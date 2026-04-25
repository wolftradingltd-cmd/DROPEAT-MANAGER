import { Hono } from 'hono'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// GET tous les agents (avec hiérarchie)
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, 
           p.nom as parent_nom, p.prenom as parent_prenom,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = a.id) as nb_restaurants,
           (SELECT COUNT(*) FROM agents s WHERE s.parent_id = a.id) as nb_sous_agents
    FROM agents a
    LEFT JOIN agents p ON a.parent_id = p.id
    ORDER BY a.niveau, a.nom, a.prenom
  `).all()
  return c.json({ agents: results })
})

// GET arbre hiérarchique
app.get('/tree', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, 
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = a.id) as nb_restaurants
    FROM agents a
    ORDER BY a.niveau, a.nom
  `).all() as any

  const map = new Map<number, any>()
  results.forEach((a: any) => map.set(a.id, { ...a, enfants: [] }))

  const roots: any[] = []
  results.forEach((a: any) => {
    if (a.parent_id && map.has(a.parent_id)) {
      map.get(a.parent_id).enfants.push(map.get(a.id))
    } else {
      roots.push(map.get(a.id))
    }
  })

  return c.json({ tree: roots })
})

// GET un agent
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first()
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404)
  return c.json({ agent })
})

// POST créer un agent
app.post('/', async (c) => {
  const data = await c.req.json()
  const { nom, prenom, email, telephone, niveau, parent_id, iban, notes } = data

  if (!nom || !prenom || !niveau) {
    return c.json({ error: 'Nom, prénom et niveau requis' }, 400)
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO agents (nom, prenom, email, telephone, niveau, parent_id, iban, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nom, prenom, email || null, telephone || null,
    niveau, parent_id || null, iban || null, notes || null
  ).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// PUT modifier un agent
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { nom, prenom, email, telephone, niveau, parent_id, iban, actif, notes } = data

  await c.env.DB.prepare(`
    UPDATE agents 
    SET nom = ?, prenom = ?, email = ?, telephone = ?, 
        niveau = ?, parent_id = ?, iban = ?, actif = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nom, prenom, email || null, telephone || null,
    niveau, parent_id || null, iban || null,
    actif !== undefined ? actif : 1, notes || null, id
  ).run()

  return c.json({ success: true })
})

// DELETE supprimer un agent
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM agents WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
