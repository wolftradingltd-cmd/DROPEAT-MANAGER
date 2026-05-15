import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { parseCsv, detectColumns, parseNumber, parseDate, normalizeStatus } from '../lib/csv-parser'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

// Auth simple (admin OU agent peut uploader pour ses propres marques)
app.use('*', requireAuth)

/**
 * Vérifie qu'un user a le droit d'uploader pour une marque.
 * Superadmin : OK partout
 * Agent : OK si la marque est dans un de ses restaurants (ou ceux de sa branche)
 */
async function userCanUploadForMarque(db: D1Database, user: any, marqueId: number): Promise<boolean> {
  if (user.role === 'superadmin') return true

  const m = await db.prepare(`
    SELECT r.agent_id FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(marqueId).first() as any

  if (!m) return false
  if (m.agent_id === user.id) return true

  // Vérifier si l'agent est dans la descendance de user
  let cur = m.agent_id
  while (cur) {
    if (cur === user.id) return true
    const p = await db.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
    cur = p?.parent_id || null
  }
  return false
}

// POST /api/imports/preview - Analyser un CSV (détection colonnes + marque)
app.post('/preview', async (c) => {
  const user = c.get('user')
  const { csv } = await c.req.json()
  if (!csv) return c.json({ error: 'CSV requis' }, 400)

  const { rows, headers, delimiter } = parseCsv(csv)
  const detected = detectColumns(headers)

  // Auto-détection marque via colonnes Uber Eats officielles :
  //  - "Restaurant" (store_name)        : nom du store
  //  - "Id. externe du restaurant"      : UUID store
  //  - "Marque Eats" (marque_eats)      : marque virtuelle si différente
  let marque_suggeree: any = null
  let marques_uniques: Array<{ nom: string, uuid: string | null, nb: number }> = []

  if (rows.length && (detected.store_name || detected.store_uuid || detected.marque_eats)) {
    // Compter les marques uniques sur l'ensemble du CSV pour détecter le multi-marque
    const counts = new Map<string, { nom: string, uuid: string | null, nb: number }>()
    for (const r of rows) {
      // "Marque Eats" prioritaire SI elle a une vraie valeur (pas "Uber Eats" générique ni vide)
      const marqueEatsRaw = detected.marque_eats ? (r[detected.marque_eats]?.trim() || '') : ''
      const marqueEatsValide = marqueEatsRaw && marqueEatsRaw.toLowerCase() !== 'uber eats' && marqueEatsRaw.toLowerCase() !== 'uber\u00a0eats'
      const nom = (marqueEatsValide ? marqueEatsRaw : '') ||
                  (detected.store_name && r[detected.store_name]?.trim()) || ''
      const uuid = detected.store_uuid ? (r[detected.store_uuid]?.trim() || null) : null
      if (!nom) continue
      const key = nom.toLowerCase()
      const ex = counts.get(key)
      if (ex) ex.nb++
      else counts.set(key, { nom, uuid, nb: 1 })
    }
    marques_uniques = Array.from(counts.values()).sort((a, b) => b.nb - a.nb)

    // Première marque dominante
    const top = marques_uniques[0]
    if (top) {
      let m: any = null
      if (top.uuid) {
        m = await c.env.DB.prepare(`
          SELECT m.id, m.nom, m.uber_store_id, m.restaurant_id, r.nom as restaurant_nom, r.agent_id
          FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
          WHERE m.uber_store_id = ? LIMIT 1
        `).bind(top.uuid).first()
      }
      if (!m && top.nom) {
        m = await c.env.DB.prepare(`
          SELECT m.id, m.nom, m.uber_store_id, m.restaurant_id, r.nom as restaurant_nom, r.agent_id
          FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
          WHERE LOWER(m.nom) = LOWER(?) OR LOWER(r.nom) = LOWER(?) LIMIT 1
        `).bind(top.nom, top.nom).first()
      }
      if (m) {
        let autorise = user.role === 'superadmin'
        if (!autorise) {
          let cur = (m as any).agent_id
          while (cur) {
            if (cur === user.id) { autorise = true; break }
            const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
            cur = p?.parent_id || null
          }
        }
        marque_suggeree = autorise ? { ...(m as any), match: top.uuid ? 'uber_store_id' : 'nom' } : null
      } else {
        marque_suggeree = {
          id: null,
          nom_detecte: top.nom,
          uber_store_id_detecte: top.uuid,
          match: 'nouveau'
        }
      }
    }
  }

  return c.json({
    headers,
    delimiter,
    detected,
    nb_lignes: rows.length,
    apercu: rows.slice(0, 5),
    marque_suggeree,
    marques_uniques // utile pour CSV multi-marque (afficher liste à l'utilisateur)
  })
})

// POST /api/imports - Importer les commandes
app.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const { marque_id, csv, nom_fichier, mapping } = body

  if (!marque_id || !csv) return c.json({ error: 'marque_id et csv requis' }, 400)

  const canUpload = await userCanUploadForMarque(c.env.DB, user, marque_id)
  if (!canUpload) return c.json({ error: 'Vous n\'avez pas accès à cette marque' }, 403)

  const { rows, headers } = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'CSV vide' }, 400)

  const cols = mapping || detectColumns(headers)

  if (!cols.date) return c.json({ error: 'Colonne date introuvable' }, 400)
  if (!cols.total && !cols.net) {
    return c.json({ error: 'Au moins une colonne montant (total ou net) requise' }, 400)
  }

  let nb_importees = 0, nb_doublons = 0, nb_erreurs = 0, total_montant = 0
  let date_min: string | null = null, date_max: string | null = null

  const importRes = await c.env.DB.prepare(`
    INSERT INTO imports_csv (marque_id, uploader_user_id, nom_fichier, nb_lignes, statut)
    VALUES (?, ?, ?, ?, 'en_cours')
  `).bind(marque_id, user.id, nom_fichier || null, rows.length).run()
  const import_id = importRes.meta.last_row_id

  for (const row of rows) {
    try {
      const date = cols.date ? parseDate(row[cols.date], cols.time ? row[cols.time] : undefined) : null
      if (!date) { nb_erreurs++; continue }

      const total = cols.total ? parseNumber(row[cols.total]) : 0
      const uber_fee = cols.uber_fee ? parseNumber(row[cols.uber_fee]) : 0
      let net = cols.net ? parseNumber(row[cols.net]) : 0
      if (!net && total) net = total - uber_fee

      const order_id = cols.order_id ? row[cols.order_id] : null
      const uuid = cols.uuid ? row[cols.uuid] : null
      const statutRaw = cols.status ? row[cols.status] : ''
      const statut = normalizeStatus(statutRaw)
      const type_honoree = cols.type_honoree ? row[cols.type_honoree] : null

      // Ignorer les annulées (CA = 0)
      if (statut === 'annulee') { nb_erreurs++; continue }

      // Doublon ? Priorité UUID, fallback order_id
      if (uuid) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM commandes WHERE uber_uuid = ?'
        ).bind(uuid).first()
        if (existing) { nb_doublons++; continue }
      } else if (order_id) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM commandes WHERE marque_id = ? AND uber_order_id = ?'
        ).bind(marque_id, order_id).first()
        if (existing) { nb_doublons++; continue }
      }

      await c.env.DB.prepare(`
        INSERT INTO commandes (marque_id, uber_order_id, uber_uuid, type_honoree, date_commande, montant_brut, frais_uber, montant_net, statut, raw_data, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        marque_id, order_id || null, uuid || null, type_honoree || null, date,
        total, uber_fee, net, statut,
        JSON.stringify(row), import_id
      ).run()

      nb_importees++
      total_montant += total
      if (!date_min || date < date_min) date_min = date
      if (!date_max || date > date_max) date_max = date
    } catch (e) {
      nb_erreurs++
    }
  }

  await c.env.DB.prepare(`
    UPDATE imports_csv SET
      nb_lignes_importees = ?, nb_doublons = ?, montant_total = ?,
      periode_debut = ?, periode_fin = ?, statut = ?
    WHERE id = ?
  `).bind(
    nb_importees, nb_doublons, total_montant,
    date_min ? date_min.substring(0, 10) : null,
    date_max ? date_max.substring(0, 10) : null,
    nb_erreurs > 0 ? 'partiel' : 'complete',
    import_id
  ).run()

  // === CALCUL AUTOMATIQUE DES COMMISSIONS ===
  // Recalcule chaque mois impacté par cet import
  let commissionsCalcul: any = null
  try {
    const { recalculerPeriodesImpactees } = await import('../lib/auto-commissions')
    commissionsCalcul = await recalculerPeriodesImpactees(c.env.DB, import_id as number)
  } catch (e: any) {
    console.error('Erreur calcul auto commissions:', e?.message || e)
  }

  return c.json({
    success: true, import_id, nb_lignes: rows.length,
    nb_importees, nb_doublons, nb_erreurs, montant_total: total_montant,
    periode: { debut: date_min, fin: date_max },
    commissions_auto: commissionsCalcul
  })
})

