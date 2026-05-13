// ============================================================
// MODULE OMNIPOTENCE SUPERADMIN — pouvoirs 2000%
// ============================================================
// Fonctionnalités exclusives superadmin :
// 1) Cacher/réafficher un parent à son filleul (parent_visible_par_enfant)
// 2) Masquer entièrement un user dans les arborescences (masque_par_admin)
// 3) Réassigner un user (changer parent_id) avec recalcul branche
// 4) Forcer/dé-forcer une attribution portefeuille resto/marque
// 5) Override commission calculée (montant manuel + motif)
// 6) Audit invisible (visible_agent = 0)
// 7) Reset password de n'importe quel user
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { hashPassword } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// Garde superadmin
app.use('*', async (c, next) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  await next()
})

async function logInvisible(db: D1Database, userId: number, action: string, entity_type: string, entity_id: any, details: any) {
  await db.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, visible_agent)
    VALUES (?, ?, ?, ?, ?, 0)
  `).bind(userId, action, entity_type, entity_id || null, JSON.stringify(details)).run()
}

// ====================== 1) Visibilité parent ======================
// PUT /api/admin/omnipotence/user/:id/parent-visible { visible: 0|1 }
app.put('/user/:id/parent-visible', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { visible } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE users SET parent_visible_par_enfant = ? WHERE id = ?`
  ).bind(visible ? 1 : 0, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'parent_visible_change', 'user', id, { visible })
  return c.json({ success: true })
})

// ====================== 2) Masquer entièrement ======================
// PUT /api/admin/omnipotence/user/:id/masque { masque: 0|1 }
app.put('/user/:id/masque', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { masque } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE users SET masque_par_admin = ? WHERE id = ?`
  ).bind(masque ? 1 : 0, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'masque_user', 'user', id, { masque })
  return c.json({ success: true })
})

// ====================== 3) Réassignation parent ======================
// PUT /api/admin/omnipotence/user/:id/reparent { parent_id, niveau }
app.put('/user/:id/reparent', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { parent_id, niveau, motif } = await c.req.json()

  if (parent_id === id) return c.json({ error: 'Un user ne peut être son propre parent' }, 400)

  // Anti-cycle : vérifier que parent_id n'est pas un descendant
  if (parent_id) {
    let cur = parent_id
    let depth = 0
    while (cur && depth < 10) {
      if (cur === id) return c.json({ error: 'Cycle détecté' }, 400)
      const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
      cur = p?.parent_id
      depth++
    }
  }

  const old = await c.env.DB.prepare('SELECT parent_id, niveau FROM users WHERE id = ?').bind(id).first() as any

  const updates: string[] = ['parent_id = ?']
  const params: any[] = [parent_id || null]
  if (typeof niveau === 'number') { updates.push('niveau = ?'); params.push(niveau) }
  params.push(id)

  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()

  await logInvisible(c.env.DB, c.get('user').id, 'reparent', 'user', id, {
    old_parent: old?.parent_id, new_parent: parent_id, motif
  })

  return c.json({ success: true })
})

// ====================== 4) Forcer attribution portefeuille ======================
// PUT /api/admin/omnipotence/restaurant/:id/portefeuille { force: 0|1, motif }
app.put('/restaurant/:id/portefeuille', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { force, motif } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE restaurants SET is_portefeuille_proprietaire = ? WHERE id = ?`
  ).bind(force ? 1 : 0, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'force_portefeuille_resto', 'restaurant', id, { force, motif })
  return c.json({ success: true })
})

// PUT /api/admin/omnipotence/marque/:id/portefeuille { force: 0|1, motif }
app.put('/marque/:id/portefeuille', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { force, motif } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE marques_virtuelles SET is_portefeuille_proprietaire = ? WHERE id = ?`
  ).bind(force ? 1 : 0, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'force_portefeuille_marque', 'marque', id, { force, motif })
  return c.json({ success: true })
})

// PUT /api/admin/omnipotence/marque/:id/heritee { resto_id, exclue: 0|1 }
// Marque la marque comme "héritée d'un resto attribué" → décalage tranche
app.put('/marque/:id/heritee', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { resto_id, exclue } = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE marques_virtuelles
    SET heritee_de_resto_id = ?, exclue_tranche = ?
    WHERE id = ?
  `).bind(resto_id || null, exclue ? 1 : 0, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'marque_heritee', 'marque', id, { resto_id, exclue })
  return c.json({ success: true })
})

// ====================== 5) Override commission ======================
// PUT /api/admin/omnipotence/commission/:id/override { montant, motif }
app.put('/commission/:id/override', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { montant, motif } = await c.req.json()
  if (typeof montant !== 'number') return c.json({ error: 'montant numérique requis' }, 400)

  await c.env.DB.prepare(`
    UPDATE commissions_calculees
    SET montant_total = ?, override_par = ?, override_motif = ?, override_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(montant, c.get('user').id, motif || null, id).run()

  await logInvisible(c.env.DB, c.get('user').id, 'override_commission', 'commission', id, { montant, motif })
  return c.json({ success: true })
})

// ====================== 6) Reset password ======================
// PUT /api/admin/omnipotence/user/:id/password { new_password }
app.put('/user/:id/password', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { new_password } = await c.req.json()
  if (!new_password || new_password.length < 6) {
    return c.json({ error: 'Mot de passe ≥ 6 caractères' }, 400)
  }
  const hash = await hashPassword(new_password)
  await c.env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(hash, id).run()
  await logInvisible(c.env.DB, c.get('user').id, 'reset_password', 'user', id, { admin_forced: true })
  return c.json({ success: true })
})

// ====================== 7) État omnipotence (vue admin) ======================
// GET /api/admin/omnipotence/audit - Audit invisible (réservé superadmin)
app.get('/audit', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100')
  const { results } = await c.env.DB.prepare(`
    SELECT a.*, u.nom || ' ' || u.prenom as user_nom, u.email as user_email
    FROM audit_log a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ?
  `).bind(limit).all()
  return c.json({ logs: results })
})

// GET /api/admin/omnipotence/users-masques - Liste users masqués / parents cachés
app.get('/users-masques', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT id, email, nom, prenom, role, niveau, parent_id,
      parent_visible_par_enfant, masque_par_admin
    FROM users
    WHERE masque_par_admin = 1 OR parent_visible_par_enfant = 0
    ORDER BY masque_par_admin DESC, id
  `).all()
  return c.json({ users: results })
})

export default app
