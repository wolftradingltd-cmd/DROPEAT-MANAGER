// ============================================================
// ROUTES ADMIN — DÉROGATIONS 100% EXCEPTIONNELLES
// ============================================================
// Permet à l'admin de gérer les dérogations qui octroient
// exceptionnellement 100% de la facturation à un agent (hors
// régime Portefeuille Propriétaire classique).
//
// Toutes les routes nécessitent role=superadmin.
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

// Toutes les routes : auth admin obligatoire
app.use('*', requireSuperadmin)

// ============================================================
// GET / — Liste toutes les dérogations avec filtres optionnels
// ============================================================
// Query params : statut (active/cloturee/expiree), agent_id, marque_id, restaurant_id
app.get('/', async (c) => {
  const statut = c.req.query('statut')
  const agentId = c.req.query('agent_id')
  const marqueId = c.req.query('marque_id')
  const restoId = c.req.query('restaurant_id')

  let where = '1=1'
  const params: any[] = []
  if (statut) { where += ' AND d.statut = ?'; params.push(statut) }
  if (agentId) { where += ' AND d.agent_id = ?'; params.push(parseInt(agentId)) }
  if (marqueId) { where += ' AND d.marque_id = ?'; params.push(parseInt(marqueId)) }
  if (restoId) { where += ' AND d.restaurant_id = ?'; params.push(parseInt(restoId)) }

  const { results } = await c.env.DB.prepare(`
    SELECT
      d.*,
      m.nom as marque_nom,
      r.nom as restaurant_nom,
      u.nom as agent_nom, u.prenom as agent_prenom, u.email as agent_email,
      adm.nom as cree_par_nom, adm.prenom as cree_par_prenom,
      cloturep.nom as cloturee_par_nom, cloturep.prenom as cloturee_par_prenom
    FROM derogations_100pct d
    LEFT JOIN marques_virtuelles m ON d.marque_id = m.id
    LEFT JOIN restaurants r ON d.restaurant_id = r.id
    LEFT JOIN users u ON d.agent_id = u.id
    LEFT JOIN users adm ON d.cree_par_admin_id = adm.id
    LEFT JOIN users cloturep ON d.cloturee_par_admin_id = cloturep.id
    WHERE ${where}
    ORDER BY d.cree_at DESC
  `).bind(...params).all() as any

  // Auto-expiration : marquer comme expirées les dérogations actives dont date_fin < aujourd'hui
  const today = new Date().toISOString().substring(0, 10)
  for (const d of results as any[]) {
    if (d.statut === 'active' && d.date_fin && d.date_fin < today) {
      await c.env.DB.prepare(`UPDATE derogations_100pct SET statut = 'expiree' WHERE id = ?`).bind(d.id).run()
      d.statut = 'expiree'
    }
  }

  return c.json({ derogations: results })
})

// ============================================================
// GET /eligibles — Liste restaurants et marques éligibles
// ============================================================
// = ceux qui ne sont PAS en portefeuille propriétaire
// (car le portefeuille prime, pas besoin de dérogation dessus)
app.get('/eligibles', async (c) => {
  const { results: restaurants } = await c.env.DB.prepare(`
    SELECT
      r.id, r.nom, r.adresse, r.ville,
      u.id as agent_id, u.nom as agent_nom, u.prenom as agent_prenom,
      (SELECT COUNT(*) FROM derogations_100pct d
        WHERE d.restaurant_id = r.id AND d.statut = 'active') as nb_derogations_actives
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE COALESCE(r.is_portefeuille_proprietaire, 0) = 0
    ORDER BY r.nom
  `).all() as any

  const { results: marques } = await c.env.DB.prepare(`
    SELECT
      m.id, m.nom, m.restaurant_id, r.nom as restaurant_nom,
      u.id as agent_id, u.nom as agent_nom, u.prenom as agent_prenom,
      (SELECT COUNT(*) FROM derogations_100pct d
        WHERE d.marque_id = m.id AND d.statut = 'active') as nb_derogations_actives
    FROM marques_virtuelles m
    LEFT JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE COALESCE(m.is_portefeuille_proprietaire, 0) = 0
    ORDER BY m.nom
  `).all() as any

  return c.json({ restaurants, marques })
})