// GET /api/imports - Historique ENRICHI avec agrégats financiers
// Pour chaque import : nb_commandes réel, CA brut resto, CA DropEat brut (montant_facture_resto),
// commissions agent (propre + portefeuille), commissions N+1, commissions N+2,
// marge nette DropEat = CA DropEat - (toutes commissions hors portefeuille — la marge
// est déjà 0 pour les commandes portefeuille car DropEat ne facture pas)
app.get('/', async (c) => {
  const user = c.get('user')

  let query = `
    SELECT
      i.*,
      m.nom as marque_nom,
      m.is_portefeuille_proprietaire as marque_pf,
      r.nom as restaurant_nom,
      r.agent_id,
      r.is_portefeuille_proprietaire as resto_pf,
      u.nom as uploader_nom, u.prenom as uploader_prenom,
      ag.nom as agent_nom, ag.prenom as agent_prenom,
      -- Agrégats financiers (issus de commandes liées par import_id)
      COALESCE(stats.nb_cmd_reel, 0) as nb_commandes_reel,
      COALESCE(stats.ca_brut, 0) as ca_brut,
      COALESCE(stats.ca_dropeat_brut, 0) as ca_dropeat_brut,
      COALESCE(stats.comm_propre, 0) as commissions_propre,
      COALESCE(stats.comm_portefeuille, 0) as commissions_portefeuille,
      COALESCE(stats.comm_n1, 0) as commissions_n1,
      COALESCE(stats.comm_n2, 0) as commissions_n2,
      COALESCE(stats.ca_dropeat_brut, 0)
        - COALESCE(stats.comm_propre, 0)
        - COALESCE(stats.comm_n1, 0)
        - COALESCE(stats.comm_n2, 0) as marge_dropeat_nette,
      COALESCE(stats.comm_propre, 0)
        + COALESCE(stats.comm_portefeuille, 0)
        + COALESCE(stats.comm_n1, 0)
        + COALESCE(stats.comm_n2, 0) as commissions_total
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON i.uploader_user_id = u.id
    LEFT JOIN users ag ON r.agent_id = ag.id
    LEFT JOIN (
      SELECT
        c.import_id,
        COUNT(c.id) as nb_cmd_reel,
        SUM(COALESCE(c.montant_brut, 0)) as ca_brut,
        SUM(COALESCE(c.montant_facture_resto, 0)) as ca_dropeat_brut,
        SUM(COALESCE(c.commission_agent_montant, 0)) as comm_propre,
        SUM(COALESCE(c.commission_portefeuille_montant, 0)) as comm_portefeuille,
        SUM(COALESCE(c.commission_n1_montant, 0)) as comm_n1,
        SUM(COALESCE(c.commission_n2_montant, 0)) as comm_n2
      FROM commandes c
      WHERE c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee') AND c.import_id IS NOT NULL
      GROUP BY c.import_id
    ) stats ON stats.import_id = i.id
  `
  const params: any[] = []

  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (branchIds.length === 0) {
      return c.json({ imports: [], totaux: { nb_imports: 0, ca_brut: 0, ca_dropeat_brut: 0, commissions_total: 0, marge_dropeat_nette: 0 } })
    }
    query += ` WHERE r.agent_id IN (${branchIds.map(() => '?').join(',')})`
    params.push(...branchIds)
  }

  query += ` ORDER BY i.created_at DESC LIMIT 200`

  const stmt = c.env.DB.prepare(query)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all() as any

  // Totaux globaux (somme des lignes visibles)
  let nb_imports = 0, ca_brut = 0, ca_dropeat_brut = 0
  let comm_propre = 0, comm_portefeuille = 0, comm_n1 = 0, comm_n2 = 0
  let marge_dropeat_nette = 0
  for (const r of results as any[]) {
    nb_imports++
    ca_brut += +r.ca_brut || 0
    ca_dropeat_brut += +r.ca_dropeat_brut || 0
    comm_propre += +r.commissions_propre || 0
    comm_portefeuille += +r.commissions_portefeuille || 0
    comm_n1 += +r.commissions_n1 || 0
    comm_n2 += +r.commissions_n2 || 0
    marge_dropeat_nette += +r.marge_dropeat_nette || 0
  }

  return c.json({
    imports: results,
    totaux: {
      nb_imports,
      ca_brut,
      ca_dropeat_brut,
      commissions_propre: comm_propre,
      commissions_portefeuille: comm_portefeuille,
      commissions_n1: comm_n1,
      commissions_n2: comm_n2,
      commissions_total: comm_propre + comm_portefeuille + comm_n1 + comm_n2,
      marge_dropeat_nette
    }
  })
})

