// ============================================================
// ROUTES — DEMANDES DE PAIEMENT
// ============================================================
// Agent :
//   GET  /api/demandes-paiement/cumul         -> cumul disponible (perso + branche)
//   POST /api/demandes-paiement               -> créer une demande (si seuil atteint)
//   GET  /api/demandes-paiement/mine          -> historique de l'agent
//   DELETE /api/demandes-paiement/:id         -> annuler (si en_attente)
//
// Superadmin :
//   GET /api/demandes-paiement/admin/all      -> liste toutes les demandes (filtres)
//   GET /api/demandes-paiement/admin/:id      -> détail d'une demande
//   POST /api/demandes-paiement/admin/:id/valider  -> valider + payer
//   POST /api/demandes-paiement/admin/:id/rejeter  -> rejeter avec motif
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import {
  getCumulDisponible,
  createDemandePaiement,
  validerDemandePaiement,
  rejeterDemandePaiement,
  annulerDemandeParAgent,
  getSeuilMinimum
} from '../lib/demandes-paiement'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// ============================================================
// AGENT — Cumul disponible
// ============================================================
app.get('/cumul', async (c) => {
  const user = c.get('user')
  const cumul = await getCumulDisponible(c.env.DB, user.id)
  return c.json({ cumul })
})

// ============================================================
// AGENT — Créer une demande de paiement
// ============================================================
app.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({})) as any
  try {
    const r = await createDemandePaiement(c.env.DB, user.id, body.notes)
    return c.json({ success: true, ...r })
  } catch (e: any) {
    return c.json({ error: e.message || 'Erreur création demande' }, 400)
  }
})

// ============================================================
// AGENT — Historique de ses demandes
// ============================================================
app.get('/mine', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT id, agent_id, montant_demande,
           montant_propre, montant_portefeuille, montant_n1, montant_n2,
           statut, motif_rejet, notes_agent, notes_admin,
           date_demande, date_traitement, date_paiement,
           methode_paiement, reference_paiement,
           paiement_id
    FROM demandes_paiement
    WHERE agent_id = ?
    ORDER BY date_demande DESC
  `).bind(user.id).all() as any
  return c.json({ demandes: results })
})

// ============================================================
// AGENT — Annuler sa demande (en_attente uniquement)
// ============================================================
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  try {
    await annulerDemandeParAgent(c.env.DB, id, user.id)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// ============================================================
// SUPERADMIN — Liste toutes les demandes
// ============================================================
app.get('/admin/all', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Accès refusé' }, 403)

  const statut = c.req.query('statut')
  const agentId = c.req.query('agent_id')

  let sql = `
    SELECT d.*,
           u.nom as agent_nom, u.prenom as agent_prenom,
           u.email as agent_email, u.niveau as agent_niveau,
           u.iban as agent_iban,
           sa.nom as superadmin_nom, sa.prenom as superadmin_prenom
    FROM demandes_paiement d
    JOIN users u ON d.agent_id = u.id
    LEFT JOIN users sa ON d.superadmin_id = sa.id
    WHERE 1=1
  `
  const params: any[] = []
  if (statut) { sql += ' AND d.statut = ?'; params.push(statut) }
  if (agentId) { sql += ' AND d.agent_id = ?'; params.push(parseInt(agentId)) }
  sql += ' ORDER BY d.date_demande DESC'

  const stmt = c.env.DB.prepare(sql)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all() as any

  // Stats globales
  const stats = await c.env.DB.prepare(`
    SELECT
      SUM(CASE WHEN statut = 'en_attente' THEN 1 ELSE 0 END) as nb_en_attente,
      SUM(CASE WHEN statut = 'en_attente' THEN montant_demande ELSE 0 END) as montant_en_attente,
      SUM(CASE WHEN statut = 'payee' THEN 1 ELSE 0 END) as nb_payees,
      SUM(CASE WHEN statut = 'payee' THEN montant_demande ELSE 0 END) as montant_paye
    FROM demandes_paiement
  `).first()

  return c.json({ demandes: results, stats })
})

// ============================================================
// SUPERADMIN — Détail d'une demande
// ============================================================
app.get('/admin/:id', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Accès refusé' }, 403)
  const id = parseInt(c.req.param('id'))

  const demande = await c.env.DB.prepare(`
    SELECT d.*,
           u.nom as agent_nom, u.prenom as agent_prenom,
           u.email as agent_email, u.niveau as agent_niveau,
           u.iban as agent_iban, u.telephone as agent_telephone,
           sa.nom as superadmin_nom, sa.prenom as superadmin_prenom
    FROM demandes_paiement d
    JOIN users u ON d.agent_id = u.id
    LEFT JOIN users sa ON d.superadmin_id = sa.id
    WHERE d.id = ?
  `).bind(id).first()
  if (!demande) return c.json({ error: 'Demande introuvable' }, 404)

  // Commissions liées (détail)
  const { results: commissions } = await c.env.DB.prepare(`
    SELECT dpc.commission_id, dpc.montant_inclus,
           cc.periode_annee, cc.periode_mois,
           cc.commission_propre, cc.commission_portefeuille,
           cc.commission_n1, cc.commission_n2, cc.total
    FROM demande_paiement_commissions dpc
    JOIN commissions_calculees cc ON dpc.commission_id = cc.id
    WHERE dpc.demande_id = ?
    ORDER BY cc.periode_annee, cc.periode_mois
  `).bind(id).all() as any

  return c.json({ demande, commissions })
})

// ============================================================
// SUPERADMIN — Valider + payer une demande
// ============================================================
app.post('/admin/:id/valider', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Accès refusé' }, 403)
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any

  try {
    const r = await validerDemandePaiement(c.env.DB, id, user.id, {
      methode: body.methode,
      reference: body.reference,
      notes: body.notes,
      date_paiement: body.date_paiement
    })
    return c.json({ success: true, ...r })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// ============================================================
// SUPERADMIN — Rejeter une demande
// ============================================================
app.post('/admin/:id/rejeter', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Accès refusé' }, 403)
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json().catch(() => ({})) as any
  if (!body.motif || !body.motif.trim()) {
    return c.json({ error: 'Motif de rejet obligatoire' }, 400)
  }

  try {
    await rejeterDemandePaiement(c.env.DB, id, user.id, body.motif.trim())
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// ============================================================
// PUBLIC — Lire le seuil (utile au frontend)
// ============================================================
app.get('/config/seuil', async (c) => {
  const seuil = await getSeuilMinimum(c.env.DB)
  return c.json({ seuil_min: seuil })
})

export default app
