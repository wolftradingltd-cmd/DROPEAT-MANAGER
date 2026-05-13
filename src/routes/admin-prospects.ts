// ============================================================
// MODULE PROSPECTION — Aide à la prospection IA pour agents
// ============================================================
// Permet aux agents de gérer un pipeline de prospects :
// - Liste de leads (a_contacter / contacte / rdv / negociation / signe / perdu)
// - Score qualité (0-100)
// - Conversion en restaurant
// - Timeline d'actions
// - Suggestions IA (heuristique simple)
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// Helper : obtenir tous les agents de la branche d'un user (lui inclus)
async function getBranchAgentIds(db: D1Database, userId: number): Promise<number[]> {
  const ids = new Set<number>([userId])
  let frontier = [userId]
  for (let i = 0; i < 6; i++) {
    if (!frontier.length) break
    const placeholders = frontier.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT id FROM users WHERE parent_id IN (${placeholders})`
    ).bind(...frontier).all() as any
    frontier = results.map((r: any) => r.id).filter((id: number) => !ids.has(id))
    frontier.forEach(id => ids.add(id))
  }
  return Array.from(ids)
}

// GET /api/admin/prospects - Liste des prospects (filtré par scope)
app.get('/', async (c) => {
  const user = c.get('user')
  const statut = c.req.query('statut')
  const agent_id = c.req.query('agent_id')

  let where: string[] = ['p.archive = 0']
  let params: any[] = []

  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    where.push(`(p.agent_assigne_id IN (${branchIds.map(() => '?').join(',')}) OR p.cree_par_id = ?)`)
    params.push(...branchIds, user.id)
  }
  if (statut) { where.push('p.statut = ?'); params.push(statut) }
  if (agent_id) { where.push('p.agent_assigne_id = ?'); params.push(parseInt(agent_id)) }

  const sql = `
    SELECT p.*,
      a.nom || ' ' || a.prenom as agent_nom,
      a.email as agent_email,
      cr.nom || ' ' || cr.prenom as cree_par_nom,
      r.nom as restaurant_cree_nom,
      (SELECT COUNT(*) FROM prospect_actions WHERE prospect_id = p.id) as nb_actions
    FROM prospects p
    LEFT JOIN users a ON p.agent_assigne_id = a.id
    LEFT JOIN users cr ON p.cree_par_id = cr.id
    LEFT JOIN restaurants r ON p.restaurant_cree_id = r.id
    WHERE ${where.join(' AND ')}
    ORDER BY p.statut = 'signe' DESC, p.score DESC, p.created_at DESC
    LIMIT 500
  `
  const { results } = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ prospects: results })
})

// GET /api/admin/prospects/stats - KPIs globaux pour kanban
app.get('/stats', async (c) => {
  const user = c.get('user')
  let scope = ''
  let params: any[] = []
  if (user.role !== 'superadmin') {
    const ids = await getBranchAgentIds(c.env.DB, user.id)
    scope = `AND (agent_assigne_id IN (${ids.map(() => '?').join(',')}) OR cree_par_id = ?)`
    params = [...ids, user.id]
  }
  const { results } = await c.env.DB.prepare(`
    SELECT statut, COUNT(*) as nb, AVG(score) as score_moy
    FROM prospects WHERE archive = 0 ${scope}
    GROUP BY statut
  `).bind(...params).all() as any

  const total = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM prospects WHERE archive = 0 ${scope}
  `).bind(...params).first() as any

  const conversions = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM prospects WHERE archive = 0 AND statut = 'signe' ${scope}
  `).bind(...params).first() as any

  const relances = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM prospects
    WHERE archive = 0 AND prochaine_relance IS NOT NULL
      AND prochaine_relance <= date('now', '+3 day') ${scope}
  `).bind(...params).first() as any

  return c.json({
    total: total?.n || 0,
    conversions: conversions?.n || 0,
    taux_conversion: total?.n ? Math.round((conversions?.n / total.n) * 100) : 0,
    relances_3j: relances?.n || 0,
    par_statut: results
  })
})

