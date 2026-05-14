// ============================================================
// Module CHALLENGES — logique métier
// ============================================================
// - Création/édition d'un challenge
// - Calcul automatique de la progression d'un participant
// - Détection auto des challenges actifs pour un agent
// - Suspension de la règle tranche standard pendant un challenge
// - Attribution des récompenses (ex: 15 restos en portefeuille 100%)
// ============================================================

export interface Challenge {
  id: number
  code: string
  nom: string
  description: string | null
  date_debut: string
  date_fin: string
  type_objectif: 'restaurants' | 'marques' | 'restaurants_ou_marques'
  objectif_quantite: number
  type_recompense: 'portefeuille_restaurants' | 'portefeuille_marques' | 'bonus_montant' | 'autre'
  recompense_quantite: number | null
  recompense_montant: number | null
  recompense_description: string | null
  suspend_tranche_standard: number
  cible: 'tous' | 'selection'
  actif: number
  notes_internes: string | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface Participation {
  id: number
  challenge_id: number
  agent_id: number
  statut: 'en_cours' | 'reussi' | 'echoue' | 'recompense_attribuee' | 'annule'
  progression_actuelle: number
  date_reussite: string | null
  recompense_attribuee_at: string | null
  recompense_attribuee_par: number | null
  recompense_notes: string | null
  date_participation: string
  notes_agent: string | null
  notes_admin: string | null
}

/**
 * Récupère la progression réelle d'un agent sur un challenge
 * en comptant les restos/marques apportés sur la période.
 *
 * - Pour 'restaurants' : compte les restaurants dont la date_signature
 *   tombe entre date_debut et date_fin et qui appartiennent à l'agent.
 * - Pour 'marques' : compte les marques (created_at dans la période).
 * - Pour 'restaurants_ou_marques' : somme des deux.
 */
export async function calculerProgression(
  db: D1Database,
  challenge: Challenge,
  agentId: number
): Promise<{ progression: number; restos: any[]; marques: any[] }> {
  let restos: any[] = []
  let marques: any[] = []

  if (challenge.type_objectif === 'restaurants' || challenge.type_objectif === 'restaurants_ou_marques') {
    const { results } = await db.prepare(`
      SELECT id, nom, ville, date_signature, rang_apport, is_portefeuille_proprietaire
      FROM restaurants
      WHERE agent_id = ?
        AND date_signature IS NOT NULL
        AND date_signature >= ?
        AND date_signature <= ?
      ORDER BY date_signature ASC
    `).bind(agentId, challenge.date_debut, challenge.date_fin).all() as any
    restos = results || []
  }

  if (challenge.type_objectif === 'marques' || challenge.type_objectif === 'restaurants_ou_marques') {
    const { results } = await db.prepare(`
      SELECT m.id, m.nom, m.restaurant_id, m.created_at, m.is_portefeuille_proprietaire,
             r.nom as restaurant_nom
      FROM marques_virtuelles m
      JOIN restaurants r ON m.restaurant_id = r.id
      WHERE r.agent_id = ?
        AND date(m.created_at) >= ?
        AND date(m.created_at) <= ?
      ORDER BY m.created_at ASC
    `).bind(agentId, challenge.date_debut, challenge.date_fin).all() as any
    marques = results || []
  }

  const progression = restos.length + marques.length
  return { progression, restos, marques }
}

/**
 * Synchronise les éléments comptabilisés (challenge_elements)
 * et met à jour la progression de la participation.
 *
 * À appeler après chaque création de resto/marque, ou à la demande.
 */
export async function synchroniserParticipation(
  db: D1Database,
  challengeId: number,
  agentId: number
): Promise<{ progression: number; objectif_atteint: boolean }> {
  const challenge = await db.prepare('SELECT * FROM challenges WHERE id = ?').bind(challengeId).first() as Challenge | null
  if (!challenge) throw new Error('Challenge introuvable')

  const part = await db.prepare(
    'SELECT * FROM challenge_participations WHERE challenge_id = ? AND agent_id = ?'
  ).bind(challengeId, agentId).first() as Participation | null

  if (!part) throw new Error('Participation introuvable')

  const { progression, restos, marques } = await calculerProgression(db, challenge, agentId)

  // Snapshot des éléments comptabilisés (idempotent via UNIQUE constraint)
  for (const r of restos) {
    await db.prepare(`
      INSERT OR IGNORE INTO challenge_elements
        (participation_id, challenge_id, agent_id, type_element, element_id, date_apport)
      VALUES (?, ?, ?, 'restaurant', ?, ?)
    `).bind(part.id, challengeId, agentId, r.id, r.date_signature).run()
  }
  for (const m of marques) {
    await db.prepare(`
      INSERT OR IGNORE INTO challenge_elements
        (participation_id, challenge_id, agent_id, type_element, element_id, date_apport)
      VALUES (?, ?, ?, 'marque', ?, ?)
    `).bind(part.id, challengeId, agentId, m.id, m.created_at).run()
  }

  const objectif_atteint = progression >= challenge.objectif_quantite
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // Mise à jour de la participation
  if (objectif_atteint && part.statut === 'en_cours') {
    await db.prepare(`
      UPDATE challenge_participations
      SET progression_actuelle = ?, statut = 'reussi', date_reussite = ?
      WHERE id = ?
    `).bind(progression, now, part.id).run()
  } else {
    await db.prepare(`
      UPDATE challenge_participations
      SET progression_actuelle = ?
      WHERE id = ?
    `).bind(progression, part.id).run()
  }

  return { progression, objectif_atteint }
}

/**
 * Synchronise TOUTES les participations actives de tous les challenges actifs.
 * À appeler ponctuellement (cron-like) ou après import CSV.
 */
export async function synchroniserToutesParticipations(db: D1Database): Promise<number> {
  const { results } = await db.prepare(`
    SELECT cp.id, cp.challenge_id, cp.agent_id
    FROM challenge_participations cp
    JOIN challenges c ON cp.challenge_id = c.id
    WHERE c.actif = 1 AND cp.statut IN ('en_cours', 'reussi')
  `).all() as any
  let n = 0
  for (const p of results || []) {
    try {
      await synchroniserParticipation(db, p.challenge_id, p.agent_id)
      n++
    } catch (e) { /* ignore */ }
  }
  return n
}

/**
 * Récupère les challenges actuellement actifs (période ouverte + actif=1)
 * où l'agent participe (ou peut participer si cible='tous').
 */
export async function getChallengesActifsPourAgent(
  db: D1Database,
  agentId: number
): Promise<Array<Challenge & { participation: Participation | null }>> {
  const today = new Date().toISOString().slice(0, 10)
  const { results } = await db.prepare(`
    SELECT c.*, cp.id as part_id, cp.statut as part_statut,
           cp.progression_actuelle, cp.date_reussite,
           cp.recompense_attribuee_at, cp.recompense_attribuee_par, cp.recompense_notes,
           cp.date_participation, cp.notes_agent, cp.notes_admin
    FROM challenges c
    LEFT JOIN challenge_participations cp ON cp.challenge_id = c.id AND cp.agent_id = ?
    WHERE c.actif = 1
      AND c.date_fin >= ?
      AND (c.cible = 'tous' OR cp.id IS NOT NULL)
    ORDER BY c.date_fin ASC
  `).bind(agentId, today).all() as any

  return (results || []).map((r: any) => ({
    id: r.id, code: r.code, nom: r.nom, description: r.description,
    date_debut: r.date_debut, date_fin: r.date_fin,
    type_objectif: r.type_objectif, objectif_quantite: r.objectif_quantite,
    type_recompense: r.type_recompense, recompense_quantite: r.recompense_quantite,
    recompense_montant: r.recompense_montant, recompense_description: r.recompense_description,
    suspend_tranche_standard: r.suspend_tranche_standard, cible: r.cible,
    actif: r.actif, notes_internes: r.notes_internes,
    created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at,
    participation: r.part_id ? {
      id: r.part_id, challenge_id: r.id, agent_id: agentId,
      statut: r.part_statut, progression_actuelle: r.progression_actuelle,
      date_reussite: r.date_reussite,
      recompense_attribuee_at: r.recompense_attribuee_at,
      recompense_attribuee_par: r.recompense_attribuee_par,
      recompense_notes: r.recompense_notes,
      date_participation: r.date_participation,
      notes_agent: r.notes_agent, notes_admin: r.notes_admin
    } : null
  }))
}

/**
 * Détecte si un agent est CURRENT actif dans un challenge qui suspend
 * la règle tranche standard. Utilisé par le calcul de portefeuille
 * pour décider si un resto/marque doit déclencher la règle 5/5.
 */
export async function agentEnChallengeSuspendTranche(
  db: D1Database,
  agentId: number,
  dateRef?: string
): Promise<{ suspendu: boolean; challenge_id?: number }> {
  const d = dateRef || new Date().toISOString().slice(0, 10)
  const r = await db.prepare(`
    SELECT c.id as challenge_id
    FROM challenges c
    JOIN challenge_participations cp ON cp.challenge_id = c.id
    WHERE c.actif = 1
      AND c.suspend_tranche_standard = 1
      AND cp.agent_id = ?
      AND cp.statut IN ('en_cours', 'reussi', 'recompense_attribuee')
      AND c.date_debut <= ?
      AND c.date_fin >= ?
    LIMIT 1
  `).bind(agentId, d, d).first() as any
  if (r) return { suspendu: true, challenge_id: r.challenge_id }
  return { suspendu: false }
}

/**
 * Inscrit un agent à un challenge (idempotent).
 * Si cible='tous', n'importe quel agent peut s'inscrire lui-même.
 * Sinon, seul le superadmin peut inscrire un agent.
 */
export async function inscrireAgent(
  db: D1Database,
  challengeId: number,
  agentId: number,
  byUserId: number
): Promise<{ participation_id: number; nouveau: boolean }> {
  const existing = await db.prepare(
    'SELECT id FROM challenge_participations WHERE challenge_id = ? AND agent_id = ?'
  ).bind(challengeId, agentId).first() as any
  if (existing) return { participation_id: existing.id, nouveau: false }

  const r = await db.prepare(`
    INSERT INTO challenge_participations (challenge_id, agent_id, statut, progression_actuelle)
    VALUES (?, ?, 'en_cours', 0)
  `).bind(challengeId, agentId).run()

  const partId = r.meta.last_row_id as number
  // Synchroniser tout de suite (rétroactif)
  try { await synchroniserParticipation(db, challengeId, agentId) } catch {}
  return { participation_id: partId, nouveau: true }
}

/**
 * Attribue la récompense pour une participation réussie.
 * Pour type_recompense = 'portefeuille_restaurants' : marque N restaurants
 * (choisis par l'agent ou par défaut les premiers du challenge) comme
 * is_portefeuille_proprietaire = 1 avec date_signature_portefeuille = today.
 */
export async function attribuerRecompense(
  db: D1Database,
  participationId: number,
  byUserId: number,
  options: {
    restos_ids_choisis?: number[]    // pour portefeuille_restaurants
    marques_ids_choisies?: number[]   // pour portefeuille_marques
    notes?: string
  } = {}
): Promise<{ success: boolean; nb_attribue: number }> {
  const part = await db.prepare(`
    SELECT cp.*, c.type_recompense, c.recompense_quantite, c.recompense_montant
    FROM challenge_participations cp
    JOIN challenges c ON cp.challenge_id = c.id
    WHERE cp.id = ?
  `).bind(participationId).first() as any
  if (!part) throw new Error('Participation introuvable')
  if (part.statut !== 'reussi') throw new Error('Participation pas encore en statut "reussi"')

  const today = new Date().toISOString().slice(0, 10)
  let nbAttribue = 0

  if (part.type_recompense === 'portefeuille_restaurants') {
    let ids = options.restos_ids_choisis || []
    if (!ids.length) {
      // Défaut : prendre les N premiers éléments comptabilisés du challenge
      const { results } = await db.prepare(`
        SELECT element_id FROM challenge_elements
        WHERE participation_id = ? AND type_element = 'restaurant'
        ORDER BY date_apport ASC LIMIT ?
      `).bind(participationId, part.recompense_quantite).all() as any
      ids = (results || []).map((r: any) => r.element_id)
    }
    for (const restoId of ids.slice(0, part.recompense_quantite || 9999)) {
      await db.prepare(`
        UPDATE restaurants
        SET is_portefeuille_proprietaire = 1,
            date_signature_portefeuille = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND agent_id = ?
      `).bind(today, restoId, part.agent_id).run()
      await db.prepare(`
        UPDATE challenge_elements SET choisi_pour_recompense = 1
        WHERE participation_id = ? AND type_element = 'restaurant' AND element_id = ?
      `).bind(participationId, restoId).run()
      nbAttribue++
    }
  } else if (part.type_recompense === 'portefeuille_marques') {
    let ids = options.marques_ids_choisies || []
    if (!ids.length) {
      const { results } = await db.prepare(`
        SELECT element_id FROM challenge_elements
        WHERE participation_id = ? AND type_element = 'marque'
        ORDER BY date_apport ASC LIMIT ?
      `).bind(participationId, part.recompense_quantite).all() as any
      ids = (results || []).map((r: any) => r.element_id)
    }
    for (const marqueId of ids.slice(0, part.recompense_quantite || 9999)) {
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 1,
            date_signature_portefeuille = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(today, marqueId).run()
      await db.prepare(`
        UPDATE challenge_elements SET choisi_pour_recompense = 1
        WHERE participation_id = ? AND type_element = 'marque' AND element_id = ?
      `).bind(participationId, marqueId).run()
      nbAttribue++
    }
  } else if (part.type_recompense === 'bonus_montant') {
    // Bonus financier : laissé en note, sera converti en commission/paiement à la main
    nbAttribue = 1
  }

  await db.prepare(`
    UPDATE challenge_participations
    SET statut = 'recompense_attribuee',
        recompense_attribuee_at = CURRENT_TIMESTAMP,
        recompense_attribuee_par = ?,
        recompense_notes = ?
    WHERE id = ?
  `).bind(byUserId, options.notes || null, participationId).run()

  return { success: true, nb_attribue: nbAttribue }
}
