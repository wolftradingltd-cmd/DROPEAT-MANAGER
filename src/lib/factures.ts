// ============================================================
// MOTEUR DE FACTURATION DROPEAT
// ============================================================
// 2 types :
//   - agent_to_dropeat : agent facture DropEat ses commissions
//   - dropeat_to_resto : DropEat facture un restaurant
// ============================================================

export interface ProfilSociete {
  id?: number
  user_id?: number
  type_societe: string
  raison_sociale: string
  nom_commercial?: string
  forme_juridique?: string
  capital?: number
  siret?: string
  siren?: string
  numero_tva?: string
  rcs?: string
  ape_naf?: string
  company_number?: string
  vat_uk?: string
  adresse_rue?: string
  adresse_complement?: string
  code_postal?: string
  ville?: string
  pays?: string
  telephone?: string
  email_facturation?: string
  iban?: string
  bic?: string
  banque_nom?: string
  regime_tva?: string
  taux_tva?: number
  signature_url?: string
  logo_url?: string
  mentions_legales_extra?: string
  date_creation_entreprise?: string
  numero_assurance_pro?: string
}

/**
 * Génère le prochain numéro de facture pour un préfixe donné
 * Format : AGT-2026-04-0001 (agent) ou DRP-2026-04-R001 (DropEat→Resto)
 */
export async function getNextFactureNumero(
  db: D1Database,
  prefixe: string,
  padding: number = 4
): Promise<string> {
  // UPSERT atomique
  await db.prepare(`
    INSERT INTO facture_compteurs (prefixe, dernier_numero) VALUES (?, 1)
    ON CONFLICT(prefixe) DO UPDATE SET dernier_numero = dernier_numero + 1
  `).bind(prefixe).run()
  const r = await db.prepare(
    'SELECT dernier_numero FROM facture_compteurs WHERE prefixe = ?'
  ).bind(prefixe).first() as any
  const num = String(r.dernier_numero).padStart(padding, '0')
  return `${prefixe}-${num}`
}

/**
 * Mentions légales obligatoires France 2026 — auto-entrepreneur / société
 */
export function mentionsLegalesFR(profil: ProfilSociete): string[] {
  const lines: string[] = []
  if (profil.regime_tva === 'franchise_base') {
    lines.push('TVA non applicable, art. 293 B du CGI')
  }
  if (profil.type_societe === 'auto_entrepreneur') {
    lines.push('Auto-entrepreneur — dispensé d\'immatriculation au registre du commerce et des sociétés (RCS) et au répertoire des métiers (RM)')
  }
  // Mentions obligatoires loi LME / Code de commerce art. L441-9
  lines.push('Pénalités de retard : 3 fois le taux d\'intérêt légal en vigueur (Code de commerce art. L441-10).')
  lines.push('Indemnité forfaitaire pour frais de recouvrement : 40 € (Décret 2012-1115).')
  lines.push('Pas d\'escompte pour paiement anticipé.')
  if (profil.numero_assurance_pro) {
    lines.push(`Assurance professionnelle : ${profil.numero_assurance_pro}`)
  }
  if (profil.mentions_legales_extra) {
    lines.push(profil.mentions_legales_extra)
  }
  return lines
}

/**
 * Mentions légales obligatoires UK 2026 — Limited Company
 */
export function mentionsLegalesUK(profil: ProfilSociete): string[] {
  const lines: string[] = []
  lines.push(`${profil.raison_sociale} is a company registered in England and Wales.`)
  if (profil.company_number) {
    lines.push(`Company registration number: ${profil.company_number}`)
  }
  if (profil.vat_uk && profil.regime_tva === 'uk_vat_registered') {
    lines.push(`VAT registration number: ${profil.vat_uk}`)
  } else {
    lines.push('VAT: this business is not VAT registered.')
  }
  lines.push('Payment terms: 30 days net. Late Payment of Commercial Debts (Interest) Act 1998 applies — statutory interest 8% above Bank of England base rate plus £40 fixed sum per overdue invoice.')
  if (profil.mentions_legales_extra) {
    lines.push(profil.mentions_legales_extra)
  }
  return lines
}

export function mentionsLegales(profil: ProfilSociete): string[] {
  if ((profil.pays || '').toLowerCase().includes('kingdom') || profil.type_societe === 'ltd') {
    return mentionsLegalesUK(profil)
  }
  return mentionsLegalesFR(profil)
}

/**
 * Calcul des commissions d'un agent pour une période → lignes de facture détaillées
 * (commission propre, portefeuille, N+1 par filleul, N+2 par sous-filleul)
 */
