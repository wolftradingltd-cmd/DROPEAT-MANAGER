// ============================================================
// MOTEUR DEMANDES DE PAIEMENT — Cumul disponible & validation
// ============================================================
// Règles métier :
//   - Cumul disponible = SUM(commissions calculées) - SUM(déjà demandées/payées)
//   - Seuil minimum (config "seuil_min_demande_paiement", défaut 20€)
//   - Tous niveaux (N0/N+1/N+2) peuvent demander dès que seuil atteint
//   - Une demande "consomme" les commissions disponibles (statut → 'demandee')
//   - À la validation : statut → 'payee', création d'un paiement lié
//   - Au rejet : statut → 'disponible' (réutilisable pour future demande)
// ============================================================

export interface CumulDisponible {
  total_disponible: number
  total_propre: number
  total_portefeuille: number
  total_n1: number
  total_n2: number
  nb_periodes: number
  seuil_min: number
  eligible: boolean              // total_disponible >= seuil_min
  commissions: Array<{
    id: number
    periode_annee: number
    periode_mois: number
    commission_propre: number
    commission_portefeuille: number
    commission_n1: number
    commission_n2: number
    total: number
  }>
}

/**
 * Récupère le seuil minimum de demande depuis la config (défaut 20).
 */
export async function getSeuilMinimum(db: D1Database): Promise<number> {
  const r = await db.prepare(
    "SELECT valeur FROM config WHERE cle = 'seuil_min_demande_paiement'"
  ).first() as any
  return r ? parseFloat(r.valeur) : 20
}

/**
 * Calcule le cumul disponible (commissions non encore demandées) d'un agent.
 * Une commission est "disponible" si statut_paiement = 'disponible' (ou NULL).
 */
export async function getCumulDisponible(
  db: D1Database,
  agentId: number
): Promise<CumulDisponible> {
  const seuilMin = await getSeuilMinimum(db)

  const { results } = await db.prepare(`
    SELECT id, periode_annee, periode_mois,
           commission_propre, commission_portefeuille,
           commission_n1, commission_n2, total
    FROM commissions_calculees
    WHERE agent_id = ?
      AND (statut_paiement IS NULL OR statut_paiement = 'disponible')
      AND total > 0
    ORDER BY periode_annee, periode_mois
  `).bind(agentId).all() as any

  let totalPropre = 0, totalPortefeuille = 0, totalN1 = 0, totalN2 = 0
  for (const c of results as any[]) {
    totalPropre += c.commission_propre || 0
    totalPortefeuille += c.commission_portefeuille || 0
    totalN1 += c.commission_n1 || 0
    totalN2 += c.commission_n2 || 0
  }
  const totalDispo = totalPropre + totalPortefeuille + totalN1 + totalN2

  return {
    total_disponible: Math.round(totalDispo * 100) / 100,
    total_propre: Math.round(totalPropre * 100) / 100,
    total_portefeuille: Math.round(totalPortefeuille * 100) / 100,
    total_n1: Math.round(totalN1 * 100) / 100,
    total_n2: Math.round(totalN2 * 100) / 100,
    nb_periodes: results.length,
    seuil_min: seuilMin,
    eligible: totalDispo >= seuilMin,
    commissions: results as any[]
  }
}

/**
 * Crée une demande de paiement pour un agent.
 * Capture un snapshot des commissions disponibles et les marque 'demandee'.
 */
export async function createDemandePaiement(
  db: D1Database,
  agentId: number,
  notesAgent?: string
): Promise<{ demande_id: number; montant: number }> {
  const cumul = await getCumulDisponible(db, agentId)
  if (!cumul.eligible) {
    throw new Error(`Seuil non atteint (cumul ${cumul.total_disponible} € < ${cumul.seuil_min} €)`)
  }
  if (cumul.commissions.length === 0) {
    throw new Error('Aucune commission disponible')
  }

  // Snapshot détaillé
  const detail = cumul.commissions.map(c => ({
    commission_id: c.id,
    annee: c.periode_annee,
    mois: c.periode_mois,
    propre: c.commission_propre,
    portefeuille: c.commission_portefeuille,
    n1: c.commission_n1,
    n2: c.commission_n2,
    total: c.total
  }))

  // Création de la demande
  const r = await db.prepare(`
    INSERT INTO demandes_paiement (
      agent_id, montant_demande,
      montant_propre, montant_portefeuille, montant_n1, montant_n2,
      detail_json, statut, notes_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)
  `).bind(
    agentId,
    cumul.total_disponible,
    cumul.total_propre, cumul.total_portefeuille,
    cumul.total_n1, cumul.total_n2,
    JSON.stringify(detail),
    notesAgent || null
  ).run()
  const demandeId = r.meta.last_row_id as number

  // Lier les commissions à la demande + marquer 'demandee'
  for (const c of cumul.commissions) {
    await db.prepare(`
      INSERT INTO demande_paiement_commissions (demande_id, commission_id, montant_inclus)
      VALUES (?, ?, ?)
    `).bind(demandeId, c.id, c.total).run()
    await db.prepare(`
      UPDATE commissions_calculees
      SET statut_paiement = 'demandee', demande_paiement_id = ?
      WHERE id = ?
    `).bind(demandeId, c.id).run()
  }

  return { demande_id: demandeId, montant: cumul.total_disponible }
}

