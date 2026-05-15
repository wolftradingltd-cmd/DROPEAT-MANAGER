// Routes pour l'espace AGENT COMMERCIAL
// Visibilité Option A : transparente (l'agent voit toute sa branche)
// Permissions : TOUT (création/édition/suppression de ses restos, marques, imports CSV)
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { isRangPortefeuille, getPaliers, calculerCommissionsPeriode, type CommandeWithContext } from '../lib/commissions'
import { parseCsv, detectColumns, parseNumber, parseDate } from '../lib/csv-parser'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireAuth)

/** Récupère tous les agent_id de la branche d'un agent (lui + descendants) */
async function getBranchAgentIds(db: D1Database, userId: number): Promise<number[]> {
  const ids: number[] = [userId]
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    const { results } = await db.prepare('SELECT id FROM users WHERE parent_id = ?').bind(cur).all() as any
    for (const r of results) { ids.push(r.id); queue.push(r.id) }
  }
  return ids
}

/** Recalcule les rangs Portefeuille des restaurants d'un agent. */
async function recalculerPortefeuilleAgent(db: D1Database, agentId: number) {
  if (!agentId) return
  const { results } = await db.prepare(
    'SELECT id FROM restaurants WHERE agent_id = ? ORDER BY date_signature ASC, id ASC'
  ).bind(agentId).all() as any
  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    const isPort = isRangPortefeuille(rang) ? 1 : 0
    await db.prepare('UPDATE restaurants SET rang_apport = ?, is_portefeuille_proprietaire = ? WHERE id = ?')
      .bind(rang, isPort, results[i].id).run()
  }
}

async function recalculerPortefeuilleMarques(db: D1Database, restaurantId: number) {
  const resto = await db.prepare('SELECT is_portefeuille_proprietaire FROM restaurants WHERE id = ?')
    .bind(restaurantId).first() as any
  const restoPort = !!resto?.is_portefeuille_proprietaire
  const { results } = await db.prepare(
    'SELECT id FROM marques_virtuelles WHERE restaurant_id = ? ORDER BY date_lancement ASC, id ASC'
  ).bind(restaurantId).all() as any
  for (let i = 0; i < results.length; i++) {
    const rang = i + 1
    const isPort = restoPort ? 1 : (isRangPortefeuille(rang) ? 1 : 0)
    await db.prepare('UPDATE marques_virtuelles SET rang_creation = ?, is_portefeuille_proprietaire = ? WHERE id = ?')
      .bind(rang, isPort, results[i].id).run()
  }
}