export interface LigneCommissionAgent {
  libelle: string
  description: string
  categorie: 'comm_propre' | 'comm_portefeuille' | 'comm_n1' | 'comm_n2'
  marque_id?: number
  restaurant_id?: number
  agent_concerne_id?: number
  quantite: number
  prix_unitaire: number
  montant_ht: number
}

/**
 * Convertit (annee, mois) ou (date_debut, date_fin) en plage SQL standard
 * Retourne { debut: 'YYYY-MM-DD', fin: 'YYYY-MM-DDT23:59:59', label: '...' }
 */
export function resolvePeriode(opts: {
  annee?: number
  mois?: number
  date_debut?: string
  date_fin?: string
}): { debut: string; fin: string; label: string; type: 'mois' | 'jour' | 'semaine' | 'custom' } {
  if (opts.date_debut && opts.date_fin) {
    const d = opts.date_debut.substring(0, 10)
    const f = opts.date_fin.substring(0, 10)
    let type: 'jour' | 'semaine' | 'custom' = 'custom'
    if (d === f) type = 'jour'
    else {
      const diff = (new Date(f).getTime() - new Date(d).getTime()) / 86400000
      if (diff === 6) type = 'semaine'
    }
    const label = d === f ? d : `${d} → ${f}`
    return { debut: `${d}T00:00:00`, fin: `${f}T23:59:59`, label, type }
  }
  const annee = opts.annee!
  const mois = opts.mois!
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`
  return { debut, fin, label: `${annee}/${String(mois).padStart(2, '0')}`, type: 'mois' }
}

export async function buildLignesFactureAgent(
  db: D1Database,
  agentId: number,
  annee: number,
  mois: number,
  range?: { debut: string; fin: string },
  filters?: { restaurant_id?: number; marque_id?: number }
): Promise<LigneCommissionAgent[]> {
  const { debut, fin } = range
    ? { debut: range.debut, fin: range.fin }
    : resolvePeriode({ annee, mois })

  const restoFilter = filters?.restaurant_id ? Number(filters.restaurant_id) : null
  const marqueFilter = filters?.marque_id ? Number(filters.marque_id) : null

  const lignes: LigneCommissionAgent[] = []

  // 1) Commissions propres sur SES restos (par marque)
  //    ⚠️ EXCLUSION : les commandes en portefeuille propriétaire (5e resto OU 5e marque)
  //    NE figurent PAS sur la facture agent→DropEat.
  //    Elles sont facturées DIRECTEMENT au restaurant à 100% (facture agent→resto).
  //    + filtres optionnels resto_id / marque_id (pour facture ciblée)
  const propreSqlExtra: string[] = []
  const propreParams: any[] = [debut, fin, agentId]
  if (restoFilter) { propreSqlExtra.push('AND r.id = ?'); propreParams.push(restoFilter) }
  if (marqueFilter) { propreSqlExtra.push('AND m.id = ?'); propreParams.push(marqueFilter) }
  const { results: mesMarques } = await db.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      r.id as restaurant_id, r.nom as restaurant_nom,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.commission_agent_montant), 0) as comm_propre
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      AND COALESCE(m.is_portefeuille_proprietaire, 0) = 0
      AND COALESCE(r.is_portefeuille_proprietaire, 0) = 0
    WHERE r.agent_id = ?
      ${propreSqlExtra.join(' ')}
    GROUP BY m.id
    HAVING comm_propre > 0
  `).bind(...propreParams).all() as any

  for (const m of mesMarques as any[]) {
    lignes.push({
      libelle: `Commission standard — ${m.marque_nom} (${m.restaurant_nom})`,
      description: `${m.nb_commandes} commande(s) — ${annee}/${String(mois).padStart(2,'0')}`,
      categorie: 'comm_propre',
      marque_id: m.marque_id,
      restaurant_id: m.restaurant_id,
      quantite: m.nb_commandes,
      prix_unitaire: m.nb_commandes > 0 ? m.comm_propre / m.nb_commandes : 0,
      montant_ht: m.comm_propre
    })
  }

  // 2) Commissions N+1 sur ventes des filleuls directs (groupées par filleul)
  //    ⚠️ EXCLUSION : commandes en portefeuille du filleul (5e resto/marque) → pas de remontée N+1
  //    Si filtre resto/marque spécifique → skip (les lignes N+1/N+2 ne sont pas par resto)
  const skipN1N2 = !!(restoFilter || marqueFilter)
  const { results: n1 } = skipN1N2 ? { results: [] } : await db.prepare(`
    SELECT
      uChild.id as agent_id, uChild.nom, uChild.prenom,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.commission_n1_montant), 0) as comm_n1
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN users uChild ON r.agent_id = uChild.id
    WHERE uChild.parent_id = ?
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      AND COALESCE(m.is_portefeuille_proprietaire, 0) = 0
      AND COALESCE(r.is_portefeuille_proprietaire, 0) = 0
    GROUP BY uChild.id
    HAVING comm_n1 > 0
  `).bind(agentId, debut, fin).all() as any

  for (const x of n1 as any[]) {
    lignes.push({
      libelle: `Commission N+1 — ${x.prenom} ${x.nom}`,
      description: `Ventes du filleul direct — ${x.nb_commandes} commande(s)`,
      categorie: 'comm_n1',
      agent_concerne_id: x.agent_id,
      quantite: x.nb_commandes,
      prix_unitaire: x.nb_commandes > 0 ? x.comm_n1 / x.nb_commandes : 0,
      montant_ht: x.comm_n1
    })
  }

  // 3) Commissions N+2 sur ventes des sous-filleuls
  //    ⚠️ EXCLUSION : commandes en portefeuille du sous-filleul → pas de remontée N+2
  const { results: n2 } = skipN1N2 ? { results: [] } : await db.prepare(`
    SELECT
      uGrand.id as agent_id, uGrand.nom, uGrand.prenom,
      uChild.prenom as via_prenom, uChild.nom as via_nom,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.commission_n2_montant), 0) as comm_n2
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN users uGrand ON r.agent_id = uGrand.id
    JOIN users uChild ON uGrand.parent_id = uChild.id
    WHERE uChild.parent_id = ?
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      AND COALESCE(m.is_portefeuille_proprietaire, 0) = 0
      AND COALESCE(r.is_portefeuille_proprietaire, 0) = 0
    GROUP BY uGrand.id
    HAVING comm_n2 > 0
  `).bind(agentId, debut, fin).all() as any

  for (const x of n2 as any[]) {
    lignes.push({
      libelle: `Commission N+2 — ${x.prenom} ${x.nom}`,
      description: `Via ${x.via_prenom} ${x.via_nom} — ${x.nb_commandes} commande(s)`,
      categorie: 'comm_n2',
      agent_concerne_id: x.agent_id,
      quantite: x.nb_commandes,
      prix_unitaire: x.nb_commandes > 0 ? x.comm_n2 / x.nb_commandes : 0,
      montant_ht: x.comm_n2
    })
  }

  return lignes
}

