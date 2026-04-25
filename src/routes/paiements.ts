import { Hono } from 'hono'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// GET tous les paiements
app.get('/', async (c) => {
  const annee = c.req.query('annee')
  const mois = c.req.query('mois')
  const agent_id = c.req.query('agent_id')

  let query = `
    SELECT p.*, a.nom as agent_nom, a.prenom as agent_prenom, a.niveau as agent_niveau
    FROM paiements p
    JOIN agents a ON p.agent_id = a.id
    WHERE 1=1
  `
  const params: any[] = []
  if (annee) { query += ' AND p.periode_annee = ?'; params.push(annee) }
  if (mois) { query += ' AND p.periode_mois = ?'; params.push(mois) }
  if (agent_id) { query += ' AND p.agent_id = ?'; params.push(agent_id) }
  query += ' ORDER BY p.periode_annee DESC, p.periode_mois DESC, a.nom'

  const stmt = c.env.DB.prepare(query)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all()
  return c.json({ paiements: results })
})

// POST créer/mettre à jour un paiement (upsert sur agent + période)
app.post('/', async (c) => {
  const data = await c.req.json()
  const { agent_id, periode_mois, periode_annee, montant, statut, date_paiement, methode, reference, notes } = data

  if (!agent_id || !periode_mois || !periode_annee || montant === undefined) {
    return c.json({ error: 'agent_id, periode et montant requis' }, 400)
  }

  // Check si existe déjà
  const existing = await c.env.DB.prepare(`
    SELECT id FROM paiements 
    WHERE agent_id = ? AND periode_mois = ? AND periode_annee = ?
  `).bind(agent_id, periode_mois, periode_annee).first() as any

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE paiements SET
        montant = ?, statut = ?, date_paiement = ?, methode = ?, reference = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      montant, statut || 'en_attente', date_paiement || null,
      methode || null, reference || null, notes || null, existing.id
    ).run()
    return c.json({ success: true, id: existing.id, action: 'update' })
  } else {
    const result = await c.env.DB.prepare(`
      INSERT INTO paiements (agent_id, periode_mois, periode_annee, montant, statut, date_paiement, methode, reference, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agent_id, periode_mois, periode_annee, montant,
      statut || 'en_attente', date_paiement || null,
      methode || null, reference || null, notes || null
    ).run()
    return c.json({ success: true, id: result.meta.last_row_id, action: 'create' })
  }
})

// PUT modifier un paiement
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { montant, statut, date_paiement, methode, reference, notes } = data

  await c.env.DB.prepare(`
    UPDATE paiements SET
      montant = ?, statut = ?, date_paiement = ?, methode = ?, reference = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    montant, statut || 'en_attente', date_paiement || null,
    methode || null, reference || null, notes || null, id
  ).run()

  return c.json({ success: true })
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM paiements WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST marquer comme payé
app.post('/:id/pay', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json().catch(() => ({}))
  const { date_paiement, methode, reference } = data

  await c.env.DB.prepare(`
    UPDATE paiements SET
      statut = 'paye',
      date_paiement = ?,
      methode = ?,
      reference = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    date_paiement || new Date().toISOString().substring(0, 10),
    methode || 'virement',
    reference || null,
    id
  ).run()

  return c.json({ success: true })
})

export default app
