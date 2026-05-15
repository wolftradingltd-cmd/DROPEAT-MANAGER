// ============================================================
// MOTEUR D'AUTO-CALCUL & SNAPSHOT MENSUEL DES COMMISSIONS
// ============================================================
// - Déclenché automatiquement après chaque import CSV
// - Calcule pour chaque agent : commission propre + portefeuille + N1 + N2
// - Agrège le CA des filleuls et sous-filleuls (visible parent)
// - Sauvegarde snapshot dans commissions_calculees pour audit + cache
// ============================================================

import { getPaliers, calculerCommissionsPeriode, calculerCommissionCommande, isOrderUnderPortefeuille, type CommandeWithContext } from './commissions'

export interface AutoCalcResult {
  periode: { annee: number, mois: number }
  nb_commandes: number
  nb_agents_concernes: number
  total_commissions: number
  total_facturation: number
  total_marge: number
  agents: Array<{
    agent_id: number
    nom: string
    prenom: string
    niveau: number
    commission_propre: number
    commission_portefeuille: number
    commission_n1: number
    commission_n2: number
    total: number
    ca_propre: number
    ca_filleuls: number          // CA cumulé des filleuls (N+1)
    ca_sous_filleuls: number     // CA cumulé des sous-filleuls (N+2)
  }>
}

/**
 * Récupère les commandes d'une période avec contexte complet (agent, parent, grand-parent)
 */
async function fetchCommandesPeriode(
  db: D1Database,
  annee: number,
  mois: number
): Promise<CommandeWithContext[]> {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finMois = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finMois).padStart(2, '0')}`

  const { results } = await db.prepare(`
    SELECT
      c.id, c.date_commande, c.montant_brut,
      m.id as marque_id, m.nom as marque_nom,
      m.is_portefeuille_proprietaire as marque_is_portefeuille,
      m.date_signature_portefeuille as marque_date_signature_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.is_portefeuille_proprietaire as restaurant_is_portefeuille,
      r.date_signature_portefeuille as restaurant_date_signature_portefeuille,
      r.tablette_sr_shop,
      r.agent_id,
      u.niveau as agent_niveau,
      u.parent_id as agent_parent_id,
      p.parent_id as agent_grand_parent_id
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users p ON u.parent_id = p.id
    WHERE c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
  `).bind(debut, fin).all() as any

  return results as CommandeWithContext[]
}

/**
 * Récupère pour chaque agent le CA cumulé de ses filleuls (N+1) et sous-filleuls (N+2).
 * Permet au parent de voir tout le CA en bas de sa branche.
 */
async function fetchCAFilleulsParAgent(
  db: D1Database,
  annee: number,
  mois: number
): Promise<Map<number, { ca_filleuls: number, ca_sous_filleuls: number }>> {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finMois = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finMois).padStart(2, '0')}`

  // CA des filleuls directs (N+1) : pour chaque parent, somme du CA des restos de ses enfants
  const { results: filleuls } = await db.prepare(`
    SELECT
      u.parent_id as parent_id,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN users u ON r.agent_id = u.id
    WHERE u.parent_id IS NOT NULL
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY u.parent_id
  `).bind(debut, fin).all() as any

  // CA des sous-filleuls (N+2) : pour chaque grand-parent, somme du CA des restos de ses petits-enfants
  const { results: sousFilleuls } = await db.prepare(`
    SELECT
      p.parent_id as grand_parent_id,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN users u ON r.agent_id = u.id
    JOIN users p ON u.parent_id = p.id
    WHERE p.parent_id IS NOT NULL
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY p.parent_id
  `).bind(debut, fin).all() as any

  const map = new Map<number, { ca_filleuls: number, ca_sous_filleuls: number }>()
  for (const f of filleuls as any[]) {
    map.set(f.parent_id, { ca_filleuls: f.ca, ca_sous_filleuls: 0 })
  }
  for (const sf of sousFilleuls as any[]) {
    const ex = map.get(sf.grand_parent_id) || { ca_filleuls: 0, ca_sous_filleuls: 0 }
    ex.ca_sous_filleuls = sf.ca
    map.set(sf.grand_parent_id, ex)
  }
  return map
}

/**
 * Calcule + sauvegarde le snapshot mensuel des commissions pour TOUS les agents.
 * Idempotent : si déjà calculé, écrase via ON CONFLICT (UNIQUE agent+période).
 */
