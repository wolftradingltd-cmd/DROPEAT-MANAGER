// ============================================================
// COMMISSION VIEW — Helpers de cloisonnement vue agent / admin
// ============================================================
// Règle métier critique (Q1 — réponse user A+B) :
//   - Les agents (et sous-agents) ne doivent JAMAIS connaître la marge
//     DropEat (= ce que DropEat gagne sur les commandes du resto).
//   - Les agents peuvent voir :
//       ✅ leur propre commission
//       ✅ les commissions de leurs sous-agents (N+1, N+2)
//       ✅ le CA brut du restaurant (pour contrôler leur taux)
//       ✅ le nombre de commandes
//       ❌ JAMAIS la facturation DropEat (= ce que DropEat facture au resto)
//       ❌ JAMAIS la marge DropEat (= facturation - commissions)
//
//   - Les superadmins voient absolument tout (facturation, marge,
//     toutes les commissions y compris portefeuille).
//
// Ces helpers sont les SEULS points de sortie côté agent. Toute route
// agent doit obligatoirement passer par ces fonctions pour ne pas
// fuiter d'info.
// ============================================================

export interface ImportStatsFull {
  // Stats complètes (admin)
  ca_brut: number
  ca_dropeat_brut: number          // ⚠️ Confidentiel — ne JAMAIS exposer aux agents
  commissions_propre: number
  commissions_portefeuille: number
  commissions_n1: number
  commissions_n2: number
  commissions_total: number
  marge_dropeat_nette: number      // ⚠️ Confidentiel — ne JAMAIS exposer aux agents
  nb_commandes_reel: number
}

export interface ImportStatsAgent {
  // Stats agent (sans marge DropEat)
  ca_brut: number
  commissions_propre: number       // Sa commission
  commissions_portefeuille: number // Sa commission portefeuille (100% PF)
  commissions_n1: number           // Si user est N+0 → commissions de ses N+1
  commissions_n2: number           // Si user est N+0 → commissions de ses N+2
  commissions_total: number        // Total visible par l'agent
  nb_commandes_reel: number
}

/**
 * Filtre une ligne de stats pour la vue AGENT.
 * SUPPRIME : ca_dropeat_brut, marge_dropeat_nette, palier_facture_id
 * CONSERVE : ca_brut, commissions_*, nb_commandes
 *
 * @param row    La ligne complète issue de la DB
 * @returns      La ligne épurée (sans champs confidentiels DropEat)
 */
export function sanitizeImportForAgent(row: any): ImportStatsAgent & Record<string, any> {
  if (!row) return row
  const sanitized = { ...row }
  // Supprime tous les champs qui révèlent ce que DropEat gagne
  delete sanitized.ca_dropeat_brut
  delete sanitized.marge_dropeat_nette
  delete sanitized.marge_dropeat
  delete sanitized.facturation_restaurant
  delete sanitized.facturation_total
  delete sanitized.palier_facture_id
  // Supprime aussi les détails techniques inutiles à l'agent
  delete sanitized.type_facturation
  return sanitized
}

/**
 * Filtre une commande (résultat de commissions.calculerCommissionCommande)
 * pour la vue agent. Idem : supprime facturation_restaurant + marge_dropeat.
 */
export function sanitizeCommandeForAgent(cmd: any): any {
  if (!cmd) return cmd
  const sanitized = { ...cmd }
  delete sanitized.facturation_restaurant
  delete sanitized.marge_dropeat
  delete sanitized.palier_facture_id
  return sanitized
}

/**
 * Filtre une liste de commandes pour la vue agent.
 */
export function sanitizeCommandesForAgent(cmds: any[]): any[] {
  return (cmds || []).map(sanitizeCommandeForAgent)
}

/**
 * Sanitize les totaux d'un endpoint listant des imports.
 * Supprime ca_dropeat_brut et marge_dropeat_nette des totaux.
 */
export function sanitizeTotauxForAgent(totaux: any): any {
  if (!totaux) return totaux
  const t = { ...totaux }
  delete t.ca_dropeat_brut
  delete t.marge_dropeat_nette
  return t
}

/**
 * Détermine si un user a le droit de voir la marge DropEat.
 * Actuellement : uniquement superadmin.
 */
export function canSeeMargeDropEat(user: { role?: string }): boolean {
  return user?.role === 'superadmin'
}

/**
 * Sanitize une liste complète d'imports pour la vue agent.
 * Application système : si l'utilisateur n'est PAS superadmin,
 * on retire les champs confidentiels de chaque ligne + des totaux.
 */
export function sanitizeImportsListForAgent(
  user: { role?: string },
  data: { imports: any[], totaux: any }
): { imports: any[], totaux: any } {
  if (canSeeMargeDropEat(user)) return data
  return {
    imports: (data.imports || []).map(sanitizeImportForAgent),
    totaux: sanitizeTotauxForAgent(data.totaux)
  }
}
