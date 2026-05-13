// ============================================================
// MODULE AGENT — Création de filleul depuis dashboard agent
// ============================================================
// Permet à un agent de créer directement un sous-agent (filleul)
// et de récupérer le code d'accès (mot de passe temporaire) à transmettre
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { hashPassword } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// Génère un mot de passe temporaire lisible
function genPassword(): string {
  const consonnes = 'bcdfghjkmnpqrstvwxz'
  const voyelles = 'aeiouy'
  const chiffres = '23456789'
  let pwd = ''
  for (let i = 0; i < 3; i++) {
    pwd += consonnes.charAt(Math.floor(Math.random() * consonnes.length)).toUpperCase()
    pwd += voyelles.charAt(Math.floor(Math.random() * voyelles.length))
  }
  pwd += chiffres.charAt(Math.floor(Math.random() * chiffres.length))
  pwd += chiffres.charAt(Math.floor(Math.random() * chiffres.length))
  return pwd
}

// POST /api/agent/sous-agents/create - Créer un filleul + code d'accès
app.post('/create', async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  const required = ['email', 'nom', 'prenom']
  for (const f of required) {
    if (!b[f]) return c.json({ error: `${f} requis` }, 400)
  }

  // Email unique
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(b.email).first()
  if (exists) return c.json({ error: 'Email déjà utilisé' }, 400)

  // Détermine le niveau (parent + 1) — limité à 5
  let parent_id = user.id
  let niveau = (typeof user.niveau === 'number' ? user.niveau : 0) + 1
  if (user.role === 'superadmin') {
    parent_id = b.parent_id || user.id
    niveau = typeof b.niveau === 'number' ? b.niveau : 1
  }
  if (niveau > 5) return c.json({ error: 'Niveau MLM max atteint (5)' }, 400)

  // Mot de passe : fourni ou généré
  const passwordClear = b.password || genPassword()
  if (passwordClear.length < 6) return c.json({ error: 'Mot de passe trop court (≥6)' }, 400)

  const hash = await hashPassword(passwordClear)

  const r = await c.env.DB.prepare(`
    INSERT INTO users (email, password_hash, role, nom, prenom, niveau, parent_id, telephone, actif)
    VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, 1)
  `).bind(
    b.email, hash, b.nom, b.prenom, niveau, parent_id, b.telephone || null
  ).run()

  const user_id = r.meta.last_row_id

  // Stocke le code d'accès (visible une seule fois)
  await c.env.DB.prepare(`
    INSERT INTO codes_acces (user_id, cree_par_id, password_temporaire, expire_at)
    VALUES (?, ?, ?, datetime('now', '+30 day'))
  `).bind(user_id, user.id, passwordClear).run()

  // Audit
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, 'create_filleul', 'user', ?, ?)
  `).bind(user.id, user_id, JSON.stringify({ email: b.email, niveau })).run()

  return c.json({
    success: true,
    user: { id: user_id, email: b.email, nom: b.nom, prenom: b.prenom, niveau, parent_id },
    code_acces: {
      email: b.email,
      password_temporaire: passwordClear,
      url_connexion: '/',
      message: '⚠️ Notez ce mot de passe : il ne sera plus affiché après avoir quitté cette page.'
    }
  })
})

// GET /api/agent/sous-agents/codes - Liste des codes d'accès générés
app.get('/codes', async (c) => {
  const user = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT ca.*, u.nom, u.prenom, u.email, u.actif as user_actif,
      u.niveau, u.derniere_connexion
    FROM codes_acces ca
    JOIN users u ON ca.user_id = u.id
    WHERE ca.cree_par_id = ?
    ORDER BY ca.created_at DESC LIMIT 100
  `).bind(user.id).all() as any
  // Masquer mot de passe si déjà affiché ET utilisé (sécurité)
  const safe = results.map((r: any) => ({
    ...r,
    password_temporaire: r.utilise ? '••••••••' : r.password_temporaire,
    masque: r.utilise ? true : false
  }))
  return c.json({ codes: safe })
})

// PUT /api/agent/sous-agents/codes/:id/marque-affiche
app.put('/codes/:id/marque-affiche', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('UPDATE codes_acces SET affiche = 1 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/agent/sous-agents/:id/regenerer-code - Régénérer un code
app.post('/:id/regenerer-code', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))

  // Vérifier que c'est bien un descendant de l'agent
  const cible = await c.env.DB.prepare('SELECT id, parent_id, email, nom, prenom FROM users WHERE id = ?').bind(id).first() as any
  if (!cible) return c.json({ error: 'Introuvable' }, 404)

  let ok = user.role === 'superadmin' || cible.parent_id === user.id
  if (!ok) {
    let cur = cible.parent_id
    for (let i = 0; i < 5 && cur; i++) {
      if (cur === user.id) { ok = true; break }
      const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
      cur = p?.parent_id
    }
  }
  if (!ok) return c.json({ error: 'Accès refusé' }, 403)

  const newPwd = genPassword()
  const hash = await hashPassword(newPwd)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, id).run()
  await c.env.DB.prepare(`
    INSERT INTO codes_acces (user_id, cree_par_id, password_temporaire, expire_at)
    VALUES (?, ?, ?, datetime('now', '+30 day'))
  `).bind(id, user.id, newPwd).run()

  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, 'regenerate_code', 'user', ?, ?)
  `).bind(user.id, id, JSON.stringify({ email: cible.email })).run()

  return c.json({
    success: true,
    code_acces: {
      email: cible.email,
      password_temporaire: newPwd,
      url_connexion: '/',
      message: '⚠️ Notez ce mot de passe : il ne sera plus affiché après avoir quitté cette page.'
    }
  })
})

// GET /api/agent/sous-agents - Liste enrichie des sous-agents (dashboard agent)
app.get('/', async (c) => {
  const user = c.get('user')
  const isSuper = user.role === 'superadmin'

  // Branche complète (descendants directs + indirects)
  const branchIds = new Set<number>()
  let frontier = [user.id]
  for (let i = 0; i < 5; i++) {
    if (!frontier.length) break
    const ph = frontier.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(
      `SELECT id FROM users WHERE parent_id IN (${ph})`
    ).bind(...frontier).all() as any
    frontier = results.map((r: any) => r.id)
    frontier.forEach(id => branchIds.add(id))
  }

  if (!branchIds.size) return c.json({ sous_agents: [] })

  const ids = Array.from(branchIds)
  const ph = ids.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.niveau, u.parent_id, u.actif,
      u.derniere_connexion, u.created_at,
      (SELECT nom || ' ' || prenom FROM users WHERE id = u.parent_id) as parent_nom,
      (SELECT COUNT(*) FROM users WHERE parent_id = u.id) as nb_enfants_directs,
      (SELECT COUNT(*) FROM restaurants WHERE agent_id = u.id) as nb_restos,
      (SELECT COUNT(*) FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_marques,
      (SELECT COALESCE(SUM(c.montant_brut),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id) as ca_total
    FROM users u
    WHERE u.id IN (${ph}) AND u.role = 'agent'
    ORDER BY u.niveau, u.created_at DESC
  `).bind(...ids).all()

  return c.json({ sous_agents: results })
})

export default app