// GET /api/imports/:id/details — Détail commissions d'un import
// Retourne :
//   - import (toutes les infos + agent owner)
//   - breakdown par_marque (CA, commissions, marge)
//   - breakdown par_agent (N0/N+1/N+2) : qui touche quoi sur cet import
//   - commandes (échantillon)
app.get('/:id/details', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  // Récup import + sécurité branche
  const imp = await c.env.DB.prepare(`
    SELECT i.*, m.nom as marque_nom, m.id as marque_id,
           m.is_portefeuille_proprietaire as marque_pf,
           r.nom as restaurant_nom, r.id as restaurant_id, r.agent_id,
           r.is_portefeuille_proprietaire as resto_pf,
           ag.nom as agent_nom, ag.prenom as agent_prenom, ag.email as agent_email,
           u.nom as uploader_nom, u.prenom as uploader_prenom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users ag ON r.agent_id = ag.id
    LEFT JOIN users u ON i.uploader_user_id = u.id
    WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp) return c.json({ error: 'Import introuvable' }, 404)

  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (!branchIds.includes(imp.agent_id)) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  // Agrégats globaux de l'import
  const totaux = await c.env.DB.prepare(`
    SELECT
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca_brut,
      COALESCE(SUM(c.montant_facture_resto), 0) as ca_dropeat_brut,
      COALESCE(SUM(c.commission_agent_montant), 0) as comm_propre,
      COALESCE(SUM(c.commission_portefeuille_montant), 0) as comm_portefeuille,
      COALESCE(SUM(c.commission_n1_montant), 0) as comm_n1,
      COALESCE(SUM(c.commission_n2_montant), 0) as comm_n2
    FROM commandes c
    WHERE c.import_id = ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
  `).bind(id).first() as any

  const marge_dropeat_nette = (totaux?.ca_dropeat_brut || 0)
    - (totaux?.comm_propre || 0)
    - (totaux?.comm_n1 || 0)
    - (totaux?.comm_n2 || 0)

  // Breakdown par marque
  const { results: par_marque } = await c.env.DB.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      COALESCE(m.is_portefeuille_proprietaire, 0) as marque_pf,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca_brut,
      COALESCE(SUM(c.montant_facture_resto), 0) as ca_dropeat_brut,
      COALESCE(SUM(c.commission_agent_montant), 0) as comm_propre,
      COALESCE(SUM(c.commission_portefeuille_montant), 0) as comm_portefeuille,
      COALESCE(SUM(c.commission_n1_montant), 0) as comm_n1,
      COALESCE(SUM(c.commission_n2_montant), 0) as comm_n2
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    WHERE c.import_id = ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY m.id
    ORDER BY ca_brut DESC
  `).bind(id).all() as any

  // Breakdown par agent (N0 = agent du resto, puis N+1, N+2)
  // Pour cet import, on a UN seul resto donc UN seul N0 mais on calcule via la chaîne MLM
  let par_agent: any[] = []
  if (imp.agent_id) {
    const n0 = await c.env.DB.prepare('SELECT id, nom, prenom, parent_id FROM users WHERE id = ?').bind(imp.agent_id).first() as any
    if (n0) {
      par_agent.push({
        agent_id: n0.id, nom: n0.nom, prenom: n0.prenom, niveau: 'N0',
        commission_propre: totaux?.comm_propre || 0,
        commission_portefeuille: totaux?.comm_portefeuille || 0,
        commission_n1: 0, commission_n2: 0,
        total: (totaux?.comm_propre || 0) + (totaux?.comm_portefeuille || 0)
      })
      // N+1 = parent de N0
      if (n0.parent_id) {
        const n1 = await c.env.DB.prepare('SELECT id, nom, prenom, parent_id FROM users WHERE id = ?').bind(n0.parent_id).first() as any
        if (n1) {
          par_agent.push({
            agent_id: n1.id, nom: n1.nom, prenom: n1.prenom, niveau: 'N+1',
            commission_propre: 0, commission_portefeuille: 0,
            commission_n1: totaux?.comm_n1 || 0, commission_n2: 0,
            total: totaux?.comm_n1 || 0
          })
          // N+2 = parent de N+1
          if (n1.parent_id) {
            const n2 = await c.env.DB.prepare('SELECT id, nom, prenom FROM users WHERE id = ?').bind(n1.parent_id).first() as any
            if (n2) {
              par_agent.push({
                agent_id: n2.id, nom: n2.nom, prenom: n2.prenom, niveau: 'N+2',
                commission_propre: 0, commission_portefeuille: 0,
                commission_n1: 0, commission_n2: totaux?.comm_n2 || 0,
                total: totaux?.comm_n2 || 0
              })
            }
          }
        }
      }
    }
  }

  // DropEat lui-même (marge nette)
  par_agent.push({
    agent_id: null, nom: 'DROPEAT', prenom: '', niveau: 'DROPEAT',
    commission_propre: 0, commission_portefeuille: 0, commission_n1: 0, commission_n2: 0,
    total: marge_dropeat_nette
  })

  // Échantillon de commandes (50 max)
  const { results: commandes } = await c.env.DB.prepare(`
    SELECT
      c.id, c.uber_order_id, c.uber_uuid, c.date_commande, c.statut,
      c.montant_brut, c.frais_uber, c.montant_net, c.montant_facture_resto,
      c.commission_agent_montant, c.commission_portefeuille_montant,
      c.commission_n1_montant, c.commission_n2_montant,
      m.nom as marque_nom
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    WHERE c.import_id = ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    ORDER BY c.date_commande DESC
    LIMIT 50
  `).bind(id).all() as any

  return c.json({
    import: imp,
    totaux: {
      ...(totaux || {}),
      marge_dropeat_nette,
      commissions_total: (totaux?.comm_propre || 0) + (totaux?.comm_portefeuille || 0)
                       + (totaux?.comm_n1 || 0) + (totaux?.comm_n2 || 0)
    },
    par_marque,
    par_agent,
    commandes
  })
})

