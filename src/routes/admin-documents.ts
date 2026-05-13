// ============================================================
// DOCUMENTS RESTAURANT (KBIS, pièce d'identité, RIB, contrats…)
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

const TYPES_OBLIGATOIRES = ['kbis', 'piece_identite', 'rib']
const TYPES_OPTIONNELS = ['contrat', 'attestation', 'photo_facade', 'autre']
const TOUS_TYPES = [...TYPES_OBLIGATOIRES, ...TYPES_OPTIONNELS]

const TYPE_LABELS: Record<string, string> = {
  kbis: 'Extrait KBIS',
  piece_identite: 'Pièce d\'identité',
  rib: 'RIB / IBAN',
  contrat: 'Contrat signé',
  attestation: 'Attestation',
  photo_facade: 'Photo façade',
  autre: 'Autre'
}

/**
 * Vérifie qu'un user a le droit d'agir sur un restaurant.
 * Superadmin OK partout. Agent : uniquement ses restos ou ceux de sa branche.
 */
async function userCanAccessResto(db: D1Database, user: any, restaurantId: number): Promise<boolean> {
  if (user.role === 'superadmin') return true
  // Récupère agent_id du resto
  const r = await db.prepare('SELECT agent_id FROM restaurants WHERE id = ?')
    .bind(restaurantId).first() as any
  if (!r?.agent_id) return false
  if (r.agent_id === user.id) return true
  // Vérifie si l'agent est descendant dans la branche du user
  const ancestors: number[] = [user.id]
  let cur = user.id
  // Parcours descendants : on cherche tous les sous-agents du user
  const stack = [user.id]
  const visited = new Set<number>([user.id])
  while (stack.length) {
    const x = stack.pop()
    const { results } = await db.prepare('SELECT id FROM users WHERE parent_id = ?')
      .bind(x).all() as any
    for (const u of results as any[]) {
      if (!visited.has(u.id)) { visited.add(u.id); stack.push(u.id) }
    }
  }
  return visited.has(r.agent_id)
}

// GET /api/admin/documents/types - Liste des types possibles
app.get('/types', (c) => {
  return c.json({
    obligatoires: TYPES_OBLIGATOIRES.map(t => ({ code: t, label: TYPE_LABELS[t] })),
    optionnels: TYPES_OPTIONNELS.map(t => ({ code: t, label: TYPE_LABELS[t] }))
  })
})

