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
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
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
// POST /api/admin/commissions/recalculer - Recalcul forcé d'une période (persiste traçabilité par commande)
app.post('/recalculer', async (c) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const { annee, mois } = await c.req.json()
  if (!annee || !mois) return c.json({ error: 'annee et mois requis' }, 400)
  const { recalculerCommissionsPeriode } = await import('../lib/auto-commissions')
  const r = await recalculerCommissionsPeriode(c.env.DB, annee, mois, 'recalcul_manuel')
  return c.json({ success: true, ...r })
})

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

/**
 * Échappe une valeur pour CSV (séparateur ;, quote ")
 */
function csvEscape(v: any): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
function csvLine(arr: any[]): string { return arr.map(csvEscape).join(';') }

// GET /api/admin/commissions/export?annee=&mois=&type=agents|restaurants
app.get('/export', async (c) => {
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const type = c.req.query('type') || 'agents'

  const commandes = await fetchCommandesAvecContexte(c.env.DB, annee, mois)
  const paliers = await getPaliers(c.env.DB)
  const calc = calculerCommissionsPeriode(commandes, paliers)

  let csv = ''
  const monthLabel = `${annee}-${String(mois).padStart(2, '0')}`

  if (type === 'restaurants') {
    csv = csvLine(['Restaurant', 'Nb commandes', 'CA brut', 'Facturation DropEat', 'Commissions agents', 'Marge DropEat']) + '\n'
    for (const r of calc.par_restaurant) {
      csv += csvLine([r.restaurant_nom, r.nb_commandes, r.ca.toFixed(2), r.facturation.toFixed(2),
        r.commissions.toFixed(2), r.marge_dropeat.toFixed(2)]) + '\n'
    }
  } else {
    // agents
    const enriched = await enrichirAgents(c.env.DB, calc.par_agent)
    csv = csvLine(['Email', 'Nom', 'Prénom', 'Niveau', 'Cmds propres', 'Comm. propre',
      'Cmds portefeuille', 'Comm. portefeuille', 'Cmds N1', 'Comm. N1', 'Cmds N2', 'Comm. N2', 'Total à payer']) + '\n'
    for (const a of enriched) {
      const niv = a.niveau === 0 ? 'Agent' : a.niveau === 1 ? 'Sous-agent N1' : 'Sous-agent N2'
      csv += csvLine([a.email, a.nom, a.prenom, niv,
        a.nb_commandes_propres, a.commission_propre.toFixed(2),
        a.nb_commandes_portefeuille, a.commission_portefeuille.toFixed(2),
        a.nb_commandes_n1, a.commission_n1.toFixed(2),
        a.nb_commandes_n2, a.commission_n2.toFixed(2),
        a.total.toFixed(2)]) + '\n'
    }
  }

  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="commissions-${type}-${monthLabel}.csv"`
    }
  })
})

// GET /api/admin/commissions/commandes?annee=&mois=&restaurant_id=
app.get('/commandes', async (c) => {
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const restaurant_id = c.req.query('restaurant_id')

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  let q = `
    SELECT c.id, c.uber_order_id, c.date_commande, c.montant_brut, c.frais_uber, c.montant_net,
           c.statut, c.paye_integralement,
           m.nom as marque_nom, m.is_portefeuille_proprietaire as marque_pf,
           r.id as restaurant_id, r.nom as restaurant_nom, r.tablette_sr_shop,
           r.is_portefeuille_proprietaire as resto_pf,
           u.id as agent_id, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE c.date_commande >= ? AND c.date_commande <= ?
  `
  const params: any[] = [debut, fin]
  if (restaurant_id) { q += ' AND r.id = ?'; params.push(restaurant_id) }
  q += ' ORDER BY c.date_commande DESC LIMIT 500'

  const { results } = await c.env.DB.prepare(q).bind(...params).all() as any

  // Calculer commission par commande
  const enriched = results.map((row: any) => {
    const isPf = !!(row.resto_pf || row.marque_pf)
    const facPaliers = row.tablette_sr_shop ? paliers ? null : null : null
    return row
  })

  return c.json({ commandes: results })
})

export default app
