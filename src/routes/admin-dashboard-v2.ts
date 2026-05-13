// ============================================================
// DASHBOARD ENRICHI v2 — KPIs, graphiques, alertes, top performers
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// GET /api/admin/dashboard-v2/overview - Vue d'ensemble enrichie
app.get('/overview', async (c) => {
  const user = c.get('user')
  const isSuper = user.role === 'superadmin'

  // Scope SQL
  let scopeAgents = ''
  const scopeParams: any[] = []
  if (!isSuper) {
    // branch IDs
    const ids = new Set<number>([user.id])
    let frontier = [user.id]
    for (let i = 0; i < 6; i++) {
      if (!frontier.length) break
      const ph = frontier.map(() => '?').join(',')
      const { results } = await c.env.DB.prepare(
        `SELECT id FROM users WHERE parent_id IN (${ph})`
      ).bind(...frontier).all() as any
      frontier = results.map((r: any) => r.id).filter((id: number) => !ids.has(id))
      frontier.forEach(id => ids.add(id))
    }
    const arr = Array.from(ids)
    scopeAgents = ` AND r.agent_id IN (${arr.map(() => '?').join(',')})`
    scopeParams.push(...arr)
  }

  // ===== KPIs principaux =====
  const kpiAgents = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM users WHERE role IN ('agent','superadmin') AND actif = 1
  `).first() as any

  const kpiResto = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM restaurants r WHERE 1=1 ${scopeAgents}
  `).bind(...scopeParams).first() as any

  const kpiMarques = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE 1=1 ${scopeAgents}
  `).bind(...scopeParams).first() as any

  const kpiCommandes = await c.env.DB.prepare(`
    SELECT COUNT(*) as n, COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE 1=1 ${scopeAgents}
  `).bind(...scopeParams).first() as any

  // ===== Évolution mensuelle 6 derniers mois =====
  const { results: monthly } = await c.env.DB.prepare(`
    SELECT
      strftime('%Y-%m', c.date_commande) as mois,
      COUNT(*) as nb_cmd,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COUNT(DISTINCT c.marque_id) as nb_marques
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE c.date_commande >= date('now', '-6 month') ${scopeAgents}
    GROUP BY mois ORDER BY mois
  `).bind(...scopeParams).all()

  // ===== Top 5 restaurants =====
  const { results: topResto } = await c.env.DB.prepare(`
    SELECT r.id, r.nom, r.ville, r.is_portefeuille_proprietaire,
      u.nom || ' ' || u.prenom as agent_nom,
      COUNT(c.id) as nb_cmd,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
    WHERE 1=1 ${scopeAgents}
    GROUP BY r.id ORDER BY ca DESC LIMIT 5
  `).bind(...scopeParams).all()

  // ===== Top 5 agents =====
  const { results: topAgents } = await c.env.DB.prepare(`
    SELECT u.id, u.nom || ' ' || u.prenom as nom, u.email, u.niveau,
      COUNT(DISTINCT r.id) as nb_resto,
      COUNT(DISTINCT m.id) as nb_marques,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM users u
    LEFT JOIN restaurants r ON r.agent_id = u.id
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
    WHERE u.role IN ('agent', 'superadmin')
    GROUP BY u.id ORDER BY ca DESC LIMIT 5
  `).all()

  // ===== Alertes =====
  const alerteDocs = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM restaurant_documents
    WHERE date_expiration IS NOT NULL
      AND date_expiration <= date('now', '+30 day')
      AND statut = 'valide'
  `).first() as any

  const alerteAttribution = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM demandes_attribution_marque WHERE statut = 'en_attente'
  `).first() as any

  const alerteRelances = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM prospects
    WHERE archive = 0 AND prochaine_relance IS NOT NULL
      AND prochaine_relance <= date('now', '+3 day')
  `).first() as any

  // Tranches en cours (proches du 5e)
  const { results: tranchesProches } = await c.env.DB.prepare(`
    SELECT t.id, t.agent_id, t.type, t.numero_tranche,
      u.nom || ' ' || u.prenom as agent_nom,
      (SELECT COUNT(*) FROM tranche_elements WHERE tranche_id = t.id) as compteur
    FROM tranches_attribution t
    JOIN users u ON t.agent_id = u.id
    WHERE t.statut = 'ouverte'
    ORDER BY compteur DESC LIMIT 10
  `).all() as any
  const tranchesAlerte = tranchesProches.filter((t: any) => t.compteur >= 4)

  // ===== Conversion prospects → restaurants =====
  const conv = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN statut = 'signe' THEN 1 ELSE 0 END) as signes,
      SUM(CASE WHEN statut = 'perdu' THEN 1 ELSE 0 END) as perdus
    FROM prospects WHERE archive = 0
  `).first() as any

  // ===== Notifications non lues =====
  const notifs = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM notifications WHERE destinataire_id = ? AND lu = 0
  `).bind(user.id).first() as any

  return c.json({
    kpi: {
      agents: kpiAgents?.n || 0,
      restaurants: kpiResto?.n || 0,
      marques: kpiMarques?.n || 0,
      commandes: kpiCommandes?.n || 0,
      ca_total: kpiCommandes?.ca || 0,
      ca_moyen: kpiCommandes?.n ? Math.round(kpiCommandes.ca / kpiCommandes.n * 100) / 100 : 0
    },
    evolution_mensuelle: monthly,
    top_restaurants: topResto,
    top_agents: topAgents,
    alertes: {
      documents_expirent: alerteDocs?.n || 0,
      demandes_attribution: alerteAttribution?.n || 0,
      relances_prospects_3j: alerteRelances?.n || 0,
      tranches_proches: tranchesAlerte,
      notifications_non_lues: notifs?.n || 0
    },
    conversion_prospects: {
      total: conv?.total || 0,
      signes: conv?.signes || 0,
      perdus: conv?.perdus || 0,
      taux: conv?.total ? Math.round((conv.signes / conv.total) * 100) : 0
    }
  })
})

// GET /api/admin/dashboard-v2/sparkline/:agent_id - Mini graph CA agent
app.get('/sparkline/:agent_id', async (c) => {
  const agent_id = parseInt(c.req.param('agent_id'))
  const { results } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m-%d', c.date_commande) as jour,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id = ? AND c.date_commande >= date('now', '-30 day')
    GROUP BY jour ORDER BY jour
  `).bind(agent_id).all()
  return c.json({ data: results })
})

// GET /api/admin/dashboard-v2/notifications - Notifications du user courant
app.get('/notifications', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM notifications WHERE destinataire_id = ?
    ORDER BY lu, created_at DESC LIMIT 50
  `).bind(user.id).all()
  return c.json({ notifications: results })
})

// PUT /api/admin/dashboard-v2/notifications/:id/lu
app.put('/notifications/:id/lu', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare(`UPDATE notifications SET lu = 1 WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})

// POST /api/admin/dashboard-v2/notifications/lu-tout
app.post('/notifications/lu-tout', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare(`UPDATE notifications SET lu = 1 WHERE destinataire_id = ?`)
    .bind(user.id).run()
  return c.json({ success: true })
})

export default app
