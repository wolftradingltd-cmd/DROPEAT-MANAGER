// ============================================================
// NOTIFICATIONS — Endpoints pour badge live + liste + marquer lu
// ============================================================
// La table `notifications` est déjà présente (cf. schéma initial).
// Schéma : id, destinataire_id, type, titre, message, lien, lu, metadata, created_at
//
// Endpoints :
//   GET    /api/notifications              → liste des notifs du user (lu/non lu)
//   GET    /api/notifications/count        → { non_lues: N } pour badge live
//   POST   /api/notifications/:id/lu       → marquer une notif comme lue
//   POST   /api/notifications/tout-lu      → marquer toutes comme lues
//   DELETE /api/notifications/:id          → supprimer une notif
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireAuth)

// GET /api/notifications — Liste paginée (50 dernières par défaut)
// Query params : ?limit=50&statut=lu|non_lu|all (default all)
app.get('/', async (c) => {
  const user = c.get('user')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200)
  const statut = c.req.query('statut') || 'all'

  let where = 'destinataire_id = ?'
  const params: any[] = [user.id]
  if (statut === 'non_lu') { where += ' AND lu = 0' }
  else if (statut === 'lu') { where += ' AND lu = 1' }

  const { results } = await c.env.DB.prepare(`
    SELECT id, type, titre, message, lien, lu, metadata, created_at
    FROM notifications
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...params, limit).all() as any

  // Parse metadata JSON pour pratique
  const parsed = (results || []).map((n: any) => ({
    ...n,
    metadata: n.metadata ? (() => { try { return JSON.parse(n.metadata) } catch { return null } })() : null
  }))

  return c.json({ notifications: parsed, total: parsed.length })
})

// GET /api/notifications/count — Compteur pour badge live
app.get('/count', async (c) => {
  const user = c.get('user')
  const r = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN lu = 0 THEN 1 ELSE 0 END) as non_lues
    FROM notifications WHERE destinataire_id = ?
  `).bind(user.id).first() as any

  // Bonus : pour superadmin, ajouter le compteur d'imports à valider
  let imports_a_valider = 0
  if (user.role === 'superadmin') {
    const ia = await c.env.DB.prepare(
      "SELECT COUNT(*) as nb FROM imports_csv WHERE validation_statut = 'en_attente_validation'"
    ).first() as any
    imports_a_valider = ia?.nb || 0
  }

  return c.json({
    total: r?.total || 0,
    non_lues: r?.non_lues || 0,
    imports_a_valider
  })
})

// POST /api/notifications/:id/lu — Marquer une notif comme lue
app.post('/:id/lu', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const r = await c.env.DB.prepare(
    'UPDATE notifications SET lu = 1 WHERE id = ? AND destinataire_id = ?'
  ).bind(id, user.id).run()
  if ((r.meta as any)?.changes === 0) {
    return c.json({ error: 'Notification introuvable' }, 404)
  }
  return c.json({ success: true })
})

// POST /api/notifications/tout-lu — Marquer toutes comme lues
app.post('/tout-lu', async (c) => {
  const user = c.get('user')
  const r = await c.env.DB.prepare(
    'UPDATE notifications SET lu = 1 WHERE destinataire_id = ? AND lu = 0'
  ).bind(user.id).run()
  return c.json({ success: true, nb_marquees: (r.meta as any)?.changes || 0 })
})

// DELETE /api/notifications/:id — Supprimer une notif
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  await c.env.DB.prepare(
    'DELETE FROM notifications WHERE id = ? AND destinataire_id = ?'
  ).bind(id, user.id).run()
  return c.json({ success: true })
})

export default app