// ============================================================
// POST / — Créer une dérogation
// ============================================================
// Body : { marque_id?, restaurant_id?, agent_id, date_debut, date_fin?, motif }
// Exactement marque_id OU restaurant_id doit être fourni.
app.post('/', async (c) => {
  const user = c.get('user') as any
  const body = await c.req.json()

  const { marque_id, restaurant_id, agent_id, date_debut, date_fin, motif } = body

  // Validations
  if (!agent_id) return c.json({ error: 'agent_id obligatoire' }, 400)
  if (!date_debut) return c.json({ error: 'date_debut obligatoire (format YYYY-MM-DD)' }, 400)
  if (!motif || motif.trim().length < 3) {
    return c.json({ error: 'motif obligatoire (min 3 caractères)' }, 400)
  }
  if ((marque_id && restaurant_id) || (!marque_id && !restaurant_id)) {
    return c.json({ error: 'Spécifier exactement marque_id OU restaurant_id (pas les deux)' }, 400)
  }
  if (date_fin && date_fin < date_debut) {
    return c.json({ error: 'date_fin doit être postérieure ou égale à date_debut' }, 400)
  }

  // Vérifier que la cible n'est PAS en portefeuille propriétaire
  if (marque_id) {
    const m = await c.env.DB.prepare(
      'SELECT id, nom, is_portefeuille_proprietaire FROM marques_virtuelles WHERE id = ?'
    ).bind(marque_id).first() as any
    if (!m) return c.json({ error: 'Marque introuvable' }, 404)
    if (m.is_portefeuille_proprietaire) {
      return c.json({
        error: `La marque "${m.nom}" est déjà en Portefeuille Propriétaire (100% agent). Aucune dérogation nécessaire.`
      }, 400)
    }
  }
  if (restaurant_id) {
    const r = await c.env.DB.prepare(
      'SELECT id, nom, is_portefeuille_proprietaire FROM restaurants WHERE id = ?'
    ).bind(restaurant_id).first() as any
    if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)
    if (r.is_portefeuille_proprietaire) {
      return c.json({
        error: `Le restaurant "${r.nom}" est déjà en Portefeuille Propriétaire (100% agent). Aucune dérogation nécessaire.`
      }, 400)
    }
  }

  // Vérifier qu'il n'y a pas déjà une dérogation active qui se chevauche
  const existing = await c.env.DB.prepare(`
    SELECT id, date_debut, date_fin FROM derogations_100pct
    WHERE statut = 'active'
      AND ((marque_id IS NOT NULL AND marque_id = ?) OR (restaurant_id IS NOT NULL AND restaurant_id = ?))
      AND (
        (date_fin IS NULL OR date_fin >= ?)
        AND (? IS NULL OR date_debut <= ?)
      )
    LIMIT 1
  `).bind(marque_id || -1, restaurant_id || -1, date_debut, date_fin || null, date_fin || '9999-12-31').first() as any

  if (existing) {
    return c.json({
      error: `Une dérogation active existe déjà sur cette cible (du ${existing.date_debut} au ${existing.date_fin || 'ouvert'})`
    }, 400)
  }

  // Vérifier que l'agent existe
  const agent = await c.env.DB.prepare('SELECT id, nom, prenom FROM users WHERE id = ?').bind(agent_id).first() as any
  if (!agent) return c.json({ error: 'Agent introuvable' }, 404)

  const result = await c.env.DB.prepare(`
    INSERT INTO derogations_100pct
      (marque_id, restaurant_id, agent_id, date_debut, date_fin, motif, cree_par_admin_id, statut)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).bind(
    marque_id || null,
    restaurant_id || null,
    agent_id,
    date_debut,
    date_fin || null,
    motif.trim(),
    user.id
  ).run()

  const id = result.meta.last_row_id

  // Recalculer les périodes impactées (mois couverts par la dérogation)
  // pour appliquer la dérogation aux commandes existantes
  try {
    const { recalculerCommissionsPeriode } = await import('../lib/auto-commissions')
    const startDate = new Date(date_debut)
    const endDate = date_fin ? new Date(date_fin) : new Date()
    const periodes = new Set<string>()
    const cursor = new Date(startDate)
    while (cursor <= endDate) {
      periodes.add(`${cursor.getFullYear()}-${cursor.getMonth() + 1}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    for (const p of periodes) {
      const [a, m] = p.split('-').map(Number)
      await recalculerCommissionsPeriode(c.env.DB, a, m, 'derogation_creee')
    }
  } catch (e: any) {
    console.error('Erreur recalcul après création dérogation:', e?.message || e)
  }

  return c.json({ success: true, id })
})

