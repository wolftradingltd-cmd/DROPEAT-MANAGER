// Routes pour l'espace AGENT COMMERCIAL
// Visibilité Option A : transparente (l'agent voit toute sa branche)
// Permissions : TOUT (création/édition/suppression de ses restos, marques, imports CSV)
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { isRangPortefeuille, getPaliers, calculerCommissionsPeriode, type CommandeWithContext } from '../lib/commissions'
import { parseCsv, detectColumns, parseNumber, parseDate } from '../lib/csv-parser'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireAuth)

/** Récupère tous les agent_id de la branche d'un agent (lui + descendants) */
async function getBranchAgentIds(db: D1Database, userId: number): Promise<number[]> {
  const ids: number[] = [userId]
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    const { results } = await db.prepare('SELECT id FROM users WHERE parent_id = ?').bind(cur).all() as any
    for (const r of results) { ids.push(r.id); queue.push(r.id) }
  }
  return ids
}

/** Recalcule les rangs Portefeuille des restaurants d'un agent. */
async function recalculerPortefeuilleAgent(db: D1Database, agentId: number) {
  if (!agentId) return
  const { results } = await db.prepare(
    'SELECT id FROM restaurants WHERE agent_id = ? ORDER BY date_signature ASC, id ASC'
  ).bind(agentId).all() as any
  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    const isPort = isRangPortefeuille(rang) ? 1 : 0
    await db.prepare('UPDATE restaurants SET rang_apport = ?, is_portefeuille_proprietaire = ? WHERE id = ?')
      .bind(rang, isPort, results[i].id).run()
  }
}

async function recalculerPortefeuilleMarques(db: D1Database, restaurantId: number) {
  const resto = await db.prepare('SELECT is_portefeuille_proprietaire FROM restaurants WHERE id = ?')
    .bind(restaurantId).first() as any
  const restoPort = !!resto?.is_portefeuille_proprietaire
  const { results } = await db.prepare(
    'SELECT id FROM marques_virtuelles WHERE restaurant_id = ? ORDER BY date_lancement ASC, id ASC'
  ).bind(restaurantId).all() as any
  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    const isPort = restoPort ? 1 : (isRangPortefeuille(rang) ? 1 : 0)
    await db.prepare('UPDATE marques_virtuelles SET rang_creation = ?, is_portefeuille_proprietaire = ? WHERE id = ?')
      .bind(rang, isPort, results[i].id).run()
  }
}

// ============================================================
// PROFIL & BRANCHE
// ============================================================
app.get('/me', async (c) => {
  const me = c.get('user')
  const u = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.nom, u.prenom, u.telephone, u.niveau, u.parent_id, u.iban,
           p.nom as parent_nom, p.prenom as parent_prenom
    FROM users u LEFT JOIN users p ON u.parent_id = p.id WHERE u.id = ?
  `).bind(me.id).first() as any

  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const stats: any = {}
  const cnt = async (q: string, p: any[] = []) => {
    const r = await c.env.DB.prepare(q).bind(...p).first() as any
    return r?.c || 0
  }
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  stats.nb_restaurants = await cnt(`SELECT COUNT(*) as c FROM restaurants WHERE agent_id IN ${inClause}`, branchIds)
  stats.nb_restaurants_propres = await cnt('SELECT COUNT(*) as c FROM restaurants WHERE agent_id = ?', [me.id])
  stats.nb_marques = await cnt(`
    SELECT COUNT(*) as c FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id IN ${inClause}`, branchIds)
  stats.nb_sous_agents = await cnt('SELECT COUNT(*) as c FROM users WHERE parent_id = ?', [me.id])

  // Compter les restos qui me restent avant prochain Portefeuille (5,10,15...)
  const myRestos = await cnt('SELECT COUNT(*) as c FROM restaurants WHERE agent_id = ?', [me.id])
  const palier = 5
  const reste_avant_portefeuille = palier - (myRestos % palier)

  return c.json({ user: u, branche_ids: branchIds, stats, reste_avant_portefeuille })
})

// ============================================================
// MES RESTAURANTS (les miens + ceux de ma branche)
// ============================================================
app.get('/restaurants', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
      (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
      (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
      (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.agent_id IN ${inClause}
    ORDER BY r.created_at DESC
  `).bind(...branchIds).all()
  return c.json({ restaurants: results })
})

