import { Hono } from 'hono'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// GET tous les paliers groupés par type
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paliers_commissions
    WHERE actif = 1
    ORDER BY type, ordre, seuil_min
  `).all() as any

  const grouped: Record<string, any[]> = {
    entreprise: [],
    agent: [],
    sous_agent: [],
    sous_sous_agent: []
  }
  results.forEach((p: any) => {
    if (grouped[p.type]) grouped[p.type].push(p)
  })

  return c.json({ paliers: grouped, all: results })
})

// POST créer un palier
app.post('/', async (c) => {
  const data = await c.req.json()
  const { type, base, mode, seuil_min, seuil_max, taux, ordre } = data

  if (!type || taux === undefined) {
    return c.json({ error: 'Type et taux requis' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    type, base || 'ca', mode || 'mensuel',
    seuil_min || 0, seuil_max ?? null, taux, ordre || 0
  ).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// PUT modifier un palier
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { type, base, mode, seuil_min, seuil_max, taux, ordre, actif } = data

  await c.env.DB.prepare(`
    UPDATE paliers_commissions
    SET type = ?, base = ?, mode = ?, seuil_min = ?, seuil_max = ?,
        taux = ?, ordre = ?, actif = ?
    WHERE id = ?
  `).bind(
    type, base || 'ca', mode || 'mensuel',
    seuil_min || 0, seuil_max ?? null, taux, ordre || 0,
    actif !== undefined ? actif : 1, id
  ).run()

  return c.json({ success: true })
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM paliers_commissions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST replace tous les paliers d'un type (utile pour édition globale)
app.post('/replace/:type', async (c) => {
  const type = c.req.param('type')
  const { paliers } = await c.req.json()

  if (!Array.isArray(paliers)) return c.json({ error: 'paliers doit être un tableau' }, 400)

  await c.env.DB.prepare('DELETE FROM paliers_commissions WHERE type = ?').bind(type).run()

  for (let i = 0; i < paliers.length; i++) {
    const p = paliers[i]
    await c.env.DB.prepare(`
      INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      type, p.base || 'ca', p.mode || 'mensuel',
      p.seuil_min || 0, p.seuil_max ?? null, p.taux, i + 1
    ).run()
  }

  return c.json({ success: true, count: paliers.length })
})

export default app
