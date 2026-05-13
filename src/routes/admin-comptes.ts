// ============================================================
// MODULE COMPTES PLATEFORMES — Uber Manager/Order, Deliveroo, JustEat, etc.
// ============================================================
// Pour chaque restaurant, gérer la liste exhaustive des accès :
// - Comptes restaurateur (Uber Manager, Order, Deliveroo, JustEat...)
// - Comptes commercial DropEat (accès lecture)
// - URL publiques (site web, fiches plateformes)
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// Chiffrement basique (base64) — à remplacer par un KMS en prod
function encryptPwd(pwd: string): string {
  if (!pwd) return ''
  return Buffer.from(pwd, 'utf-8').toString('base64')
}
function decryptPwd(enc: string): string {
  if (!enc) return ''
  try { return Buffer.from(enc, 'base64').toString('utf-8') } catch { return '' }
}

async function userPeutVoirResto(db: D1Database, userId: number, role: string, restoId: number): Promise<boolean> {
  if (role === 'superadmin') return true
  const r = await db.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(restoId).first() as any
  if (!r) return false
  if (r.agent_id === userId) return true
  let cur = r.agent_id
  for (let i = 0; i < 6 && cur; i++) {
    const p = await db.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
    cur = p?.parent_id
    if (cur === userId) return true
  }
  return false
}

// GET /api/admin/comptes/restaurant/:id - Liste tous les comptes d'un resto
app.get('/restaurant/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const { results } = await c.env.DB.prepare(`
    SELECT cp.*, m.nom as marque_nom, uc.code as url_code,
      cr.nom || ' ' || cr.prenom as cree_par_nom
    FROM comptes_plateformes cp
    LEFT JOIN marques_virtuelles m ON cp.marque_id = m.id
    LEFT JOIN url_courtes uc ON cp.url_courte_id = uc.id
    LEFT JOIN users cr ON cp.created_par_id = cr.id
    WHERE cp.restaurant_id = ?
    ORDER BY cp.plateforme, cp.type_acces, cp.created_at
  `).bind(id).all() as any

  // Masquer le mot de passe par défaut (dévoiler sur action explicite)
  const safe = results.map((r: any) => ({
    ...r,
    password_chiffre: r.password_chiffre ? '••••••••' : '',
    has_password: !!r.password_chiffre
  }))

  return c.json({ comptes: safe })
})

// POST /api/admin/comptes - Créer un compte plateforme
app.post('/', async (c) => {
  const user = c.get('user')
  const b = await c.req.json()
  const required = ['restaurant_id', 'plateforme']
  for (const f of required) {
    if (!b[f]) return c.json({ error: `${f} requis` }, 400)
  }
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, b.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const r = await c.env.DB.prepare(`
    INSERT INTO comptes_plateformes (
      restaurant_id, plateforme, type_acces, libelle,
      email_connexion, password_chiffre, url_acces, store_id_externe,
      marque_id, notes, proprietaire_acces, created_par_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    b.restaurant_id, b.plateforme, b.type_acces || 'manager', b.libelle || null,
    b.email_connexion || null, b.password ? encryptPwd(b.password) : null,
    b.url_acces || null, b.store_id_externe || null,
    b.marque_id || null, b.notes || null,
    b.proprietaire_acces || 'restaurant', user.id
  ).run()

  // Mettre à jour la checklist
  if (['acces_uber_manager','acces_uber_order','acces_deliveroo','acces_justeat','acces_site_web','acces_commercial'].includes('acces_'+b.plateforme)) {
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO checklist_items (restaurant_id, code, libelle, statut, ressource_type, ressource_id)
      VALUES (?, ?, ?, 'valide', 'compte_plateforme', ?)
    `).bind(b.restaurant_id, 'acces_'+b.plateforme, 'Accès '+b.plateforme, r.meta.last_row_id).run()
  }

  return c.json({ success: true, id: r.meta.last_row_id })
})

// PUT /api/admin/comptes/:id - Modifier
app.put('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const cp = await c.env.DB.prepare('SELECT * FROM comptes_plateformes WHERE id = ?').bind(id).first() as any
  if (!cp) return c.json({ error: 'Introuvable' }, 404)
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, cp.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const fields = ['plateforme','type_acces','libelle','email_connexion','url_acces',
    'store_id_externe','marque_id','notes','proprietaire_acces','actif']
  const updates: string[] = []
  const params: any[] = []
  for (const f of fields) {
    if (b[f] !== undefined) { updates.push(`${f} = ?`); params.push(b[f]) }
  }
  if (b.password !== undefined) {
    updates.push('password_chiffre = ?')
    params.push(b.password ? encryptPwd(b.password) : null)
  }
  if (!updates.length) return c.json({ error: 'Rien à mettre à jour' }, 400)
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)

  await c.env.DB.prepare(`UPDATE comptes_plateformes SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params).run()
  return c.json({ success: true })
})

