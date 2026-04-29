import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { hashPassword, verifyPassword, createSession, destroySession, getUserFromSession } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings }>()

// POST /api/auth/login
app.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email et mot de passe requis' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ? AND actif = 1'
  ).bind(email.toLowerCase().trim()).first() as any

  if (!user) return c.json({ error: 'Identifiants invalides' }, 401)

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) return c.json({ error: 'Identifiants invalides' }, 401)

  // Créer la session
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || ''
  const ua = c.req.header('User-Agent') || ''
  const token = await createSession(c.env.DB, user.id, ip, ua, 30)

  // Mettre à jour la dernière connexion
  await c.env.DB.prepare("UPDATE users SET derniere_connexion = datetime('now') WHERE id = ?")
    .bind(user.id).run()

  // Cookie httpOnly, sécurisé
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 // 30 jours
  })

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
      niveau: user.niveau
    }
  })
})

// POST /api/auth/logout
app.post('/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) await destroySession(c.env.DB, token)
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})

// GET /api/auth/me
app.get('/me', async (c) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ user: null })
  const user = await getUserFromSession(c.env.DB, token)
  if (!user) return c.json({ user: null })

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
      niveau: user.niveau,
      parent_id: user.parent_id
    }
  })
})

// POST /api/auth/change-password (utilisateur connecté change son mdp)
app.post('/change-password', async (c) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Non authentifié' }, 401)
  const user = await getUserFromSession(c.env.DB, token)
  if (!user) return c.json({ error: 'Session invalide' }, 401)

  const { current_password, new_password } = await c.req.json()
  if (!current_password || !new_password) return c.json({ error: 'Mots de passe requis' }, 400)
  if (new_password.length < 6) return c.json({ error: 'Mot de passe trop court (min 6)' }, 400)

  const ok = await verifyPassword(current_password, user.password_hash)
  if (!ok) return c.json({ error: 'Mot de passe actuel incorrect' }, 400)

  const hash = await hashPassword(new_password)
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(hash, user.id).run()

  return c.json({ success: true })
})

export default app
