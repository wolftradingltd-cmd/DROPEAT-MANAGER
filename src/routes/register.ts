// ============================================================
// SYSTÈME D'ENREGISTREMENT (REGISTER) PAR INVITATION
// ============================================================
// Routes publiques (pas d'auth) :
//   GET  /api/register/check/:code   - Vérifie validité d'une invitation
//   POST /api/register               - Inscription avec code
// Routes protégées (agent ou superadmin) :
//   POST /api/register/invitations   - Créer une invitation pour un sous-agent
//   GET  /api/register/invitations   - Lister mes invitations
//   DELETE /api/register/invitations/:id - Révoquer
// ============================================================

import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import type { Bindings } from '../types'
import { hashPassword, createSession } from '../lib/auth'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

/**
 * Génère un token aléatoire URL-safe pour les invitations.
 */
function generateInvitationCode(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ===== PUBLIC : Vérifier une invitation =====
app.get('/check/:code', async (c) => {
  const code = c.req.param('code')
  const inv = await c.env.DB.prepare(`
    SELECT i.*, u.nom as parent_nom, u.prenom as parent_prenom, u.niveau as parent_niveau
    FROM invitations_agent i
    JOIN users u ON i.parent_id = u.id
    WHERE i.code = ?
  `).bind(code).first() as any

  if (!inv) return c.json({ valid: false, reason: 'Code invalide' })
  if (inv.utilisee) return c.json({ valid: false, reason: 'Code déjà utilisé' })
  if (inv.expire_at && new Date(inv.expire_at) < new Date()) {
    return c.json({ valid: false, reason: 'Code expiré' })
  }
  return c.json({
    valid: true,
    invitation: {
      email_pre_rempli: inv.email_pre_rempli,
      niveau_cible: inv.niveau_cible,
      parent: {
        nom: inv.parent_nom,
        prenom: inv.parent_prenom,
        niveau: inv.parent_niveau
      }
    }
  })
})

// ===== PUBLIC : S'inscrire avec un code =====
app.post('/', async (c) => {
  const data = await c.req.json()
  const { code, email, password, nom, prenom, telephone, iban } = data

  if (!code || !email || !password || !nom || !prenom) {
    return c.json({ error: 'Code, email, mot de passe, nom et prénom requis' }, 400)
  }
  if (password.length < 6) {
    return c.json({ error: 'Mot de passe trop court (6 caractères min)' }, 400)
  }

  // Vérifier le code
  const inv = await c.env.DB.prepare(`
    SELECT * FROM invitations_agent WHERE code = ?
  `).bind(code).first() as any
  if (!inv) return c.json({ error: 'Code invalide' }, 400)
  if (inv.utilisee) return c.json({ error: 'Code déjà utilisé' }, 400)
  if (inv.expire_at && new Date(inv.expire_at) < new Date()) {
    return c.json({ error: 'Code expiré' }, 400)
  }

  // Vérifier que l'email n'existe pas déjà
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email).first()
  if (existing) return c.json({ error: 'Cet email est déjà utilisé' }, 400)

  // Si l'invitation pré-remplit un email, contrainte stricte
  if (inv.email_pre_rempli && inv.email_pre_rempli.toLowerCase() !== email.toLowerCase()) {
    return c.json({ error: `Cette invitation est réservée à ${inv.email_pre_rempli}` }, 400)
  }

  // Créer le compte
  const passwordHash = await hashPassword(password)
  const result = await c.env.DB.prepare(`
    INSERT INTO users (email, password_hash, role, nom, prenom, telephone, iban, niveau, parent_id, actif)
    VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    email.toLowerCase(),
    passwordHash,
    nom,
    prenom,
    telephone || null,
    iban || null,
    inv.niveau_cible,
    inv.parent_id
  ).run()

  const newUserId = result.meta.last_row_id as number

  // Marquer l'invitation comme utilisée
  await c.env.DB.prepare(`
    UPDATE invitations_agent
    SET utilisee = 1, used_at = CURRENT_TIMESTAMP, user_cree_id = ?
    WHERE id = ?
  `).bind(newUserId, inv.id).run()

  // Audit log
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entite_type, entite_id, details, ip)
    VALUES (?, 'register', 'user', ?, ?, ?)
  `).bind(
    newUserId, newUserId,
    JSON.stringify({ via_invitation: inv.id, parent_id: inv.parent_id }),
    c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null
  ).run().catch(() => {})

  // Auto-login : créer une session
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null
  const ua = c.req.header('User-Agent') || null
  const sessionToken = await createSession(c.env.DB, newUserId, ip, ua)

  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  })

  return c.json({
    success: true,
    user: {
      id: newUserId,
      email: email.toLowerCase(),
      role: 'agent',
      nom,
      prenom,
      niveau: inv.niveau_cible,
      parent_id: inv.parent_id
    }
  })
})