/**
 * Construit les lignes facture DropEat → restaurant (par marque)
 * ⚠️ EXCLUSION : commandes en portefeuille propriétaire (5e resto OU 5e marque)
 *    NE SONT PAS facturées par DropEat car l'agent les facture en direct à 100%.
 */
export async function buildLignesFactureRestaurant(
  db: D1Database,
  restaurantId: number,
  annee: number,
  mois: number,
  range?: { debut: string; fin: string }
): Promise<LigneCommissionAgent[]> {
  const { debut, fin } = range
    ? { debut: range.debut, fin: range.fin }
    : resolvePeriode({ annee, mois })

  // On récupère aussi le flag resto pour exclure si le resto entier est portefeuille
  const resto = await db.prepare(
    'SELECT COALESCE(is_portefeuille_proprietaire, 0) as resto_pf FROM restaurants WHERE id = ?'
  ).bind(restaurantId).first() as any
  if (resto?.resto_pf) {
    // Restaurant entièrement en portefeuille : DropEat ne facture rien
    return []
  }

  const { results } = await db.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.montant_facture_resto), 0) as facturation
    FROM marques_virtuelles m
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    WHERE m.restaurant_id = ?
      AND COALESCE(m.is_portefeuille_proprietaire, 0) = 0
    GROUP BY m.id
    HAVING facturation > 0
  `).bind(debut, fin, restaurantId).all() as any

  return (results as any[]).map(r => ({
    libelle: `Service DropEat — ${r.marque_nom}`,
    description: `${r.nb_commandes} commande(s) — CA brut ${r.ca.toFixed(2)} €`,
    categorie: 'comm_propre' as const,
    marque_id: r.marque_id,
    restaurant_id: restaurantId,
    quantite: r.nb_commandes,
    prix_unitaire: r.nb_commandes > 0 ? r.facturation / r.nb_commandes : 0,
    montant_ht: r.facturation
  }))
}

/**
 * Construit les lignes facture AGENT → RESTAURANT (portefeuille 100%)
 * Règle :
 *   - L'agent facture en direct le restaurant à 100% sur les commandes des
 *     marques/restos en portefeuille propriétaire (5e marque OU 5e restaurant).
 *   - Pas de commission N+1/N+2 ici (déjà exclues côté commissions.ts ligne 169).
 *   - DropEat ne touche rien sur ces commandes.
 *
 * @param agentId    L'agent qui émet la facture
 * @param restaurantId Le restaurant facturé (obligatoire : c'est lui qui paie)
 * @param annee / mois  Période
 */
export async function buildLignesFactureAgentResto(
  db: D1Database,
  agentId: number,
  restaurantId: number,
  annee: number,
  mois: number,
  range?: { debut: string; fin: string }
): Promise<LigneCommissionAgent[]> {
  const { debut, fin } = range
    ? { debut: range.debut, fin: range.fin }
    : resolvePeriode({ annee, mois })

  // On ne prend QUE les marques en portefeuille (marque PF OU resto entier PF)
  // ET on filtre sur restaurant_id + agent_id (sécurité : l'agent ne peut facturer
  // que les commandes des restaurants qu'il a apportés)
  const { results } = await db.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      r.id as restaurant_id, r.nom as restaurant_nom,
      m.is_portefeuille_proprietaire as marque_pf,
      r.is_portefeuille_proprietaire as resto_pf,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.commission_portefeuille_montant), 0) as comm_portefeuille,
      COALESCE(SUM(c.montant_facture_resto), 0) as facturation_resto
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    WHERE r.id = ?
      AND r.agent_id = ?
      AND (
        COALESCE(m.is_portefeuille_proprietaire, 0) = 1
        OR COALESCE(r.is_portefeuille_proprietaire, 0) = 1
      )
    GROUP BY m.id
    HAVING nb_commandes > 0
  `).bind(debut, fin, restaurantId, agentId).all() as any

  const lignes: LigneCommissionAgent[] = []
  for (const m of results as any[]) {
    // Montant à 100% pour l'agent = ce qui aurait été facturé au resto par DropEat
    // + la part de commission DropEat (puisqu'ici DropEat ne prend rien).
    // En pratique : on facture le montant_facture_resto (ce que paie le resto normalement)
    // entièrement à l'agent. La marge DropEat = 0 sur ces commandes.
    const montant = m.facturation_resto > 0 ? m.facturation_resto : m.comm_portefeuille
    if (montant <= 0) continue

    const motif = m.marque_pf && m.resto_pf
      ? 'Marque + restaurant en portefeuille propriétaire'
      : m.resto_pf
        ? 'Restaurant en portefeuille propriétaire (5e restaurant)'
        : 'Marque en portefeuille propriétaire (5e marque)'

    lignes.push({
      libelle: `Service direct 100% — ${m.marque_nom}`,
      description: `${motif} — ${m.nb_commandes} commande(s) — CA brut ${m.ca.toFixed(2)} €`,
      categorie: 'comm_portefeuille',
      marque_id: m.marque_id,
      restaurant_id: m.restaurant_id,
      quantite: m.nb_commandes,
      prix_unitaire: m.nb_commandes > 0 ? montant / m.nb_commandes : 0,
      montant_ht: montant
    })
  }
  return lignes
}

