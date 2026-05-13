// ============================================================
// MOTEUR DE CALCUL DES COMMISSIONS DROPEAT™
// ============================================================
// Logique :
// 1. Pour chaque commande, on détermine le palier de montant (0-30, 30-60, etc.)
// 2. On applique :
//    - Facturation restaurant (avec ou sans tablette SR SHOP)
//    - Commission agent commercial (standard OU 100% si Portefeuille Propriétaire)
//    - Commission sous-agent N1 (pour l'agent parent)
//    - Commission sous-agent N2 (pour le grand-parent)
// ============================================================

import type { Palier } from '../types'

export type PalierType =
  | 'facturation_restaurant'
  | 'facturation_restaurant_tablette'
  | 'agent_standard'
  | 'agent_portefeuille'
  | 'sous_agent_n1'
  | 'sous_agent_n2'

export interface PaliersMap {
  facturation_restaurant: Palier[]
  facturation_restaurant_tablette: Palier[]
  agent_standard: Palier[]
  agent_portefeuille: Palier[]
  sous_agent_n1: Palier[]
  sous_agent_n2: Palier[]
}

/**
 * Trouve le montant de commission pour un montant de commande donné.
 * Retourne le montant_par_commande du palier qui contient le montant.
 */
export function getCommissionForOrder(montantCommande: number, paliers: Palier[]): number {
  const p = getPalierForOrder(montantCommande, paliers)
  return p ? p.montant_par_commande : 0
}

/**
 * Retourne le palier complet (avec id, seuils, montant) appliqué à une commande.
 * Utile pour la traçabilité 100% : on persiste l'id du palier sur la commande.
 */
export function getPalierForOrder(montantCommande: number, paliers: Palier[]): Palier | null {
  if (montantCommande <= 0 || paliers.length === 0) return null
  const sorted = [...paliers].sort((a, b) => a.seuil_min - b.seuil_min)
  for (const p of sorted) {
    const min = p.seuil_min
    const max = p.seuil_max ?? Infinity
    if (montantCommande >= min && montantCommande < max) return p
    // Cas limite : seuil_max inclusif (ex: 30€ = palier 0-30)
    if (montantCommande === max) return p
  }
  // Si supérieur au dernier palier (seuil_max = null)
  const last = sorted[sorted.length - 1]
  if (last && last.seuil_max === null && montantCommande >= last.seuil_min) {
    return last
  }
  return null
}

/**
 * Récupère tous les paliers depuis la BDD et les groupe par type.
 */
export async function getPaliers(db: D1Database): Promise<PaliersMap> {
  const { results } = await db.prepare(`
    SELECT * FROM paliers_commissions WHERE actif = 1 ORDER BY type, ordre, seuil_min
  `).all() as any

  const map: PaliersMap = {
    facturation_restaurant: [],
    facturation_restaurant_tablette: [],
    agent_standard: [],
    agent_portefeuille: [],
    sous_agent_n1: [],
    sous_agent_n2: []
  }
  for (const p of results) {
    if (map[p.type as PalierType]) {
      (map[p.type as PalierType] as Palier[]).push(p)
    }
  }
  return map
}

/**
 * Calcule les commissions pour UNE commande
 *
 * @param montantCommande Montant brut de la commande
 * @param tabletteSRShop true si tablette SR SHOP fournie (+0.05€ facturation)
 * @param isPortefeuilleProprietaire true si la marque est en Portefeuille Propriétaire (5e)
 * @param hasAgentN0 true si un agent commercial est rattaché (qui a apporté le restaurant)
 * @param hasParentN1 true si l'agent a un parent (= il est sous-agent N1)
 * @param hasGrandParentN2 true si l'agent N1 a lui-même un parent (= grand-parent N2)
 * @param paliers paliers depuis la BDD
 */