// ============================================================
// GET /api/imports/:id/download — Reconstruire et télécharger le CSV original
// depuis raw_data des commandes (admin + agent de la branche)
// ============================================================
app.get('/:id/download', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const imp = await c.env.DB.prepare(`
    SELECT i.*, r.agent_id, m.nom as marque_nom, r.nom as restaurant_nom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp) return c.json({ error: 'Import introuvable' }, 404)

  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (!branchIds.includes(imp.agent_id)) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  const { results: cmds } = await c.env.DB.prepare(`
    SELECT raw_data FROM commandes WHERE import_id = ? ORDER BY date_commande
  `).bind(id).all() as any

  if (!cmds.length) {
    return c.json({ error: 'Aucune commande pour cet import' }, 404)
  }

  // Reconstruction du CSV : récupérer toutes les clés rencontrées
  const headersSet = new Set<string>()
  const rows: Record<string, string>[] = []
  for (const row of cmds as any[]) {
    try {
      const obj = JSON.parse(row.raw_data || '{}')
      rows.push(obj)
      Object.keys(obj).forEach(k => headersSet.add(k))
    } catch {}
  }
  const headers = Array.from(headersSet)

  function esc(v: any): string {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes('"') || s.includes(';') || s.includes('\n') || s.includes(',')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers.map(esc).join(';')]
  for (const row of rows) {
    lines.push(headers.map(h => esc(row[h])).join(';'))
  }
  const csv = '\uFEFF' + lines.join('\n')
  const filename = (imp.nom_fichier || `import-${id}.csv`).replace(/[^a-zA-Z0-9._-]/g, '_')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
})

// ============================================================
// POST /api/imports/:id/recalculer — Recalculer les commissions de cet import
// (refait tourner le moteur d'auto-commissions sur la/les périodes impactées)
// ============================================================
app.post('/:id/recalculer', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const imp = await c.env.DB.prepare(`
    SELECT i.*, r.agent_id FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp) return c.json({ error: 'Import introuvable' }, 404)

  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (!branchIds.includes(imp.agent_id)) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  const { recalculerPeriodesImpactees } = await import('../lib/auto-commissions')
  const calculs = await recalculerPeriodesImpactees(c.env.DB, parseInt(id))

  return c.json({ success: true, periodes_recalculees: calculs.length, calculs })
})