app.get('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id WHERE r.id = ?
  `).bind(id).first() as any
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)
  if (!branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total
    FROM marques_virtuelles m WHERE m.restaurant_id = ? ORDER BY m.rang_creation, m.id
  `).bind(id).all()
  return c.json({ restaurant: r, marques })
})

app.post('/restaurants', async (c) => {
  const me = c.get('user')
  const data = await c.req.json()
  const { nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, date_signature, date_lancement, tablette_sr_shop, notes, agent_id } = data
  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  // L'agent peut affecter le resto à lui-même OU à un de ses sous-agents
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const targetAgentId = agent_id || me.id
  if (!branchIds.includes(targetAgentId)) return c.json({ error: 'Vous ne pouvez pas affecter à cet agent' }, 403)

  const r = await c.env.DB.prepare(`
    INSERT INTO restaurants (nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
      contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(nom, raison_sociale || null, siret || null, adresse || null, code_postal || null, ville || null,
    pays || 'France', telephone || null, email || null, contact_nom || null, targetAgentId,
    date_signature || null, date_lancement || null, tablette_sr_shop ? 1 : 0, notes || null).run()
  await recalculerPortefeuilleAgent(c.env.DB, targetAgentId)
  return c.json({ success: true, id: r.meta.last_row_id })
})

app.put('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const old = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!old || !branchIds.includes(old.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const data = await c.req.json()
  const { nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, date_signature, date_lancement, tablette_sr_shop, actif, notes, agent_id } = data
  const targetAgentId = agent_id || old.agent_id
  if (!branchIds.includes(targetAgentId)) return c.json({ error: 'Réassignation hors branche interdite' }, 403)

  await c.env.DB.prepare(`
    UPDATE restaurants SET nom = ?, raison_sociale = ?, siret = ?, adresse = ?, code_postal = ?, ville = ?, pays = ?,
      telephone = ?, email = ?, contact_nom = ?, agent_id = ?, date_signature = ?, date_lancement = ?,
      tablette_sr_shop = ?, actif = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(nom, raison_sociale || null, siret || null, adresse || null, code_postal || null, ville || null,
    pays || 'France', telephone || null, email || null, contact_nom || null, targetAgentId,
    date_signature || null, date_lancement || null, tablette_sr_shop ? 1 : 0,
    actif !== undefined ? actif : 1, notes || null, id).run()

  if (old.agent_id !== targetAgentId) {
    await recalculerPortefeuilleAgent(c.env.DB, old.agent_id)
    await recalculerPortefeuilleAgent(c.env.DB, targetAgentId)
  } else {
    await recalculerPortefeuilleMarques(c.env.DB, parseInt(id))
  }
  return c.json({ success: true })
})

app.delete('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!r || !branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(id).run()
  await recalculerPortefeuilleAgent(c.env.DB, r.agent_id)
  return c.json({ success: true })
})

// ============================================================
// MARQUES VIRTUELLES
// ============================================================
app.post('/restaurants/:id/marques', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!r || !branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const { nom, uber_store_id, plateforme, date_lancement, notes } = await c.req.json()
  if (!nom) return c.json({ error: 'Nom requis' }, 400)
  const res = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles (restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, nom, uber_store_id || null, plateforme || 'uber_eats', date_lancement || null, notes || null).run()
  await recalculerPortefeuilleMarques(c.env.DB, id)
  return c.json({ success: true, id: res.meta.last_row_id })
})