export interface CalculCommandeResult {
  montant_commande: number
  facturation_restaurant: number  // Ce que DropEat facture au resto
  commission_agent: number         // Ce que touche l'agent qui a apporté
  commission_parent: number        // Ce que touche le parent (si l'apporteur est un sous-agent)
  commission_grand_parent: number  // Ce que touche le grand-parent (si apporteur N2)
  marge_dropeat: number            // Marge nette pour DropEat
  is_portefeuille: boolean
  tablette: boolean
  // Traçabilité 100% : ids des paliers appliqués
  palier_facture_id: number | null
  palier_agent_id: number | null
  palier_n1_id: number | null
  palier_n2_id: number | null
  details: {
    type_facturation: string
    type_commission_agent: string
  }
}

export function calculerCommissionCommande(params: {
  montant_commande: number
  tablette_sr_shop: boolean
  is_portefeuille_proprietaire: boolean
  agent_niveau: number | null  // 0=Agent commercial, 1=Sous-agent N1, 2=Sous-agent N2
  has_parent: boolean
  has_grand_parent: boolean
  paliers: PaliersMap
}): CalculCommandeResult {
  const {
    montant_commande,
    tablette_sr_shop,
    is_portefeuille_proprietaire,
    agent_niveau,
    has_parent,
    has_grand_parent,
    paliers
  } = params

  // Facturation restaurant (avec ou sans tablette)
  const facturationPaliers = tablette_sr_shop
    ? paliers.facturation_restaurant_tablette
    : paliers.facturation_restaurant
  const palierFacture = getPalierForOrder(montant_commande, facturationPaliers)
  const facturation_restaurant = palierFacture?.montant_par_commande || 0

  // Commission agent (apporteur direct du resto)
  // Si Portefeuille Propriétaire => 100% (= grille agent_portefeuille)
  // Sinon => commission standard
  let commission_agent = 0
  let type_commission_agent = 'aucune'
  let palierAgent: Palier | null = null
  if (agent_niveau !== null) {
    if (is_portefeuille_proprietaire) {
      palierAgent = getPalierForOrder(montant_commande, paliers.agent_portefeuille)
      commission_agent = palierAgent?.montant_par_commande || 0
      type_commission_agent = 'portefeuille_proprietaire'
    } else {
      palierAgent = getPalierForOrder(montant_commande, paliers.agent_standard)
      commission_agent = palierAgent?.montant_par_commande || 0
      type_commission_agent = 'agent_standard'
    }
  }

  // Commissions remontées MLM (uniquement si pas Portefeuille Propriétaire)
  // Si l'apporteur est un sous-agent N1 => son parent (agent commercial) touche commission n1
  // Si l'apporteur est un sous-agent N2 => son parent (sous-agent N1) touche n1, et son grand-parent (agent commercial) touche n2
  let commission_parent = 0
  let commission_grand_parent = 0
  let palierN1: Palier | null = null
  let palierN2: Palier | null = null
  if (!is_portefeuille_proprietaire && agent_niveau !== null) {
    if (has_parent) {
      if (agent_niveau === 1) {
        palierN1 = getPalierForOrder(montant_commande, paliers.sous_agent_n1)
        commission_parent = palierN1?.montant_par_commande || 0
      } else if (agent_niveau === 2) {
        palierN1 = getPalierForOrder(montant_commande, paliers.sous_agent_n1)
        commission_parent = palierN1?.montant_par_commande || 0
        if (has_grand_parent) {
          palierN2 = getPalierForOrder(montant_commande, paliers.sous_agent_n2)
          commission_grand_parent = palierN2?.montant_par_commande || 0
        }
      }
    }
  }

  const marge_dropeat = facturation_restaurant
    - commission_agent
    - commission_parent
    - commission_grand_parent

  return {
    montant_commande,
    facturation_restaurant,
    commission_agent,
    commission_parent,
    commission_grand_parent,
    marge_dropeat,
    is_portefeuille: is_portefeuille_proprietaire,
    tablette: tablette_sr_shop,
    palier_facture_id: palierFacture?.id ?? null,
    palier_agent_id: palierAgent?.id ?? null,
    palier_n1_id: palierN1?.id ?? null,
    palier_n2_id: palierN2?.id ?? null,
    details: {
      type_facturation: tablette_sr_shop ? 'avec_tablette' : 'sans_tablette',
      type_commission_agent
    }
  }
}

