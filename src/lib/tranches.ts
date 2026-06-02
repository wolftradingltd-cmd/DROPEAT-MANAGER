// ============================================================
// MOTEUR DE TRANCHES UNIFIÉES (DropEat™ — refonte 0020)
// ============================================================
//
// LOGIQUE MÉTIER VALIDÉE :
//
// 1) UN SEUL COMPTEUR PAR AGENT, type='unifiee'
//    - Une tranche compte 5 éléments qualifiants : restos ET marques mélangés
//    - L'ordre est CHRONOLOGIQUE (date de validation / signature de l'élément)
//    - Le 5ᵉ élément déclenche l'attribution 100% portefeuille à l'agent
//
// 2) PROPAGATION RESTO → MARQUES
//    - Quand un restaurant atteint position 5 et devient 100% portefeuille agent :
//      * Toutes les marques EXISTANTES de ce resto qui étaient déjà dans une tranche
//        passée ne sont PAS modifiées (elles ont déjà été comptées).
//      * Toutes les marques CRÉÉES PLUS TARD sur ce resto sont automatiquement :
//          - is_portefeuille_proprietaire = 1
//          - heritee_portefeuille = 1 (héritage du resto)
//          - exclue_mlm = 1 (pas de commission N+1/N+2)
//          - PAS d'entrée dans tranche_elements (elles ne comptent pas dans le palier)
//
// 3) CHRONOLOGIE STRICTE
//    - La date qui détermine dans quelle tranche un élément entre =
//      sa date de validation (restos.date_signature, marques.date_lancement).
//    - Si à la création d'une marque le resto parent n'est PAS portefeuille,
//      la marque entre dans la tranche ouverte AU JOUR de sa création.
//    - Si le resto parent est portefeuille au moment de la création → héritage.
//
// 4) ANTI DOUBLE-DIPPING
//    - Un même resto ne peut pas être compté deux fois (ni via lui-même ni via
//      une de ses marques) dans des tranches différentes.
//    - Quand un resto est qualifié, ses marques apportées AVANT lui (qui étaient
//      des "porteurs de tranche") restent valables, mais ses marques futures
//      ne comptent pas (héritage).
//
// 5) BACKWARD COMPATIBILITY
//    - Les anciennes signatures qualifierElement(type='client'|'marque') restent
//      valides. Elles délèguent toutes à qualifierApport (compteur unifié).
//    - Les anciennes tranches type='client' / 'marque' restent visibles en lecture
//      (jusqu'au recalcul global via /admin/tranches/recalculer).
// ============================================================

const SEUIL_TRANCHE = 5

export type TrancheType = 'client' | 'marque' | 'unifiee'
export type ApportKind = 'client' | 'marque'

export interface Tranche {
  id: number
  agent_id: number
  type: TrancheType
  numero_tranche: number
  date_ouverture: string
  date_cloture: string | null
  statut: 'ouverte' | 'cloturee'
  element_attribue_id: number | null
  element_attribue_kind?: ApportKind | null
  validation_ecrite: number
  date_validation: string | null
  validateur_user_id: number | null
  notes: string | null
}

export interface TrancheElement {
  id: number
  tranche_id: number
  agent_id: number
  type: ApportKind
  element_id: number
  position_dans_tranche: number
  date_qualification: string
  is_attribution: number
  notes: string | null
  is_challenge?: number
  hooked_resto_id?: number | null
}

// ============================================================
// FONCTIONS BAS-NIVEAU
// ============================================================

/**
 * Récupère la tranche UNIFIÉE ouverte d'un agent, la crée si besoin.
 * IMPORTANT : à partir de la migration 0020, on n'ouvre QUE des tranches 'unifiee'.
 * Les anciennes tranches 'client'/'marque' restent en lecture pour l'historique.
 */
export async function getOrCreateTrancheOuverteUnifiee(
  db: D1Database,
  agentId: number
): Promise<Tranche> {
  const ouverte = await db.prepare(`
    SELECT * FROM tranches_attribution
    WHERE agent_id = ? AND type = 'unifiee' AND statut = 'ouverte'
    LIMIT 1
  `).bind(agentId).first() as Tranche | null
  if (ouverte) return ouverte

  // Numéro = max(numero_tranche) + 1 sur l'ensemble des tranches de l'agent
  const cnt = await db.prepare(`
    SELECT COALESCE(MAX(numero_tranche), 0) as n FROM tranches_attribution WHERE agent_id = ? AND type = 'unifiee'
  `).bind(agentId).first() as any
  const numero = (cnt?.n || 0) + 1

  const r = await db.prepare(`
    INSERT INTO tranches_attribution (agent_id, type, numero_tranche, statut)
    VALUES (?, 'unifiee', ?, 'ouverte')
  `).bind(agentId, numero).run()

  return {
    id: r.meta.last_row_id as number,
    agent_id: agentId,
    type: 'unifiee',
    numero_tranche: numero,
    date_ouverture: new Date().toISOString(),
    date_cloture: null,
    statut: 'ouverte',
    element_attribue_id: null,
    element_attribue_kind: null,
    validation_ecrite: 0,
    date_validation: null,
    validateur_user_id: null,
    notes: null
  }
}

