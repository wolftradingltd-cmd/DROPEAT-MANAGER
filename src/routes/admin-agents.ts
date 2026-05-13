// ============================================================
// Drill-down Agent → Restaurants → Marques → CA
// ============================================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { getEtatTranches } from '../lib/tranches'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireSuperadmin)

// GET /api/admin/agents - Liste des agents avec compteurs (restos, marques, CA, sous-agents)
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.telephone, u.niveau, u.parent_id,
           u.iban, u.actif, u.derniere_connexion, u.created_at,
           p.nom as parent_nom, p.prenom as parent_prenom, p.niveau as parent_niveau,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id AND r.is_portefeuille_proprietaire = 1) as nb_restos_portefeuille,
           (SELECT COUNT(*) FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_marques,
           (SELECT COUNT(*) FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
           (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as ca_total,
           (SELECT COUNT(*) FROM users s WHERE s.parent_id = u.id) as nb_sous_agents
    FROM users u
    LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.role = 'agent'
    ORDER BY u.niveau, u.nom
  `).all()
  return c.json({ agents: results })
})

// GET /api/admin/agents/:id - Détail complet (drill-down)
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const agent = await c.env.DB.prepare(`
    SELECT u.*, p.nom as parent_nom, p.prenom as parent_prenom, p.niveau as parent_niveau
    FROM users u LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.id = ? AND u.role = 'agent'
  `).bind(id).first()
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404)

  // Restaurants de l'agent (avec stats agrégées)
  const { results: restaurants } = await c.env.DB.prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
           (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total,
           (SELECT MAX(c.date_commande) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as derniere_commande
    FROM restaurants r
    WHERE r.agent_id = ?
    ORDER BY r.rang_apport, r.id
  `).bind(id).all() as any

  // Marques par restaurant (avec CA par marque)
  const restoIds = (restaurants as any[]).map(r => r.id)
  let marquesParResto: Record<number, any[]> = {}
  if (restoIds.length) {
    const ph = restoIds.map(() => '?').join(',')
    const { results: marques } = await c.env.DB.prepare(`
      SELECT m.*,
             (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
             (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total,
             (SELECT COALESCE(SUM(c.montant_net), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_net,
             (SELECT MAX(c.date_commande) FROM commandes c WHERE c.marque_id = m.id) as derniere_commande,
             (SELECT MIN(c.date_commande) FROM commandes c WHERE c.marque_id = m.id) as premiere_commande
      FROM marques_virtuelles m
      WHERE m.restaurant_id IN (${ph})
      ORDER BY m.rang_creation, m.id
    `).bind(...restoIds).all() as any
    for (const m of marques as any[]) {
      if (!marquesParResto[m.restaurant_id]) marquesParResto[m.restaurant_id] = []
      marquesParResto[m.restaurant_id].push(m)
    }
  }

  const restosAvecMarques = (restaurants as any[]).map(r => ({
    ...r,
    marques: marquesParResto[r.id] || []
  }))

  // Sous-agents directs
  const { results: sousAgents } = await c.env.DB.prepare(`
    SELECT u.id, u.nom, u.prenom, u.email, u.niveau, u.actif,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c
              JOIN marques_virtuelles m ON c.marque_id = m.id
              JOIN restaurants r ON m.restaurant_id = r.id
              WHERE r.agent_id = u.id) as ca_total
    FROM users u WHERE u.parent_id = ? AND u.role = 'agent'
    ORDER BY u.niveau, u.nom
  `).bind(id).all() as any

  // État des tranches client + marque
  const trancheClient = await getEtatTranches(c.env.DB, id, 'client')
  const trancheMarque = await getEtatTranches(c.env.DB, id, 'marque')

  // Totaux agrégés
  const totaux = {
    nb_restaurants: restaurants.length,
    nb_marques: Object.values(marquesParResto).reduce((s: number, arr: any) => s + arr.length, 0),
    nb_commandes: (restaurants as any[]).reduce((s, r) => s + (r.nb_commandes || 0), 0),
    ca_total: (restaurants as any[]).reduce((s, r) => s + (r.ca_total || 0), 0),
    nb_sous_agents: sousAgents.length
  }

  return c.json({
    agent,
    totaux,
    restaurants: restosAvecMarques,
    sous_agents: sousAgents,
    tranches: { client: trancheClient, marque: trancheMarque }
  })
})

// GET /api/admin/agents/:id/marques/:marque_id/commandes - Commandes d'une marque
app.get('/:id/marques/:marque_id/commandes', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const limit = parseInt(c.req.query('limit') || '100')
  const { results } = await c.env.DB.prepare(`
    SELECT c.*, m.nom as marque_nom, r.nom as restaurant_nom
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE c.marque_id = ?
    ORDER BY c.date_commande DESC
    LIMIT ?
  `).bind(marque_id, limit).all()
  return c.json({ commandes: results })
})

export default app