// ============================================================
// GET /:id — Détail d'une dérogation + impact (commandes concernées)
// ============================================================
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const d = await c.env.DB.prepare(`
    SELECT
      d.*,
      m.nom as marque_nom,
      r.nom as restaurant_nom,
      u.nom as agent_nom, u.prenom as agent_prenom, u.email as agent_email,
      adm.nom as cree_par_nom, adm.prenom as cree_par_prenom,
      cloturep.nom as cloturee_par_nom, cloturep.prenom as cloturee_par_prenom
    FROM derogations_100pct d
    LEFT JOIN marques_virtuelles m ON d.marque_id = m.id
    LEFT JOIN restaurants r ON d.restaurant_id = r.id
    LEFT JOIN users u ON d.agent_id = u.id
    LEFT JOIN users adm ON d.cree_par_admin_id = adm.id
    LEFT JOIN users cloturep ON d.cloturee_par_admin_id = cloturep.id
    WHERE d.id = ?
  `).bind(id).first() as any

  if (!d) return c.json({ error: 'Dérogation introuvable' }, 404)

  // Stats : nb commandes impactées + montant total redirigé
  const impact = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as nb_commandes,
      COALESCE(SUM(montant_brut), 0) as ca_brut,
      COALESCE(SUM(montant_facture_resto), 0) as facturation_redirigee,
      COALESCE(SUM(commission_portefeuille_montant), 0) as commission_agent_redirigee
    FROM commandes
    WHERE derogation_id = ?
      AND statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
  `).bind(id).first() as any

  return c.json({ derogation: d, impact })
})

// ============================================================
// POST /:id/cloturer — Clôturer manuellement une dérogation
// ============================================================
// Body : { motif_cloture }
app.post('/:id/cloturer', async (c) => {
  const user = c.get('user') as any
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const motifCloture = (body.motif_cloture || '').trim()

  if (motifCloture.length < 3) {
    return c.json({ error: 'motif_cloture obligatoire (min 3 caractères)' }, 400)
  }

  const d = await c.env.DB.prepare('SELECT id, statut, marque_id, restaurant_id, date_debut FROM derogations_100pct WHERE id = ?').bind(id).first() as any
  if (!d) return c.json({ error: 'Dérogation introuvable' }, 404)
  if (d.statut !== 'active') return c.json({ error: `Dérogation déjà ${d.statut}` }, 400)

  const today = new Date().toISOString().substring(0, 10)
  await c.env.DB.prepare(`
    UPDATE derogations_100pct
    SET statut = 'cloturee',
        cloturee_par_admin_id = ?,
        cloturee_at = CURRENT_TIMESTAMP,
        motif_cloture = ?,
        date_fin = COALESCE(date_fin, ?)
    WHERE id = ?
  `).bind(user.id, motifCloture, today, id).run()

  // Recalculer les mois impactés pour retirer la dérogation des futures commandes
  try {
    const { recalculerCommissionsPeriode } = await import('../lib/auto-commissions')
    const periodes = new Set<string>()
    const cursor = new Date(d.date_debut)
    const end = new Date(today)
    while (cursor <= end) {
      periodes.add(`${cursor.getFullYear()}-${cursor.getMonth() + 1}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    for (const p of periodes) {
      const [a, m] = p.split('-').map(Number)
      await recalculerCommissionsPeriode(c.env.DB, a, m, 'derogation_cloturee')
    }
  } catch (e: any) {
    console.error('Erreur recalcul après clôture dérogation:', e?.message || e)
  }

  return c.json({ success: true })
})

// ============================================================
// DELETE /:id — Supprimer une dérogation (réservé aux dérogations actives sans commandes impactées)
// ============================================================
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const d = await c.env.DB.prepare('SELECT id, statut, date_debut FROM derogations_100pct WHERE id = ?').bind(id).first() as any
  if (!d) return c.json({ error: 'Dérogation introuvable' }, 404)

  // Si des commandes y sont rattachées, on refuse la suppression (intégrité audit)
  const nbCmd = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM commandes WHERE derogation_id = ?'
  ).bind(id).first() as any
  if ((nbCmd?.n || 0) > 0) {
    return c.json({
      error: `Suppression impossible : ${nbCmd.n} commande(s) déjà calculée(s) avec cette dérogation. Clôturez-la plutôt pour préserver la traçabilité.`
    }, 400)
  }

  await c.env.DB.prepare('DELETE FROM derogations_100pct WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
