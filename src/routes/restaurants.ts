import { Hono } from 'hono'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// GET tous les restaurants
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT r.*,
           a.nom as agent_nom, a.prenom as agent_prenom,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques
    FROM restaurants r
    LEFT JOIN agents a ON r.agent_id = a.id
    ORDER BY r.nom
  `).all()
  return c.json({ restaurants: results })
})

// GET un restaurant avec ses marques
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const resto = await c.env.DB.prepare(`
    SELECT r.*, a.nom as agent_nom, a.prenom as agent_prenom
    FROM restaurants r
    LEFT JOIN agents a ON r.agent_id = a.id
    WHERE r.id = ?
  `).bind(id).first()

  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)

  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.*, 
           (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
           (SELECT COALESCE(SUM(montant_net), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total
    FROM marques_virtuelles m
    WHERE m.restaurant_id = ?
    ORDER BY m.nom
  `).bind(id).all()

  return c.json({ restaurant: resto, marques })
})

// POST créer un restaurant
app.post('/', async (c) => {
  const data = await c.req.json()
  const { nom, adresse, ville, telephone, email, agent_id, date_signature, notes } = data
  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO restaurants (nom, adresse, ville, telephone, email, agent_id, date_signature, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nom, adresse || null, ville || null, telephone || null, email || null,
    agent_id || null, date_signature || null, notes || null
  ).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// PUT modifier un restaurant
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { nom, adresse, ville, telephone, email, agent_id, date_signature, actif, notes } = data

  await c.env.DB.prepare(`
    UPDATE restaurants
    SET nom = ?, adresse = ?, ville = ?, telephone = ?, email = ?,
        agent_id = ?, date_signature = ?, actif = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nom, adresse || null, ville || null, telephone || null, email || null,
    agent_id || null, date_signature || null,
    actif !== undefined ? actif : 1, notes || null, id
  ).run()

  return c.json({ success: true })
})

// DELETE
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ===== MARQUES VIRTUELLES =====

// GET toutes les marques
app.get('/marques/all', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, r.nom as restaurant_nom,
           a.id as agent_id, a.nom as agent_nom, a.prenom as agent_prenom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN agents a ON r.agent_id = a.id
    ORDER BY r.nom, m.nom
  `).all()
  return c.json({ marques: results })
})

// POST créer une marque
app.post('/:id/marques', async (c) => {
  const restaurant_id = c.req.param('id')
  const data = await c.req.json()
  const { nom, uber_store_id, date_lancement, notes } = data
  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles (restaurant_id, nom, uber_store_id, date_lancement, notes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    restaurant_id, nom, uber_store_id || null,
    date_lancement || null, notes || null
  ).run()

  return c.json({ id: result.meta.last_row_id, success: true })
})

// PUT modifier une marque
app.put('/marques/:marque_id', async (c) => {
  const marque_id = c.req.param('marque_id')
  const data = await c.req.json()
  const { nom, uber_store_id, date_lancement, actif, notes } = data

  await c.env.DB.prepare(`
    UPDATE marques_virtuelles
    SET nom = ?, uber_store_id = ?, date_lancement = ?, actif = ?, notes = ?
    WHERE id = ?
  `).bind(
    nom, uber_store_id || null, date_lancement || null,
    actif !== undefined ? actif : 1, notes || null, marque_id
  ).run()

  return c.json({ success: true })
})

// DELETE marque
app.delete('/marques/:marque_id', async (c) => {
  const marque_id = c.req.param('marque_id')
  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(marque_id).run()
  return c.json({ success: true })
})

export default app