/**
 * Compte les éléments non-challenge d'une tranche.
 */
async function countTrancheElements(db: D1Database, trancheId: number): Promise<number> {
  const r = await db.prepare(`
    SELECT COUNT(*) as n FROM tranche_elements WHERE tranche_id = ? AND COALESCE(is_challenge,0)=0
  `).bind(trancheId).first() as any
  return r?.n || 0
}

/**
 * Vérifie si un élément a déjà été comptabilisé (toute tranche).
 */
export async function elementDejaComptabilise(
  db: D1Database,
  agentId: number,
  kind: ApportKind,
  elementId: number
): Promise<boolean> {
  const r = await db.prepare(`
    SELECT id FROM tranche_elements
    WHERE agent_id = ? AND type = ? AND element_id = ?
    LIMIT 1
  `).bind(agentId, kind, elementId).first()
  return !!r
}

/**
 * Vérifie si le restaurant sous-jacent (en cas de marque) a déjà été utilisé
 * comme apport dans une autre tranche pour cet agent.
 * @returns la tranche concernée si conflit, null sinon
 */
async function restoDejaApporte(
  db: D1Database,
  agentId: number,
  restoId: number,
  trancheCouranteId?: number
): Promise<{ tranche_id: number; numero_tranche: number; statut: string } | null> {
  // (a) le resto lui-même a été qualifié dans une tranche
  const trDirect = await db.prepare(`
    SELECT te.tranche_id, ta.numero_tranche, ta.statut
    FROM tranche_elements te
    JOIN tranches_attribution ta ON te.tranche_id = ta.id
    WHERE te.agent_id = ? AND te.type = 'client' AND te.element_id = ?
      AND (? IS NULL OR te.tranche_id != ?)
    LIMIT 1
  `).bind(agentId, restoId, trancheCouranteId || null, trancheCouranteId || null).first() as any
  if (trDirect) return trDirect

  // (b) une marque de ce resto a déjà été qualifiée dans une autre tranche
  const trViaMarque = await db.prepare(`
    SELECT te.tranche_id, ta.numero_tranche, ta.statut
    FROM tranche_elements te
    JOIN marques_virtuelles m ON te.element_id = m.id
    JOIN tranches_attribution ta ON te.tranche_id = ta.id
    WHERE te.agent_id = ? AND te.type = 'marque' AND m.restaurant_id = ?
      AND COALESCE(te.is_challenge,0) = 0
      AND (? IS NULL OR te.tranche_id != ?)
    LIMIT 1
  `).bind(agentId, restoId, trancheCouranteId || null, trancheCouranteId || null).first() as any
  return trViaMarque || null
}

// ============================================================
// PROPAGATION RESTO → MARQUES
// ============================================================

/**
 * Quand un resto bascule en 100% portefeuille :
 *   - Les marques NON encore qualifiées dans une tranche héritent du statut.
 *   - Les marques DÉJÀ dans une tranche (passée ou présente) ne sont PAS touchées :
 *     leur apport est consommé, elles restent telles quelles.
 */
export async function propagerHeritageResto(
  db: D1Database,
  restoId: number,
  trancheSourceId: number
): Promise<{ marques_heritees: number[] }> {
  // Marques de ce resto qui ne sont PAS comptabilisées dans une tranche
  const { results } = await db.prepare(`
    SELECT m.id
    FROM marques_virtuelles m
    WHERE m.restaurant_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM tranche_elements te
        WHERE te.element_id = m.id AND te.type = 'marque'
      )
  `).bind(restoId).all() as any

  const ids: number[] = (results || []).map((r: any) => r.id)
  if (ids.length === 0) return { marques_heritees: [] }

  const placeholders = ids.map(() => '?').join(',')
  await db.prepare(`
    UPDATE marques_virtuelles
    SET is_portefeuille_proprietaire = 1,
        heritee_portefeuille = 1,
        exclue_mlm = 1,
        tranche_source_id = ?,
        date_heritage = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders})
  `).bind(trancheSourceId, ...ids).run()

  return { marques_heritees: ids }
}