// GET /api/admin/prospects/:id - Détail + timeline
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const p = await c.env.DB.prepare(`
    SELECT p.*, a.nom || ' ' || a.prenom as agent_nom, a.email as agent_email,
      cr.nom || ' ' || cr.prenom as cree_par_nom
    FROM prospects p
    LEFT JOIN users a ON p.agent_assigne_id = a.id
    LEFT JOIN users cr ON p.cree_par_id = cr.id
    WHERE p.id = ?
  `).bind(id).first() as any
  if (!p) return c.json({ error: 'Prospect introuvable' }, 404)

  // Permission
  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (!branchIds.includes(p.agent_assigne_id) && p.cree_par_id !== user.id) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  const { results: actions } = await c.env.DB.prepare(`
    SELECT pa.*, u.nom || ' ' || u.prenom as user_nom
    FROM prospect_actions pa
    JOIN users u ON pa.user_id = u.id
    WHERE pa.prospect_id = ?
    ORDER BY pa.created_at DESC
  `).bind(id).all()

  return c.json({ prospect: p, actions })
})

// POST /api/admin/prospects - Créer un prospect
app.post('/', async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  if (!b.nom_etablissement) return c.json({ error: 'Nom établissement requis' }, 400)

  const agentAssigne = b.agent_assigne_id || (user.role === 'agent' ? user.id : null)

  // Score initial : heuristique basée sur la complétude
  let score = 30
  if (b.telephone) score += 15
  if (b.email) score += 15
  if (b.adresse) score += 10
  if (b.type_cuisine) score += 10
  if (b.contact_nom) score += 10
  if (b.source && b.source !== 'inconnu') score += 10
  score = Math.min(100, score)

  const r = await c.env.DB.prepare(`
    INSERT INTO prospects (
      nom_etablissement, contact_nom, contact_prenom, telephone, email,
      adresse, ville, code_postal, type_cuisine, source, statut, score,
      agent_assigne_id, cree_par_id, prochaine_relance, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    b.nom_etablissement, b.contact_nom || null, b.contact_prenom || null,
    b.telephone || null, b.email || null, b.adresse || null, b.ville || null,
    b.code_postal || null, b.type_cuisine || null, b.source || 'inconnu',
    b.statut || 'a_contacter', score,
    agentAssigne, user.id, b.prochaine_relance || null, b.notes || null
  ).run()

  return c.json({ success: true, id: r.meta.last_row_id, score })
})

// PUT /api/admin/prospects/:id - Mettre à jour
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const b = await c.req.json()

  const p = await c.env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first() as any
  if (!p) return c.json({ error: 'Introuvable' }, 404)

  // Permission
  if (user.role !== 'superadmin') {
    const branchIds = await getBranchAgentIds(c.env.DB, user.id)
    if (!branchIds.includes(p.agent_assigne_id) && p.cree_par_id !== user.id) {
      return c.json({ error: 'Accès refusé' }, 403)
    }
  }

  const fields = ['nom_etablissement', 'contact_nom', 'contact_prenom', 'telephone',
    'email', 'adresse', 'ville', 'code_postal', 'type_cuisine', 'source', 'statut',
    'score', 'agent_assigne_id', 'prochaine_relance', 'notes']
  const updates: string[] = []
  const params: any[] = []
  for (const f of fields) {
    if (b[f] !== undefined) { updates.push(`${f} = ?`); params.push(b[f]) }
  }
  if (!updates.length) return c.json({ error: 'Rien à mettre à jour' }, 400)
  updates.push("updated_at = CURRENT_TIMESTAMP")
  params.push(id)

  await c.env.DB.prepare(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params).run()

  // Si changement de statut → log dans timeline
  if (b.statut && b.statut !== p.statut) {
    await c.env.DB.prepare(`
      INSERT INTO prospect_actions (prospect_id, user_id, type_action, description, ancien_statut, nouveau_statut)
      VALUES (?, ?, 'changement_statut', ?, ?, ?)
    `).bind(id, user.id, `Statut: ${p.statut} → ${b.statut}`, p.statut, b.statut).run()
  }

  return c.json({ success: true })
})

// POST /api/admin/prospects/:id/action - Ajouter une action (appel, email, etc.)
app.post('/:id/action', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const { type_action, description } = await c.req.json()
  if (!type_action) return c.json({ error: 'type_action requis' }, 400)

  await c.env.DB.prepare(`
    INSERT INTO prospect_actions (prospect_id, user_id, type_action, description)
    VALUES (?, ?, ?, ?)
  `).bind(id, user.id, type_action, description || null).run()

  await c.env.DB.prepare(`
    UPDATE prospects SET derniere_action_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(id).run()

  return c.json({ success: true })
})

