// Module de calcul des commissions par paliers
import type { Palier } from '../types'

/**
 * Calcule la commission par paliers progressifs (style tranches d'imposition).
 * Chaque tranche du CA est taxée à son taux propre.
 *
 * Exemple paliers : [0-5000:15%, 5000-10000:12%, 10000+:10%]
 * Pour CA=12000 :
 *   - 5000 * 15% = 750
 *   - 5000 * 12% = 600
 *   - 2000 * 10% = 200
 *   Total = 1550
 */
export function calculerCommissionParPaliers(
  base: number,
  paliers: Palier[]
): { montant: number; details: Array<{ tranche: string; taux: number; base: number; montant: number }> } {
  if (base <= 0 || paliers.length === 0) {
    return { montant: 0, details: [] }
  }

  // Trier paliers par seuil_min croissant
  const sorted = [...paliers].sort((a, b) => a.seuil_min - b.seuil_min)

  let total = 0
  const details: Array<{ tranche: string; taux: number; base: number; montant: number }> = []

  for (const palier of sorted) {
    const min = palier.seuil_min
    const max = palier.seuil_max ?? Infinity

    if (base <= min) break

    const tranche_max = Math.min(base, max)
    const montant_dans_tranche = tranche_max - min

    if (montant_dans_tranche > 0) {
      const commission = montant_dans_tranche * (palier.taux / 100)
      total += commission
      details.push({
        tranche: `${min.toFixed(0)} - ${max === Infinity ? '∞' : max.toFixed(0)}`,
        taux: palier.taux,
        base: montant_dans_tranche,
        montant: commission
      })
    }
  }

  return { montant: total, details }
}

/**
 * Variante : commission en taux unique selon le palier atteint (le plus élevé).
 * Pour CA=12000 avec [0-5k:15%, 5-10k:12%, 10k+:10%] => 12000 * 10% = 1200
 */
export function calculerCommissionTauxUnique(
  base: number,
  paliers: Palier[]
): { montant: number; taux_applique: number } {
  if (base <= 0 || paliers.length === 0) return { montant: 0, taux_applique: 0 }

  const sorted = [...paliers].sort((a, b) => a.seuil_min - b.seuil_min)
  let taux_applique = 0

  for (const palier of sorted) {
    if (base >= palier.seuil_min) {
      taux_applique = palier.taux
    }
  }

  return { montant: base * (taux_applique / 100), taux_applique }
}

/**
 * Calcule l'ensemble des commissions pour un restaurant et un mois donné.
 *
 * Logique :
 * 1. CA mensuel net du restaurant (somme des commandes)
 * 2. Commission ENTREPRISE = paliers entreprise sur CA net
 * 3. Commission AGENT = paliers agent sur la commission entreprise
 * 4. Commission SOUS-AGENT = paliers sous_agent sur la commission entreprise
 * 5. Commission SOUS-SOUS-AGENT = paliers sous_sous_agent sur la commission entreprise
 *
 * Note : on calcule les commissions agent/sous-agent sur la commission entreprise,
 * pour que le total agent + sous-agent + sous-sous-agent ne dépasse pas la commission entreprise.
 */
export interface ResultatCommissions {
  ca_net: number
  commission_entreprise: number
  commission_agent: number
  commission_sous_agent: number
  commission_sous_sous_agent: number
  marge_entreprise_finale: number
  details: {
    entreprise: any[]
    agent: any[]
    sous_agent: any[]
    sous_sous_agent: any[]
  }
}

export function calculerToutesCommissions(
  ca_net: number,
  paliersEntreprise: Palier[],
  paliersAgent: Palier[],
  paliersSousAgent: Palier[],
  paliersSousSousAgent: Palier[],
  hasAgent: boolean,
  hasSousAgent: boolean,
  hasSousSousAgent: boolean
): ResultatCommissions {
  const entrepriseRes = calculerCommissionParPaliers(ca_net, paliersEntreprise)
  const com_entreprise = entrepriseRes.montant

  // Les commissions agents s'appliquent sur la commission entreprise
  const agentRes = hasAgent
    ? calculerCommissionParPaliers(com_entreprise, paliersAgent)
    : { montant: 0, details: [] }

  const sousAgentRes = hasSousAgent
    ? calculerCommissionParPaliers(com_entreprise, paliersSousAgent)
    : { montant: 0, details: [] }

  const sousSousAgentRes = hasSousSousAgent
    ? calculerCommissionParPaliers(com_entreprise, paliersSousSousAgent)
    : { montant: 0, details: [] }

  const margeFinale =
    com_entreprise -
    agentRes.montant -
    sousAgentRes.montant -
    sousSousAgentRes.montant

  return {
    ca_net,
    commission_entreprise: com_entreprise,
    commission_agent: agentRes.montant,
    commission_sous_agent: sousAgentRes.montant,
    commission_sous_sous_agent: sousSousAgentRes.montant,
    marge_entreprise_finale: margeFinale,
    details: {
      entreprise: entrepriseRes.details,
      agent: agentRes.details,
      sous_agent: sousAgentRes.details,
      sous_sous_agent: sousSousAgentRes.details
    }
  }
}
