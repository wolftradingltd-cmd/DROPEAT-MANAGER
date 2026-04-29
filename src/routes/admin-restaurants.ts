import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { isRangPortefeuille } from '../lib/commissions'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

/**
 * Recalcule les rangs et le statut Portefeuille Propriétaire des restaurants d'un agent.
 * Règle : tous les 5 restos apportés, le 5e (10e, 15e...) est en Portefeuille (100% pour l'agent).
 */
async function recalculerPortefeuilleAgent(db: D1Database, agentId: number) {
  if (!agentId) return
  const { results } = await db.prepare(`
    SELECT id FROM restaurants 
    WHERE agent_id = ? 
    ORDER BY date_signature ASC, id ASC
  `).bind(agentId).all() as any

  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    const isPortefeuille = isRangPortefeuille(rang) ? 1 : 0
    await db.prepare(`
      UPDATE restaurants SET rang_apport = ?, is_portefeuille_proprietaire = ? WHERE id = ?
    `).bind(rang, isPortefeuille, results[i].id).run()
  }
}

/**
 * Recalcule les rangs et statut Portefeuille des marques d'un restaurant.
 * Règle : tous les 5 marques créées, la 5e (10e...) appartient à l'agent.
 * EXCEPTION : si le restaurant est déjà Portefeuille Propriétaire, toutes ses marques aussi.
 */
async function recalculerPortefeuilleMarques(db: D1Database, restaurantId: number) {
  const resto = await db.prepare('SELECT is_portefeuille_proprietaire FROM restaurants WHERE id = ?')
    .bind(restaurantId).first() as any
  const restoPortefeuille = !!resto?.is_portefeuille_proprietaire

  const { results } = await db.prepare(`
    SELECT id FROM marques_virtuelles 
    WHERE restaurant_id = ? 
    ORDER BY date_lancement ASC, id ASC
  `).bind(restaurantId).all() as any

  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    // Soit le resto entier est Portefeuille (toutes marques = 100% agent)
    // Soit on applique la règle des 5 marques
    const isPortefeuille = restoPortefeuille ? 1 : (isRangPortefeuille(rang) ? 1 : 0)
    await db.prepare(`
      UPDATE marques_virtuelles SET rang_creation = ?, is_portefeuille_proprietaire = ? WHERE id = ?
    `).bind(rang, isPortefeuille, results[i].id).run()
  }
}

// GET /api/admin/restaurants - Tous les restaurants
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT r.*,
           u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
           (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.created_at DESC
  `).all()
  return c.json({ restaurants: results })
})

// GET /api/admin/restaurants/:id - Détail
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau, u.email as agent_email
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.id = ?
  `).bind(id).first()
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)

  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.*,
           (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total
    FROM marques_virtuelles m
    WHERE m.restaurant_id = ?
    ORDER BY m.rang_creation, m.id
  `).bind(id).all()

  return c.json({ restaurant: r, marques })
})

// POST /api/admin/restaurants - Créer
app.post('/', async (c) => {
  const data = await c.req.json()
  const { 
    nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes 
  } = data

  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO restaurants (
      nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
      contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nom, raison_sociale || null, siret || null, adresse || null,
    code_postal || null, ville || null, pays || 'France',
    telephone || null, email || null, contact_nom || null,
    agent_id || null, date_signature || null, date_lancement || null,
    tablette_sr_shop ? 1 : 0, notes || null
  ).run()

  // Recalculer les rangs Portefeuille pour cet agent
  if (agent_id) await recalculerPortefeuilleAgent(c.env.DB, agent_id)

  return c.json({ success: true, id: result.meta.last_row_id })
})

// PUT /api/admin/restaurants/:id
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const oldResto = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  const oldAgentId = oldResto?.agent_id

  const {
    nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, actif, notes
  } = data

  await c.env.DB.prepare(`
    UPDATE restaurants SET
      nom = ?, raison_sociale = ?, siret = ?, adresse = ?, code_postal = ?, ville = ?, pays = ?,
      telephone = ?, email = ?, contact_nom = ?, agent_id = ?, date_signature = ?, date_lancement = ?,
      tablette_sr_shop = ?, actif = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nom, raison_sociale || null, siret || null, adresse || null,
    code_postal || null, ville || null, pays || 'France',
    telephone || null, email || null, contact_nom || null,
    agent_id || null, date_signature || null, date_lancement || null,
    tablette_sr_shop ? 1 : 0,
    actif !== undefined ? actif : 1, notes || null, id
  ).run()

  // Si changement d'agent, recalculer pour l'ancien et le nouveau
  if (oldAgentId !== agent_id) {
    if (oldAgentId) await recalculerPortefeuilleAgent(c.env.DB, oldAgentId)
    if (agent_id) await recalculerPortefeuilleAgent(c.env.DB, agent_id)
  } else if (agent_id) {
    // Le rang Portefeuille peut avoir bougé, on recalcule les marques
    await recalculerPortefeuilleMarques(c.env.DB, parseInt(id))
  }

  return c.json({ success: true })
})

