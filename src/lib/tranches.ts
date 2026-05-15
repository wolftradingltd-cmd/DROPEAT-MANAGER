// ============================================================
// MOTEUR DE TRANCHES FERMÉES (Clause 5 du contrat DropEat™)
// ============================================================
// Règles strictes :
// - Une tranche = 5 éléments qualifiants (clients OU marques)
// - Le 5e élément valide → attribution économique 100% à l'agent
// - Compteur RÉINITIALISÉ après attribution (pas de modulo)
// - Un élément déjà comptabilisé ne peut JAMAIS être recompté
// - Pas de revendication rétroactive : seuls les éléments NOUVEAUX
//   validés pendant la tranche ouverte comptent
// - Validation écrite SR SHOP requise pour clôturer
// ============================================================

const SEUIL_TRANCHE = 5

export type TrancheType = 'client' | 'marque'

export interface Tranche {
  id: number
  agent_id: number
  type: TrancheType
  numero_tranche: number
  date_ouverture: string
  date_cloture: string | null
  statut: 'ouverte' | 'cloturee'
  element_attribue_id: number | null
  validation_ecrite: number
  date_validation: string | null
  validateur_user_id: number | null
  notes: string | null
}

export interface TrancheElement {
  id: number
  tranche_id: number
  agent_id: number
  type: TrancheType
  element_id: number
  position_dans_tranche: number
  date_qualification: string
  is_attribution: number
  notes: string | null
}

/**
 * Récupère la tranche ouverte d'un agent pour un type donné.
 * Si aucune tranche ouverte, en crée une nouvelle.
 */
export async function getOrCreateTrancheOuverte(
  db: D1Database,
  agentId: number,
  type: TrancheType
): Promise<Tranche> {
  const ouverte = await db.prepare(`
    SELECT * FROM tranches_attribution
    WHERE agent_id = ? AND type = ? AND statut = 'ouverte'
    LIMIT 1
  `).bind(agentId, type).first() as Tranche | null

  if (ouverte) return ouverte

  // Compte le nombre total de tranches pour cet agent et ce type
  const cnt = await db.prepare(`
    SELECT COUNT(*) as n FROM tranches_attribution WHERE agent_id = ? AND type = ?
  `).bind(agentId, type).first() as any
  const numero = (cnt?.n || 0) + 1

  const r = await db.prepare(`
    INSERT INTO tranches_attribution (agent_id, type, numero_tranche, statut)
    VALUES (?, ?, ?, 'ouverte')
  `).bind(agentId, type, numero).run()

  return {
    id: r.meta.last_row_id as number,
    agent_id: agentId,
    type,
    numero_tranche: numero,
    date_ouverture: new Date().toISOString(),
    date_cloture: null,
    statut: 'ouverte',
    element_attribue_id: null,
    validation_ecrite: 0,
    date_validation: null,
    validateur_user_id: null,
    notes: null
  }
}

/**
 * Vérifie si un élément (resto ou marque) a DÉJÀ été comptabilisé
 * dans n'importe quelle tranche de cet agent (ouverte ou fermée).
 * INTERDICTION DE REVENDICATION RÉTROACTIVE.
 */
export async function elementDejaComptabilise(
  db: D1Database,
  agentId: number,
  type: TrancheType,
  elementId: number
): Promise<boolean> {
  const r = await db.prepare(`
    SELECT id FROM tranche_elements
    WHERE agent_id = ? AND type = ? AND element_id = ?
    LIMIT 1
  `).bind(agentId, type, elementId).first()
  return !!r
}

/**
 * Tente de qualifier un élément (resto ou marque) dans la tranche ouverte
 * de l'agent. Retourne :
 *   - { ok: true, position, attribution: false }   → 1er-4e élément
 *   - { ok: true, position: 5, attribution: true } → 5e élément, tranche clôturée
 *   - { ok: false, reason }                         → refus (déjà compté, etc.)
 */