/**
 * Quand on tente de qualifier une marque, on vérifie d'abord si son resto parent
 * est déjà 100% portefeuille de l'agent → héritage automatique, pas d'entrée tranche.
 */
async function shouldInheritFromResto(
  db: D1Database,
  agentId: number,
  marqueId: number
): Promise<{ inherit: boolean; resto_id?: number; tranche_source_id?: number }> {
  const r = await db.prepare(`
    SELECT r.id as resto_id, r.is_portefeuille_proprietaire as resto_pf, r.agent_id as resto_agent
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(marqueId).first() as any
  if (!r) return { inherit: false }

  if (r.resto_pf === 1 && r.resto_agent === agentId) {
    // Tranche source = celle qui a clôturé sur ce resto
    const tr = await db.prepare(`
      SELECT id FROM tranches_attribution
      WHERE agent_id = ? AND element_attribue_id = ? AND element_attribue_kind = 'client'
      ORDER BY date_cloture DESC LIMIT 1
    `).bind(agentId, r.resto_id).first() as any
    return { inherit: true, resto_id: r.resto_id, tranche_source_id: tr?.id }
  }
  return { inherit: false }
}

// ============================================================
// API HAUT-NIVEAU : QUALIFIER UN APPORT
// ============================================================

export interface QualifierResult {
  ok: boolean
  position?: number
  attribution?: boolean
  tranche_id?: number
  numero_tranche?: number
  heritage?: boolean        // la marque a été héritée (resto parent déjà 100% PF) → pas comptée dans tranche
  marques_heritees?: number[]  // pour les attributions resto, liste des marques propagées
  reason?: string
}

/**
 * Tente de qualifier un apport (client ou marque) dans la tranche UNIFIÉE ouverte.
 * Retourne :
 *   - { ok: true, position, attribution, ... }
 *   - { ok: true, heritage: true }            → marque héritée d'un resto 100% PF
 *   - { ok: false, reason }                    → refus (déjà compté, anti-double-dipping, etc.)
 */
export async function qualifierApport(
  db: D1Database,
  agentId: number,
  kind: ApportKind,
  elementId: number,
  options: {
    validation_ecrite?: boolean
    validateur_user_id?: number
    notes?: string
    is_challenge?: boolean
  } = {}
): Promise<QualifierResult> {
  // Cas spécial : marque sur resto 100% PF agent → héritage direct
  if (kind === 'marque' && !options.is_challenge) {
    const inh = await shouldInheritFromResto(db, agentId, elementId)
    if (inh.inherit) {
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 1,
            heritee_portefeuille = 1,
            exclue_mlm = 1,
            tranche_source_id = ?,
            date_heritage = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(inh.tranche_source_id || null, elementId).run()
      return { ok: true, heritage: true }
    }
  }

  // 1) Anti-revendication rétroactive (même élément déjà compté)
  if (await elementDejaComptabilise(db, agentId, kind, elementId)) {
    return { ok: false, reason: 'Élément déjà comptabilisé dans une tranche antérieure (revendication rétroactive interdite)' }
  }

  // 2) Anti double-dipping : règle assouplie selon Q4/Q5
  //    Un même resto ET ses marques sont des apports DISTINCTS qui peuvent chacun
  //    qualifier une tranche, à condition que ce soit dans des tranches DIFFÉRENTES
  //    (chronologie). On rejette UNIQUEMENT si on tente d'ajouter la marque
  //    dans la même tranche ouverte où son resto est déjà compté.
  let hookedResto: number | null = null
  if (kind === 'marque' && !options.is_challenge) {
    const m = await db.prepare(`SELECT restaurant_id FROM marques_virtuelles WHERE id = ?`).bind(elementId).first() as any
    hookedResto = m?.restaurant_id || null
    if (hookedResto) {
      // Vérifier UNIQUEMENT la tranche ouverte courante
      const ouverte = await db.prepare(`
        SELECT id, numero_tranche FROM tranches_attribution
        WHERE agent_id = ? AND statut = 'ouverte' AND type = 'unifiee'
        LIMIT 1
      `).bind(agentId).first() as any

      if (ouverte) {
        const dejaDansOuverte = await db.prepare(`
          SELECT te.id FROM tranche_elements te
          WHERE te.tranche_id = ? AND te.agent_id = ?
            AND (
              (te.type = 'client' AND te.element_id = ?)
              OR (te.type = 'marque' AND EXISTS (
                SELECT 1 FROM marques_virtuelles m2
                WHERE m2.id = te.element_id AND m2.restaurant_id = ?
              ))
            )
          LIMIT 1
        `).bind(ouverte.id, agentId, hookedResto, hookedResto).first()
        if (dejaDansOuverte) {
          return {
            ok: false,
            reason: `Le restaurant #${hookedResto} (ou une autre de ses marques) est déjà compté dans la tranche ouverte n°${ouverte.numero_tranche}. Pas de double-comptage dans la MÊME tranche.`
          }
        }
      }
    }
  }

  // 3) Idem pour un resto : on vérifie qu'aucune de ses marques n'est dans la TRANCHE OUVERTE
  if (kind === 'client') {
    const ouverte = await db.prepare(`
      SELECT id, numero_tranche FROM tranches_attribution
      WHERE agent_id = ? AND statut = 'ouverte' AND type = 'unifiee'
      LIMIT 1
    `).bind(agentId).first() as any

    if (ouverte) {
      const marqueDansOuverte = await db.prepare(`
        SELECT te.id FROM tranche_elements te
        JOIN marques_virtuelles m ON te.element_id = m.id
        WHERE te.tranche_id = ? AND te.type = 'marque' AND m.restaurant_id = ?
        LIMIT 1
      `).bind(ouverte.id, elementId).first()
      if (marqueDansOuverte) {
        return {
          ok: false,
          reason: `Une marque de ce restaurant est déjà comptée dans la tranche ouverte n°${ouverte.numero_tranche}. Pas de double-comptage dans la MÊME tranche.`
        }
      }
    }
  }

  // 4) Récupérer / créer la tranche unifiée ouverte
  const tranche = await getOrCreateTrancheOuverteUnifiee(db, agentId)

  // 5) Calculer la position (challenges exclus)
  const cnt = await countTrancheElements(db, tranche.id)
  const position = cnt + 1
  const isAttribution = position === SEUIL_TRANCHE && !options.is_challenge

  if (position > SEUIL_TRANCHE && !options.is_challenge) {
    return { ok: false, reason: 'Tranche déjà saturée' }
  }

  // 6) Insérer l'élément
  await db.prepare(`
    INSERT INTO tranche_elements
      (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, is_challenge, notes, hooked_resto_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    tranche.id, agentId, kind, elementId, position,
    isAttribution ? 1 : 0,
    options.is_challenge ? 1 : 0,
    options.notes || null,
    hookedResto
  ).run()

  // 7) Si position 5 → clôture + portefeuille + propagation marques (si resto)
  let marquesHeritees: number[] = []
  if (isAttribution) {
    await db.prepare(`
      UPDATE tranches_attribution
      SET statut = 'cloturee',
          date_cloture = CURRENT_TIMESTAMP,
          element_attribue_id = ?,
          element_attribue_kind = ?,
          validation_ecrite = ?,
          date_validation = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          validateur_user_id = ?
      WHERE id = ?
    `).bind(
      elementId, kind,
      options.validation_ecrite ? 1 : 0,
      options.validation_ecrite ? 1 : 0,
      options.validateur_user_id || null,
      tranche.id
    ).run()

    if (kind === 'client') {
      await db.prepare(`UPDATE restaurants SET is_portefeuille_proprietaire = 1 WHERE id = ?`)
        .bind(elementId).run()
      // PROPAGATION : marques non-comptées de ce resto deviennent héritées portefeuille
      const prop = await propagerHeritageResto(db, elementId, tranche.id)
      marquesHeritees = prop.marques_heritees
    } else {
      // attribution sur marque : 100% PF sur la marque uniquement
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 1,
            tranche_source_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(tranche.id, elementId).run()
    }
  } else if (kind === 'marque') {
    // Marque comptée dans une tranche → trace tranche_source_id
    await db.prepare(`
      UPDATE marques_virtuelles SET tranche_source_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(tranche.id, elementId).run()
  }

  return {
    ok: true,
    position,
    attribution: isAttribution,
    tranche_id: tranche.id,
    numero_tranche: tranche.numero_tranche,
    marques_heritees: marquesHeritees
  }
}

