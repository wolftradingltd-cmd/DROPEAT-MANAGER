import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import {
  getPaliers,
  calculerCommissionsPeriode,
  type CommandeWithContext
} from '../lib/commissions'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireAuth)

/**
 * Récupère les commandes d'une période avec tout le contexte nécessaire pour le calcul.
 * Si scopeAgentIds est fourni, on filtre uniquement les commandes des restos de ces agents.
 */
async function fetchCommandesAvecContexte(
  db: D1Database,
  annee: number,
  mois: number,
  scopeAgentIds?: number[]
): Promise<CommandeWithContext[]> {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  let query = `
    SELECT 
      c.id, c.date_commande, c.montant_brut,
      m.id as marque_id, m.nom as marque_nom, m.is_portefeuille_proprietaire as marque_is_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.is_portefeuille_proprietaire as restaurant_is_portefeuille,
      r.tablette_sr_shop,
      r.agent_id,
      u.niveau as agent_niveau, u.parent_id as agent_parent_id,
      u2.parent_id as agent_grand_parent_id
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users u2 ON u.parent_id = u2.id
    WHERE c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut != 'annulee'
      AND c.paye_integralement = 1
  `
  const params: any[] = [debut, fin]

  if (scopeAgentIds && scopeAgentIds.length > 0) {
    query += ` AND r.agent_id IN (${scopeAgentIds.map(() => '?').join(',')})`
    params.push(...scopeAgentIds)
  }

  const { results } = await db.prepare(query).bind(...params).all() as any
  return results
}

/**
 * Helper : ids de la branche d'un user (lui + descendants)
 */
async function getBranchAgentIds(db: D1Database, userId: number): Promise<number[]> {
  const ids: number[] = [userId]
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    const { results } = await db.prepare('SELECT id FROM users WHERE parent_id = ?').bind(cur).all() as any
    for (const r of results) { ids.push(r.id); queue.push(r.id) }
  }
  return ids
}

// GET /api/commissions/recap?annee=2026&mois=4
// Récap superadmin OU récap agent (limité à sa branche)
app.get('/recap', async (c) => {
  const user = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))

  let scopeIds: number[] | undefined
  if (user.role !== 'superadmin') {
    scopeIds = await getBranchAgentIds(c.env.DB, user.id)
  }

  const commandes = await fetchCommandesAvecContexte(c.env.DB, annee, mois, scopeIds)
  const paliers = await getPaliers(c.env.DB)
  const calc = calculerCommissionsPeriode(commandes, paliers)

  // Convertir Map en array pour JSON
  const par_agent = await enrichirAgents(c.env.DB, calc.par_agent)

  return c.json({
    periode: { annee, mois },
    totaux: calc.totaux,
    par_restaurant: calc.par_restaurant,
    par_agent,
    nb_commandes_brut: commandes.length
  })
})

// GET /api/commissions/agent/:id?annee=&mois=
app.get('/agent/:id', async (c) => {
  const user = c.get('user')
  const targetId = parseInt(c.req.param('id'))
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))

  // Agent : ne peut voir que lui-même ou sa descendance
  if (user.role !== 'superadmin') {
    const branch = await getBranchAgentIds(c.env.DB, user.id)
    if (!branch.includes(targetId)) return c.json({ error: 'Accès refusé' }, 403)
  }

  const target = await c.env.DB.prepare('SELECT id, nom, prenom, niveau, parent_id, email FROM users WHERE id = ?')
    .bind(targetId).first() as any
  if (!target) return c.json({ error: 'Agent introuvable' }, 404)

  // Récupère TOUTES les commandes de la période (on filtre ensuite localement pour cet agent)
  const commandes = await fetchCommandesAvecContexte(c.env.DB, annee, mois)
  const paliers = await getPaliers(c.env.DB)
  const calc = calculerCommissionsPeriode(commandes, paliers)

  const detail = calc.par_agent.get(targetId) || {
    agent_id: targetId, total: 0,
    commission_propre: 0, commission_portefeuille: 0,
    commission_n1: 0, commission_n2: 0,
    nb_commandes_propres: 0, nb_commandes_portefeuille: 0,
    nb_commandes_n1: 0, nb_commandes_n2: 0
  }

  // Détails par restaurant pour cet agent
  const restosDetails = calc.par_restaurant.filter(r => {
    // Garder uniquement les restos qui contribuent aux commissions de cet agent
    return commandes.some(cmd =>
      cmd.restaurant_id === r.restaurant_id &&
      (cmd.agent_id === targetId || cmd.agent_parent_id === targetId || cmd.agent_grand_parent_id === targetId)
    )
  })

  // Vérifier paiement existant
  const paiement = await c.env.DB.prepare(
    'SELECT * FROM paiements WHERE agent_id = ? AND periode_annee = ? AND periode_mois = ?'
  ).bind(targetId, annee, mois).first()

  return c.json({
    agent: target,
    periode: { annee, mois },
    detail,
    restaurants: restosDetails,
    paiement_existant: paiement
  })
})

/**
 * Enrichit la map des agents avec leurs infos (nom, prénom, niveau)
 */
async function enrichirAgents(db: D1Database, agentMap: Map<number, any>): Promise<any[]> {
  if (agentMap.size === 0) return []
  const ids = Array.from(agentMap.keys())
  const { results } = await db.prepare(
    `SELECT id, nom, prenom, niveau, email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`
  ).bind(...ids).all() as any

  const infoMap = new Map<number, any>()
  results.forEach((r: any) => infoMap.set(r.id, r))

  const out: any[] = []
  for (const [id, detail] of agentMap.entries()) {
    const info = infoMap.get(id)
    if (info) {
      out.push({
        ...detail,
        nom: info.nom,
        prenom: info.prenom,
        niveau: info.niveau,
        email: info.email
      })
    }
  }
  out.sort((a, b) => b.total - a.total)
  return out
}

export default app