// POST /api/admin/prospects/:id/convert - Convertir en restaurant
app.post('/:id/convert', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const p = await c.env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first() as any
  if (!p) return c.json({ error: 'Prospect introuvable' }, 404)
  if (p.restaurant_cree_id) return c.json({ error: 'Déjà converti' }, 400)

  const agentId = p.agent_assigne_id || user.id

  const r = await c.env.DB.prepare(`
    INSERT INTO restaurants (nom, ville, adresse, code_postal, telephone, email, agent_id, actif)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    p.nom_etablissement, p.ville || null, p.adresse || null, p.code_postal || null,
    p.telephone || null, p.email || null, agentId
  ).run()

  const resto_id = r.meta.last_row_id

  await c.env.DB.prepare(`
    UPDATE prospects SET restaurant_cree_id = ?, statut = 'signe', date_conversion = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(resto_id, id).run()

  await c.env.DB.prepare(`
    INSERT INTO prospect_actions (prospect_id, user_id, type_action, description, ancien_statut, nouveau_statut)
    VALUES (?, ?, 'conversion', ?, ?, 'signe')
  `).bind(id, user.id, `Converti en restaurant #${resto_id}`, p.statut).run()

  return c.json({ success: true, restaurant_id: resto_id })
})

// DELETE /api/admin/prospects/:id - Archiver (soft delete)
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  const p = await c.env.DB.prepare('SELECT * FROM prospects WHERE id = ?').bind(id).first() as any
  if (!p) return c.json({ error: 'Introuvable' }, 404)

  if (user.role !== 'superadmin' && p.cree_par_id !== user.id) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  await c.env.DB.prepare('UPDATE prospects SET archive = 1 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/admin/prospects/ai-suggest - Suggestion IA (heuristique simple)
// Génère des leads similaires basés sur le profil saisi
app.post('/ai-suggest', async (c) => {
  const { type_cuisine, ville, code_postal } = await c.req.json()

  // Heuristique : suggère des types similaires + zones à explorer
  const suggestions: any[] = []
  const cuisines: Record<string, string[]> = {
    'pizza': ['Pizzeria artisanale', 'Pizzeria napolitaine', 'Pizza & pâtes'],
    'burger': ['Smash burger', 'Burger gourmet', 'American Diner'],
    'asiatique': ['Sushi & Wok', 'Bun bao', 'Ramen', 'Thaï express'],
    'kebab': ['Kebab traditionnel', 'Tacos français', 'Grec'],
    'libanais': ['Mezze libanais', 'Shawarma', 'Falafel'],
    'mexicain': ['Tacos mexicains', 'Burrito bar', 'Quesadilla'],
    'indien': ['Tandoori', 'Curry house', 'Naan & biryani'],
    'healthy': ['Poke bowl', 'Salad bar', 'Veggie box']
  }
  const key = (type_cuisine || '').toLowerCase()
  const ideas = cuisines[key] || ['Snack généraliste', 'Fast food', 'Spécialité régionale']

  for (const idea of ideas) {
    suggestions.push({
      type_etablissement: idea,
      zone_recommandee: ville || 'Zone urbaine dense',
      score_potentiel: 60 + Math.floor(Math.random() * 30),
      argument: `Forte demande sur ${ville || 'zones urbaines'} pour le concept "${idea}". Ciblez les commerces avec vitrine sans présence sur Uber Eats / Deliveroo.`,
      sources_recherche: [
        `Google Maps : "${idea} ${ville || code_postal || ''}"`,
        `Pages Jaunes : restaurants ${ville || ''}`,
        `Uber Eats : zones blanches autour de ${ville || code_postal || ''}`,
        `Insta/TikTok : #${idea.replace(/\s+/g, '').toLowerCase()} ${ville || ''}`
      ]
    })
  }

  return c.json({
    suggestions,
    conseils: [
      'Privilégiez les restaurants AVEC cuisine sur place mais SANS livraison.',
      'Demandez un KBIS récent dès le 1er contact pour qualifier.',
      'Proposez le concept marque virtuelle = 0€ d\'investissement.',
      'Une seule cuisine = max 3 marques virtuelles parallèles.'
    ]
  })
})

export default app