/**
 * Valide + paye une demande de paiement (par superadmin).
 * Crée un enregistrement dans la table paiements + marque les commissions 'payee'.
 */
export async function validerDemandePaiement(
  db: D1Database,
  demandeId: number,
  superadminId: number,
  opts: {
    methode?: string
    reference?: string
    notes?: string
    date_paiement?: string
  } = {}
): Promise<{ paiement_id: number }> {
  const demande = await db.prepare(
    'SELECT * FROM demandes_paiement WHERE id = ?'
  ).bind(demandeId).first() as any
  if (!demande) throw new Error('Demande introuvable')
  if (demande.statut !== 'en_attente') {
    throw new Error(`Demande déjà traitée (statut: ${demande.statut})`)
  }

  // Récupérer la dernière période de la demande pour stocker dans paiements
  const detail = JSON.parse(demande.detail_json || '[]')
  let maxAnnee = new Date().getFullYear(), maxMois = new Date().getMonth() + 1
  if (detail.length > 0) {
    const last = detail.reduce((m: any, d: any) =>
      (d.annee > m.annee || (d.annee === m.annee && d.mois > m.mois)) ? d : m
    , detail[0])
    maxAnnee = last.annee
    maxMois = last.mois
  }

  const datePaie = opts.date_paiement || new Date().toISOString().split('T')[0]

  // Créer le paiement
  const p = await db.prepare(`
    INSERT INTO paiements
      (agent_id, periode_mois, periode_annee, montant, statut, date_paiement,
       methode, reference, notes)
    VALUES (?, ?, ?, ?, 'paye', ?, ?, ?, ?)
  `).bind(
    demande.agent_id, maxMois, maxAnnee,
    demande.montant_demande, datePaie,
    opts.methode || 'virement',
    opts.reference || null,
    opts.notes || `Demande #${demandeId}`
  ).run()
  const paiementId = p.meta.last_row_id as number

  // Mettre à jour la demande
  await db.prepare(`
    UPDATE demandes_paiement
    SET statut = 'payee',
        date_traitement = CURRENT_TIMESTAMP,
        date_paiement = ?,
        superadmin_id = ?,
        paiement_id = ?,
        methode_paiement = ?,
        reference_paiement = ?,
        notes_admin = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    datePaie, superadminId, paiementId,
    opts.methode || 'virement', opts.reference || null,
    opts.notes || null, demandeId
  ).run()

  // Marquer les commissions liées comme 'payee'
  await db.prepare(`
    UPDATE commissions_calculees
    SET statut_paiement = 'payee'
    WHERE demande_paiement_id = ?
  `).bind(demandeId).run()

  return { paiement_id: paiementId }
}

/**
 * Rejette une demande de paiement et libère les commissions.
 */
export async function rejeterDemandePaiement(
  db: D1Database,
  demandeId: number,
  superadminId: number,
  motif: string
): Promise<void> {
  const demande = await db.prepare(
    'SELECT statut FROM demandes_paiement WHERE id = ?'
  ).bind(demandeId).first() as any
  if (!demande) throw new Error('Demande introuvable')
  if (demande.statut !== 'en_attente') {
    throw new Error(`Demande déjà traitée (statut: ${demande.statut})`)
  }

  await db.prepare(`
    UPDATE demandes_paiement
    SET statut = 'rejetee',
        motif_rejet = ?,
        date_traitement = CURRENT_TIMESTAMP,
        superadmin_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(motif, superadminId, demandeId).run()

  // Libérer les commissions (statut → 'disponible')
  await db.prepare(`
    UPDATE commissions_calculees
    SET statut_paiement = 'disponible', demande_paiement_id = NULL
    WHERE demande_paiement_id = ?
  `).bind(demandeId).run()
}

/**
 * Annulation par l'agent lui-même (uniquement si statut 'en_attente').
 */
export async function annulerDemandeParAgent(
  db: D1Database,
  demandeId: number,
  agentId: number
): Promise<void> {
  const demande = await db.prepare(
    'SELECT statut, agent_id FROM demandes_paiement WHERE id = ?'
  ).bind(demandeId).first() as any
  if (!demande) throw new Error('Demande introuvable')
  if (demande.agent_id !== agentId) throw new Error('Accès refusé')
  if (demande.statut !== 'en_attente') {
    throw new Error('Seules les demandes en attente peuvent être annulées')
  }

  await db.prepare(`
    UPDATE demandes_paiement
    SET statut = 'annulee', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(demandeId).run()

  // Libérer les commissions
  await db.prepare(`
    UPDATE commissions_calculees
    SET statut_paiement = 'disponible', demande_paiement_id = NULL
    WHERE demande_paiement_id = ?
  `).bind(demandeId).run()
}
