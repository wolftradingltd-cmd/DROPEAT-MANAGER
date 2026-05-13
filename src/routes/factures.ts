// ============================================================
// FACTURES — module de facturation complet
// ============================================================
// Agent → DropEat : commissions (propre + portefeuille + N+1 + N+2)
// DropEat → Restaurant : facturation service
// Workflow : brouillon → envoyee → validee/refusee → payee
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import {
  getNextFactureNumero,
  mentionsLegales,
  buildLignesFactureAgent,
  buildLignesFactureRestaurant,
  buildLignesFactureAgentResto,
  listRestosPortefeuilleAvecCommandes,
  type ProfilSociete
} from '../lib/factures'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// ---------- Helpers ----------
async function getProfil(db: D1Database, userId: number): Promise<ProfilSociete | null> {
  return await db.prepare('SELECT * FROM profils_societe WHERE user_id = ?').bind(userId).first() as any
}

async function getSuperadmin(db: D1Database) {
  return await db.prepare(`SELECT id, email, nom, prenom FROM users WHERE role = 'superadmin' LIMIT 1`).first() as any
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmtDate(d: Date) {
  return d.toISOString().substring(0, 10)
}

// ============================================================
// POST /api/factures/agent/preview
// Body : { annee, mois }
// → Aperçu des lignes sans créer la facture (pour confirmation)
// ============================================================
app.post('/agent/preview', async (c) => {
  const user = c.get('user')
  const { annee, mois } = await c.req.json()
  if (!annee || !mois) return c.json({ error: 'annee, mois requis' }, 400)

  const lignes = await buildLignesFactureAgent(c.env.DB, user.id, annee, mois)
  const total = lignes.reduce((s, l) => s + l.montant_ht, 0)
  return c.json({ lignes, total, nb_lignes: lignes.length, periode: { annee, mois } })
})

// ============================================================
// POST /api/factures/agent/create
// Body : { annee, mois, notes? }
// → Crée une facture brouillon agent_to_dropeat
// ============================================================
app.post('/agent/create', async (c) => {
  const user = c.get('user')
  const { annee, mois, notes } = await c.req.json()
  if (!annee || !mois) return c.json({ error: 'annee, mois requis' }, 400)

  // Vérif : profil société rempli
  const profil = await getProfil(c.env.DB, user.id)
  if (!profil || !profil.raison_sociale || !profil.adresse_rue) {
    return c.json({ error: 'Veuillez compléter votre profil société avant de créer une facture (Mon profil société)' }, 400)
  }

  // Vérif : pas de facture déjà existante pour cette période (sauf annulee/refusee)
  const existing = await c.env.DB.prepare(`
    SELECT id, numero, statut FROM factures
    WHERE emetteur_user_id = ? AND periode_annee = ? AND periode_mois = ?
      AND type = 'agent_to_dropeat'
      AND statut NOT IN ('annulee','refusee')
  `).bind(user.id, annee, mois).first() as any
  if (existing) {
    return c.json({ error: `Une facture existe déjà pour cette période : ${existing.numero} (${existing.statut})` }, 400)
  }

  // Construire les lignes
  const lignes = await buildLignesFactureAgent(c.env.DB, user.id, annee, mois)
  if (!lignes.length) return c.json({ error: 'Aucune commission à facturer pour cette période' }, 400)
  const totalHT = lignes.reduce((s, l) => s + l.montant_ht, 0)

  // Snapshot émetteur
  const emetteurSnap = JSON.stringify(profil)

  // Snapshot destinataire = superadmin
  const sa = await getSuperadmin(c.env.DB)
  const saProfil = sa ? await getProfil(c.env.DB, sa.id) : null
  const destSnap = JSON.stringify(saProfil || { raison_sociale: 'DROPEAT LTD', pays: 'United Kingdom' })

  // Numéro
  const prefixe = `AGT-${annee}-${String(mois).padStart(2, '0')}`
  const numero = await getNextFactureNumero(c.env.DB, prefixe, 4)

  const taux = profil.taux_tva || 0
  const montantTVA = totalHT * (taux / 100)
  const totalTTC = totalHT + montantTVA
  const devise = (profil.pays || '').toLowerCase().includes('kingdom') ? 'GBP' : 'EUR'
  const dateEmission = new Date()
  const dateEcheance = addDays(dateEmission, 30)
  const mentions = JSON.stringify(mentionsLegales(profil))

  const r = await c.env.DB.prepare(`
    INSERT INTO factures (
      numero, type, emetteur_user_id, emetteur_snapshot,
      dest_user_id, dest_snapshot,
      periode_annee, periode_mois,
      date_emission, date_echeance,
      montant_ht, montant_tva, taux_tva, montant_ttc, devise,
      statut, mentions_legales, notes_internes
    ) VALUES (?, 'agent_to_dropeat', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brouillon', ?, ?)
  `).bind(
    numero, user.id, emetteurSnap,
    sa?.id || null, destSnap,
    annee, mois,
    fmtDate(dateEmission), fmtDate(dateEcheance),
    totalHT, montantTVA, taux, totalTTC, devise,
    mentions, notes || null
  ).run()

  const factureId = r.meta.last_row_id as number

  // Insertion lignes
  let ordre = 0
  for (const l of lignes) {
    ordre++
    const tvaL = l.montant_ht * (taux / 100)
    await c.env.DB.prepare(`
      INSERT INTO facture_lignes (
        facture_id, ordre, libelle, description, categorie,
        marque_id, restaurant_id, agent_concerne_id,
        quantite, prix_unitaire, montant_ht, taux_tva, montant_tva, montant_ttc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      factureId, ordre, l.libelle, l.description, l.categorie,
      l.marque_id || null, l.restaurant_id || null, l.agent_concerne_id || null,
      l.quantite, l.prix_unitaire, l.montant_ht, taux, tvaL, l.montant_ht + tvaL
    ).run()
  }

  return c.json({ success: true, facture_id: factureId, numero, montant_ht: totalHT, montant_ttc: totalTTC })
})

// ============================================================
// POST /api/factures/resto/create
// Body : { restaurant_id, annee, mois }
// SUPERADMIN — Génère facture DropEat → restaurant
// ============================================================
app.post('/resto/create', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const { restaurant_id, annee, mois } = await c.req.json()
  if (!restaurant_id || !annee || !mois) return c.json({ error: 'restaurant_id, annee, mois requis' }, 400)

  const profil = await getProfil(c.env.DB, user.id)
  if (!profil || !profil.raison_sociale) {
    return c.json({ error: 'Veuillez compléter le profil société DROPEAT LTD avant de générer une facture' }, 400)
  }

  // Vérif existence
  const existing = await c.env.DB.prepare(`
    SELECT id, numero, statut FROM factures
    WHERE dest_restaurant_id = ? AND periode_annee = ? AND periode_mois = ?
      AND type = 'dropeat_to_resto'
      AND statut NOT IN ('annulee')
  `).bind(restaurant_id, annee, mois).first() as any
  if (existing) {
    return c.json({ error: `Une facture existe déjà pour cette période : ${existing.numero} (${existing.statut})` }, 400)
  }

  const resto = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id WHERE r.id = ?
  `).bind(restaurant_id).first() as any
  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)

  const lignes = await buildLignesFactureRestaurant(c.env.DB, restaurant_id, annee, mois)
  if (!lignes.length) return c.json({ error: 'Aucune facturation à émettre pour cette période' }, 400)
  const totalHT = lignes.reduce((s, l) => s + l.montant_ht, 0)

  const emetteurSnap = JSON.stringify(profil)
  const destSnap = JSON.stringify({
    raison_sociale: resto.raison_sociale || resto.nom,
    nom_commercial: resto.nom,
    siret: resto.siret,
    adresse_rue: resto.adresse,
    code_postal: resto.code_postal,
    ville: resto.ville,
    pays: 'France',
    email_facturation: resto.email,
    telephone: resto.telephone
  })

  const prefixe = `DRP-${annee}-${String(mois).padStart(2, '0')}-R`
  const numero = await getNextFactureNumero(c.env.DB, prefixe, 3)

  const taux = profil.taux_tva || 0
  const montantTVA = totalHT * (taux / 100)
  const totalTTC = totalHT + montantTVA
  const devise = (profil.pays || '').toLowerCase().includes('kingdom') ? 'GBP' : 'EUR'
  const dateEmission = new Date()
  const dateEcheance = addDays(dateEmission, 30)
  const mentions = JSON.stringify(mentionsLegales(profil))

  const r = await c.env.DB.prepare(`
    INSERT INTO factures (
      numero, type, emetteur_user_id, emetteur_snapshot,
      dest_restaurant_id, dest_snapshot,
      periode_annee, periode_mois,
      date_emission, date_echeance,
      montant_ht, montant_tva, taux_tva, montant_ttc, devise,
      statut, mentions_legales
    ) VALUES (?, 'dropeat_to_resto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'envoyee', ?)
  `).bind(
    numero, user.id, emetteurSnap,
    restaurant_id, destSnap,
    annee, mois,
    fmtDate(dateEmission), fmtDate(dateEcheance),
    totalHT, montantTVA, taux, totalTTC, devise,
    mentions
  ).run()
  const factureId = r.meta.last_row_id as number
  await c.env.DB.prepare(`UPDATE factures SET envoyee_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(factureId).run()

  let ordre = 0
  for (const l of lignes) {
    ordre++
    const tvaL = l.montant_ht * (taux / 100)
    await c.env.DB.prepare(`
      INSERT INTO facture_lignes (
        facture_id, ordre, libelle, description, categorie,
        marque_id, restaurant_id, agent_concerne_id,
        quantite, prix_unitaire, montant_ht, taux_tva, montant_tva, montant_ttc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      factureId, ordre, l.libelle, l.description, 'facturation_resto',
      l.marque_id || null, l.restaurant_id || null, null,
      l.quantite, l.prix_unitaire, l.montant_ht, taux, tvaL, l.montant_ht + tvaL
    ).run()
  }

  return c.json({ success: true, facture_id: factureId, numero, montant_ht: totalHT, montant_ttc: totalTTC })
})

// ============================================================
// AGENT → RESTAURANT (portefeuille propriétaire 100%)
// ============================================================
// L'agent facture DIRECTEMENT le restaurant à 100% sur les commandes
// des marques/restaurants en portefeuille (5e marque ou 5e restaurant).
// DropEat ne touche rien sur ces commandes.
// Pas de commission N+1/N+2 (déjà exclu côté calcul).
// ============================================================

// GET /api/factures/agent-resto/restos-eligibles?annee=&mois=
// Liste les restaurants éligibles à facturation directe par l'agent connecté
app.get('/agent-resto/restos-eligibles', async (c) => {
  const user = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const restos = await listRestosPortefeuilleAvecCommandes(c.env.DB, user.id, annee, mois)
  return c.json({ restos, annee, mois })
})

// POST /api/factures/agent-resto/preview
// Body : { restaurant_id, annee, mois }
app.post('/agent-resto/preview', async (c) => {
  const user = c.get('user')
  const { restaurant_id, annee, mois } = await c.req.json()
  if (!restaurant_id || !annee || !mois) {
    return c.json({ error: 'restaurant_id, annee, mois requis' }, 400)
  }
  // Vérifier que le restaurant appartient bien à l'agent
  const resto = await c.env.DB.prepare(
    'SELECT id, nom, agent_id FROM restaurants WHERE id = ?'
  ).bind(restaurant_id).first() as any
  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)
  if (resto.agent_id !== user.id && user.role !== 'superadmin') {
    return c.json({ error: 'Ce restaurant ne vous appartient pas' }, 403)
  }

  const lignes = await buildLignesFactureAgentResto(c.env.DB, user.id, restaurant_id, annee, mois)
  const total = lignes.reduce((s, l) => s + l.montant_ht, 0)
  return c.json({ lignes, total, nb_lignes: lignes.length, periode: { annee, mois }, restaurant: { id: resto.id, nom: resto.nom } })
})

