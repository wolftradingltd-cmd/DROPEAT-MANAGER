import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { hashPassword } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

// GET /api/admin/users - Liste tous les utilisateurs
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.nom, u.prenom, u.telephone, u.niveau, u.parent_id,
           u.iban, u.actif, u.notes, u.derniere_connexion, u.created_at,
           p.nom as parent_nom, p.prenom as parent_prenom,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
           (SELECT COUNT(*) FROM users s WHERE s.parent_id = u.id) as nb_sous_agents
    FROM users u
    LEFT JOIN users p ON u.parent_id = p.id
    ORDER BY u.role DESC, u.niveau, u.nom, u.prenom
  `).all()
  return c.json({ users: results })
})

// GET /api/admin/users/tree - Arborescence MLM
app.get('/tree', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.nom, u.prenom, u.niveau, u.parent_id, u.actif,
           (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
           (SELECT COUNT(*) FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_marques
    FROM users u
    WHERE u.role = 'agent'
    ORDER BY u.niveau, u.nom
  `).all() as any

  const map = new Map<number, any>()
  results.forEach((u: any) => map.set(u.id, { ...u, enfants: [] }))

  const roots: any[] = []
  results.forEach((u: any) => {
    if (u.parent_id && map.has(u.parent_id)) {
      map.get(u.parent_id).enfants.push(map.get(u.id))
    } else {
      roots.push(map.get(u.id))
    }
  })

  return c.json({ tree: roots })
})

// GET /api/admin/users/:id
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const u = await c.env.DB.prepare(`
    SELECT u.*, p.nom as parent_nom, p.prenom as parent_prenom
    FROM users u LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.id = ?
  `).bind(id).first() as any
  if (!u) return c.json({ error: 'Utilisateur introuvable' }, 404)
  delete u.password_hash
  return c.json({ user: u })
})

// POST /api/admin/users - Créer un utilisateur (admin ou agent)
app.post('/', async (c) => {
  const data = await c.req.json()
  const { email, password, role, nom, prenom, telephone, niveau, parent_id, iban, notes } = data

  if (!email || !password || !nom || !prenom) {
    return c.json({ error: 'email, password, nom, prénom requis' }, 400)
  }
  if (password.length < 6) return c.json({ error: 'Mot de passe trop court (min 6)' }, 400)

  const userRole = role === 'superadmin' ? 'superadmin' : 'agent'
  const userNiveau = userRole === 'superadmin' ? null : (niveau ?? 0)

  // Vérifier email unique
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase().trim()).first()
  if (exists) return c.json({ error: 'Email déjà utilisé' }, 400)

  const hash = await hashPassword(password)
  const result = await c.env.DB.prepare(`
    INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, iban, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    email.toLowerCase().trim(), hash, userRole, nom, prenom,
    telephone || null, userNiveau, parent_id || null, iban || null, notes || null
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// PUT /api/admin/users/:id - Modifier
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const { email, nom, prenom, telephone, niveau, parent_id, iban, actif, notes, role } = data

  // Vérifier email unique (sauf pour cet user)
  if (email) {
    const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(email.toLowerCase().trim(), id).first()
    if (exists) return c.json({ error: 'Email déjà utilisé par un autre utilisateur' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE users SET
      email = COALESCE(?, email),
      nom = COALESCE(?, nom),
      prenom = COALESCE(?, prenom),
      telephone = ?,
      niveau = ?,
      parent_id = ?,
      iban = ?,
      actif = COALESCE(?, actif),
      notes = ?,
      role = COALESCE(?, role),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    email ? email.toLowerCase().trim() : null,
    nom || null, prenom || null,
    telephone || null,
    niveau !== undefined ? niveau : null,
    parent_id !== undefined ? parent_id : null,
    iban || null,
    actif !== undefined ? actif : null,
    notes || null,
    role || null,
    id
  ).run()

  return c.json({ success: true })
})

// POST /api/admin/users/:id/reset-password - Réinitialiser le mdp d'un user
app.post('/:id/reset-password', async (c) => {
  const id = c.req.param('id')
  const { new_password } = await c.req.json()
  if (!new_password || new_password.length < 6) {
    return c.json({ error: 'Mot de passe min 6 caractères' }, 400)
  }
  const hash = await hashPassword(new_password)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(hash, id).run()
  // Invalider toutes les sessions de cet utilisateur
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  return c.json({ success: true })
})

// DELETE /api/admin/users/:id
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const me = c.get('user')
  if (id === me.id) return c.json({ error: 'Vous ne pouvez pas vous supprimer vous-même' }, 400)

  // Empêcher suppression du dernier superadmin
  const u = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first() as any
  if (u?.role === 'superadmin') {
    const count = await c.env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'superadmin'").first() as any
    if (count.c <= 1) return c.json({ error: 'Impossible de supprimer le dernier superadmin' }, 400)
  }

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/admin/users/:id/move - Déplacer un agent dans la hiérarchie (changer parent)
app.post('/:id/move', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { new_parent_id, new_niveau } = await c.req.json()

  // Vérifier qu'on ne crée pas de cycle
  if (new_parent_id) {
    let cur = new_parent_id
    while (cur) {
      if (cur === id) return c.json({ error: 'Cycle détecté dans la hiérarchie' }, 400)
      const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
      cur = p?.parent_id || null
    }
  }

  await c.env.DB.prepare('UPDATE users SET parent_id = ?, niveau = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(new_parent_id || null, new_niveau ?? 0, id).run()
  return c.json({ success: true })
})

export default app