/**
 * Retire un élément d'une tranche. Si c'était une attribution, on rouvre + on
 * dépropage les marques héritées de ce resto (si kind=client).
 */
export async function dequalifierApport(
  db: D1Database,
  agentId: number,
  kind: ApportKind,
  elementId: number
): Promise<void> {
  const elem = await db.prepare(`
    SELECT * FROM tranche_elements
    WHERE agent_id = ? AND type = ? AND element_id = ?
  `).bind(agentId, kind, elementId).first() as TrancheElement | null

  if (!elem) {
    // Cas marque héritée (jamais entrée dans tranche) : on revert juste les flags
    if (kind === 'marque') {
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 0,
            heritee_portefeuille = 0,
            exclue_mlm = 0,
            tranche_source_id = NULL,
            date_heritage = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND heritee_portefeuille = 1
      `).bind(elementId).run()
    }
    return
  }

  await db.prepare(`DELETE FROM tranche_elements WHERE id = ?`).bind(elem.id).run()

  if (elem.is_attribution) {
    // Réouverture
    await db.prepare(`
      UPDATE tranches_attribution
      SET statut = 'ouverte', date_cloture = NULL, element_attribue_id = NULL,
          element_attribue_kind = NULL,
          validation_ecrite = 0, date_validation = NULL, validateur_user_id = NULL
      WHERE id = ?
    `).bind(elem.tranche_id).run()

    if (kind === 'client') {
      await db.prepare(`UPDATE restaurants SET is_portefeuille_proprietaire = 0 WHERE id = ?`)
        .bind(elementId).run()
      // Dépropager : les marques héritées de ce resto reviennent à 0
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 0,
            heritee_portefeuille = 0,
            exclue_mlm = 0,
            tranche_source_id = NULL,
            date_heritage = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE restaurant_id = ? AND heritee_portefeuille = 1
      `).bind(elementId).run()
    } else {
      await db.prepare(`
        UPDATE marques_virtuelles
        SET is_portefeuille_proprietaire = 0, tranche_source_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(elementId).run()
    }
  }
}

// ============================================================
// BACKWARD COMPATIBILITY (anciens callers)
// ============================================================
// Les anciens routes appellent qualifierElement(type='client'|'marque').
// On les redirige vers qualifierApport (compteur unifié).

export async function qualifierElement(
  db: D1Database,
  agentId: number,
  type: ApportKind,
  elementId: number,
  options: { validation_ecrite?: boolean; validateur_user_id?: number; notes?: string; is_challenge?: boolean } = {}
): Promise<QualifierResult> {
  return qualifierApport(db, agentId, type, elementId, options)
}

export async function dequalifierElement(
  db: D1Database,
  agentId: number,
  type: ApportKind,
  elementId: number
): Promise<void> {
  return dequalifierApport(db, agentId, type, elementId)
}

export async function getOrCreateTrancheOuverte(
  db: D1Database,
  agentId: number,
  _type: TrancheType
): Promise<Tranche> {
  // Toutes les anciennes signatures convergent vers la tranche unifiée
  return getOrCreateTrancheOuverteUnifiee(db, agentId)
}

// ============================================================
// LECTURE : état des tranches
// ============================================================

/**
 * Renvoie l'état des tranches de l'agent (toutes types confondus).
 * - Si type='unifiee' → renvoie uniquement la tranche unifiée
 * - Si type='client' ou 'marque' (compat) → renvoie le filtre legacy
 *
 * Pour la nouvelle UI on appelle directement getEtatTranchesUnifie.
 */
export async function getEtatTranches(db: D1Database, agentId: number, type: TrancheType = 'unifiee') {
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
        END as element_nom,
        CASE
          WHEN te.type = 'client' THEN (SELECT ville FROM restaurants WHERE id = te.element_id)
          WHEN te.type = 'marque' THEN (SELECT r2.ville FROM marques_virtuelles m2 JOIN restaurants r2 ON m2.restaurant_id = r2.id WHERE m2.id = te.element_id)
        END as element_ville
      FROM tranche_elements te
      WHERE te.tranche_id = ?
      ORDER BY te.position_dans_tranche
    `).bind(ouverte.id).all() as any
    elementsOuverte = results
  }

  const { results: cloturees } = await db.prepare(`
    SELECT t.*,
      CASE
        WHEN t.element_attribue_kind = 'client' OR (t.element_attribue_kind IS NULL AND t.type = 'client')
          THEN (SELECT nom FROM restaurants WHERE id = t.element_attribue_id)
        ELSE (SELECT nom FROM marques_virtuelles WHERE id = t.element_attribue_id)
      END as element_attribue_nom
    FROM tranches_attribution t
    WHERE t.agent_id = ? AND t.type = ? AND t.statut = 'cloturee'
    ORDER BY t.numero_tranche DESC
  `).bind(agentId, type).all() as any

  return {
    seuil: SEUIL_TRANCHE,
    type,
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

// ============================================================
// RECALCUL CHRONOLOGIQUE (utilisé par /admin/tranches/recalculer)
// ============================================================
// Logique : pour chaque agent, on parcourt l'historique des apports
// (restos + marques) dans l'ordre chronologique de leur date de validation
// et on les re-qualifie via qualifierApport(). Cela reconstruit proprement
// les tranches unifiées, propage les héritages, etc.
//
// IMPORTANT : on ne touche PAS aux agents/restos/marques eux-mêmes.
// On efface uniquement tranches_attribution + tranche_elements + flags
// dérivés (is_portefeuille_proprietaire, heritee_portefeuille, exclue_mlm)
// puis on rejoue.
// ============================================================

export interface RecalculReport {
  agent_id: number
  agent_nom?: string
  tranches_creees: number
  attributions: number
  marques_heritees: number
  warnings: string[]
}

/**
 * Récupère l'ordre chronologique des apports d'un agent.
 * - Resto : date = restaurants.date_signature (fallback created_at)
 * - Marque : date = marques_virtuelles.date_lancement (fallback created_at)
 *
 * Tri stable : (date ascendante, kind=client avant marque si égalité, id croissant)
 */
export async function listApportsChronologiques(db: D1Database, agentId: number): Promise<Array<{
  kind: ApportKind
  element_id: number
  date_validation: string
  nom: string
  resto_id?: number
  is_portefeuille_already?: number
}>> {
  const { results: restos } = await db.prepare(`
    SELECT id, nom,
      COALESCE(date_signature, substr(created_at, 1, 10)) as date_validation,
      is_portefeuille_proprietaire
    FROM restaurants
    WHERE agent_id = ? AND COALESCE(actif, 1) = 1
    ORDER BY date_validation ASC, id ASC
  `).bind(agentId).all() as any

  const { results: marques } = await db.prepare(`
    SELECT m.id, m.nom, m.restaurant_id,
      COALESCE(m.date_lancement, substr(m.created_at, 1, 10)) as date_validation,
      m.is_portefeuille_proprietaire, m.heritee_portefeuille
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id = ? AND COALESCE(m.actif, 1) = 1
    ORDER BY date_validation ASC, m.id ASC
  `).bind(agentId).all() as any

  const all: any[] = []
  for (const r of (restos || [])) {
    all.push({
      kind: 'client' as ApportKind,
      element_id: r.id,
      date_validation: r.date_validation,
      nom: r.nom,
      is_portefeuille_already: r.is_portefeuille_proprietaire
    })
  }
  for (const m of (marques || [])) {
    all.push({
      kind: 'marque' as ApportKind,
      element_id: m.id,
      date_validation: m.date_validation,
      nom: m.nom,
      resto_id: m.restaurant_id,
      is_portefeuille_already: m.is_portefeuille_proprietaire
    })
  }

  // Tri : date ASC, puis kind='client' avant 'marque' (pour qu'un resto qualifié
  // le même jour qu'une marque déclenche l'héritage), puis id ASC
  all.sort((a, b) => {
    if (a.date_validation !== b.date_validation) {
      return a.date_validation < b.date_validation ? -1 : 1
    }
    if (a.kind !== b.kind) return a.kind === 'client' ? -1 : 1
    return a.element_id - b.element_id
  })

  return all
}

/**
 * Recalcule entièrement les tranches d'un agent depuis le journal chronologique.
 * Étapes :
 *  1) Wipe : tranches_attribution + tranche_elements de cet agent
 *  2) Reset : flags is_portefeuille_proprietaire/heritee_portefeuille/exclue_mlm sur ses restos & marques
 *  3) Replay : pour chaque apport dans l'ordre, appeler qualifierApport()
 */
export async function recalculerTranchesAgent(
  db: D1Database,
  agentId: number
): Promise<RecalculReport> {
  const warnings: string[] = []

  // Snapshot before pour le log
  const before = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM tranches_attribution WHERE agent_id = ?) as nb_tranches,
      (SELECT COUNT(*) FROM tranche_elements WHERE agent_id = ?) as nb_elements
  `).bind(agentId, agentId).first()

  // 1) Wipe tranches de cet agent (en cascade manuelle pour éviter FK fail D1)
  //    Tables qui référencent tranches_attribution.id :
  //      - demandes_attribution_marque (tranche_id)
  //      - marques_virtuelles.tranche_source_id (SET NULL souhaité)
  await db.prepare(`
    DELETE FROM demandes_attribution_marque
    WHERE tranche_id IN (SELECT id FROM tranches_attribution WHERE agent_id = ?)
  `).bind(agentId).run().catch(() => null)
  await db.prepare(`
    UPDATE marques_virtuelles SET tranche_source_id = NULL
    WHERE tranche_source_id IN (SELECT id FROM tranches_attribution WHERE agent_id = ?)
  `).bind(agentId).run().catch(() => null)
  await db.prepare(`DELETE FROM tranche_elements WHERE agent_id = ?`).bind(agentId).run()
  await db.prepare(`DELETE FROM tranches_attribution WHERE agent_id = ?`).bind(agentId).run()

  // 2) Reset flags portefeuille SUR LES APPORTS DE CET AGENT UNIQUEMENT
  //    (on ne touche pas aux apports d'autres agents)
  await db.prepare(`
    UPDATE restaurants SET is_portefeuille_proprietaire = 0
    WHERE agent_id = ?
  `).bind(agentId).run()

  await db.prepare(`
    UPDATE marques_virtuelles
    SET is_portefeuille_proprietaire = 0,
        heritee_portefeuille = 0,
        exclue_mlm = 0,
        tranche_source_id = NULL,
        date_heritage = NULL
    WHERE restaurant_id IN (SELECT id FROM restaurants WHERE agent_id = ?)
  `).bind(agentId).run()

  // 3) Replay
  const apports = await listApportsChronologiques(db, agentId)
  let attributions = 0
  let marquesHeritees = 0

  for (const a of apports) {
    const r = await qualifierApport(db, agentId, a.kind, a.element_id, {
      notes: `Recalcul auto (date=${a.date_validation})`
    })
    if (!r.ok) {
      warnings.push(`Skip ${a.kind}#${a.element_id} (${a.nom}) : ${r.reason}`)
      continue
    }
    if (r.attribution) attributions++
    if (r.heritage) marquesHeritees++
    if (r.marques_heritees) marquesHeritees += r.marques_heritees.length
  }

  const tranchesCreees = await db.prepare(`
    SELECT COUNT(*) as n FROM tranches_attribution WHERE agent_id = ?
  `).bind(agentId).first() as any

  // Log
  await db.prepare(`
    INSERT INTO tranches_recalcul_log (agent_id, action, details, before_snapshot, after_snapshot)
    VALUES (?, 'recalcul_complet', ?, ?, ?)
  `).bind(
    agentId,
    `${apports.length} apports rejoués, ${attributions} attributions, ${marquesHeritees} héritages`,
    JSON.stringify(before),
    JSON.stringify({ tranches: tranchesCreees?.n, attributions, heritages: marquesHeritees })
  ).run()

  return {
    agent_id: agentId,
    tranches_creees: tranchesCreees?.n || 0,
    attributions,
    marques_heritees: marquesHeritees,
    warnings
  }
}