// GET /api/admin/comptes/:id/reveal - Dévoiler le mot de passe (audité)
app.get('/:id/reveal', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const cp = await c.env.DB.prepare('SELECT * FROM comptes_plateformes WHERE id = ?').bind(id).first() as any
  if (!cp) return c.json({ error: 'Introuvable' }, 404)
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, cp.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  await c.env.DB.prepare(`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (?, 'reveal_password', 'compte_plateforme', ?, ?)
  `).bind(user.id, id, JSON.stringify({ plateforme: cp.plateforme })).run()
  return c.json({
    email: cp.email_connexion,
    password: decryptPwd(cp.password_chiffre || ''),
    url: cp.url_acces
  })
})

// DELETE /api/admin/comptes/:id
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const cp = await c.env.DB.prepare('SELECT * FROM comptes_plateformes WHERE id = ?').bind(id).first() as any
  if (!cp) return c.json({ error: 'Introuvable' }, 404)
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, cp.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  await c.env.DB.prepare('DELETE FROM comptes_plateformes WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ====================== Marque ↔ Plateformes ======================

// GET /api/admin/comptes/marque/:id/plateformes
app.get('/marque/:id/plateformes', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { results } = await c.env.DB.prepare(`
    SELECT mp.*, uc.code as url_code
    FROM marque_plateformes mp
    LEFT JOIN url_courtes uc ON mp.url_courte_id = uc.id
    WHERE mp.marque_id = ?
    ORDER BY mp.plateforme
  `).bind(id).all()
  return c.json({ plateformes: results })
})

// POST /api/admin/comptes/marque/:id/plateforme
app.post('/marque/:id/plateforme', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()
  if (!b.plateforme) return c.json({ error: 'plateforme requise' }, 400)

  // Vérifier permissions
  const m = await c.env.DB.prepare(`
    SELECT m.id, r.id as resto_id, r.agent_id FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, m.resto_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  await c.env.DB.prepare(`
    INSERT INTO marque_plateformes (marque_id, plateforme, url_publique, store_id_externe, date_lancement, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(marque_id, plateforme) DO UPDATE SET
      url_publique = excluded.url_publique,
      store_id_externe = excluded.store_id_externe,
      date_lancement = excluded.date_lancement,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    id, b.plateforme, b.url_publique || null,
    b.store_id_externe || null, b.date_lancement || null, b.notes || null
  ).run()

  return c.json({ success: true })
})

// DELETE /api/admin/comptes/marque/:id/plateforme/:plat
app.delete('/marque/:id/plateforme/:plat', async (c) => {
  const id = parseInt(c.req.param('id'))
  const plat = c.req.param('plat')
  await c.env.DB.prepare(`
    DELETE FROM marque_plateformes WHERE marque_id = ? AND plateforme = ?
  `).bind(id, plat).run()
  return c.json({ success: true })
})

// ====================== Checklist activation ======================