// ============================================================
// PROFIL & BRANCHE
// ============================================================
app.get('/me', async (c) => {
  const me = c.get('user')
  const u = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.nom, u.prenom, u.telephone, u.niveau, u.parent_id, u.iban,
           p.nom as parent_nom, p.prenom as parent_prenom
    FROM users u LEFT JOIN users p ON u.parent_id = p.id WHERE u.id = ?
  `).bind(me.id).first() as any

  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const stats: any = {}
  const cnt = async (q: string, p: any[] = []) => {
    const r = await c.env.DB.prepare(q).bind(...p).first() as any
    return r?.c || 0
  }
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  stats.nb_restaurants = await cnt(`SELECT COUNT(*) as c FROM restaurants WHERE agent_id IN ${inClause}`, branchIds)
  stats.nb_restaurants_propres = await cnt('SELECT COUNT(*) as c FROM restaurants WHERE agent_id = ?', [me.id])
  stats.nb_marques = await cnt(`
    SELECT COUNT(*) as c FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id IN ${inClause}`, branchIds)
  stats.nb_sous_agents = await cnt('SELECT COUNT(*) as c FROM users WHERE parent_id = ?', [me.id])

  // Compter les restos qui me restent avant prochain Portefeuille (5,10,15...)
  const myRestos = await cnt('SELECT COUNT(*) as c FROM restaurants WHERE agent_id = ?', [me.id])
  const palier = 5
  const reste_avant_portefeuille = palier - (myRestos % palier)

  return c.json({ user: u, branche_ids: branchIds, stats, reste_avant_portefeuille })
})

// ============================================================
// ARBORESCENCE COMPLÈTE — vue CRM commercial / MLM senior
// GET /api/agent/mes-restaurants/tree?annee=&mois=&date_debut=&date_fin=
//
// Renvoie pour chaque restaurant de la branche :
//   - identité complète (gérant, RIB manuel, etc.)
//   - marques associées (avec statuts, accès Uber, tablette, CA, commissions)
//   - sous-agents éventuellement liés (chaîne MLM)
//   - checklist complète (KBIS, CNI, RIB, contrat, accès Uber, tablette, onboarding, validation)
//   - documents fournis (count par type)
//   - KPI : CA, commissions, marges, nb commandes, dernière activité
//   - alertes : documents manquants, marques refusées, signature portefeuille
// ============================================================
app.get('/mes-restaurants/tree', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`

  // Période optionnelle pour filtrer les KPI (par défaut : 12 derniers mois)
  const dateDebut = c.req.query('date_debut') || null
  const dateFin = c.req.query('date_fin') || null
  let rangeDebut = dateDebut, rangeFin = dateFin
  if (!rangeDebut || !rangeFin) {
    const an = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
    const mo = c.req.query('mois') ? parseInt(c.req.query('mois')!) : null
    if (mo) {
      rangeDebut = `${an}-${String(mo).padStart(2, '0')}-01`
      const lastDay = new Date(an, mo, 0).getDate()
      rangeFin = `${an}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`
    } else {
      // 12 derniers mois
      const now = new Date()
      const past = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      rangeDebut = past.toISOString().substring(0, 10)
      rangeFin = now.toISOString().substring(0, 10) + ' 23:59:59'
    }
  }

  // 1) Tous les restaurants de la branche avec leur fiche complète + KPI agrégés
  const { results: restos } = await c.env.DB.prepare(`
    SELECT r.*,
      u.id as agent_uid, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
      u.email as agent_email,
      p.id as parent_uid, p.nom as parent_nom, p.prenom as parent_prenom,
      (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
      (SELECT COUNT(*) FROM marques_virtuelles m
        WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
      (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as nb_commandes_total,
      (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
          AND c.date_commande >= ? AND c.date_commande <= ?) as nb_commandes_periode,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as ca_total,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
          AND c.date_commande >= ? AND c.date_commande <= ?) as ca_periode,
      (SELECT COALESCE(SUM(c.commission_agent_montant)+SUM(c.commission_portefeuille_montant),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
          AND c.date_commande >= ? AND c.date_commande <= ?) as commissions_periode,
      (SELECT MAX(c.date_commande) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        WHERE m.restaurant_id = r.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as derniere_commande
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users p ON u.parent_id = p.id
    WHERE r.agent_id IN ${inClause}
    ORDER BY r.created_at DESC
  `).bind(rangeDebut, rangeFin, rangeDebut, rangeFin, rangeDebut, rangeFin, ...branchIds).all() as any

  const restoIds = (restos as any[]).map(r => r.id)
  if (restoIds.length === 0) {
    return c.json({ tree: [], stats: { nb_restos: 0, nb_marques: 0, nb_portefeuille: 0, ca_total: 0, commissions_total: 0 }, periode: { debut: rangeDebut, fin: rangeFin } })
  }
  const ph = restoIds.map(() => '?').join(',')

  // 2) Toutes les marques + KPI
  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.id, m.restaurant_id, m.nom, m.plateforme, m.uber_store_id,
      m.rang_creation, m.is_portefeuille_proprietaire,
      m.date_signature_portefeuille, m.date_lancement, m.actif, m.statut_marque,
      m.uber_manager_email, m.uber_manager_url,
      m.uber_orders_email, m.uber_orders_url,
      m.tablette_fournie, m.tablette_serial,
      m.commission_info, m.acces_operationnels,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as nb_commandes_total,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as nb_commandes_periode,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as ca_total,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as ca_periode,
      (SELECT COALESCE(SUM(c.commission_agent_montant)+SUM(c.commission_portefeuille_montant),0)
        FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as commissions_periode,
      (SELECT MAX(c.date_commande) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as derniere_commande
    FROM marques_virtuelles m
    WHERE m.restaurant_id IN (${ph})
    ORDER BY m.rang_creation ASC, m.id ASC
  `).bind(rangeDebut, rangeFin, rangeDebut, rangeFin, rangeDebut, rangeFin, ...restoIds).all() as any

  const marquesMap: Record<number, any[]> = {}
  for (const mm of marques as any[]) {
    if (!marquesMap[mm.restaurant_id]) marquesMap[mm.restaurant_id] = []
    marquesMap[mm.restaurant_id].push(mm)
  }

  // 3) Checklist complète par resto (statut_resto + items)
  const { results: checks } = await c.env.DB.prepare(`
    SELECT restaurant_id, code, libelle, obligatoire, statut, ressource_type, date_validation
    FROM checklist_items
    WHERE restaurant_id IN (${ph})
    ORDER BY restaurant_id, obligatoire DESC, code
  `).bind(...restoIds).all() as any
  const checksMap: Record<number, any[]> = {}
  for (const ci of checks as any[]) {
    if (!checksMap[ci.restaurant_id]) checksMap[ci.restaurant_id] = []
    checksMap[ci.restaurant_id].push(ci)
  }

  // 4) Documents : liste détaillée par type pour chaque resto (avec id, statut, nom_fichier, mime…)
  const { results: docsList } = await c.env.DB.prepare(`
    SELECT id, restaurant_id, type_document, nom_fichier, mime_type, taille_octets,
      url_externe, date_emission, date_expiration, statut, created_at,
      (contenu_base64 IS NOT NULL) as has_content
    FROM restaurant_documents
    WHERE restaurant_id IN (${ph})
    ORDER BY created_at DESC
  `).bind(...restoIds).all() as any
  // Structure : docsMap[restoId][type_document] = { fourni, valide, fichiers: [...] }
  const docsMap: Record<number, Record<string, { fourni: number, valide: number, fichiers: any[] }>> = {}
  for (const d of docsList as any[]) {
    if (!docsMap[d.restaurant_id]) docsMap[d.restaurant_id] = {}
    if (!docsMap[d.restaurant_id][d.type_document]) {
      docsMap[d.restaurant_id][d.type_document] = { fourni: 0, valide: 0, fichiers: [] }
    }
    docsMap[d.restaurant_id][d.type_document].fourni += 1
    if (d.statut === 'valide') docsMap[d.restaurant_id][d.type_document].valide += 1
    docsMap[d.restaurant_id][d.type_document].fichiers.push({
      id: d.id, nom_fichier: d.nom_fichier, mime_type: d.mime_type,
      taille_octets: d.taille_octets, url_externe: d.url_externe,
      date_emission: d.date_emission, date_expiration: d.date_expiration,
      statut: d.statut, has_content: !!d.has_content, created_at: d.created_at
    })
  }

  // 5) Sous-agents éventuels = agents de niveau > moi qui sont rattachés au resto via agent_id
  //    Construit la chaîne MLM : me → ... → agent_id_resto
  const tree = (restos as any[]).map(r => {
    const restoMarques = marquesMap[r.id] || []
    const checklist = checksMap[r.id] || []
    const checklistOk = checklist.filter((x: any) => x.obligatoire && x.statut === 'valide').length
    const checklistTotalObl = checklist.filter((x: any) => x.obligatoire).length
    const docsByType = docsMap[r.id] || {}

    // Compte des alertes / blocages
    const docsManquants: string[] = []
    for (const code of ['kbis', 'piece_identite', 'rib', 'contrat']) {
      if (!docsByType[code] || docsByType[code].valide === 0) docsManquants.push(code)
    }
    // RIB : si pas de doc valide, on regarde si IBAN manuel renseigné
    const ribManuelOk = !!(r.rib_iban && r.rib_iban.trim().length > 0)
    if (docsManquants.includes('rib') && ribManuelOk) {
      const idx = docsManquants.indexOf('rib')
      if (idx >= 0) docsManquants.splice(idx, 1)
    }

    return {
      ...r,
      agent: r.agent_uid ? {
        id: r.agent_uid, nom: r.agent_nom, prenom: r.agent_prenom,
        email: r.agent_email, niveau: r.agent_niveau,
        parent: r.parent_uid ? {
          id: r.parent_uid, nom: r.parent_nom, prenom: r.parent_prenom
        } : null
      } : null,
      marques: restoMarques,
      checklist,
      checklist_progression: {
        ok: checklistOk,
        total_obligatoire: checklistTotalObl,
        pct: checklistTotalObl ? Math.round((checklistOk / checklistTotalObl) * 100) : 0
      },
      documents: docsByType,
      rib_manuel_ok: ribManuelOk,
      docs_manquants: docsManquants,
      alertes: {
        nb_docs_manquants: docsManquants.length,
        bloque_signature: docsManquants.length > 0,
        nb_marques_refusees: restoMarques.filter((m: any) => m.statut_marque === 'refusee').length,
        nb_marques_en_attente: restoMarques.filter((m: any) => m.statut_marque === 'en_attente' || m.statut_marque === 'en_creation').length
      }
    }
  })

  // Stats globales
  const stats = {
    nb_restos: tree.length,
    nb_marques: (marques as any[]).length,
    nb_portefeuille: (marques as any[]).filter((m: any) => m.is_portefeuille_proprietaire).length,
    ca_total_periode: tree.reduce((s, r) => s + (r.ca_periode || 0), 0),
    ca_total_global: tree.reduce((s, r) => s + (r.ca_total || 0), 0),
    commissions_periode: tree.reduce((s, r) => s + (r.commissions_periode || 0), 0),
    nb_docs_manquants_total: tree.reduce((s, r) => s + (r.alertes.nb_docs_manquants || 0), 0)
  }

  return c.json({ tree, stats, periode: { debut: rangeDebut, fin: rangeFin } })
})

// ============================================================
// PORTEFEUILLE 100% — vue dédiée des marques/restos portefeuille de l'agent
// GET /api/agent/portefeuille?annee=&mois=
// ============================================================
app.get('/portefeuille', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`

  // Période (par défaut : mois courant)
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`

  // Marques portefeuille de la branche
  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.plateforme, m.uber_store_id,
      m.is_portefeuille_proprietaire, m.date_signature_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom, r.ville,
      r.agent_id, u.nom as agent_nom, u.prenom as agent_prenom,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as nb_commandes_periode,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as ca_periode,
      (SELECT COALESCE(SUM(c.commission_portefeuille_montant),0)
        FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        AND c.date_commande >= ? AND c.date_commande <= ?) as commissions_portefeuille_periode,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as nb_commandes_total,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as ca_total
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.agent_id IN ${inClause}
      AND m.is_portefeuille_proprietaire = 1
    ORDER BY ca_periode DESC, m.nom
  `).bind(debut, fin, debut, fin, debut, fin, ...branchIds).all() as any

  const stats = {
    nb_marques_portefeuille: (marques as any[]).length,
    ca_periode: (marques as any[]).reduce((s: number, m: any) => s + (m.ca_periode || 0), 0),
    commissions_periode: (marques as any[]).reduce((s: number, m: any) => s + (m.commissions_portefeuille_periode || 0), 0),
    nb_commandes_periode: (marques as any[]).reduce((s: number, m: any) => s + (m.nb_commandes_periode || 0), 0)
  }

  return c.json({ marques_portefeuille: marques, stats, periode: { annee, mois, debut, fin } })
})

// ============================================================
// MES RESTAURANTS (les miens + ceux de ma branche)
// ============================================================
app.get('/restaurants', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
      (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
      (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
      (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.agent_id IN ${inClause}
    ORDER BY r.created_at DESC
  `).bind(...branchIds).all()
  return c.json({ restaurants: results })
})

app.get('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id WHERE r.id = ?
  `).bind(id).first() as any
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)
  if (!branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total
    FROM marques_virtuelles m WHERE m.restaurant_id = ? ORDER BY m.rang_creation, m.id
  `).bind(id).all()
  return c.json({ restaurant: r, marques })
})

app.post('/restaurants', async (c) => {
  const me = c.get('user')
  const data = await c.req.json()
  const {
    nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, date_signature, date_lancement, tablette_sr_shop, notes, agent_id,
    // Nouveaux champs : gérant + RIB manuel
    gerant_nom, gerant_prenom, gerant_telephone, gerant_email,
    rib_titulaire, rib_iban, rib_bic, rib_banque_nom, rib_references
  } = data
  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  // L'agent peut affecter le resto à lui-même OU à un de ses sous-agents
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const targetAgentId = agent_id || me.id
  if (!branchIds.includes(targetAgentId)) return c.json({ error: 'Vous ne pouvez pas affecter à cet agent' }, 403)

  const r = await c.env.DB.prepare(`
    INSERT INTO restaurants (nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
      contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes,
      gerant_nom, gerant_prenom, gerant_telephone, gerant_email,
      rib_titulaire, rib_iban, rib_bic, rib_banque_nom, rib_references)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(nom, raison_sociale || null, siret || null, adresse || null, code_postal || null, ville || null,
    pays || 'France', telephone || null, email || null, contact_nom || null, targetAgentId,
    date_signature || null, date_lancement || null, tablette_sr_shop ? 1 : 0, notes || null,
    gerant_nom || null, gerant_prenom || null, gerant_telephone || null, gerant_email || null,
    rib_titulaire || null, rib_iban || null, rib_bic || null, rib_banque_nom || null, rib_references || null
  ).run()
  await recalculerPortefeuilleAgent(c.env.DB, targetAgentId)

  // Pré-créer la checklist standard pour ce nouveau resto
  const newId = r.meta.last_row_id as number
  const checklistItems = [
    ['kbis', 'Extrait KBIS', 1, 'document'],
    ['piece_identite', 'CNI / Pièce d\'identité', 1, 'document'],
    ['rib', 'RIB / IBAN', 1, 'document'],
    ['contrat', 'Contrat signé DropEat', 1, 'document'],
    ['acces_uber_manager', 'Accès Uber Eats Manager', 1, 'compte_plateforme'],
    ['acces_uber_orders', 'Accès Uber Eats Orders / Tablette', 1, 'compte_plateforme'],
    ['tablette', 'Tablette de prise de commandes', 0, 'champ_resto'],
    ['onboarding', 'Onboarding terminé', 1, 'champ_resto'],
    ['validation_admin', 'Validation administrative', 1, 'champ_resto']
  ]
  for (const [code, libelle, oblig, restype] of checklistItems) {
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
      VALUES (?, ?, ?, ?, 'non_renseigne', ?)
    `).bind(newId, code, libelle, oblig, restype).run().catch(() => {})
  }

  return c.json({ success: true, id: newId })
})

app.put('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const old = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!old || !branchIds.includes(old.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const data = await c.req.json()
  const {
    nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, date_signature, date_lancement, tablette_sr_shop, actif, notes, agent_id,
    gerant_nom, gerant_prenom, gerant_telephone, gerant_email,
    rib_titulaire, rib_iban, rib_bic, rib_banque_nom, rib_references
  } = data
  const targetAgentId = agent_id || old.agent_id
  if (!branchIds.includes(targetAgentId)) return c.json({ error: 'Réassignation hors branche interdite' }, 403)

  // Construction dynamique : on ne met à jour que les champs présents dans data
  const updates: string[] = []
  const params: any[] = []
  const setField = (col: string, val: any) => { updates.push(`${col} = ?`); params.push(val === undefined ? null : (val === '' ? null : val)) }
  setField('nom', nom)
  setField('raison_sociale', raison_sociale)
  setField('siret', siret)
  setField('adresse', adresse)
  setField('code_postal', code_postal)
  setField('ville', ville)
  setField('pays', pays || 'France')
  setField('telephone', telephone)
  setField('email', email)
  setField('contact_nom', contact_nom)
  setField('agent_id', targetAgentId)
  setField('date_signature', date_signature)
  setField('date_lancement', date_lancement)
  updates.push('tablette_sr_shop = ?'); params.push(tablette_sr_shop ? 1 : 0)
  updates.push('actif = ?'); params.push(actif !== undefined ? (actif ? 1 : 0) : 1)
  setField('notes', notes)
  // Champs étendus (peuvent être undefined si on n'envoie qu'une partie du form)
  if (gerant_nom !== undefined) setField('gerant_nom', gerant_nom)
  if (gerant_prenom !== undefined) setField('gerant_prenom', gerant_prenom)
  if (gerant_telephone !== undefined) setField('gerant_telephone', gerant_telephone)
  if (gerant_email !== undefined) setField('gerant_email', gerant_email)
  if (rib_titulaire !== undefined) setField('rib_titulaire', rib_titulaire)
  if (rib_iban !== undefined) setField('rib_iban', rib_iban)
  if (rib_bic !== undefined) setField('rib_bic', rib_bic)
  if (rib_banque_nom !== undefined) setField('rib_banque_nom', rib_banque_nom)
  if (rib_references !== undefined) setField('rib_references', rib_references)
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)

  await c.env.DB.prepare(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()

  if (old.agent_id !== targetAgentId) {
    await recalculerPortefeuilleAgent(c.env.DB, old.agent_id)
    await recalculerPortefeuilleAgent(c.env.DB, targetAgentId)
  } else {
    await recalculerPortefeuilleMarques(c.env.DB, parseInt(id))
  }
  return c.json({ success: true })
})

app.delete('/restaurants/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!r || !branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(id).run()
  await recalculerPortefeuilleAgent(c.env.DB, r.agent_id)
  return c.json({ success: true })
})

// ============================================================
// MARQUES VIRTUELLES
// ============================================================
app.post('/restaurants/:id/marques', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  if (!r || !branchIds.includes(r.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const {
    nom, uber_store_id, plateforme, date_lancement, notes,
    uber_manager_email, uber_manager_password, uber_manager_url,
    uber_orders_email, uber_orders_password, uber_orders_url,
    tablette_fournie, tablette_serial, tablette_notes,
    commission_info, acces_operationnels, statut_marque
  } = await c.req.json()
  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const res = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles (
      restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes,
      uber_manager_email, uber_manager_password, uber_manager_url,
      uber_orders_email, uber_orders_password, uber_orders_url,
      tablette_fournie, tablette_serial, tablette_notes,
      commission_info, acces_operationnels, statut_marque
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, nom, uber_store_id || null, plateforme || 'uber_eats', date_lancement || null, notes || null,
    uber_manager_email || null, uber_manager_password || null, uber_manager_url || null,
    uber_orders_email || null, uber_orders_password || null, uber_orders_url || null,
    tablette_fournie ? 1 : 0, tablette_serial || null, tablette_notes || null,
    commission_info || null, acces_operationnels || null, statut_marque || 'en_creation'
  ).run()
  await recalculerPortefeuilleMarques(c.env.DB, id)
  return c.json({ success: true, id: res.meta.last_row_id })
})

app.put('/marques/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const data = await c.req.json()
  // Champs gérables côté agent (whitelist)
  const allowed = [
    'nom', 'uber_store_id', 'plateforme', 'date_lancement', 'actif', 'notes',
    'uber_manager_email', 'uber_manager_password', 'uber_manager_url',
    'uber_orders_email', 'uber_orders_password', 'uber_orders_url',
    'tablette_fournie', 'tablette_serial', 'tablette_notes',
    'commission_info', 'acces_operationnels', 'statut_marque'
  ]
  const updates: string[] = []
  const params: any[] = []
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      updates.push(`${k} = ?`)
      let v = data[k]
      if (k === 'tablette_fournie' || k === 'actif') v = v ? 1 : 0
      params.push(v === '' ? null : v)
    }
  }
  if (!updates.length) return c.json({ error: 'Aucun champ à mettre à jour' }, 400)
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  await c.env.DB.prepare(`UPDATE marques_virtuelles SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

app.delete('/marques/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(id).run()
  await recalculerPortefeuilleMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

// ============================================================
// IMPORT CSV
// ============================================================
app.post('/imports/preview', async (c) => {
  const { csv } = await c.req.json()
  if (!csv) return c.json({ error: 'CSV requis' }, 400)
  const { rows, headers, delimiter } = parseCsv(csv)
  const detected = detectColumns(headers)
  return c.json({ headers, delimiter, detected, nb_lignes: rows.length, apercu: rows.slice(0, 5) })
})

app.post('/imports', async (c) => {
  const me = c.get('user')
  const { marque_id, csv, nom_fichier, mapping } = await c.req.json()
  if (!marque_id || !csv) return c.json({ error: 'marque_id et csv requis' }, 400)

  // Vérifier la marque appartient à la branche
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const m = await c.env.DB.prepare(`
    SELECT r.agent_id FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(marque_id).first() as any
  if (!m || !branchIds.includes(m.agent_id)) return c.json({ error: 'Accès refusé' }, 403)

  const { rows, headers } = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'CSV vide' }, 400)

  const cols = mapping || detectColumns(headers)
  if (!cols.date) return c.json({ error: 'Colonne date introuvable' }, 400)
  if (!cols.total && !cols.net) return c.json({ error: 'Colonne montant introuvable' }, 400)

  let nb_importees = 0, nb_doublons = 0, nb_erreurs = 0, total_montant = 0
  let date_min: string | null = null, date_max: string | null = null

  const importRes = await c.env.DB.prepare(`
    INSERT INTO imports_csv (marque_id, uploader_user_id, nom_fichier, nb_lignes, statut)
    VALUES (?, ?, ?, ?, 'en_cours')
  `).bind(marque_id, me.id, nom_fichier || null, rows.length).run()
  const import_id = importRes.meta.last_row_id

  for (const row of rows) {
    try {
      const date = parseDate(row[cols.date])
      if (!date) { nb_erreurs++; continue }
      const total = cols.total ? parseNumber(row[cols.total]) : 0
      const uber_fee = cols.uber_fee ? parseNumber(row[cols.uber_fee]) : 0
      let net = cols.net ? parseNumber(row[cols.net]) : 0
      if (!net && total) net = total - uber_fee
      const order_id = cols.order_id ? row[cols.order_id] : null
      const statut = cols.status ? row[cols.status] : 'completee'
      if (order_id) {
        const exists = await c.env.DB.prepare('SELECT id FROM commandes WHERE marque_id = ? AND uber_order_id = ?')
          .bind(marque_id, order_id).first()
        if (exists) { nb_doublons++; continue }
      }
      await c.env.DB.prepare(`
        INSERT INTO commandes (marque_id, uber_order_id, date_commande, montant_brut, frais_uber, montant_net, statut, raw_data, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(marque_id, order_id || null, date, total, uber_fee, net, statut || 'completee',
        JSON.stringify(row), import_id).run()
      nb_importees++
      total_montant += total
      if (!date_min || date < date_min) date_min = date
      if (!date_max || date > date_max) date_max = date
    } catch { nb_erreurs++ }
  }

  await c.env.DB.prepare(`
    UPDATE imports_csv SET nb_lignes_importees = ?, nb_doublons = ?, montant_total = ?,
      periode_debut = ?, periode_fin = ?, statut = ? WHERE id = ?
  `).bind(nb_importees, nb_doublons, total_montant,
    date_min ? date_min.substring(0, 10) : null, date_max ? date_max.substring(0, 10) : null,
    nb_erreurs > 0 ? 'partiel' : 'complete', import_id).run()

  return c.json({ success: true, import_id, nb_lignes: rows.length, nb_importees, nb_doublons, nb_erreurs,
    montant_total: total_montant, periode: { debut: date_min, fin: date_max } })
})

app.get('/imports', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT i.*, m.nom as marque_nom, r.nom as restaurant_nom,
      u.nom as uploader_nom, u.prenom as uploader_prenom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON i.uploader_user_id = u.id
    WHERE r.agent_id IN ${inClause}
    ORDER BY i.created_at DESC LIMIT 200
  `).bind(...branchIds).all()
  return c.json({ imports: results })
})

app.delete('/imports/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const imp = await c.env.DB.prepare(`
    SELECT i.id, r.agent_id FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id WHERE i.id = ?
  `).bind(id).first() as any
  if (!imp || !branchIds.includes(imp.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM commandes WHERE import_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM imports_csv WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// MES COMMISSIONS
// ============================================================
app.get('/commissions', async (c) => {
  const me = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  const { results: cmds } = await c.env.DB.prepare(`
    SELECT c.id, c.date_commande, c.montant_brut,
      m.id as marque_id, m.nom as marque_nom,
      m.is_portefeuille_proprietaire as marque_is_portefeuille,
      m.date_signature_portefeuille as marque_date_signature_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.is_portefeuille_proprietaire as restaurant_is_portefeuille,
      r.date_signature_portefeuille as restaurant_date_signature_portefeuille,
      r.tablette_sr_shop, r.agent_id,
      u.niveau as agent_niveau, u.parent_id as agent_parent_id, u2.parent_id as agent_grand_parent_id
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users u2 ON u.parent_id = u2.id
    WHERE c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee') AND c.paye_integralement = 1
  `).bind(debut, fin).all() as any

  const paliers = await getPaliers(c.env.DB)
  const calc = calculerCommissionsPeriode(cmds as CommandeWithContext[], paliers)
  const detail = calc.par_agent.get(me.id) || {
    agent_id: me.id, total: 0,
    commission_propre: 0, commission_portefeuille: 0, commission_n1: 0, commission_n2: 0,
    nb_commandes_propres: 0, nb_commandes_portefeuille: 0, nb_commandes_n1: 0, nb_commandes_n2: 0
  }

  // Restos qui contribuent (les miens directs OU ceux de mes sous-agents)
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const restosBranche = calc.par_restaurant.filter(r => {
    return cmds.some((cmd: any) =>
      cmd.restaurant_id === r.restaurant_id && branchIds.includes(cmd.agent_id))
  })

  // Paiement existant
  const paiement = await c.env.DB.prepare(
    'SELECT * FROM paiements WHERE agent_id = ? AND periode_annee = ? AND periode_mois = ?'
  ).bind(me.id, annee, mois).first()

  // Détail par sous-agent (de ma branche, hors moi)
  const sousAgents: any[] = []
  for (const id of branchIds) {
    if (id === me.id) continue
    const det = calc.par_agent.get(id)
    if (!det) continue
    const u = await c.env.DB.prepare('SELECT id, nom, prenom, niveau FROM users WHERE id = ?').bind(id).first() as any
    if (u) sousAgents.push({ ...u, ...det })
  }

  return c.json({
    periode: { annee, mois },
    detail,
    restaurants: restosBranche,
    sous_agents: sousAgents,
    paiement_existant: paiement
  })
})

// GET /api/agent/commissions/historique - Historique des paiements
app.get('/commissions/historique', async (c) => {
  const me = c.get('user')
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paiements WHERE agent_id = ?
    ORDER BY periode_annee DESC, periode_mois DESC LIMIT 24
  `).bind(me.id).all()
  return c.json({ paiements: results })
})

// ============================================================
// MA HIÉRARCHIE (sous-agents)
// ============================================================
app.get('/sous-agents', async (c) => {
  const me = c.get('user')
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const otherIds = branchIds.filter(i => i !== me.id)
  if (otherIds.length === 0) return c.json({ sous_agents: [] })
  const inClause = `(${otherIds.map(() => '?').join(',')})`
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.niveau, u.parent_id, u.actif, u.derniere_connexion,
      p.nom as parent_nom, p.prenom as parent_prenom,
      (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
      (SELECT COUNT(*) FROM users s WHERE s.parent_id = u.id) as nb_sous_agents
    FROM users u LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.id IN ${inClause} ORDER BY u.niveau, u.nom
  `).bind(...otherIds).all()
  return c.json({ sous_agents: results })
})

// ============================================================
// MLM TREE 2 NIVEAUX — pour dashboard agent
// GET /api/agent/mlm-tree
// → { me, filleuls: [{ ..., sous_filleuls: [...] }], total_n1, total_n2 }
// ============================================================
app.get('/mlm-tree', async (c) => {
  const me = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`

  // N+1 directs (filleuls de l'agent)
  const { results: n1 } = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.nom, u.prenom, u.niveau, u.actif, u.derniere_connexion, u.created_at,
      (SELECT COUNT(*) FROM users WHERE parent_id = u.id) as nb_filleuls,
      (SELECT COUNT(*) FROM restaurants WHERE agent_id = u.id) as nb_restos,
      (SELECT COALESCE(SUM(c.commission_agent_montant),0) + COALESCE(SUM(c.commission_portefeuille_montant),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id AND c.date_commande >= ? AND c.date_commande <= ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      ) as ca_periode,
      (SELECT COALESCE(SUM(c.montant_brut),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      ) as ca_total
    FROM users u WHERE u.parent_id = ? AND u.role = 'agent'
    ORDER BY u.nom, u.prenom
  `).bind(debut, fin, me.id).all() as any

  // N+2 par parent direct
  const n1Ids = (n1 as any[]).map((x: any) => x.id)
  const n2ByParent: Record<number, any[]> = {}
  if (n1Ids.length) {
    const ph = n1Ids.map(() => '?').join(',')
    const { results: n2 } = await c.env.DB.prepare(`
      SELECT u.id, u.email, u.nom, u.prenom, u.niveau, u.parent_id, u.actif,
        (SELECT COUNT(*) FROM restaurants WHERE agent_id = u.id) as nb_restos,
        (SELECT COALESCE(SUM(c.commission_agent_montant),0)
          FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
          JOIN restaurants r ON m.restaurant_id = r.id
          WHERE r.agent_id = u.id AND c.date_commande >= ? AND c.date_commande <= ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
        ) as ca_periode
      FROM users u WHERE u.parent_id IN (${ph}) AND u.role = 'agent'
      ORDER BY u.nom, u.prenom
    `).bind(debut, fin, ...n1Ids).all() as any
    for (const x of n2 as any[]) {
      if (!n2ByParent[x.parent_id]) n2ByParent[x.parent_id] = []
      n2ByParent[x.parent_id].push(x)
    }
  }

  const filleuls = (n1 as any[]).map((x: any) => ({
    ...x,
    sous_filleuls: n2ByParent[x.id] || []
  }))

  const total_n1 = filleuls.length
  const total_n2 = filleuls.reduce((s: number, x: any) => s + (x.sous_filleuls?.length || 0), 0)

  return c.json({
    me: { id: me.id, nom: me.nom, prenom: me.prenom, niveau: me.niveau },
    filleuls,
    total_n1, total_n2,
    periode: { annee, mois }
  })
})

// ============================================================
// HISTORIQUE COMMISSIONS — vue mensuelle ou hebdomadaire (12 dernières)
// GET /api/agent/commissions/history?type=monthly|weekly
// ============================================================
app.get('/commissions/history', async (c) => {
  const me = c.get('user')
  const type = c.req.query('type') || 'monthly'
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const inClause = `(${branchIds.map(() => '?').join(',')})`

  const baseSelect = `
      COUNT(c.id) as nb_commandes,
      COALESCE(SUM(CASE WHEN r.agent_id = ? THEN c.commission_agent_montant ELSE 0 END), 0) as comm_propre,
      COALESCE(SUM(CASE WHEN r.agent_id = ? THEN c.commission_portefeuille_montant ELSE 0 END), 0) as comm_portefeuille,
      COALESCE(SUM(CASE
        WHEN (SELECT parent_id FROM users WHERE id = r.agent_id) = ? THEN c.commission_n1_montant
        ELSE 0 END), 0) as comm_n1,
      COALESCE(SUM(CASE
        WHEN (SELECT parent_id FROM users WHERE id = (SELECT parent_id FROM users WHERE id = r.agent_id)) = ? THEN c.commission_n2_montant
        ELSE 0 END), 0) as comm_n2`

  if (type === 'weekly') {
    const { results } = await c.env.DB.prepare(`
      SELECT strftime('%Y-W%W', c.date_commande) as periode, ${baseSelect}
      FROM commandes c
      JOIN marques_virtuelles m ON c.marque_id = m.id
      JOIN restaurants r ON m.restaurant_id = r.id
      WHERE r.agent_id IN ${inClause}
        AND c.date_commande >= date('now', '-90 day')
        AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      GROUP BY periode
      ORDER BY periode DESC LIMIT 12
    `).bind(me.id, me.id, me.id, me.id, ...branchIds).all() as any
    const enriched = (results as any[]).map(r => ({ ...r, total: r.comm_propre + r.comm_portefeuille + r.comm_n1 + r.comm_n2 }))
    return c.json({ type: 'weekly', history: enriched.reverse() })
  }

  // monthly — 12 derniers mois
  const { results } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', c.date_commande) as periode, ${baseSelect}
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id IN ${inClause}
      AND c.date_commande >= date('now', '-12 month')
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY periode
    ORDER BY periode DESC LIMIT 12
  `).bind(me.id, me.id, me.id, me.id, ...branchIds).all() as any
  const enriched = (results as any[]).map(r => ({ ...r, total: r.comm_propre + r.comm_portefeuille + r.comm_n1 + r.comm_n2 }))
  return c.json({ type: 'monthly', history: enriched.reverse() })
})

// ============================================================
// COMMISSIONS DES SOUS-AGENTS — vue agrégée (pour visu commerciale)
// GET /api/agent/sous-agents/commissions?annee=&mois=
// ============================================================
app.get('/sous-agents/commissions', async (c) => {
  const me = c.get('user')
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(new Date().getMonth() + 1))
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`

  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  const otherIds = branchIds.filter(i => i !== me.id)
  if (!otherIds.length) return c.json({ sous_agents: [] })
  const ph = otherIds.map(() => '?').join(',')
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.nom, u.prenom, u.niveau, u.parent_id,
      p.nom as parent_nom, p.prenom as parent_prenom,
      (SELECT COUNT(*) FROM restaurants WHERE agent_id = u.id) as nb_restos,
      (SELECT COUNT(c.id) FROM commandes c
        JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id AND c.date_commande >= ? AND c.date_commande <= ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      ) as nb_commandes,
      (SELECT COALESCE(SUM(c.commission_agent_montant),0) + COALESCE(SUM(c.commission_portefeuille_montant),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id AND c.date_commande >= ? AND c.date_commande <= ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      ) as commissions_propres,
      (SELECT COALESCE(SUM(c.montant_brut),0)
        FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id
        JOIN restaurants r ON m.restaurant_id = r.id
        WHERE r.agent_id = u.id AND c.date_commande >= ? AND c.date_commande <= ? AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
      ) as ca_periode
    FROM users u LEFT JOIN users p ON u.parent_id = p.id
    WHERE u.id IN (${ph}) AND u.role = 'agent'
    ORDER BY u.niveau, commissions_propres DESC
  `).bind(debut, fin, debut, fin, debut, fin, ...otherIds).all() as any
  return c.json({ sous_agents: results, periode: { annee, mois } })
})

// ============================================================
// DOCUMENTS (agent — restos de sa branche uniquement)
// ============================================================

// Helper : vérifie que le restaurant appartient à la branche de l'agent
async function assertRestoInBranch(db: D1Database, userId: number, restaurantId: number): Promise<boolean> {
  const branchIds = await getBranchAgentIds(db, userId)
  const r = await db.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(restaurantId).first() as any
  return !!(r && branchIds.includes(r.agent_id))
}

// GET /api/agent/documents/restaurant/:id — liste des documents d'un resto
app.get('/documents/restaurant/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  if (!(await assertRestoInBranch(c.env.DB, me.id, id))) return c.json({ error: 'Accès refusé' }, 403)
  const { results } = await c.env.DB.prepare(`
    SELECT d.id, d.restaurant_id, d.type_document, d.nom_fichier, d.taille_octets, d.mime_type,
      d.url_externe, d.date_emission, d.date_expiration, d.statut, d.notes,
      d.created_at, d.updated_at,
      u.nom as uploader_nom, u.prenom as uploader_prenom,
      (d.contenu_base64 IS NOT NULL) as has_content
    FROM restaurant_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.restaurant_id = ?
    ORDER BY d.created_at DESC
  `).bind(id).all() as any
  return c.json({ documents: results })
})

// GET /api/agent/documents/:id/contenu — contenu base64 (avec check permission)
app.get('/documents/:id/contenu', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const doc = await c.env.DB.prepare(`
    SELECT d.*, r.agent_id FROM restaurant_documents d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).bind(id).first() as any
  if (!doc) return c.json({ error: 'Document introuvable' }, 404)
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  if (!branchIds.includes(doc.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  return c.json({
    id: doc.id,
    nom_fichier: doc.nom_fichier,
    mime_type: doc.mime_type,
    taille_octets: doc.taille_octets,
    contenu_base64: doc.contenu_base64,
    url_externe: doc.url_externe,
    statut: doc.statut
  })
})

// POST /api/agent/documents — upload d'un document
app.post('/documents', async (c) => {
  const me = c.get('user')
  const { restaurant_id, type_document, nom_fichier, mime_type, taille, contenu_base64, url_externe, date_emission, date_expiration, commentaire } = await c.req.json()
  if (!restaurant_id || !type_document || !nom_fichier) {
    return c.json({ error: 'restaurant_id, type_document et nom_fichier requis' }, 400)
  }
  if (!(await assertRestoInBranch(c.env.DB, me.id, restaurant_id))) return c.json({ error: 'Accès refusé' }, 403)
  // Limite taille base64 : ~5 Mo brut = ~7 Mo base64
  if (contenu_base64 && contenu_base64.length > 7 * 1024 * 1024) {
    return c.json({ error: 'Fichier trop volumineux (max 5 Mo)' }, 400)
  }
  const res = await c.env.DB.prepare(`
    INSERT INTO restaurant_documents (
      restaurant_id, type_document, nom_fichier, taille_octets, mime_type,
      contenu_base64, url_externe, date_emission, date_expiration,
      statut, uploaded_by, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)
  `).bind(
    restaurant_id, type_document, nom_fichier, taille || null, mime_type || null,
    contenu_base64 || null, url_externe || null, date_emission || null, date_expiration || null,
    me.id, commentaire || null
  ).run()
  return c.json({ success: true, id: res.meta.last_row_id })
})

// DELETE /api/agent/documents/:id — supprime un document (uploadeur ou admin)
app.delete('/documents/:id', async (c) => {
  const me = c.get('user')
  const id = parseInt(c.req.param('id'))
  const doc = await c.env.DB.prepare(`
    SELECT d.*, r.agent_id FROM restaurant_documents d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.id = ?
  `).bind(id).first() as any
  if (!doc) return c.json({ error: 'Document introuvable' }, 404)
  const branchIds = await getBranchAgentIds(c.env.DB, me.id)
  if (!branchIds.includes(doc.agent_id)) return c.json({ error: 'Accès refusé' }, 403)
  await c.env.DB.prepare('DELETE FROM restaurant_documents WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// PALIERS (lecture seule pour agents)
// ============================================================
app.get('/paliers', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT * FROM paliers_commissions WHERE actif = 1 ORDER BY type, ordre, seuil_min
  `).all() as any
  const grouped: Record<string, any[]> = {}
  for (const p of results) {
    if (!grouped[p.type]) grouped[p.type] = []
    grouped[p.type].push(p)
  }
  return c.json({ paliers: grouped })
})

export default app