// ============================================================
// AUDIT : détecte les anomalies dans le système de tranches
// ============================================================

export interface AuditAnomaly {
  agent_id: number
  agent_nom: string
  type: 'tranche_5_5_non_cloturee' | 'tranche_cloturee_incomplete' | 'orphan_attribution' | 'pf_sans_tranche' | 'tranche_sans_pf' | 'doublon_resto' | 'heritage_incoherent'
  tranche_id?: number
  details: string
  severity: 'warning' | 'error'
}

export async function auditTranches(db: D1Database): Promise<AuditAnomaly[]> {
  const anomalies: AuditAnomaly[] = []

  // 1) Tranches avec >= 5 éléments non-challenge mais statut='ouverte'
  const { results: a1 } = await db.prepare(`
    SELECT ta.id, ta.agent_id, ta.numero_tranche, ta.type,
      u.nom || ' ' || u.prenom as agent_nom,
      COUNT(te.id) as nb_elements
    FROM tranches_attribution ta
    JOIN users u ON ta.agent_id = u.id
    LEFT JOIN tranche_elements te ON te.tranche_id = ta.id AND COALESCE(te.is_challenge,0)=0
    WHERE ta.statut = 'ouverte'
    GROUP BY ta.id
    HAVING COUNT(te.id) >= 5
  `).all() as any
  for (const r of (a1 || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom,
      type: 'tranche_5_5_non_cloturee',
      tranche_id: r.id,
      details: `Tranche #${r.numero_tranche} (${r.type}) a ${r.nb_elements} éléments mais reste ouverte`,
      severity: 'error'
    })
  }

  // 2) Tranches clôturées avec < 5 éléments (sauf attribution challenge)
  const { results: a2 } = await db.prepare(`
    SELECT ta.id, ta.agent_id, ta.numero_tranche, ta.type,
      u.nom || ' ' || u.prenom as agent_nom,
      COUNT(te.id) as nb_elements
    FROM tranches_attribution ta
    JOIN users u ON ta.agent_id = u.id
    LEFT JOIN tranche_elements te ON te.tranche_id = ta.id AND COALESCE(te.is_challenge,0)=0
    WHERE ta.statut = 'cloturee'
    GROUP BY ta.id
    HAVING COUNT(te.id) < 5
  `).all() as any
  for (const r of (a2 || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom,
      type: 'tranche_cloturee_incomplete',
      tranche_id: r.id,
      details: `Tranche #${r.numero_tranche} (${r.type}) clôturée avec seulement ${r.nb_elements} élément(s)`,
      severity: 'error'
    })
  }

  // 3) Restos / marques marqués portefeuille mais sans tranche d'attribution
  const { results: a3a } = await db.prepare(`
    SELECT r.id, r.nom, r.agent_id, u.nom || ' ' || u.prenom as agent_nom
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.is_portefeuille_proprietaire = 1
      AND NOT EXISTS (
        SELECT 1 FROM tranches_attribution ta
        WHERE ta.element_attribue_id = r.id
          AND (ta.element_attribue_kind = 'client' OR ta.type = 'client' OR ta.type = 'unifiee')
          AND ta.statut = 'cloturee'
      )
  `).all() as any
  for (const r of (a3a || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom || 'N/A',
      type: 'pf_sans_tranche',
      details: `Resto #${r.id} (${r.nom}) marqué portefeuille mais aucune tranche d'attribution`,
      severity: 'warning'
    })
  }

  const { results: a3b } = await db.prepare(`
    SELECT m.id, m.nom, m.heritee_portefeuille, r.agent_id,
      u.nom || ' ' || u.prenom as agent_nom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE m.is_portefeuille_proprietaire = 1
      AND COALESCE(m.heritee_portefeuille, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM tranches_attribution ta
        WHERE ta.element_attribue_id = m.id
          AND (ta.element_attribue_kind = 'marque' OR ta.type = 'marque' OR ta.type = 'unifiee')
          AND ta.statut = 'cloturee'
      )
  `).all() as any
  for (const r of (a3b || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom || 'N/A',
      type: 'pf_sans_tranche',
      details: `Marque #${r.id} (${r.nom}) marquée portefeuille (non héritée) mais aucune tranche d'attribution`,
      severity: 'warning'
    })
  }

  // 4) Doublons resto : un resto compté ET via lui-même ET via une de ses marques
  //    DANS LA MÊME TRANCHE (resto+marque-du-même-resto dans la même tranche = double-comptage)
  //    Entre tranches différentes : c'est légitime (Q4 — chronologie).
  const { results: a4 } = await db.prepare(`
    SELECT te1.agent_id, te1.element_id as resto_id, r.nom as resto_nom,
      te1.tranche_id, ta.numero_tranche,
      u.nom || ' ' || u.prenom as agent_nom
    FROM tranche_elements te1
    JOIN restaurants r ON te1.element_id = r.id
    JOIN users u ON te1.agent_id = u.id
    JOIN tranches_attribution ta ON te1.tranche_id = ta.id
    WHERE te1.type = 'client'
      AND EXISTS (
        SELECT 1 FROM tranche_elements te2
        JOIN marques_virtuelles m ON te2.element_id = m.id
        WHERE te2.agent_id = te1.agent_id
          AND te2.type = 'marque'
          AND te2.tranche_id = te1.tranche_id  -- MÊME tranche
          AND m.restaurant_id = te1.element_id
      )
  `).all() as any
  for (const r of (a4 || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom,
      type: 'doublon_resto',
      tranche_id: r.tranche_id,
      details: `Resto #${r.resto_id} (${r.resto_nom}) compté en double dans la tranche n°${r.numero_tranche} (resto + une de ses marques)`,
      severity: 'error'
    })
  }

  // 5) Marques héritées sans flag exclue_mlm
  const { results: a5 } = await db.prepare(`
    SELECT m.id, m.nom, r.agent_id, u.nom || ' ' || u.prenom as agent_nom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE m.heritee_portefeuille = 1 AND COALESCE(m.exclue_mlm, 0) = 0
  `).all() as any
  for (const r of (a5 || [])) {
    anomalies.push({
      agent_id: r.agent_id, agent_nom: r.agent_nom || 'N/A',
      type: 'heritage_incoherent',
      details: `Marque #${r.id} (${r.nom}) marquée héritée mais sans flag exclue_mlm`,
      severity: 'warning'
    })
  }

  return anomalies
}
