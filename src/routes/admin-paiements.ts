import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

// GET /api/admin/paiements
app.get('/', async (c) => {
  const annee = c.req.query('annee')
  const mois = c.req.query('mois')
  const agent_id = c.req.query('agent_id')
  const statut = c.req.query('statut')

  let query = `
    SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau, u.email as agent_email
    FROM paiements p
    JOIN users u ON p.agent_id = u.id
    WHERE 1=1
  `
  const params: any[] = []
  if (annee) { query += ' AND p.periode_annee = ?'; params.push(annee) }
  if (mois) { query += ' AND p.periode_mois = ?'; params.push(mois) }
  if (agent_id) { query += ' AND p.agent_id = ?'; params.push(agent_id) }
  if (statut) { query += ' AND p.statut = ?'; params.push(statut) }
  query += ' ORDER BY p.periode_annee DESC, p.periode_mois DESC, u.nom'

  const stmt = c.env.DB.prepare(query)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return c.json({ paiements: results })
})

// POST /api/admin/paiements - upsert sur (agent, période)
app.post('/', async (c) => {
  const data = await c.req.json()
  const { agent_id, periode_mois, periode_annee, montant, statut, date_paiement, methode, reference, notes } = data
  if (!agent_id || !periode_mois || !periode_annee || montant === undefined) {
    return c.json({ error: 'agent_id, periode et montant requis' }, 400)
  }
  const existing = await c.env.DB.prepare(
    'SELECT id FROM paiements WHERE agent_id = ? AND periode_mois = ? AND periode_annee = ?'
  ).bind(agent_id, periode_mois, periode_annee).first() as any

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE paiements SET montant = ?, statut = ?, date_paiement = ?, methode = ?, reference = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(montant, statut || 'en_attente', date_paiement || null, methode || null, reference || null, notes || null, existing.id).run()
    return c.json({ success: true, id: existing.id, updated: true })
  }
  const r = await c.env.DB.prepare(`
    INSERT INTO paiements (agent_id, periode_mois, periode_annee, montant, statut, date_paiement, methode, reference, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(agent_id, periode_mois, periode_annee, montant, statut || 'en_attente', date_paiement || null, methode || null, reference || null, notes || null).run()
  return c.json({ success: true, id: r.meta.last_row_id })
})

// PUT /api/admin/paiements/:id
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const { montant, statut, date_paiement, methode, reference, notes } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE paiements SET montant = COALESCE(?, montant), statut = COALESCE(?, statut),
      date_paiement = ?, methode = ?, reference = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(montant ?? null, statut || null, date_paiement || null, methode || null, reference || null, notes || null, id).run()
  return c.json({ success: true })
})

// DELETE
app.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM paiements WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// POST /api/admin/paiements/:id/marquer-paye
app.post('/:id/marquer-paye', async (c) => {
  const id = c.req.param('id')
  const { date_paiement, methode, reference } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE paiements SET statut = 'paye', date_paiement = COALESCE(?, date('now')),
      methode = ?, reference = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(date_paiement || null, methode || null, reference || null, id).run()
  return c.json({ success: true })
})

export default app
