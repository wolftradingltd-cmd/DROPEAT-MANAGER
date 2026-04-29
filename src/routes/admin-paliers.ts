import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

const TYPES = [
  'facturation_restaurant',
  'facturation_restaurant_tablette',
  'agent_standard',
  'agent_portefeuille',
  'sous_agent_n1',
  'sous_agent_n2'
]

// GET tous les paliers groupés par type
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paliers_commissions WHERE actif = 1 ORDER BY type, ordre, seuil_min
  `).all() as any

  const grouped: Record<string, any[]> = {}
  TYPES.forEach(t => grouped[t] = [])
  results.forEach((p: any) => {
    if (grouped[p.type]) grouped[p.type].push(p)
  })

  return c.json({ paliers: grouped })
})

// POST /api/admin/paliers - Créer
app.post('/', async (c) => {
  const data = await c.req.json()
  const { type, seuil_min, seuil_max, montant_par_commande, ordre } = data

  if (!type || montant_par_commande === undefined) {
    return c.json({ error: 'type et montant_par_commande requis' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre)
    VALUES (?, ?, ?, ?, ?)
  `).bind(type, seuil_min || 0, seuil_max ?? null, montant_par_commande, ordre || 0).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// PUT /api/admin/paliers/:id
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { type, seuil_min, seuil_max, montant_par_commande, ordre, actif } = data

  await c.env.DB.prepare(`
    UPDATE paliers_commissions SET
      type = ?, seuil_min = ?, seuil_max = ?, montant_par_commande = ?, ordre = ?, actif = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    type, seuil_min || 0, seuil_max ?? null, montant_par_commande,
    ordre || 0, actif !== undefined ? actif : 1, id
  ).run()

  return c.json({ success: true })
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM paliers_commissions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/admin/paliers/replace/:type - Remplacer tous les paliers d'un type
app.post('/replace/:type', async (c) => {
  const type = c.req.param('type')
  const { paliers } = await c.req.json()
  if (!Array.isArray(paliers)) return c.json({ error: 'paliers doit être un tableau' }, 400)

  await c.env.DB.prepare('DELETE FROM paliers_commissions WHERE type = ?').bind(type).run()

  for (let i = 0; i < paliers.length; i++) {
    const p = paliers[i]
    await c.env.DB.prepare(`
      INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre)
      VALUES (?, ?, ?, ?, ?)
    `).bind(type, p.seuil_min || 0, p.seuil_max ?? null, p.montant_par_commande, i + 1).run()
  }

  return c.json({ success: true, count: paliers.length })
})

export default app
