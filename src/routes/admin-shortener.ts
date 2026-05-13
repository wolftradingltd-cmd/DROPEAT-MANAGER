// ============================================================
// MODULE URL SHORTENER — Raccourci d'URL interne
// ============================================================
// Permet de raccourcir n'importe quelle URL (menu PDF, fiche Uber Eats,
// site web restaurant) avec un code court accessible via /s/:code
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

// Génération d'un code court (6 caractères alphanumériques)
function genCode(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
  return s
}

// POST /api/shortener (auth requise) - Créer un raccourci
app.post('/', requireAuth, async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  if (!b.url) return c.json({ error: 'url requise' }, 400)

  // Validation URL
  try { new URL(b.url) } catch { return c.json({ error: 'url invalide' }, 400) }

  // Code unique (3 essais)
  let code = b.code || genCode()
  for (let i = 0; i < 3; i++) {
    const exists = await c.env.DB.prepare('SELECT id FROM url_courtes WHERE code = ?').bind(code).first()
    if (!exists) break
    code = genCode()
  }

  const r = await c.env.DB.prepare(`
    INSERT INTO url_courtes (code, url_originale, libelle, cree_par_id, restaurant_id, marque_id, expire_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    code, b.url, b.libelle || null, user.id,
    b.restaurant_id || null, b.marque_id || null,
    b.expire_at || null
  ).run()

  return c.json({
    success: true,
    id: r.meta.last_row_id,
    code,
    short_url: `/s/${code}`
  })
})

// GET /api/shortener (auth requise) - Liste des raccourcis du user
app.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  const restaurant_id = c.req.query('restaurant_id')
  const marque_id = c.req.query('marque_id')

  let where = '1=1'
  const params: any[] = []
  if (user.role !== 'superadmin') {
    where += ' AND uc.cree_par_id = ?'
    params.push(user.id)
  }
  if (restaurant_id) { where += ' AND uc.restaurant_id = ?'; params.push(parseInt(restaurant_id)) }
  if (marque_id) { where += ' AND uc.marque_id = ?'; params.push(parseInt(marque_id)) }

  const { results } = await c.env.DB.prepare(`
    SELECT uc.*, r.nom as restaurant_nom, m.nom as marque_nom,
      u.nom || ' ' || u.prenom as cree_par_nom
    FROM url_courtes uc
    LEFT JOIN restaurants r ON uc.restaurant_id = r.id
    LEFT JOIN marques_virtuelles m ON uc.marque_id = m.id
    LEFT JOIN users u ON uc.cree_par_id = u.id
    WHERE ${where}
    ORDER BY uc.created_at DESC LIMIT 200
  `).bind(...params).all()
  return c.json({ urls: results })
})

// DELETE /api/shortener/:id - Désactiver
app.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const u = await c.env.DB.prepare('SELECT * FROM url_courtes WHERE id = ?').bind(id).first() as any
  if (!u) return c.json({ error: 'Introuvable' }, 404)
  if (user.role !== 'superadmin' && u.cree_par_id !== user.id) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  await c.env.DB.prepare('UPDATE url_courtes SET actif = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