/**
 * Calcule les commissions agrégées sur une période pour TOUTES les commandes.
 * Retourne plusieurs vues : par restaurant, par agent, totaux globaux.
 */
export interface CommandeWithContext {
  id: number
  date_commande: string
  montant_brut: number
  marque_id: number
  marque_nom: string
  marque_is_portefeuille: number
  marque_date_signature_portefeuille?: string | null
  restaurant_id: number
  restaurant_nom: string
  restaurant_is_portefeuille: number
  restaurant_date_signature_portefeuille?: string | null
  tablette_sr_shop: number
  agent_id: number | null
  agent_niveau: number | null
  agent_parent_id: number | null
  agent_grand_parent_id: number | null
}

/**
 * Détermine si une commande tombe sous le régime PORTEFEUILLE 100% agent.
 *
 * Règle métier (clarification utilisateur du 13 mai 2026) :
 *   - Le portefeuille devient effectif à la DATE DE SIGNATURE du contrat
 *     de portefeuille, pas à la date de création de la marque.
 *   - Exemple : marque créée le 26 mai, sélectionnée comme portefeuille
 *     le 29 juin → toutes les commandes < 29 juin = commissions normales
 *     (DropEat + N+1/N+2), toutes les commandes ≥ 29 juin = 100% agent.
 *   - Si le flag is_portefeuille_proprietaire est posé mais aucune date
 *     de signature n'est renseignée → on conserve l'ancien comportement
 *     (compatibilité ascendante : portefeuille effectif depuis toujours).
 */
export function isOrderUnderPortefeuille(cmd: {
  date_commande: string
  marque_is_portefeuille: number
  marque_date_signature_portefeuille?: string | null
  restaurant_is_portefeuille: number
  restaurant_date_signature_portefeuille?: string | null
}): boolean {
  const margeFlag = !!cmd.marque_is_portefeuille
  const restoFlag = !!cmd.restaurant_is_portefeuille
  if (!margeFlag && !restoFlag) return false

  const dateCmd = (cmd.date_commande || '').substring(0, 10) // YYYY-MM-DD
  if (!dateCmd) return margeFlag || restoFlag

  // Si signature marque définie, on respecte cette date
  if (margeFlag) {
    const dSign = cmd.marque_date_signature_portefeuille
    if (dSign && dSign.length >= 10) {
      return dateCmd >= dSign.substring(0, 10)
    }
    // Pas de date → comportement historique : portefeuille effectif partout
    return true
  }
  // Sinon, c'est le resto qui est en portefeuille
  if (restoFlag) {
    const dSign = cmd.restaurant_date_signature_portefeuille
    if (dSign && dSign.length >= 10) {
      return dateCmd >= dSign.substring(0, 10)
    }
    return true
  }
  return false
}

export interface AgentCommissionDetail {
  agent_id: number
  total: number
  commission_propre: number       // sur ses propres clients
  commission_portefeuille: number  // sur ses clients Portefeuille
  commission_n1: number             // sur les ventes des sous-agents directs
  commission_n2: number             // sur les ventes des sous-sous-agents
  nb_commandes_propres: number
  nb_commandes_portefeuille: number
  nb_commandes_n1: number
  nb_commandes_n2: number
}

export interface CalculPeriodeResult {
  totaux: {
    nb_commandes: number
    ca_brut: number
    facturation_dropeat: number
    commissions_agents_total: number
    marge_dropeat: number
  }
  par_restaurant: Array<{
    restaurant_id: number
    restaurant_nom: string
    nb_commandes: number
    ca: number
    facturation: number
    commissions: number
    marge_dropeat: number
  }>
  par_agent: Map<number, AgentCommissionDetail>
}

