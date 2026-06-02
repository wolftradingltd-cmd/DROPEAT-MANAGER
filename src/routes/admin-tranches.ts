// ============================================================
// ADMIN — Tranches (audit + recalcul chronologique unifié)
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import {
  auditTranches,
  recalculerTranchesAgent,
  getEtatTranches,
  listApportsChronologiques,
  type RecalculReport,
  type AuditAnomaly
} from '../lib/tranches'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

const onlySuperadmin = async (c: any, next: any) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  await next()
}

// ============================================================
// AUDIT
// ============================================================
// GET /api/admin/tranches/audit
// Détecte les anomalies de cohérence sur l'ensemble des tranches.
app.get('/audit', onlySuperadmin, async (c) => {
  const anomalies = await auditTranches(c.env.DB)
  const summary = {
    total: anomalies.length,
    errors: anomalies.filter(a => a.severity === 'error').length,
    warnings: anomalies.filter(a => a.severity === 'warning').length,
    par_type: {} as Record<string, number>
  }
  for (const a of anomalies) {
    summary.par_type[a.type] = (summary.par_type[a.type] || 0) + 1
  }
  return c.json({ summary, anomalies })
})

// ============================================================
// CHRONOLOGIE D'UN AGENT (lecture seule)
// ============================================================
// GET /api/admin/tranches/chronologie?agent_id=...
// Renvoie la liste ordonnée des apports d'un agent (restos + marques) avec leur
// date de validation. Utile pour visualiser comment le recalcul va se dérouler.
app.get('/chronologie', async (c) => {
  const u = c.get('user')
  const agentId = u.role === 'superadmin'
    ? parseInt(c.req.query('agent_id') || String(u.id))
    : u.id
  if (!agentId) return c.json({ error: 'agent_id requis' }, 400)

  const apports = await listApportsChronologiques(c.env.DB, agentId)
  return c.json({ agent_id: agentId, total: apports.length, apports })
})

// ============================================================
// ÉTAT UNIFIÉ
// ============================================================
// GET /api/admin/tranches/etat?agent_id=...
// Renvoie l'état des tranches UNIFIÉES de l'agent (tranche ouverte + clôturées).
app.get('/etat', async (c) => {
  const u = c.get('user')
  const agentId = u.role === 'superadmin'
    ? parseInt(c.req.query('agent_id') || String(u.id))
    : u.id
  if (!agentId) return c.json({ error: 'agent_id requis' }, 400)

  const etat = await getEtatTranches(c.env.DB, agentId, 'unifiee')

  // Inclure aussi les marques héritées (qui n'apparaissent pas dans tranche_elements)
  const { results: heritees } = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.tranche_source_id, m.date_heritage,
      r.id as resto_id, r.nom as resto_nom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id = ? AND m.heritee_portefeuille = 1
    ORDER BY m.date_heritage DESC
  `).bind(agentId).all() as any

  return c.json({ ...etat, marques_heritees: heritees })
})

// ============================================================
// RECALCUL (DESTRUCTIF mais sûr : ne touche pas aux agents/restos/marques)
// ============================================================
// POST /api/admin/tranches/recalculer { agent_id?: number, all?: boolean }
//   - { agent_id }   → recalcule un seul agent
//   - { all: true }  → recalcule TOUS les agents commerciaux (rôle commercial/agent)
app.post('/recalculer', onlySuperadmin, async (c) => {
  const body = await c.req.json().catch(() => ({} as any))
  const { agent_id, all } = body

  let agentIds: number[] = []
  if (all === true) {
    const { results } = await c.env.DB.prepare(`
      SELECT id FROM users WHERE role IN ('commercial','agent','superadmin')
        AND COALESCE(actif, 1) = 1
      ORDER BY id
    `).all() as any
    agentIds = (results || []).map((r: any) => r.id)
  } else if (agent_id) {
    agentIds = [parseInt(agent_id)]
  } else {
    return c.json({ error: 'Préciser agent_id ou all=true' }, 400)
  }

  const reports: RecalculReport[] = []
  for (const id of agentIds) {
    try {
      const r = await recalculerTranchesAgent(c.env.DB, id)
      reports.push(r)
    } catch (e: any) {
      reports.push({
        agent_id: id,
        tranches_creees: 0,
        attributions: 0,
        marques_heritees: 0,
        warnings: [`Erreur : ${e?.message || String(e)}`]
      })
    }
  }

  return c.json({
    success: true,
    total_agents: agentIds.length,
    reports,
    summary: {
      total_attributions: reports.reduce((s, r) => s + r.attributions, 0),
      total_heritages: reports.reduce((s, r) => s + r.marques_heritees, 0),
      total_warnings: reports.reduce((s, r) => s + r.warnings.length, 0)
    }
  })
})

// ============================================================
// HISTORIQUE des recalculs
// ============================================================
// GET /api/admin/tranches/recalcul-log?limit=50
app.get('/recalcul-log', onlySuperadmin, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 500)
  const { results } = await c.env.DB.prepare(`
    SELECT l.*, u.nom || ' ' || u.prenom as agent_nom
    FROM tranches_recalcul_log l
    LEFT JOIN users u ON l.agent_id = u.id
    ORDER BY l.executed_at DESC
    LIMIT ?
  `).bind(limit).all() as any
  return c.json({ logs: results })
})

export default app