// POST /api/factures/agent-resto/create
// Body : { restaurant_id, annee, mois, notes? }
app.post('/agent-resto/create', async (c) => {
  const user = c.get('user')
  const { restaurant_id, annee, mois, notes } = await c.req.json()
  if (!restaurant_id || !annee || !mois) {
    return c.json({ error: 'restaurant_id, annee, mois requis' }, 400)
  }

  // Vérif profil société rempli
  const profil = await getProfil(c.env.DB, user.id)
  if (!profil || !profil.raison_sociale || !profil.adresse_rue) {
    return c.json({ error: 'Veuillez compléter votre profil société avant de créer une facture (Mon profil société)' }, 400)
  }

  // Récup resto + sécurité (ownership)
  const resto = await c.env.DB.prepare(`
    SELECT r.*, u.id as agent_id_real
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.id = ?
  `).bind(restaurant_id).first() as any
  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)
  if (resto.agent_id_real !== user.id && user.role !== 'superadmin') {
    return c.json({ error: 'Ce restaurant ne vous appartient pas' }, 403)
  }

  // Vérif : pas de facture existante
  const existing = await c.env.DB.prepare(`
    SELECT id, numero, statut FROM factures
    WHERE emetteur_user_id = ? AND dest_restaurant_id = ?
      AND periode_annee = ? AND periode_mois = ?
      AND type = 'agent_to_resto'
      AND statut NOT IN ('annulee','refusee')
  `).bind(user.id, restaurant_id, annee, mois).first() as any
  if (existing) {
    return c.json({ error: `Une facture existe déjà pour cette période et ce restaurant : ${existing.numero} (${existing.statut})` }, 400)
  }

  const lignes = await buildLignesFactureAgentResto(c.env.DB, user.id, restaurant_id, annee, mois)
  if (!lignes.length) return c.json({ error: 'Aucun encaissement direct (portefeuille) à facturer pour cette période' }, 400)
  const totalHT = lignes.reduce((s, l) => s + l.montant_ht, 0)

  // Snapshots
  const emetteurSnap = JSON.stringify(profil)
  const destSnap = JSON.stringify({
    raison_sociale: resto.raison_sociale || resto.nom,
    nom_commercial: resto.nom,
    siret: resto.siret,
    adresse_rue: resto.adresse,
    code_postal: resto.code_postal,
    ville: resto.ville,
    pays: 'France',
    email_facturation: resto.email,
    telephone: resto.telephone
  })

  const prefixe = `AGR-${annee}-${String(mois).padStart(2, '0')}`
  const numero = await getNextFactureNumero(c.env.DB, prefixe, 4)

  const taux = profil.taux_tva || 0
  const montantTVA = totalHT * (taux / 100)
  const totalTTC = totalHT + montantTVA
  const devise = (profil.pays || '').toLowerCase().includes('kingdom') ? 'GBP' : 'EUR'
  const dateEmission = new Date()
  const dateEcheance = addDays(dateEmission, 30)
  const mentions = JSON.stringify(mentionsLegales(profil))

  const r = await c.env.DB.prepare(`
    INSERT INTO factures (
      numero, type, emetteur_user_id, emetteur_snapshot,
      dest_restaurant_id, dest_snapshot,
      periode_annee, periode_mois,
      date_emission, date_echeance,
      montant_ht, montant_tva, taux_tva, montant_ttc, devise,
      statut, mentions_legales, notes_internes
    ) VALUES (?, 'agent_to_resto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brouillon', ?, ?)
  `).bind(
    numero, user.id, emetteurSnap,
    restaurant_id, destSnap,
    annee, mois,
    fmtDate(dateEmission), fmtDate(dateEcheance),
    totalHT, montantTVA, taux, totalTTC, devise,
    mentions, notes || null
  ).run()
  const factureId = r.meta.last_row_id as number

  let ordre = 0
  for (const l of lignes) {
    ordre++
    const tvaL = l.montant_ht * (taux / 100)
    await c.env.DB.prepare(`
      INSERT INTO facture_lignes (
        facture_id, ordre, libelle, description, categorie,
        marque_id, restaurant_id, agent_concerne_id,
        quantite, prix_unitaire, montant_ht, taux_tva, montant_tva, montant_ttc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      factureId, ordre, l.libelle, l.description, l.categorie,
      l.marque_id || null, l.restaurant_id || null, null,
      l.quantite, l.prix_unitaire, l.montant_ht, taux, tvaL, l.montant_ht + tvaL
    ).run()
  }

  return c.json({ success: true, facture_id: factureId, numero, montant_ht: totalHT, montant_ttc: totalTTC })
})

// ============================================================
// GET /api/factures — liste des factures (filtrée selon rôle)
// query : ?type=agent_to_dropeat|dropeat_to_resto&statut=...&annee=...&mois=...
// ============================================================
app.get('/', async (c) => {
  const user = c.get('user')
  const type = c.req.query('type')
  const statut = c.req.query('statut')
  const annee = c.req.query('annee')
  const mois = c.req.query('mois')

  const where: string[] = []
  const params: any[] = []
  if (user.role !== 'superadmin') {
    where.push('f.emetteur_user_id = ?')
    params.push(user.id)
  }
  if (type) { where.push('f.type = ?'); params.push(type) }
  if (statut) { where.push('f.statut = ?'); params.push(statut) }
  if (annee) { where.push('f.periode_annee = ?'); params.push(parseInt(annee)) }
  if (mois) { where.push('f.periode_mois = ?'); params.push(parseInt(mois)) }

  const sql = `
    SELECT f.*,
      ue.nom as emetteur_nom, ue.prenom as emetteur_prenom,
      ud.nom as dest_user_nom, ud.prenom as dest_user_prenom,
      r.nom as dest_restaurant_nom
    FROM factures f
    LEFT JOIN users ue ON f.emetteur_user_id = ue.id
    LEFT JOIN users ud ON f.dest_user_id = ud.id
    LEFT JOIN restaurants r ON f.dest_restaurant_id = r.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY f.date_emission DESC, f.id DESC
    LIMIT 500
  `
  const { results } = await c.env.DB.prepare(sql).bind(...params).all()
  return c.json({ factures: results })
})

// ============================================================
// GET /api/factures/:id — détail facture + lignes
// ============================================================
app.get('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const f = await c.env.DB.prepare(`
    SELECT f.*,
      ue.nom as emetteur_nom, ue.prenom as emetteur_prenom, ue.email as emetteur_email,
      ud.nom as dest_user_nom, ud.prenom as dest_user_prenom, ud.email as dest_user_email,
      r.nom as dest_restaurant_nom
    FROM factures f
    LEFT JOIN users ue ON f.emetteur_user_id = ue.id
    LEFT JOIN users ud ON f.dest_user_id = ud.id
    LEFT JOIN restaurants r ON f.dest_restaurant_id = r.id
    WHERE f.id = ?
  `).bind(id).first() as any
  if (!f) return c.json({ error: 'Introuvable' }, 404)

  // ACL : superadmin tout, émetteur sa facture, destinataire user sa facture
  if (user.role !== 'superadmin' && f.emetteur_user_id !== user.id && f.dest_user_id !== user.id) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  const { results: lignes } = await c.env.DB.prepare(
    'SELECT * FROM facture_lignes WHERE facture_id = ? ORDER BY ordre'
  ).bind(id).all()
  // Parse snapshots
  try { f.emetteur = JSON.parse(f.emetteur_snapshot) } catch { f.emetteur = {} }
  try { f.dest = JSON.parse(f.dest_snapshot) } catch { f.dest = {} }
  try { f.mentions = JSON.parse(f.mentions_legales || '[]') } catch { f.mentions = [] }
  return c.json({ facture: f, lignes })
})

// ============================================================
// POST /api/factures/:id/envoyer
// Émetteur soumet sa facture brouillon au destinataire
// ============================================================
app.post('/:id/envoyer', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const f = await c.env.DB.prepare('SELECT * FROM factures WHERE id = ?').bind(id).first() as any
  if (!f) return c.json({ error: 'Introuvable' }, 404)
  if (f.emetteur_user_id !== user.id && user.role !== 'superadmin') return c.json({ error: 'Accès refusé' }, 403)
  if (f.statut !== 'brouillon') return c.json({ error: 'Statut invalide : doit être brouillon' }, 400)
  await c.env.DB.prepare(`
    UPDATE factures SET statut = 'envoyee', envoyee_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// POST /api/factures/:id/valider — superadmin valide une facture
// ============================================================
app.post('/:id/valider', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const f = await c.env.DB.prepare('SELECT statut FROM factures WHERE id = ?').bind(id).first() as any
  if (!f) return c.json({ error: 'Introuvable' }, 404)
  if (!['envoyee'].includes(f.statut)) return c.json({ error: `Statut ${f.statut} non validable` }, 400)
  await c.env.DB.prepare(`
    UPDATE factures SET statut = 'validee', validee_at = CURRENT_TIMESTAMP, validee_par = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(user.id, id).run()
  return c.json({ success: true })
})

// ============================================================
// POST /api/factures/:id/refuser — superadmin refuse
// ============================================================
app.post('/:id/refuser', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const { motif } = await c.req.json()
  if (!motif) return c.json({ error: 'Motif obligatoire' }, 400)
  await c.env.DB.prepare(`
    UPDATE factures SET statut = 'refusee', motif_refus = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(motif, id).run()
  return c.json({ success: true })
})

// ============================================================
// POST /api/factures/:id/payer — marque comme payée
// ============================================================
app.post('/:id/payer', async (c) => {
  const user = c.get('user')
  if (user.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)
  const id = parseInt(c.req.param('id'))
  const { reference_paiement } = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare(`
    UPDATE factures SET statut = 'payee', payee_at = CURRENT_TIMESTAMP,
      reference_paiement = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(reference_paiement || null, id).run()
  return c.json({ success: true })
})

// ============================================================
// DELETE /api/factures/:id — supprime une facture brouillon
// ============================================================
app.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const f = await c.env.DB.prepare('SELECT statut, emetteur_user_id FROM factures WHERE id = ?').bind(id).first() as any
  if (!f) return c.json({ error: 'Introuvable' }, 404)
  if (user.role !== 'superadmin' && f.emetteur_user_id !== user.id) return c.json({ error: 'Accès refusé' }, 403)
  if (f.statut !== 'brouillon' && user.role !== 'superadmin') return c.json({ error: 'Seules les factures brouillon peuvent être supprimées' }, 400)
  await c.env.DB.prepare('DELETE FROM factures WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