export async function qualifierElement(
  db: D1Database,
  agentId: number,
  type: TrancheType,
  elementId: number,
  options: { validation_ecrite?: boolean, validateur_user_id?: number, notes?: string, is_challenge?: boolean } = {}
): Promise<{
  ok: boolean,
  position?: number,
  attribution?: boolean,
  tranche_id?: number,
  numero_tranche?: number,
  reason?: string
}> {
  // 1. Vérifier que l'élément n'a JAMAIS été compté pour cet agent
  if (await elementDejaComptabilise(db, agentId, type, elementId)) {
    return { ok: false, reason: 'Élément déjà comptabilisé dans une tranche antérieure (revendication rétroactive interdite)' }
  }

  // 1.bis 🛡️ CORRECTIF UNICITÉ RESTAURANT : si on qualifie une marque, le restaurant
  // sous-jacent ne doit jamais avoir servi (via une autre marque) à qualifier
  // une tranche pour ce même agent. Sinon double-comptage du même apport.
  // Exception : si l'élément qualifié est un "challenge" (is_challenge=1), on
  // n'applique pas cette règle car le challenge a sa propre logique de récompense.
  if (type === 'marque' && !options.is_challenge) {
    const dejaResto = await db.prepare(`
      SELECT te.id, ta.numero_tranche, ta.statut
      FROM tranche_elements te
      JOIN marques_virtuelles m2 ON te.element_id = m2.id
      JOIN tranches_attribution ta ON te.tranche_id = ta.id
      WHERE te.agent_id = ?
        AND te.type = 'marque'
        AND COALESCE(te.is_challenge, 0) = 0
        AND m2.restaurant_id = (SELECT restaurant_id FROM marques_virtuelles WHERE id = ?)
      LIMIT 1
    `).bind(agentId, elementId).first() as any
    if (dejaResto) {
      return {
        ok: false,
        reason: `Le restaurant de cette marque a déjà été comptabilisé dans la tranche n°${dejaResto.numero_tranche} (${dejaResto.statut}). Un même restaurant ne peut être utilisé qu'une seule fois pour qualifier une tranche (anti double-dipping).`
      }
    }
  }

  // 2. Récupérer ou créer la tranche ouverte
  const tranche = await getOrCreateTrancheOuverte(db, agentId, type)

  // 3. Compter les éléments déjà dans cette tranche
  //    (les éléments "challenge" ne comptent PAS dans le palier 5/5 standard)
  const cntRow = await db.prepare(`
    SELECT COUNT(*) as n FROM tranche_elements WHERE tranche_id = ? AND COALESCE(is_challenge, 0) = 0
  `).bind(tranche.id).first() as any
  const position = (cntRow?.n || 0) + 1

  if (position > SEUIL_TRANCHE && !options.is_challenge) {
    // Ne devrait jamais arriver (la tranche aurait dû être clôturée au 5e)
    return { ok: false, reason: 'Tranche déjà saturée' }
  }

  const isAttribution = position === SEUIL_TRANCHE && !options.is_challenge

  // 4. Insérer l'élément qualifié
  await db.prepare(`
    INSERT INTO tranche_elements
      (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, is_challenge, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tranche.id, agentId, type, elementId, position, isAttribution ? 1 : 0, options.is_challenge ? 1 : 0, options.notes || null).run()

  // 5. Si c'est le 5e → clôturer la tranche et marquer l'élément comme portefeuille
  if (isAttribution) {
    await db.prepare(`
      UPDATE tranches_attribution
      SET statut = 'cloturee',
          date_cloture = CURRENT_TIMESTAMP,
          element_attribue_id = ?,
          validation_ecrite = ?,
          date_validation = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          validateur_user_id = ?
      WHERE id = ?
    `).bind(
      elementId,
      options.validation_ecrite ? 1 : 0,
      options.validation_ecrite ? 1 : 0,
      options.validateur_user_id || null,
      tranche.id
    ).run()

    // Marquer l'élément comme portefeuille propriétaire
    if (type === 'client') {
      await db.prepare(`UPDATE restaurants SET is_portefeuille_proprietaire = 1 WHERE id = ?`)
        .bind(elementId).run()
    } else {
      await db.prepare(`UPDATE marques_virtuelles SET is_portefeuille_proprietaire = 1 WHERE id = ?`)
        .bind(elementId).run()
    }
  }

  return {
    ok: true,
    position,
    attribution: isAttribution,
    tranche_id: tranche.id,
    numero_tranche: tranche.numero_tranche
  }
}

/**
 * Retire un élément d'une tranche (suppression du resto/marque).
 * Si la tranche était clôturée par cet élément → réouverture.
 */
export async function dequalifierElement(
  db: D1Database,
  agentId: number,
  type: TrancheType,
  elementId: number
): Promise<void> {
  const elem = await db.prepare(`
    SELECT * FROM tranche_elements
    WHERE agent_id = ? AND type = ? AND element_id = ?
  `).bind(agentId, type, elementId).first() as TrancheElement | null

  if (!elem) return

  await db.prepare(`DELETE FROM tranche_elements WHERE id = ?`).bind(elem.id).run()

  // Si c'était le 5e (attribution) → réouvrir la tranche
  if (elem.is_attribution) {
    await db.prepare(`
      UPDATE tranches_attribution
      SET statut = 'ouverte', date_cloture = NULL, element_attribue_id = NULL,
          validation_ecrite = 0, date_validation = NULL, validateur_user_id = NULL
      WHERE id = ?
    `).bind(elem.tranche_id).run()
  }
}

/**
 * État des tranches d'un agent : tranche ouverte courante + historique.
 */
export async function getEtatTranches(db: D1Database, agentId: number, type: TrancheType) {
  const ouverte = await db.prepare(`
    SELECT * FROM tranches_attribution
    WHERE agent_id = ? AND type = ? AND statut = 'ouverte'
    LIMIT 1
  `).bind(agentId, type).first() as Tranche | null

  let elementsOuverte: any[] = []
  if (ouverte) {
    const { results } = await db.prepare(`
      SELECT te.*,
        CASE
          WHEN te.type = 'client' THEN (SELECT nom FROM restaurants WHERE id = te.element_id)
          WHEN te.type = 'marque' THEN (SELECT nom FROM marques_virtuelles WHERE id = te.element_id)
        END as element_nom
      FROM tranche_elements te
      WHERE te.tranche_id = ?
      ORDER BY te.position_dans_tranche
    `).bind(ouverte.id).all() as any
    elementsOuverte = results
  }

  const { results: cloturees } = await db.prepare(`
    SELECT t.*,
      CASE
        WHEN t.type = 'client' THEN (SELECT nom FROM restaurants WHERE id = t.element_attribue_id)
        WHEN t.type = 'marque' THEN (SELECT nom FROM marques_virtuelles WHERE id = t.element_attribue_id)
      END as element_attribue_nom
    FROM tranches_attribution t
    WHERE t.agent_id = ? AND t.type = ? AND t.statut = 'cloturee'
    ORDER BY t.numero_tranche DESC
  `).bind(agentId, type).all() as any

  return {
    seuil: SEUIL_TRANCHE,
    tranche_ouverte: ouverte ? {
      ...ouverte,
      elements: elementsOuverte,
      compteur: elementsOuverte.length,
      restant: SEUIL_TRANCHE - elementsOuverte.length
    } : null,
    tranches_cloturees: cloturees,
    nb_attributions_total: cloturees.length
  }
}

export { SEUIL_TRANCHE }