// DELETE /api/admin/restaurants/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  await c.env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(id).run()
  if (r?.agent_id) await recalculerPortefeuilleAgent(c.env.DB, r.agent_id)
  return c.json({ success: true })
})

// POST /api/admin/restaurants/:id/reassign - Changer l'agent d'un resto
app.post('/:id/reassign', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { new_agent_id } = await c.req.json()

  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  const oldAgentId = r?.agent_id

  await c.env.DB.prepare('UPDATE restaurants SET agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(new_agent_id || null, id).run()

  if (oldAgentId) await recalculerPortefeuilleAgent(c.env.DB, oldAgentId)
  if (new_agent_id) await recalculerPortefeuilleAgent(c.env.DB, new_agent_id)

  return c.json({ success: true })
})

// POST /api/admin/restaurants/:id/recalc-portefeuille - Forcer le recalcul
app.post('/:id/recalc-portefeuille', async (c) => {
  const id = parseInt(c.req.param('id'))
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (r?.agent_id) await recalculerPortefeuilleAgent(c.env.DB, r.agent_id)
  await recalculerPortefeuilleMarques(c.env.DB, id)
  return c.json({ success: true })
})

// ========== MARQUES VIRTUELLES ==========

// GET /api/admin/restaurants/marques/all
app.get('/marques/all', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, r.nom as restaurant_nom, r.is_portefeuille_proprietaire as resto_portefeuille,
           u.nom as agent_nom, u.prenom as agent_prenom, u.id as agent_id
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.nom, m.rang_creation
  `).all()
  return c.json({ marques: results })
})

// POST /api/admin/restaurants/:id/marques
app.post('/:id/marques', async (c) => {
  const restaurant_id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const { nom, uber_store_id, plateforme, date_lancement, notes } = data

  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles (restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    restaurant_id, nom, uber_store_id || null,
    plateforme || 'uber_eats', date_lancement || null, notes || null
  ).run()

  await recalculerPortefeuilleMarques(c.env.DB, restaurant_id)

  return c.json({ success: true, id: result.meta.last_row_id })
})

// PUT /api/admin/restaurants/marques/:marque_id
app.put('/marques/:marque_id', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const data = await c.req.json()
  const { nom, uber_store_id, plateforme, date_lancement, actif, notes } = data

  const m = await c.env.DB.prepare('SELECT restaurant_id FROM marques_virtuelles WHERE id = ?')
    .bind(marque_id).first() as any

  await c.env.DB.prepare(`
    UPDATE marques_virtuelles SET
      nom = ?, uber_store_id = ?, plateforme = ?, date_lancement = ?, actif = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nom, uber_store_id || null, plateforme || 'uber_eats',
    date_lancement || null, actif !== undefined ? actif : 1, notes || null, marque_id
  ).run()

  if (m?.restaurant_id) await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)

  return c.json({ success: true })
})

// DELETE marque
app.delete('/marques/:marque_id', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const m = await c.env.DB.prepare('SELECT restaurant_id FROM marques_virtuelles WHERE id = ?')
    .bind(marque_id).first() as any
  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(marque_id).run()
  if (m?.restaurant_id) await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

// POST /api/admin/restaurants/marques/:marque_id/toggle-portefeuille
// Force manuellement le statut Portefeuille (override)
app.post('/marques/:marque_id/toggle-portefeuille', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const { is_portefeuille } = await c.req.json()
  await c.env.DB.prepare('UPDATE marques_virtuelles SET is_portefeuille_proprietaire = ? WHERE id = ?')
    .bind(is_portefeuille ? 1 : 0, marque_id).run()
  return c.json({ success: true })
})

export default app