/**
 * Retourne la liste des restaurants en portefeuille propriétaire d'un agent
 * (5e restaurant OU ayant au moins une marque en portefeuille) pour lesquels
 * il y a des commandes sur la période → candidats à facturation agent→resto.
 */
export async function listRestosPortefeuilleAvecCommandes(
  db: D1Database,
  agentId: number,
  annee: number,
  mois: number,
  range?: { debut: string; fin: string }
): Promise<Array<{
  restaurant_id: number
  restaurant_nom: string
  resto_pf: number
  nb_marques_pf: number
  nb_commandes: number
  ca: number
  montant_facturable: number
}>> {
  const { debut, fin } = range
    ? { debut: range.debut, fin: range.fin }
    : resolvePeriode({ annee, mois })

  const { results } = await db.prepare(`
    SELECT
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.is_portefeuille_proprietaire as resto_pf,
      SUM(CASE WHEN m.is_portefeuille_proprietaire = 1 THEN 1 ELSE 0 END) as nb_marques_pf,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.montant_facture_resto), 0) as montant_facturable
    FROM restaurants r
    JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      AND (
        COALESCE(m.is_portefeuille_proprietaire, 0) = 1
        OR COALESCE(r.is_portefeuille_proprietaire, 0) = 1
      )
    WHERE r.agent_id = ?
      AND (
        COALESCE(r.is_portefeuille_proprietaire, 0) = 1
        OR EXISTS (
          SELECT 1 FROM marques_virtuelles m2
          WHERE m2.restaurant_id = r.id AND m2.is_portefeuille_proprietaire = 1
        )
      )
    GROUP BY r.id
    HAVING nb_commandes > 0
    ORDER BY r.nom
  `).bind(debut, fin, agentId).all() as any

  return results as any[]
}