// ===== PROTÉGÉ : Créer une invitation =====
app.post('/invitations', requireAuth, async (c) => {
  const user = c.get('user')
  const { email_pre_rempli, niveau_cible, duree_jours } = await c.req.json()

  // Le niveau cible doit être > niveau du créateur
  // Sauf si superadmin (peut créer des agents N0, N1, N2)
  let parentId: number = user.id
  let niveauCible: number

  if (user.role === 'superadmin') {
    niveauCible = niveau_cible !== undefined ? parseInt(niveau_cible) : 0
    // Si superadmin invite un N+1 ou N+2, il faut un parent_id explicite
    if (niveauCible > 0) {
      const { parent_id } = await c.req.json().catch(() => ({}))
      if (parent_id) parentId = parseInt(parent_id as any)
    }
  } else {
    // Agent : ne peut inviter qu'un niveau strictement supérieur (sous-agent)
    if (user.niveau === null || user.niveau === undefined) {
      return c.json({ error: 'Niveau utilisateur indéterminé' }, 400)
    }
    if (user.niveau >= 2) {
      return c.json({ error: 'Vous êtes déjà au dernier niveau, vous ne pouvez pas inviter de sous-agent' }, 403)
    }
    niveauCible = user.niveau + 1
  }

  if (niveauCible < 0 || niveauCible > 2) {
    return c.json({ error: 'Niveau cible invalide (0, 1 ou 2)' }, 400)
  }

  const code = generateInvitationCode()
  const dureeJours = parseInt(duree_jours || '30')
  const expireAt = new Date(Date.now() + dureeJours * 24 * 3600 * 1000).toISOString()

  const r = await c.env.DB.prepare(`
    INSERT INTO invitations_agent (code, parent_id, niveau_cible, email_pre_rempli, expire_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(code, parentId, niveauCible, email_pre_rempli || null, expireAt).run()

  const baseUrl = new URL(c.req.url).origin
  return c.json({
    success: true,
    id: r.meta.last_row_id,
    code,
    invitation_url: `${baseUrl}/register?code=${code}`,
    niveau_cible: niveauCible,
    parent_id: parentId,
    expire_at: expireAt
  })
})

// ===== PROTÉGÉ : Lister mes invitations =====
app.get('/invitations', requireAuth, async (c) => {
  const user = c.get('user')
  let query = `
    SELECT i.*, u.nom as user_nom, u.prenom as user_prenom, u.email as user_email,
           p.nom as parent_nom, p.prenom as parent_prenom
    FROM invitations_agent i
    LEFT JOIN users u ON i.user_cree_id = u.id
    LEFT JOIN users p ON i.parent_id = p.id
  `
  const params: any[] = []
  if (user.role !== 'superadmin') {
    query += ' WHERE i.parent_id = ?'
    params.push(user.id)
  }
  query += ' ORDER BY i.created_at DESC'

  const stmt = c.env.DB.prepare(query)
  const { results } = await (params.length ? stmt.bind(...params) : stmt).all() as any

  const baseUrl = new URL(c.req.url).origin
  return c.json({
    invitations: (results as any[]).map((i: any) => ({
      ...i,
      invitation_url: `${baseUrl}/register?code=${i.code}`,
      statut: i.utilisee ? 'utilisee' : (i.expire_at && new Date(i.expire_at) < new Date() ? 'expiree' : 'active')
    }))
  })
})

// ===== PROTÉGÉ : Révoquer une invitation =====
app.delete('/invitations/:id', requireAuth, async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const inv = await c.env.DB.prepare('SELECT parent_id, utilisee FROM invitations_agent WHERE id = ?')
    .bind(id).first() as any
  if (!inv) return c.json({ error: 'Invitation introuvable' }, 404)
  if (inv.utilisee) return c.json({ error: 'Invitation déjà utilisée, impossible de la révoquer' }, 400)
  if (user.role !== 'superadmin' && inv.parent_id !== user.id) {
    return c.json({ error: 'Action interdite' }, 403)
  }
  await c.env.DB.prepare('DELETE FROM invitations_agent WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