app.put('/marques/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const { nom, uber_store_id, plateforme, date_lancement, actif, notes } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE marques_virtuelles SET nom = ?, uber_store_id = ?, plateforme = ?, date_lancement = ?,
      actif = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(nom, uber_store_id || null, plateforme || 'uber_eats', date_lancement || null,
    actif !== undefined ? actif : 1, notes || null, id).run()
  await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

app.delete('/marques/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(id).run()
  await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

// ============================================================
// IMPORT CSV
// ============================================================
app.post('/imports/preview', async (c) => {
  const { csv } = await c.req.json()
  if (!csv) return c.json({ error: 'CSV requis' }, 400)
  const { rows, headers, delimiter } = parseCsv(csv)
  const detected = detectColumns(headers)
  return c.json({ headers, delimiter, detected, nb_lignes: rows.length, apercu: rows.slice(0, 5) })
})

app.post('/imports', async (c) => {
  const me = c.get('user')
  const { marque_id, csv, nom_fichier, mapping } = await c.req.json()
  if (!marque_id || !csv) return c.json({ error: 'marque_id et csv requis' }, 400)

  // Vérifier la marque appartient à la branche
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(marque_id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const { rows, headers } = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'CSV vide' }, 400)

  const cols = mapping || detectColumns(headers)
  if (!cols.date) return c.json({ error: 'Colonne date introuvable' }, 400)
  if (!cols.total && !cols.net) return c.json({ error: 'Colonne montant introuvable' }, 400)

  let nb_importees = 0, nb_doublons = 0, nb_erreurs = 0, total_montant = 0
  let date_min: string | null = null, date_max: string | null = null

  const importRes = await c.env.DB.prepare(`
    INSERT INTO imports_csv (marque_id, uploader_user_id, nom_fichier, nb_lignes, statut)
    VALUES (?, ?, ?, ?, 'en_cours')
  `).bind(marque_id, me.id, nom_fichier || null, rows.length).run()
  const import_id = importRes.meta.last_row_id

  for (const row of rows) {
    try {
      const date = parseDate(row[cols.date])
      if (!date) { nb_erreurs++; continue }
      const total = cols.total ? parseNumber(row[cols.total]) : 0
      const uber_fee = cols.uber_fee ? parseNumber(row[cols.uber_fee]) : 0
      let net = cols.net ? parseNumber(row[cols.net]) : 0
      if (!net && total) net = total - uber_fee
      const order_id = cols.order_id ? row[cols.order_id] : null
      const statut = cols.status ? row[cols.status] : 'completee'
      if (order_id) {
        const exists = await c.env.DB.prepare('SELECT id FROM commandes WHERE marque_id = ? AND uber_order_id = ?')
          .bind(marque_id, order_id).first()
        if (exists) { nb_doublons++; continue }
      }
      await c.env.DB.prepare(`
        INSERT INTO commandes (marque_id, uber_order_id, date_commande, montant_brut, frais_uber, montant_net, statut, raw_data, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(marque_id, order_id || null, date, total, uber_fee, net, statut || 'completee',
        JSON.stringify(row), import_id).run()
      nb_importees++
      total_montant += total
      if (!date_min || date < date_min) date_min = date
      if (!date_max || date > date_max) date_max = date
    } catch { nb_erreurs++ }
  }

  await c.env.DB.prepare(`
    UPDATE imports_csv SET nb_lignes_importees = ?, nb_doublons = ?, montant_total = ?,
      periode_debut = ?, periode_fin = ?, statut = ? WHERE id = ?
  `).bind(nb_importees, nb_doublons, total_montant,
    date_min ? date_min.substring(0, 10) : null, date_max ? date_max.substring(0, 10) : null,
    nb_erreurs > 0 ? 'partiel' : 'complete', import_id).run()

  return c.json({ success: true, import_id, nb_lignes: rows.length, nb_importees, nb_doublons, nb_erreurs,
    montant_total: total_montant, periode: { debut: date_min, fin: date_max } })
})

app.get('/imports', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT i.*, m.nom as marque_nom, r.nom as restaurant_nom,
      u.nom as uploader_nom, u.prenom as uploader_prenom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON i.uploader_user_id = u.id
    WHERE r.agent_id IN ${inClause}
    ORDER BY i.created_at DESC LIMIT 200
  `).bind(...branchIds).all()
  return c.json({ imports: results })
})

app.delete('/imports/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const imp = await c.env.DB.prepare(`
    SELECT i.id, r.agent_id FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp || !branchIds.includes(imp.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM commandes WHERE import_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM imports_csv WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// MES COMMISSIONS
// ============================================================
app.get('/commissions', async (c) => {
  const me = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  const { results: cmds } = await c.env.DB.prepare(`
    SELECT c.id, c.date_commande, c.montant_brut,
      m.id as marque_id, m.nom as marque_nom, m.is_portefeuille_proprietaire as marque_is_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom, r.is_portefeuille_proprietaire as restaurant_is_portefeuille,
      r.tablette_sr_shop, r.agent_id,
      u.niveau as agent_niveau, u.parent_id as agent_parent_id, u2.parent_id as agent_grand_parent_id
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users u2 ON u.parent_id = u2.id
    WHERE c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut != 'annulee' AND c.paye_integralement = 1
  `).bind(debut, fin).all() as any

  const paliers = await getPaliers(c.env.DB)
  const calc = calculerCommissionsPeriode(cmds as CommandeWithContext[], paliers)
  const detail = calc.par_agent.get(me.id) || {
    agent_id: me.id, total: 0,
    commission_propre: 0, commission_portefeuille: 0, commission_n1: 0, commission_n2: 0,
    nb_commandes_propres: 0, nb_commandes_portefeuille: 0, nb_commandes_n1: 0, nb_commandes_n2: 0
  }

  // Restos qui contribuent (les miens directs OU ceux de mes sous-agents)
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const restosBranche = calc.par_restaurant.filter(r => {
    return cmds.some((cmd: any) =>
      cmd.restaurant_id === r.restaurant_id && branchIds.includes(cmd.agent_id))
  })

  // Paiement existant
  const paiement = await c.env.DB.prepare(
    'SELECT * FROM paiements WHERE agent_id = ? AND periode_annee = ? AND periode_mois = ?'
  ).bind(me.id, annee, mois).first()

  // Détail par sous-agent (de ma branche, hors moi)
  const sousAgents: any[] = []
  for (const id of branchIds) {
    if (id === me.id) continue
    const det = calc.par_agent.get(id)
    if (!det) continue
    const u = await c.env.DB.prepare('SELECT id, nom, prenom, niveau FROM users WHERE id = ?').bind(id).first() as any
    if (u) sousAgents.push({ ...u, ...det })
  }

  return c.json({
    periode: { annee, mois },
    detail,
    restaurants: restosBranche,
    sous_agents: sousAgents,
    paiement_existant: paiement
  })
})

// GET /api/agent/commissions/historique - Historique des paiements
app.get('/commissions/historique', async (c) => {
  const me = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paiements WHERE agent_id = ?
    ORDER BY periode_annee DESC, periode_mois DESC LIMIT 24
  `).bind(me.id).all()
  return c.json({ paiements: results })
})

// ============================================================
// MA HIÉRARCHIE (sous-agents)
// ============================================================
app.get('/sous-agents', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const otherIds = branchIds.filter(i => i !== me.id)
  if (otherIds.length === 0) return c.json({ sous_agents: [] })
  const inClause = `(${otherIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.niveau, u.parent_id, u.actif, u.derniere_connexion,
      p.nom as parent_nom, p.prenom as parent_prenom,
      (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
      (SELECT COUNT(*) FROM users s WHERE s.parent_id = u.id) as nb_sous_agents
    FROM users u LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.id IN ${inClause} ORDER BY u.niveau, u.nom
  `).bind(...otherIds).all()
  return c.json({ sous_agents: results })
})

// ============================================================
// PALIERS (lecture seule pour agents)
// ============================================================
app.get('/paliers', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paliers_commissions WHERE actif = 1 ORDER BY type, ordre, seuil_min
  `).all() as any
  const grouped: Record<string, any[]> = {}
  for (const p of results) {
    if (!grouped[p.type]) grouped[p.type] = []
    grouped[p.type].push(p)
  }
  return c.json({ paliers: grouped })
})

export default app
