// ============================================================
// SUPERADMIN — CRUD complet des agents commerciaux & sous-agents
// ============================================================
// POST   /api/admin/agents-crud/create        créer un agent N0..N5
// PUT    /api/admin/agents-crud/:id           modifier (email, nom, prénom, tel, iban, niveau, parent)
// PUT    /api/admin/agents-crud/:id/activer   activer
// PUT    /api/admin/agents-crud/:id/desactiver désactiver
// DELETE /api/admin/agents-crud/:id           supprimer (avec cascade contrôlée)
// GET    /api/admin/agents-crud               lister tous les agents (avec stats)
// GET    /api/admin/agents-crud/parents-possibles?level=  liste les parents possibles
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

// ============================================================
// GET /api/admin/agents-crud — liste enrichie de tous les agents
// ============================================================
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.telephone, u.role,
      u.niveau, u.parent_id, u.actif, u.iban, u.derniere_connexion, u.created_at,
      (SELECT nom || ' ' || prenom FROM users WHERE id = u.parent_id) as parent_nom,
      (SELECT COUNT(*) FROM users WHERE parent_id = u.id AND role = 'agent') as nb_enfants_directs,
      (SELECT COUNT(*) FROM restaurants WHERE agent_id = u.id) as nb_restos
    FROM users u
    WHERE u.role = 'agent'
    ORDER BY u.niveau, u.nom, u.prenom
  `).all()
  return c.json({ agents: results })
})

// ============================================================
// GET /api/admin/agents-crud/parents-possibles?level=N
// — Renvoie la liste des parents possibles pour un niveau donné
// ============================================================
app.get('/parents-possibles', async (c) => {
  const level = parseInt(c.req.query('level') || '1')
  if (level === 0) return c.json({ parents: [] }) // N0 = pas de parent
  const parentLevel = level - 1
  const { results } = await c.env.DB.prepare(`
    SELECT id, nom, prenom, email, niveau
    FROM users WHERE role = 'agent' AND niveau = ? AND actif = 1
    ORDER BY nom, prenom
  `).bind(parentLevel).all()
  return c.json({ parents: results })
})

// ============================================================
// POST /api/admin/agents-crud/create
// Body : { email, nom, prenom, niveau, parent_id?, telephone?, iban?, password? }
// ============================================================
app.post('/create', async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  for (const f of ['email', 'nom', 'prenom']) {
    if (!b[f]) return c.json({ error: `${f} requis` }, 400)
  }

  // Email unique
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(b.email).first()
  if (exists) return c.json({ error: 'Email déjà utilisé' }, 400)

  const niveau = typeof b.niveau === 'number' ? b.niveau : 1
  if (niveau < 0 || niveau > 5) return c.json({ error: 'Niveau invalide (0-5)' }, 400)

  // Vérif parent
  let parent_id = b.parent_id || null
  if (niveau > 0 && !parent_id) return c.json({ error: 'Un parent est requis pour les niveaux ≥1' }, 400)
  if (parent_id) {
    const p = await c.env.DB.prepare('SELECT niveau FROM users WHERE id = ?').bind(parent_id).first() as any
    if (!p) return c.json({ error: 'Parent introuvable' }, 400)
    if (p.niveau !== niveau - 1) return c.json({ error: `Le parent doit être de niveau ${niveau - 1}` }, 400)
  }

  const passwordClear = b.password || genPassword()
  if (passwordClear.length < 6) return c.json({ error: 'Mot de passe trop court (≥6)' }, 400)
  const hash = await hashPassword(passwordClear)

  const r = await c.env.DB.prepare(`
    INSERT INTO users (email, password_hash, role, nom, prenom, niveau, parent_id, telephone, iban, actif)
    VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    b.email, hash, b.nom, b.prenom, niveau, parent_id,
    b.telephone || null, b.iban || null
  ).run()

  const user_id = r.meta.last_row_id

  await c.env.DB.prepare(`
    INSERT INTO codes_acces (user_id, cree_par_id, password_temporaire, expire_at)
    VALUES (?, ?, ?, datetime('now', '+90 day'))
  `).bind(user_id, user.id, passwordClear).run()

  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, visible_agent)
    VALUES (?, 'admin_create_agent', 'user', ?, ?, 0)
  `).bind(user.id, user_id, JSON.stringify({ email: b.email, niveau, parent_id })).run()

  return c.json({
    success: true,
    user: { id: user_id, email: b.email, nom: b.nom, prenom: b.prenom, niveau, parent_id },
    code_acces: {
      email: b.email,
      password_temporaire: passwordClear,
      url_connexion: '/',
      message: '⚠️ Notez ce mot de passe : il ne sera plus affiché après cette page.'
    }
  })
})

// ============================================================
// PUT /api/admin/agents-crud/:id — modifier
// ============================================================
app.put('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const cur = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND role = \'agent\'').bind(id).first() as any
  if (!cur) return c.json({ error: 'Agent introuvable' }, 404)

  const fields = ['email', 'nom', 'prenom', 'telephone', 'iban', 'niveau', 'parent_id']
  const updates: string[] = []
  const values: any[] = []
  for (const f of fields) {
    if (b[f] !== undefined) {
      // Vérif email unique
      if (f === 'email' && b.email !== cur.email) {
        const dupe = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(b.email, id).first()
        if (dupe) return c.json({ error: 'Email déjà utilisé' }, 400)
      }
      // Vérif cohérence parent/niveau
      if (f === 'parent_id' && b.parent_id) {
        // Anti-cycle
        let cur2 = b.parent_id
        let depth = 0
        while (cur2 && depth < 10) {
          if (cur2 === id) return c.json({ error: 'Cycle détecté' }, 400)
          const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur2).first() as any
          cur2 = p?.parent_id
          depth++
        }
      }
      updates.push(`${f} = ?`)
      values.push(b[f] === '' ? null : b[f])
    }
  }
  if (!updates.length) return c.json({ error: 'Rien à mettre à jour' }, 400)
  values.push(id)
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, visible_agent)
    VALUES (?, 'admin_update_agent', 'user', ?, ?, 0)
  `).bind(user.id, id, JSON.stringify(b)).run()

  return c.json({ success: true })
})