// ============================================================
// PUT /api/imports/commandes/:cmd_id — Ajustement manuel d'une commande
// Permet à l'admin de corriger : montant_brut, frais_uber, montant_net,
// montant_facture_resto, commission_agent_montant, commission_portefeuille_montant,
// commission_n1_montant, commission_n2_montant, statut, notes_ajustement
// ============================================================
app.put('/commandes/:cmd_id', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') {
    return c.json({ error: 'Réservé superadmin' }, 403)
  }
  const cmdId = c.req.param('cmd_id')
  const body = await c.req.json()

  const FIELDS = [
    'montant_brut', 'frais_uber', 'montant_net', 'montant_facture_resto',
    'commission_agent_montant', 'commission_portefeuille_montant',
    'commission_n1_montant', 'commission_n2_montant', 'statut'
  ]
  const updates: string[] = []
  const params: any[] = []
  for (const f of FIELDS) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`)
      params.push(body[f])
    }
  }
  if (body.notes_ajustement !== undefined) {
    updates.push(`notes_ajustement = ?`)
    params.push(body.notes_ajustement)
  }
  if (!updates.length) {
    return c.json({ error: 'Aucun champ à modifier' }, 400)
  }
  // Marque l'ajustement
  updates.push(`ajuste_par_id = ?`)
  params.push(user.id)
  updates.push(`ajuste_at = CURRENT_TIMESTAMP`)
  params.push(cmdId)

  // S'assurer que les colonnes d'audit existent (idempotent)
  try {
    await c.env.DB.prepare(`ALTER TABLE commandes ADD COLUMN notes_ajustement TEXT`).run()
  } catch {}
  try {
    await c.env.DB.prepare(`ALTER TABLE commandes ADD COLUMN ajuste_par_id INTEGER`).run()
  } catch {}
  try {
    await c.env.DB.prepare(`ALTER TABLE commandes ADD COLUMN ajuste_at TEXT`).run()
  } catch {}

  await c.env.DB.prepare(`
    UPDATE commandes SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run()

  return c.json({ success: true })
})