export function calculerCommissionsPeriode(
  commandes: CommandeWithContext[],
  paliers: PaliersMap
): CalculPeriodeResult {
  const result: CalculPeriodeResult = {
    totaux: {
      nb_commandes: 0,
      ca_brut: 0,
      facturation_dropeat: 0,
      commissions_agents_total: 0,
      marge_dropeat: 0
    },
    par_restaurant: [],
    par_agent: new Map()
  }

  const restoMap = new Map<number, any>()

  for (const cmd of commandes) {
    // Le portefeuille n'est effectif qu'à partir de la date de signature
    // du contrat (cf. règle métier 0010_portefeuille_signature_docs).
    const isPortefeuille = isOrderUnderPortefeuille(cmd)

    const calc = calculerCommissionCommande({
      montant_commande: cmd.montant_brut,
      tablette_sr_shop: !!cmd.tablette_sr_shop,
      is_portefeuille_proprietaire: isPortefeuille,
      agent_niveau: cmd.agent_niveau,
      has_parent: cmd.agent_parent_id !== null,
      has_grand_parent: cmd.agent_grand_parent_id !== null,
      paliers
    })

    // Totaux globaux
    result.totaux.nb_commandes++
    result.totaux.ca_brut += cmd.montant_brut
    result.totaux.facturation_dropeat += calc.facturation_restaurant
    result.totaux.commissions_agents_total +=
      calc.commission_agent + calc.commission_parent + calc.commission_grand_parent
    result.totaux.marge_dropeat += calc.marge_dropeat

    // Par restaurant
    if (!restoMap.has(cmd.restaurant_id)) {
      restoMap.set(cmd.restaurant_id, {
        restaurant_id: cmd.restaurant_id,
        restaurant_nom: cmd.restaurant_nom,
        nb_commandes: 0,
        ca: 0,
        facturation: 0,
        commissions: 0,
        marge_dropeat: 0
      })
    }
    const r = restoMap.get(cmd.restaurant_id)
    r.nb_commandes++
    r.ca += cmd.montant_brut
    r.facturation += calc.facturation_restaurant
    r.commissions += calc.commission_agent + calc.commission_parent + calc.commission_grand_parent
    r.marge_dropeat += calc.marge_dropeat

    // Par agent : commission propre (apporteur direct)
    if (cmd.agent_id && calc.commission_agent > 0) {
      const a = getOrCreateAgentDetail(result.par_agent, cmd.agent_id)
      if (isPortefeuille) {
        a.commission_portefeuille += calc.commission_agent
        a.nb_commandes_portefeuille++
      } else {
        a.commission_propre += calc.commission_agent
        a.nb_commandes_propres++
      }
      a.total += calc.commission_agent
    }

    // Parent (commission n1)
    if (cmd.agent_parent_id && calc.commission_parent > 0) {
      const a = getOrCreateAgentDetail(result.par_agent, cmd.agent_parent_id)
      a.commission_n1 += calc.commission_parent
      a.nb_commandes_n1++
      a.total += calc.commission_parent
    }

    // Grand-parent (commission n2)
    if (cmd.agent_grand_parent_id && calc.commission_grand_parent > 0) {
      const a = getOrCreateAgentDetail(result.par_agent, cmd.agent_grand_parent_id)
      a.commission_n2 += calc.commission_grand_parent
      a.nb_commandes_n2++
      a.total += calc.commission_grand_parent
    }
  }

  result.par_restaurant = Array.from(restoMap.values()).sort((a, b) => b.ca - a.ca)
  return result
}

function getOrCreateAgentDetail(map: Map<number, AgentCommissionDetail>, id: number): AgentCommissionDetail {
  if (!map.has(id)) {
    map.set(id, {
      agent_id: id,
      total: 0,
      commission_propre: 0,
      commission_portefeuille: 0,
      commission_n1: 0,
      commission_n2: 0,
      nb_commandes_propres: 0,
      nb_commandes_portefeuille: 0,
      nb_commandes_n1: 0,
      nb_commandes_n2: 0
    })
  }
  return map.get(id)!
}

/**
 * Détermine si un nouveau restaurant ou marque doit être en Portefeuille Propriétaire.
 * Règle : tous les 5 (5e, 10e, 15e...), ça appartient à 100% à l'agent.
 */
export function isRangPortefeuille(rang: number, palierPortefeuille: number = 5): boolean {
  return rang > 0 && rang % palierPortefeuille === 0
}