export async function recalculerCommissionsPeriode(
  db: D1Database,
  annee: number,
  mois: number,
  source: string = 'auto_import'
): Promise<AutoCalcResult> {
  const [paliers, commandes, caFilleulsMap] = await Promise.all([
    getPaliers(db),
    fetchCommandesPeriode(db, annee, mois),
    fetchCAFilleulsParAgent(db, annee, mois)
  ])

  const calcul = calculerCommissionsPeriode(commandes, paliers)

  // ===== TRAÇABILITÉ 100% : persister la facturation + commission par commande =====
  for (const cmd of commandes) {
    // Portefeuille effectif uniquement à partir de la date de signature du contrat
    const isPortefeuille = isOrderUnderPortefeuille(cmd as any)
    const tablette = !!(cmd as any).tablette_sr_shop
    const calc = calculerCommissionCommande({
      montant_commande: cmd.montant_brut,
      tablette_sr_shop: tablette,
      is_portefeuille_proprietaire: isPortefeuille,
      agent_niveau: cmd.agent_niveau,
      has_parent: cmd.agent_parent_id !== null,
      has_grand_parent: cmd.agent_grand_parent_id !== null,
      paliers
    })
    const tauxPropre = cmd.montant_brut > 0
      ? Math.round((calc.commission_agent / cmd.montant_brut) * 10000) / 100
      : 0
    // Si portefeuille => commission_agent_montant = 0 et commission_portefeuille_montant = montant
    const commPortefeuille = isPortefeuille ? calc.commission_agent : 0
    const commPropre       = isPortefeuille ? 0 : calc.commission_agent
    await db.prepare(`
      UPDATE commandes SET
        montant_facture_resto         = ?,
        commission_agent_montant      = ?,
        commission_portefeuille_montant = ?,
        commission_n1_montant         = ?,
        commission_n2_montant         = ?,
        marge_dropeat_montant         = ?,
        commission_taux_propre        = ?,
        palier_facture_id             = ?,
        palier_agent_id               = ?,
        is_portefeuille_snapshot      = ?,
        is_tablette_snapshot          = ?,
        commission_calculee_at        = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      calc.facturation_restaurant,
      commPropre,
      commPortefeuille,
      calc.commission_parent,
      calc.commission_grand_parent,
      calc.marge_dropeat,
      tauxPropre,
      calc.palier_facture_id,
      calc.palier_agent_id,
      isPortefeuille ? 1 : 0,
      tablette ? 1 : 0,
      cmd.id
    ).run()
  }

  // Récupère les infos de tous les agents impliqués
  const agentIds = Array.from(calcul.par_agent.keys())
  let agentsInfo: any[] = []
  if (agentIds.length) {
    const ph = agentIds.map(() => '?').join(',')
    const { results } = await db.prepare(`
      SELECT id, nom, prenom, niveau, parent_id, email FROM users WHERE id IN (${ph})
    `).bind(...agentIds).all() as any
    agentsInfo = results
  }
  const agentInfoMap = new Map<number, any>()
  for (const a of agentsInfo) agentInfoMap.set(a.id, a)

  // CA propre par agent (commandes de SES restos)
  const caPropreMap = new Map<number, number>()
  for (const cmd of commandes) {
    if (cmd.agent_id) {
      caPropreMap.set(cmd.agent_id, (caPropreMap.get(cmd.agent_id) || 0) + cmd.montant_brut)
    }
  }
  // Ajouter les agents qui ont des filleuls mais pas leurs propres ventes
  for (const aid of caFilleulsMap.keys()) {
    if (!calcul.par_agent.has(aid)) {
      // Agent qui ne touche que des commissions descendantes → on le récupère quand même
      const u = await db.prepare('SELECT id, nom, prenom, niveau, parent_id, email FROM users WHERE id = ?')
        .bind(aid).first() as any
      if (u) agentInfoMap.set(u.id, u)
    }
  }

  // Liste finale = agents qui ont commission OU CA filleuls
  const allAgentIds = new Set<number>()
  for (const id of calcul.par_agent.keys()) allAgentIds.add(id)
  for (const id of caFilleulsMap.keys()) allAgentIds.add(id)

  const agentsResult: AutoCalcResult['agents'] = []

  for (const agentId of allAgentIds) {
    const detail = calcul.par_agent.get(agentId)
    const ca = caFilleulsMap.get(agentId) || { ca_filleuls: 0, ca_sous_filleuls: 0 }
    const info = agentInfoMap.get(agentId)
    if (!info) continue

    const caPropre = caPropreMap.get(agentId) || 0
    const row = {
      agent_id: agentId,
      nom: info.nom || '',
      prenom: info.prenom || '',
      niveau: info.niveau,
      commission_propre: detail?.commission_propre || 0,
      commission_portefeuille: detail?.commission_portefeuille || 0,
      commission_n1: detail?.commission_n1 || 0,
      commission_n2: detail?.commission_n2 || 0,
      total: detail?.total || 0,
      ca_propre: caPropre,
      ca_filleuls: ca.ca_filleuls,
      ca_sous_filleuls: ca.ca_sous_filleuls
    }
    agentsResult.push(row)

    // Snapshot DB (UPSERT)
    const existing = await db.prepare(
      'SELECT id FROM commissions_calculees WHERE agent_id = ? AND periode_annee = ? AND periode_mois = ?'
    ).bind(agentId, annee, mois).first() as any

    if (existing) {
      await db.prepare(`
        UPDATE commissions_calculees SET
          commission_propre = ?, commission_portefeuille = ?, commission_n1 = ?, commission_n2 = ?,
          total = ?, nb_commandes_propres = ?, ca_propre = ?, ca_filleuls = ?, ca_sous_filleuls = ?,
          calcule_at = CURRENT_TIMESTAMP, source = ?
        WHERE id = ?
      `).bind(
        row.commission_propre, row.commission_portefeuille, row.commission_n1, row.commission_n2,
        row.total, detail?.nb_commandes_propres || 0,
        row.ca_propre, row.ca_filleuls, row.ca_sous_filleuls, source, existing.id
      ).run()
    } else {
      await db.prepare(`
        INSERT INTO commissions_calculees
          (agent_id, periode_annee, periode_mois, commission_propre, commission_portefeuille,
           commission_n1, commission_n2, total, nb_commandes_propres,
           ca_propre, ca_filleuls, ca_sous_filleuls, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        agentId, annee, mois,
        row.commission_propre, row.commission_portefeuille, row.commission_n1, row.commission_n2,
        row.total, detail?.nb_commandes_propres || 0,
        row.ca_propre, row.ca_filleuls, row.ca_sous_filleuls, source
      ).run()
    }
  }

  return {
    periode: { annee, mois },
    nb_commandes: calcul.totaux.nb_commandes,
    nb_agents_concernes: agentsResult.length,
    total_commissions: calcul.totaux.commissions_agents_total,
    total_facturation: calcul.totaux.facturation_dropeat,
    total_marge: calcul.totaux.marge_dropeat,
    agents: agentsResult
  }
}