// ============================================================
// POST /api/imports/:id/facturer — Génère une facture DropEat → Restaurant
// pour la période de cet import (raccourci pratique pour l'admin)
// ============================================================
app.post('/:id/facturer', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') {
    return c.json({ error: 'Réservé superadmin' }, 403)
  }
  const id = c.req.param('id')

  const imp = await c.env.DB.prepare(`
    SELECT i.*, r.id as restaurant_id, r.nom as restaurant_nom,
           r.is_portefeuille_proprietaire as resto_pf,
           m.is_portefeuille_proprietaire as marque_pf
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp) return c.json({ error: 'Import introuvable' }, 404)

  if (imp.resto_pf || imp.marque_pf) {
    return c.json({ error: 'Restaurant/marque en PORTEFEUILLE 100% — DropEat ne facture pas (l\'agent facture directement)' }, 400)
  }
  if (!imp.periode_debut || !imp.periode_fin) {
    return c.json({ error: 'Période de l\'import inconnue — impossible de générer une facture' }, 400)
  }

  // Retourne directement les paramètres pour appeler /api/factures/resto/create
  return c.json({
    success: true,
    restaurant_id: imp.restaurant_id,
    date_debut: imp.periode_debut,
    date_fin: imp.periode_fin,
    info: 'Utilisez POST /api/factures/resto/create avec ces paramètres pour générer la facture'
  })
})

// DELETE /api/imports/:id
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  if (user.role !== 'superadmin') {
    // Agent : vérifier qu'il est uploader OU que c'est dans sa branche
    const imp = await c.env.DB.prepare(`
      SELECT i.uploader_user_id, r.agent_id 
      FROM imports_csv i 
      JOIN marques_virtuelles m ON i.marque_id = m.id 
      JOIN restaurants r ON m.restaurant_id = r.id 
      WHERE i.id = ?
    `).bind(id).first() as any
    if (!imp) return c.json({ error: 'Import introuvable' }, 404)

    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (imp.uploader_user_id !== user.id && !branchIds.includes(imp.agent_id)) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  await c.env.DB.prepare('DELETE FROM commandes WHERE import_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM imports_csv WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Helper : récupérer tous les agent_id de la branche d'un user (lui + descendants)
async function getBranchAgentIds(db: D1Database, userId: number): Promise<number[]> {
  const ids: number[] = [userId]
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    const { results } = await db.prepare('SELECT id FROM users WHERE parent_id = ?').bind(cur).all() as any
    for (const r of results) {
      ids.push(r.id)
      queue.push(r.id)
    }
  }
  return ids
}

export default app
