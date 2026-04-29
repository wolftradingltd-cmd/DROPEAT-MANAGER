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
  if (montantCommande <= 0 || paliers.length === 0) return 0
  const sorted = [...paliers].sort((a, b) => a.seuil_min - b.seuil_min)
  for (const p of sorted) {
    const min = p.seuil_min
    const max = p.seuil_max ?? Infinity
    if (montantCommande >= min && montantCommande < max) {
      return p.montant_par_commande
    }
    // Cas limite : si seuil_max est inclusif (ex: 30€ = palier 0-30)
    if (montantCommande === max) {
      return p.montant_par_commande
    }
  }
  // Si supérieur au dernier palier
  const last = sorted[sorted.length - 1]
  if (last && last.seuil_max === null && montantCommande >= last.seuil_min) {
    return last.montant_par_commande
  }
  return 0
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
  const facturation_restaurant = getCommissionForOrder(montant_commande, facturationPaliers)

  // Commission agent (apporteur direct du resto)
  // Si Portefeuille Propriétaire => 100% (= grille agent_portefeuille)
  // Sinon => commission standard
  let commission_agent = 0
  let type_commission_agent = 'aucune'
  if (agent_niveau !== null) {
    if (is_portefeuille_proprietaire) {
      commission_agent = getCommissionForOrder(montant_commande, paliers.agent_portefeuille)
      type_commission_agent = 'portefeuille_proprietaire'
    } else {
      commission_agent = getCommissionForOrder(montant_commande, paliers.agent_standard)
      type_commission_agent = 'agent_standard'
    }
  }

  // Commissions remontées MLM (uniquement si pas Portefeuille Propriétaire)
  // Si l'apporteur est un sous-agent N1 => son parent (agent commercial) touche commission n1
  // Si l'apporteur est un sous-agent N2 => son parent (sous-agent N1) touche n1, et son grand-parent (agent commercial) touche n2
  let commission_parent = 0
  let commission_grand_parent = 0
  if (!is_portefeuille_proprietaire && agent_niveau !== null) {
    // L'apporteur a un parent ?
    if (has_parent) {
      // Le parent touche une commission "sous_agent_n1" (peu importe le niveau de l'apporteur tant qu'il est sous-agent)
      // Cas 1 : apporteur niveau 1 (sous-agent direct), parent = niveau 0 (agent commercial) => n1
      // Cas 2 : apporteur niveau 2 (sous-sous-agent), parent = niveau 1 (sous-agent), grand-parent = niveau 0 (agent commercial)
      if (agent_niveau === 1) {
        commission_parent = getCommissionForOrder(montant_commande, paliers.sous_agent_n1)
      } else if (agent_niveau === 2) {
        // Le parent direct (sous-agent N1) touche en tant que parent de N2
        // Le grand-parent (agent commercial) touche en tant que parent indirect via N1->N2
        commission_parent = getCommissionForOrder(montant_commande, paliers.sous_agent_n1)
        if (has_grand_parent) {
          commission_grand_parent = getCommissionForOrder(montant_commande, paliers.sous_agent_n2)
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
  restaurant_id: number
  restaurant_nom: string
  restaurant_is_portefeuille: number
  tablette_sr_shop: number
  agent_id: number | null
  agent_niveau: number | null
  agent_parent_id: number | null
  agent_grand_parent_id: number | null
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
    // Une marque peut être Portefeuille même si le resto ne l'est pas (5e marque créée)
    // Le restaurant peut être Portefeuille (5e resto apporté)
    const isPortefeuille = !!(cmd.restaurant_is_portefeuille || cmd.marque_is_portefeuille)

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