// GET /api/admin/comptes/restaurant/:id/checklist - Checklist d'activation complète
app.get('/restaurant/:id/checklist', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const r = await c.env.DB.prepare('SELECT * FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)

  // Items obligatoires standards
  const obligatoires = [
    { code: 'kbis', libelle: 'Extrait KBIS', categorie: 'documents' },
    { code: 'piece_identite', libelle: "Pièce d'identité gérant", categorie: 'documents' },
    { code: 'rib', libelle: 'RIB / IBAN', categorie: 'documents' },
    { code: 'menu', libelle: 'Menu PDF / digital', categorie: 'documents' },
    { code: 'contrat', libelle: 'Contrat signé', categorie: 'documents' },
    { code: 'acces_uber_manager', libelle: 'Accès Uber Eats Manager', categorie: 'comptes' },
    { code: 'acces_uber_order', libelle: 'Accès Uber Eats Order (tablette)', categorie: 'comptes' },
    { code: 'acces_commercial', libelle: 'Accès commercial DropEat', categorie: 'comptes' }
  ]
  const optionnels = [
    { code: 'photo_facade', libelle: 'Photo façade', categorie: 'documents' },
    { code: 'attestation', libelle: 'Attestation', categorie: 'documents' },
    { code: 'acces_deliveroo', libelle: 'Accès Deliveroo', categorie: 'comptes' },
    { code: 'acces_justeat', libelle: 'Accès Just Eat', categorie: 'comptes' },
    { code: 'acces_site_web', libelle: 'Site web', categorie: 'comptes' }
  ]

  // État courant des items
  const { results: items } = await c.env.DB.prepare(`
    SELECT * FROM checklist_items WHERE restaurant_id = ?
  `).bind(id).all() as any
  const itemsMap = new Map(items.map((i: any) => [i.code, i]))

  // Documents disponibles
  const { results: docs } = await c.env.DB.prepare(`
    SELECT type_document, statut, COUNT(*) as nb FROM restaurant_documents
    WHERE restaurant_id = ? GROUP BY type_document, statut
  `).bind(id).all() as any
  const docsMap = new Map<string, any>()
  for (const d of docs as any[]) {
    if (!docsMap.has(d.type_document)) docsMap.set(d.type_document, { uploades: 0, valides: 0 })
    const e = docsMap.get(d.type_document)!
    e.uploades += d.nb
    if (d.statut === 'valide') e.valides += d.nb
  }

  // Comptes plateformes disponibles
  const { results: comptes } = await c.env.DB.prepare(`
    SELECT plateforme, type_acces, COUNT(*) as nb FROM comptes_plateformes
    WHERE restaurant_id = ? AND actif = 1 GROUP BY plateforme, type_acces
  `).bind(id).all() as any

  function checkStatus(code: string): { statut: string, source?: string } {
    const item = itemsMap.get(code) as any
    if (item && item.statut !== 'non_renseigne') return { statut: item.statut }

    // Auto-détection
    if (code === 'menu' && r.menu_url) return { statut: 'valide', source: 'menu_url' }
    const docInfo = docsMap.get(code)
    if (docInfo) {
      if (docInfo.valides > 0) return { statut: 'valide', source: 'document' }
      if (docInfo.uploades > 0) return { statut: 'en_attente', source: 'document' }
    }
    if (code.startsWith('acces_')) {
      const plat = code.substring(6)
      const trouve = (comptes as any[]).find(co => co.plateforme === plat || ('uber_'+co.type_acces) === plat)
      if (trouve) return { statut: 'valide', source: 'compte' }
    }
    return { statut: 'non_renseigne' }
  }

  const checklist = [...obligatoires, ...optionnels].map(it => {
    const s = checkStatus(it.code)
    return {
      ...it,
      obligatoire: obligatoires.some(o => o.code === it.code),
      ...s
    }
  })

  const obligatoiresList = checklist.filter(c => c.obligatoire)
  const valides = obligatoiresList.filter(c => c.statut === 'valide').length
  const en_attente = obligatoiresList.filter(c => c.statut === 'en_attente').length
  const manquants = obligatoiresList.filter(c => c.statut === 'non_renseigne').length

  return c.json({
    restaurant: {
      id: r.id, nom: r.nom, ville: r.ville,
      siret: r.siret, raison_sociale: r.raison_sociale, menu_url: r.menu_url,
      compte_active: r.compte_active, date_activation: r.date_activation
    },
    checklist,
    resume: {
      obligatoires: obligatoiresList.length,
      valides,
      en_attente,
      manquants,
      pourcentage: obligatoiresList.length ? Math.round((valides / obligatoiresList.length) * 100) : 0,
      pret_activation: manquants === 0 && en_attente === 0
    }
  })
})

// PUT /api/admin/comptes/restaurant/:id/activer - Activer le compte (superadmin)
app.put('/restaurant/:id/activer', async (c) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare(`
    UPDATE restaurants
    SET compte_active = 1, date_activation = CURRENT_TIMESTAMP, active_par_id = ?
    WHERE id = ?
  `).bind(u.id, id).run()
  return c.json({ success: true })
})

// PUT /api/admin/comptes/restaurant/:id/checklist/:code/statut
app.put('/restaurant/:id/checklist/:code/statut', async (c) => {
  const user = c.get('user')
  const restoId = parseInt(c.req.param('id'))
  const code = c.req.param('code')
  const { statut, notes } = await c.req.json()
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, restoId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const labels: Record<string, string> = {
    kbis: 'Extrait KBIS', piece_identite: "Pièce d'identité",
    rib: 'RIB / IBAN', menu: 'Menu', contrat: 'Contrat signé',
    photo_facade: 'Photo façade', attestation: 'Attestation',
    acces_uber_manager: 'Accès Uber Manager', acces_uber_order: 'Accès Uber Order',
    acces_deliveroo: 'Accès Deliveroo', acces_justeat: 'Accès Just Eat',
    acces_site_web: 'Site web', acces_commercial: 'Accès commercial'
  }
  await c.env.DB.prepare(`
    INSERT INTO checklist_items (restaurant_id, code, libelle, statut, notes, validateur_id, date_validation)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(restaurant_id, code) DO UPDATE SET
      statut = excluded.statut, notes = excluded.notes,
      validateur_id = excluded.validateur_id,
      date_validation = excluded.date_validation,
      updated_at = CURRENT_TIMESTAMP
  `).bind(restoId, code, labels[code] || code, statut, notes || null, user.id).run()

  return c.json({ success: true })
})

// PUT /api/admin/comptes/restaurant/:id/menu - Définir l'URL du menu
app.put('/restaurant/:id/menu', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const { menu_url } = await c.req.json()
  if (!await userPeutVoirResto(c.env.DB, user.id, user.role, id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  await c.env.DB.prepare('UPDATE restaurants SET menu_url = ? WHERE id = ?').bind(menu_url || null, id).run()
  return c.json({ success: true })
})

export default app
