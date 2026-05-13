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

export async function buildLignesFactureAgent(
  db: D1Database,
  agentId: number,
  annee: number,
  mois: number
): Promise<LigneCommissionAgent[]> {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`

  const lignes: LigneCommissionAgent[] = []

  // 1) Commissions propres + portefeuille sur SES restos (par marque)
  const { results: mesMarques } = await db.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      r.id as restaurant_id, r.nom as restaurant_nom,
      m.is_portefeuille_proprietaire as marque_pf,
      r.is_portefeuille_proprietaire as resto_pf,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.commission_agent_montant), 0) as comm_propre,
      COALESCE(SUM(c.commission_portefeuille_montant), 0) as comm_portefeuille
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut != 'annulee'
    WHERE r.agent_id = ?
    GROUP BY m.id
    HAVING (comm_propre + comm_portefeuille) > 0
  `).bind(debut, fin, agentId).all() as any

  for (const m of mesMarques as any[]) {
    if (m.comm_propre > 0) {
      lignes.push({
        libelle: `Commission standard — ${m.marque_nom} (${m.restaurant_nom})`,
        description: `${m.nb_commandes} commande(s) — Avril ${annee}/${String(mois).padStart(2,'0')}`,
        categorie: 'comm_propre',
        marque_id: m.marque_id,
        restaurant_id: m.restaurant_id,
        quantite: m.nb_commandes,
        prix_unitaire: m.nb_commandes > 0 ? m.comm_propre / m.nb_commandes : 0,
        montant_ht: m.comm_propre
      })
    }
    if (m.comm_portefeuille > 0) {
      lignes.push({
        libelle: `Commission Portefeuille 100% — ${m.marque_nom} (${m.restaurant_nom})`,
        description: `Marque/restaurant en portefeuille — ${m.nb_commandes} commande(s)`,
        categorie: 'comm_portefeuille',
        marque_id: m.marque_id,
        restaurant_id: m.restaurant_id,
        quantite: m.nb_commandes,
        prix_unitaire: m.nb_commandes > 0 ? m.comm_portefeuille / m.nb_commandes : 0,
        montant_ht: m.comm_portefeuille
      })
    }
  }

  // 2) Commissions N+1 sur ventes des filleuls directs (groupées par filleul)
  const { results: n1 } = await db.prepare(`
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
      AND c.statut != 'annulee'
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
  const { results: n2 } = await db.prepare(`
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
      AND c.statut != 'annulee'
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
 */
export async function buildLignesFactureRestaurant(
  db: D1Database,
  restaurantId: number,
  annee: number,
  mois: number
): Promise<LigneCommissionAgent[]> {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`

  const { results } = await db.prepare(`
    SELECT
      m.id as marque_id, m.nom as marque_nom,
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.montant_facture_resto), 0) as facturation
    FROM marques_virtuelles m
    LEFT JOIN commandes c ON c.marque_id = m.id
      AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut != 'annulee'
    WHERE m.restaurant_id = ?
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
