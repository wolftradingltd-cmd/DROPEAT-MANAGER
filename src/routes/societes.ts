// ============================================================
// PROFILS SOCIÉTÉ — coordonnées légales (FR auto-entrepreneur / UK Ltd)
// ============================================================
// GET  /api/societes/me            → mon profil société
// PUT  /api/societes/me            → créer/maj mon profil
// GET  /api/societes/user/:id      → (superadmin) profil d'un user
// PUT  /api/societes/user/:id      → (superadmin) maj profil d'un user
// PUT  /api/societes/user/:id/valider → validation KYC
// GET  /api/societes/all           → (superadmin) tous les profils
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

const FIELDS = [
  'type_societe', 'raison_sociale', 'nom_commercial', 'forme_juridique', 'capital',
  'siret', 'siren', 'numero_tva', 'rcs', 'ape_naf',
  'company_number', 'vat_uk',
  'adresse_rue', 'adresse_complement', 'code_postal', 'ville', 'pays',
  'telephone', 'email_facturation',
  'iban', 'bic', 'banque_nom',
  'regime_tva', 'taux_tva',
  'signature_url', 'logo_url',
  'mentions_legales_extra', 'date_creation_entreprise', 'numero_assurance_pro'
]

async function upsertProfil(db: D1Database, userId: number, b: any) {
  const existing = await db.prepare('SELECT id FROM profils_societe WHERE user_id = ?').bind(userId).first() as any
  if (existing) {
    const updates: string[] = []
    const values: any[] = []
    for (const f of FIELDS) {
      if (b[f] !== undefined) {
        updates.push(`${f} = ?`)
        values.push(b[f] === '' ? null : b[f])
      }
    }
    if (!updates.length) return existing
    values.push(userId)
    await db.prepare(
      `UPDATE profils_societe SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
    ).bind(...values).run()
    return existing
  }
  // INSERT — raison_sociale obligatoire
  const cols: string[] = ['user_id']
  const placeholders: string[] = ['?']
  const values: any[] = [userId]
  if (!b.raison_sociale) {
    const u = await db.prepare('SELECT nom, prenom FROM users WHERE id = ?').bind(userId).first() as any
    cols.push('raison_sociale')
    placeholders.push('?')
    values.push(`${u?.prenom || ''} ${u?.nom || ''}`.trim() || 'À compléter')
  }
  for (const f of FIELDS) {
    if (b[f] !== undefined) {
      cols.push(f)
      placeholders.push('?')
      values.push(b[f] === '' ? null : b[f])
    }
  }
  const r = await db.prepare(
    `INSERT INTO profils_societe (${cols.join(',')}) VALUES (${placeholders.join(',')})`
  ).bind(...values).run()
  return { id: r.meta.last_row_id }
}

// ============================================================
// GET /api/societes/me — récupère mon profil société
// ============================================================
app.get('/me', async (c) => {
  const user = c.get('user')
  const p = await c.env.DB.prepare('SELECT * FROM profils_societe WHERE user_id = ?').bind(user.id).first()
  return c.json({ profil: p || null })
})

// ============================================================
// PUT /api/societes/me — créer / mettre à jour mon profil société
// ============================================================
app.put('/me', async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  await upsertProfil(c.env.DB, user.id, b)
  const p = await c.env.DB.prepare('SELECT * FROM profils_societe WHERE user_id = ?').bind(user.id).first()
  return c.json({ success: true, profil: p })
})

// ============================================================
// SUPERADMIN — profil d'un autre user
// ============================================================
app.get('/user/:id', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const p = await c.env.DB.prepare('SELECT * FROM profils_societe WHERE user_id = ?').bind(id).first()
  const u = await c.env.DB.prepare('SELECT id, email, nom, prenom, role, niveau FROM users WHERE id = ?').bind(id).first()
  return c.json({ user: u, profil: p || null })
})

app.put('/user/:id', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()
  await upsertProfil(c.env.DB, id, b)
  const p = await c.env.DB.prepare('SELECT * FROM profils_societe WHERE user_id = ?').bind(id).first()
  return c.json({ success: true, profil: p })
})

// ============================================================
// SUPERADMIN — validation KYC d'un profil
// ============================================================
app.put('/user/:id/valider', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare(`
    UPDATE profils_societe SET validated_at = CURRENT_TIMESTAMP, validated_by = ? WHERE user_id = ?
  `).bind(user.id, id).run()
  return c.json({ success: true })
})

// ============================================================
// SUPERADMIN — liste de tous les profils
// ============================================================
app.get('/all', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, u.email, u.nom, u.prenom, u.role, u.niveau, u.actif
    FROM profils_societe p
    JOIN users u ON p.user_id = u.id
    ORDER BY u.role, u.nom, u.prenom
  `).all()
  return c.json({ profils: results })
})

export default app