/**
 * Détecte les périodes (mois) impactées par un import et recalcule chacune.
 * Utilisé après un import CSV pour ne recalculer que les mois concernés.
 */
export async function recalculerPeriodesImpactees(
  db: D1Database,
  importId: number
): Promise<AutoCalcResult[]> {
  // Récupère toutes les périodes (année+mois) distinctes des commandes de cet import
  const { results } = await db.prepare(`
    SELECT DISTINCT
      CAST(strftime('%Y', date_commande) AS INTEGER) as annee,
      CAST(strftime('%m', date_commande) AS INTEGER) as mois
    FROM commandes
    WHERE import_id = ?
  `).bind(importId).all() as any

  const calculs: AutoCalcResult[] = []
  for (const p of results as any[]) {
    const r = await recalculerCommissionsPeriode(db, p.annee, p.mois, 'auto_import')
    calculs.push(r)
  }
  return calculs
}

/**
 * Récupère un snapshot existant. Si null, calcule à la volée.
 */
export async function getOrComputeCommissions(
  db: D1Database,
  annee: number,
  mois: number,
  forceRecalc: boolean = false
): Promise<AutoCalcResult> {
  if (!forceRecalc) {
    const { results } = await db.prepare(`
      SELECT cc.*, u.nom, u.prenom, u.niveau, u.email
      FROM commissions_calculees cc
      JOIN users u ON cc.agent_id = u.id
      WHERE cc.periode_annee = ? AND cc.periode_mois = ?
      ORDER BY cc.total DESC
    `).bind(annee, mois).all() as any

    if (results.length > 0) {
      const totalCommissions = (results as any[]).reduce((s, r) => s + (r.total || 0), 0)
      return {
        periode: { annee, mois },
        nb_commandes: 0, // info perdue dans le snapshot agent
        nb_agents_concernes: results.length,
        total_commissions: totalCommissions,
        total_facturation: 0,
        total_marge: 0,
        agents: (results as any[]).map(r => ({
          agent_id: r.agent_id,
          nom: r.nom,
          prenom: r.prenom,
          niveau: r.niveau,
          commission_propre: r.commission_propre,
          commission_portefeuille: r.commission_portefeuille,
          commission_n1: r.commission_n1,
          commission_n2: r.commission_n2,
          total: r.total,
          ca_propre: r.ca_propre,
          ca_filleuls: r.ca_filleuls,
          ca_sous_filleuls: r.ca_sous_filleuls
        }))
      }
    }
  }
  return recalculerCommissionsPeriode(db, annee, mois, forceRecalc ? 'recalcul' : 'auto_import')
}