// GET /api/admin/documents/restaurant/:id - Documents + checklist
app.get('/restaurant/:id', async (c) => {
  const user = c.get('user')
  const restaurantId = parseInt(c.req.param('id'))
  if (!await userCanAccessResto(c.env.DB, user, restaurantId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const { results: docs } = await c.env.DB.prepare(`
    SELECT d.id, d.type_document, d.nom_fichier, d.taille_octets, d.mime_type,
           d.url_externe, d.date_emission, d.date_expiration, d.statut,
           d.uploaded_by, d.validated_by, d.date_validation, d.notes,
           d.created_at, d.updated_at,
           u.nom as uploader_nom, u.prenom as uploader_prenom,
           v.nom as validator_nom, v.prenom as validator_prenom
    FROM restaurant_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    LEFT JOIN users v ON d.validated_by = v.id
    WHERE d.restaurant_id = ?
    ORDER BY d.created_at DESC
  `).bind(restaurantId).all() as any

  // Checklist : pour chaque type obligatoire, on regarde si un doc valide existe
  const checklist = TOUS_TYPES.map(type => {
    const fournis = (docs as any[]).filter((d: any) => d.type_document === type && d.statut !== 'rejete')
    const valides = fournis.filter((d: any) => d.statut === 'valide')
    const expire = fournis.find((d: any) =>
      d.date_expiration && new Date(d.date_expiration) < new Date()
    )
    return {
      type,
      label: TYPE_LABELS[type],
      obligatoire: TYPES_OBLIGATOIRES.includes(type),
      fourni: fournis.length > 0,
      valide: valides.length > 0,
      expire: !!expire,
      nb_documents: fournis.length,
      derniere_maj: fournis[0]?.created_at || null
    }
  })

  const conformite = {
    documents_obligatoires_fournis: checklist.filter(c => c.obligatoire && c.fourni).length,
    documents_obligatoires_total: TYPES_OBLIGATOIRES.length,
    documents_obligatoires_valides: checklist.filter(c => c.obligatoire && c.valide).length,
    pourcentage_completion: Math.round(
      (checklist.filter(c => c.obligatoire && c.valide).length / TYPES_OBLIGATOIRES.length) * 100
    ),
    documents_expires: checklist.filter(c => c.expire).length,
    conforme: checklist.filter(c => c.obligatoire).every(c => c.valide && !c.expire)
  }

  return c.json({ checklist, documents: docs, conformite })
})

// POST /api/admin/documents/restaurant/:id - Uploader un document
app.post('/restaurant/:id', async (c) => {
  const user = c.get('user')
  const restaurantId = parseInt(c.req.param('id'))
  if (!await userCanAccessResto(c.env.DB, user, restaurantId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const data = await c.req.json()
  const {
    type_document, nom_fichier, taille_octets, mime_type,
    contenu_base64, url_externe, date_emission, date_expiration, notes
  } = data

  if (!type_document || !nom_fichier) {
    return c.json({ error: 'type_document et nom_fichier requis' }, 400)
  }
  if (!TOUS_TYPES.includes(type_document)) {
    return c.json({ error: 'Type de document invalide' }, 400)
  }
  if (!contenu_base64 && !url_externe) {
    return c.json({ error: 'contenu_base64 ou url_externe requis' }, 400)
  }
  // Limite : 1 Mo en base64 (~750 Ko fichier réel)
  if (contenu_base64 && contenu_base64.length > 1_400_000) {
    return c.json({ error: 'Fichier trop volumineux (max 1 Mo en base64)' }, 400)
  }

  // Statut : superadmin valide directement, agent → en_attente
  const statut = user.role === 'superadmin' ? 'valide' : 'en_attente'
  const validatedBy = user.role === 'superadmin' ? user.id : null
  const dateValidation = user.role === 'superadmin' ? new Date().toISOString() : null

  const r = await c.env.DB.prepare(`
    INSERT INTO restaurant_documents
      (restaurant_id, type_document, nom_fichier, taille_octets, mime_type,
       contenu_base64, url_externe, date_emission, date_expiration, statut,
       uploaded_by, validated_by, date_validation, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    restaurantId, type_document, nom_fichier, taille_octets || null, mime_type || null,
    contenu_base64 || null, url_externe || null,
    date_emission || null, date_expiration || null,
    statut, user.id, validatedBy, dateValidation, notes || null
  ).run()

  // Mettre à jour la checklist
  await c.env.DB.prepare(`
    INSERT INTO restaurant_checklist (restaurant_id, type_document, fourni, document_id, date_fourniture)
    VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(restaurant_id, type_document) DO UPDATE SET
      fourni = 1, document_id = excluded.document_id, date_fourniture = CURRENT_TIMESTAMP
  `).bind(restaurantId, type_document, r.meta.last_row_id).run().catch(() => {
    // Si la table checklist n'a pas le PRIMARY KEY composite, fallback
  })

  return c.json({ success: true, id: r.meta.last_row_id, statut })
})

// GET /api/admin/documents/:id/contenu - Récupère le contenu base64 (preview/download)
app.get('/:id/contenu', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const d = await c.env.DB.prepare(`
    SELECT d.*, r.agent_id FROM restaurant_documents d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).bind(id).first() as any
  if (!d) return c.json({ error: 'Document introuvable' }, 404)
  if (!await userCanAccessResto(c.env.DB, user, d.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  return c.json({
    id: d.id,
    nom_fichier: d.nom_fichier,
    mime_type: d.mime_type,
    contenu_base64: d.contenu_base64,
    url_externe: d.url_externe
  })
})

// PUT /api/admin/documents/:id/valider - Valider/rejeter (superadmin)
app.put('/:id/valider', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé au superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const { statut, notes } = await c.req.json()
  if (!['valide', 'rejete', 'expire'].includes(statut)) {
    return c.json({ error: 'Statut invalide' }, 400)
  }
  await c.env.DB.prepare(`
    UPDATE restaurant_documents SET
      statut = ?, validated_by = ?, date_validation = CURRENT_TIMESTAMP,
      notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(statut, user.id, notes || null, id).run()
  return c.json({ success: true })
})

// DELETE /api/admin/documents/:id
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const d = await c.env.DB.prepare(`
    SELECT d.*, r.agent_id FROM restaurant_documents d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).bind(id).first() as any
  if (!d) return c.json({ error: 'Document introuvable' }, 404)
  if (!await userCanAccessResto(c.env.DB, user, d.restaurant_id)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  // Agent ne peut supprimer que ses propres uploads non validés
  if (user.role !== 'superadmin' && d.uploaded_by !== user.id) {
    return c.json({ error: 'Action interdite' }, 403)
  }
  await c.env.DB.prepare('DELETE FROM restaurant_documents WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// GET /api/admin/documents/conformite/all - Vue conformité globale (superadmin)
app.get('/conformite/all', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé au superadmin' }, 403)

  const { results } = await c.env.DB.prepare(`
    SELECT r.id, r.nom, r.ville, r.actif,
           u.nom as agent_nom, u.prenom as agent_prenom,
           ${TYPES_OBLIGATOIRES.map(t =>
             `(SELECT COUNT(*) FROM restaurant_documents d
                WHERE d.restaurant_id = r.id AND d.type_document = '${t}' AND d.statut = 'valide') as has_${t}`
           ).join(', ')}
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.nom
  `).all() as any

  const stats = {
    total_restos: results.length,
    conformes: 0,
    non_conformes: 0
  }
  const enriched = (results as any[]).map((r: any) => {
    const conforme = TYPES_OBLIGATOIRES.every(t => r[`has_${t}`] > 0)
    if (conforme) stats.conformes++; else stats.non_conformes++
    return {
      id: r.id, nom: r.nom, ville: r.ville, actif: r.actif,
      agent: r.agent_nom ? `${r.agent_prenom} ${r.agent_nom}` : null,
      conforme,
      manquants: TYPES_OBLIGATOIRES.filter(t => !r[`has_${t}`]).map(t => TYPE_LABELS[t])
    }
  })

  return c.json({ stats, restaurants: enriched })
})

export default app
