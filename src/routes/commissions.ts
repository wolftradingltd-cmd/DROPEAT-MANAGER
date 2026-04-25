import { Hono } from 'hono'
import type { Bindings, Palier } from '../types'
import { calculerToutesCommissions } from '../lib/commissions'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Récupère les paliers actifs depuis la BDD
 */
async function getPaliers(db: D1Database) {
  const { results } = await db.prepare(`
    SELECT * FROM paliers_commissions WHERE actif = 1 ORDER BY type, ordre, seuil_min
  `).all() as any

  const paliers: Record<string, Palier[]> = {
    entreprise: [],
    agent: [],
    sous_agent: [],
    sous_sous_agent: []
  }
  results.forEach((p: any) => {
    if (paliers[p.type]) paliers[p.type].push(p)
  })
  return paliers
}

/**
 * Calcule le récap pour une période donnée (logique partagée)
 */
async function calculerRecapPeriode(db: D1Database, annee: number, mois: number) {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  // Agréger par restaurant
  const { results: restos } = await db.prepare(`
    SELECT 
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.agent_id,
      a.nom as agent_nom, a.prenom as agent_prenom, a.niveau as agent_niveau, a.parent_id as agent_parent,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca_brut,
      COALESCE(SUM(c.frais_uber), 0) as frais_uber,
      COALESCE(SUM(c.montant_net), 0) as ca_net
    FROM restaurants r
    LEFT JOIN agents a ON r.agent_id = a.id
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id 
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut != 'annulee'
    GROUP BY r.id
    HAVING nb_commandes > 0
    ORDER BY ca_net DESC
  `).bind(debut, fin).all() as any

  const paliers = await getPaliers(db)

  // Map agent
  const { results: allAgents } = await db.prepare(
    'SELECT id, nom, prenom, niveau, parent_id FROM agents'
  ).all() as any
  const agentMap = new Map<number, any>()
  allAgents.forEach((a: any) => agentMap.set(a.id, a))

  function getHierarchy(agentId: number | null) {
    if (!agentId) return { agent: null, sous_agent: null, sous_sous_agent: null }
    const a = agentMap.get(agentId)
    if (!a) return { agent: null, sous_agent: null, sous_sous_agent: null }

    if (a.niveau === 1) {
      return { agent: a, sous_agent: null, sous_sous_agent: null }
    } else if (a.niveau === 2) {
      const parent = a.parent_id ? agentMap.get(a.parent_id) : null
      return { agent: parent, sous_agent: a, sous_sous_agent: null }
    } else if (a.niveau === 3) {
      const parent = a.parent_id ? agentMap.get(a.parent_id) : null
      const grandParent = parent?.parent_id ? agentMap.get(parent.parent_id) : null
      return { agent: grandParent, sous_agent: parent, sous_sous_agent: a }
    }
    return { agent: a, sous_agent: null, sous_sous_agent: null }
  }

  const recap: any[] = []
  let total_ca = 0
  let total_com_entreprise = 0
  let total_com_agent = 0
  let total_com_sous_agent = 0
  let total_com_sous_sous_agent = 0

  for (const r of restos) {
    const hierarchy = getHierarchy(r.agent_id)
    const com = calculerToutesCommissions(
      r.ca_net,
      paliers.entreprise,
      paliers.agent,
      paliers.sous_agent,
      paliers.sous_sous_agent,
      !!hierarchy.agent,
      !!hierarchy.sous_agent,
      !!hierarchy.sous_sous_agent
    )

    total_ca += r.ca_net
    total_com_entreprise += com.commission_entreprise
    total_com_agent += com.commission_agent
    total_com_sous_agent += com.commission_sous_agent
    total_com_sous_sous_agent += com.commission_sous_sous_agent

    recap.push({ ...r, hierarchy, ...com })
  }

  return {
    periode: { annee, mois, debut, fin },
    totaux: {
      nb_restaurants: recap.length,
      ca_net: total_ca,
      commission_entreprise: total_com_entreprise,
      commission_agent: total_com_agent,
      commission_sous_agent: total_com_sous_agent,
      commission_sous_sous_agent: total_com_sous_sous_agent,
      marge_finale: total_com_entreprise - total_com_agent - total_com_sous_agent - total_com_sous_sous_agent
    },
    restaurants: recap
  }
}

/**
 * Calcule l'agrégation par agent (à payer)
 */
async function calculerAgentsAPayer(db: D1Database, annee: number, mois: number) {
  const recap = await calculerRecapPeriode(db, annee, mois)

  const agentTotals = new Map<number, any>()

  function add(agent: any, type: string, montant: number, restoNom: string, ca: number) {
    if (!agent || montant <= 0) return
    if (!agentTotals.has(agent.id)) {
      agentTotals.set(agent.id, {
        agent_id: agent.id,
        nom: agent.nom,
        prenom: agent.prenom,
        niveau: agent.niveau,
        total_a_payer: 0,
        details: []
      })
    }
    const a = agentTotals.get(agent.id)
    a.total_a_payer += montant
    a.details.push({ type, restaurant: restoNom, ca, montant })
  }

  for (const r of recap.restaurants) {
    add(r.hierarchy.agent, 'agent', r.commission_agent, r.restaurant_nom, r.ca_net)
    add(r.hierarchy.sous_agent, 'sous_agent', r.commission_sous_agent, r.restaurant_nom, r.ca_net)
    add(r.hierarchy.sous_sous_agent, 'sous_sous_agent', r.commission_sous_sous_agent, r.restaurant_nom, r.ca_net)
  }

  const { results: paiements } = await db.prepare(`
    SELECT agent_id, montant, statut FROM paiements
    WHERE periode_annee = ? AND periode_mois = ?
  `).bind(annee, mois).all() as any

  const paiementMap = new Map<number, any>()
  paiements.forEach((p: any) => paiementMap.set(p.agent_id, p))

  const result = Array.from(agentTotals.values()).map(a => ({
    ...a,
    paiement_existant: paiementMap.get(a.agent_id) || null
  }))

  result.sort((a, b) => b.total_a_payer - a.total_a_payer)

  return { periode: { annee, mois }, agents: result }
}

/**
 * GET /api/commissions/recap
 */
app.get('/recap', async (c) => {
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const data = await calculerRecapPeriode(c.env.DB, annee, mois)
  return c.json(data)
})

/**
 * GET /api/commissions/agents
 */
app.get('/agents', async (c) => {
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const data = await calculerAgentsAPayer(c.env.DB, annee, mois)
  return c.json(data)
})

/**
 * GET /api/commissions/agent/:id - détail pour un agent
 */
app.get('/agent/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))

  const agent = await c.env.DB.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first() as any
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404)

  const data = await calculerAgentsAPayer(c.env.DB, annee, mois)
  const a = data.agents.find((x: any) => x.agent_id === id) || {
    agent_id: id, total_a_payer: 0, details: []
  }

  return c.json({
    agent,
    periode: { annee, mois },
    ...a
  })
})

export default app