// ============================================================
// PUT /api/admin/agents-crud/:id/activer | desactiver
// ============================================================
app.put('/:id/activer', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('UPDATE users SET actif = 1 WHERE id = ?').bind(id).run()
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, visible_agent)
    VALUES (?, 'admin_activate_agent', 'user', ?, 0)
  `).bind(c.get('user').id, id).run()
  return c.json({ success: true })
})

app.put('/:id/desactiver', async (c) => {
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('UPDATE users SET actif = 0 WHERE id = ?').bind(id).run()
  // Invalider toutes les sessions
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, visible_agent)
    VALUES (?, 'admin_deactivate_agent', 'user', ?, 0)
  `).bind(c.get('user').id, id).run()
  return c.json({ success: true })
})

// ============================================================
// DELETE /api/admin/agents-crud/:id — supprime un agent
// Vérif : pas d'enfants, pas de restaurants associés (sinon refus)
// ============================================================
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const enfants = await c.env.DB.prepare('SELECT COUNT(*) as n FROM users WHERE parent_id = ?').bind(id).first() as any
  if ((enfants?.n || 0) > 0) {
    return c.json({ error: `Cet agent a ${enfants.n} filleul(s). Réassignez-les avant suppression.` }, 400)
  }
  const restos = await c.env.DB.prepare('SELECT COUNT(*) as n FROM restaurants WHERE agent_id = ?').bind(id).first() as any
  if ((restos?.n || 0) > 0) {
    return c.json({ error: `Cet agent a ${restos.n} restaurant(s) associé(s). Réassignez-les avant suppression.` }, 400)
  }
  // Cleanup
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM codes_acces WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM profils_societe WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, visible_agent)
    VALUES (?, 'admin_delete_agent', 'user', ?, 0)
  `).bind(c.get('user').id, id).run()
  return c.json({ success: true })
})

// ============================================================
// POST /api/admin/agents-crud/:id/reassign-restos
// Body : { new_agent_id, restaurant_ids: [] }
// ============================================================
app.post('/:id/reassign-restos', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { new_agent_id, restaurant_ids } = await c.req.json()
  if (!new_agent_id) return c.json({ error: 'new_agent_id requis' }, 400)
  const ids = restaurant_ids && restaurant_ids.length ? restaurant_ids : null
  if (ids) {
    const ph = ids.map(() => '?').join(',')
    await c.env.DB.prepare(`UPDATE restaurants SET agent_id = ? WHERE id IN (${ph}) AND agent_id = ?`)
      .bind(new_agent_id, ...ids, id).run()
  } else {
    await c.env.DB.prepare('UPDATE restaurants SET agent_id = ? WHERE agent_id = ?').bind(new_agent_id, id).run()
  }
  return c.json({ success: true })
})

export default app
