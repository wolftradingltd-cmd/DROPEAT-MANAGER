import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { parseCsv, detectColumns, parseNumber, parseDate } from '../lib/csv-parser'

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

// POST /api/imports/preview - Analyser un CSV (détection colonnes)
app.post('/preview', async (c) => {
  const { csv } = await c.req.json()
  if (!csv) return c.json({ error: 'CSV requis' }, 400)

  const { rows, headers, delimiter } = parseCsv(csv)
  const detected = detectColumns(headers)

  return c.json({
    headers,
    delimiter,
    detected,
    nb_lignes: rows.length,
    apercu: rows.slice(0, 5)
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
      const date = cols.date ? parseDate(row[cols.date]) : null
      if (!date) { nb_erreurs++; continue }

      const total = cols.total ? parseNumber(row[cols.total]) : 0
      const uber_fee = cols.uber_fee ? parseNumber(row[cols.uber_fee]) : 0
      let net = cols.net ? parseNumber(row[cols.net]) : 0
      if (!net && total) net = total - uber_fee

      const order_id = cols.order_id ? row[cols.order_id] : null
      const statut = cols.status ? row[cols.status] : 'completee'

      // Doublon ?
      if (order_id) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM commandes WHERE marque_id = ? AND uber_order_id = ?'
        ).bind(marque_id, order_id).first()
        if (existing) { nb_doublons++; continue }
      }

      await c.env.DB.prepare(`
        INSERT INTO commandes (marque_id, uber_order_id, date_commande, montant_brut, frais_uber, montant_net, statut, raw_data, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        marque_id, order_id || null, date,
        total, uber_fee, net, statut || 'completee',
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

  return c.json({
    success: true, import_id, nb_lignes: rows.length,
    nb_importees, nb_doublons, nb_erreurs, montant_total: total_montant,
    periode: { debut: date_min, fin: date_max }
  })
})

// GET /api/imports - Historique
app.get('/', async (c) => {
  const user = c.get('user')

  let query = `
    SELECT i.*, m.nom as marque_nom, r.nom as restaurant_nom, r.agent_id,
           u.nom as uploader_nom, u.prenom as uploader_prenom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON i.uploader_user_id = u.id
  `
  const params: any[] = []

  if (user.role !== 'superadmin') {
    // Agent : voir uniquement les imports de sa branche
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (branchIds.length === 0) {
      return c.json({ imports: [] })
    }
    query += ` WHERE r.agent_id IN (${branchIds.map(() => '?').join(',')})`
    params.push(...branchIds)
  }

  query += ` ORDER BY i.created_at DESC LIMIT 200`

  const stmt = c.env.DB.prepare(query)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return c.json({ imports: results })
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
