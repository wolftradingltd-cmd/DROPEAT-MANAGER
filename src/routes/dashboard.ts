import { Hono } from 'hono'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// GET /api/dashboard - Statistiques globales
app.get('/', async (c) => {
  const db = c.env.DB

  // Compteurs
  const stats: any = {}

  const cnt = async (q: string) => {
    const r = await db.prepare(q).first() as any
    return r?.c || 0
  }

  stats.nb_agents = await cnt('SELECT COUNT(*) as c FROM agents WHERE actif = 1')
  stats.nb_agents_n1 = await cnt('SELECT COUNT(*) as c FROM agents WHERE actif = 1 AND niveau = 1')
  stats.nb_agents_n2 = await cnt('SELECT COUNT(*) as c FROM agents WHERE actif = 1 AND niveau = 2')
  stats.nb_agents_n3 = await cnt('SELECT COUNT(*) as c FROM agents WHERE actif = 1 AND niveau = 3')
  stats.nb_restaurants = await cnt('SELECT COUNT(*) as c FROM restaurants WHERE actif = 1')
  stats.nb_marques = await cnt('SELECT COUNT(*) as c FROM marques_virtuelles WHERE actif = 1')
  stats.nb_commandes = await cnt('SELECT COUNT(*) as c FROM commandes')

  // CA total
  const caTotal = await db.prepare('SELECT COALESCE(SUM(montant_net), 0) as total FROM commandes').first() as any
  stats.ca_total = caTotal?.total || 0

  // Mois en cours
  const now = new Date()
  const debut = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const ca_mois = await db.prepare(
    'SELECT COALESCE(SUM(montant_net), 0) as total, COUNT(*) as nb FROM commandes WHERE date_commande >= ?'
  ).bind(debut).first() as any
  stats.ca_mois_courant = ca_mois?.total || 0
  stats.nb_commandes_mois = ca_mois?.nb || 0

  // Top 5 restaurants
  const { results: topRestos } = await db.prepare(`
    SELECT r.id, r.nom,
           COALESCE(SUM(c.montant_net), 0) as ca,
           COUNT(c.id) as nb_commandes
    FROM restaurants r
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
    GROUP BY r.id
    ORDER BY ca DESC
    LIMIT 5
  `).all()

  // Top 5 agents
  const { results: topAgents } = await db.prepare(`
    SELECT a.id, a.nom, a.prenom, a.niveau,
           COUNT(DISTINCT r.id) as nb_restaurants,
           COALESCE(SUM(c.montant_net), 0) as ca_total
    FROM agents a
    LEFT JOIN restaurants r ON r.agent_id = a.id
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
    WHERE a.actif = 1
    GROUP BY a.id
    ORDER BY ca_total DESC
    LIMIT 5
  `).all()

  // Évolution 6 derniers mois (CA)
  const { results: evolution } = await db.prepare(`
    SELECT 
      strftime('%Y-%m', date_commande) as mois,
      COALESCE(SUM(montant_net), 0) as ca,
      COUNT(*) as nb_commandes
    FROM commandes
    WHERE date_commande >= date('now', '-6 months')
    GROUP BY mois
    ORDER BY mois
  `).all()

  return c.json({
    stats,
    top_restaurants: topRestos,
    top_agents: topAgents,
    evolution
  })
})

export default app
