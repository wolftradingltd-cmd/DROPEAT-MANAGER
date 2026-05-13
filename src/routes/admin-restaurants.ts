import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { qualifierElement, dequalifierElement, getEtatTranches } from '../lib/tranches'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

/**
 * Met à jour le rang d'apport (ordre de signature) d'un restaurant pour son agent.
 * NB : le statut is_portefeuille_proprietaire est désormais géré par le moteur de tranches.
 */
async function recalculerRangsRestaurants(db: D1Database, agentId: number) {
  if (!agentId) return
  const { results } = await db.prepare(`
    SELECT id FROM restaurants
    WHERE agent_id = ?
    ORDER BY date_signature ASC, id ASC
  `).bind(agentId).all() as any
  for (let i = 0; i < results.length; i++) {
    await db.prepare(`UPDATE restaurants SET rang_apport = ? WHERE id = ?`)
      .bind(i + 1, results[i].id).run()
  }
}

async function recalculerRangsMarques(db: D1Database, restaurantId: number) {
  const { results } = await db.prepare(`
    SELECT id FROM marques_virtuelles
    WHERE restaurant_id = ?
    ORDER BY date_lancement ASC, id ASC
  `).bind(restaurantId).all() as any
  for (let i = 0; i < results.length; i++) {
    await db.prepare(`UPDATE marques_virtuelles SET rang_creation = ? WHERE id = ?`)
      .bind(i + 1, results[i].id).run()
  }
}

// GET /api/admin/restaurants/tree - Arborescence Restaurant → Marques → Agent
app.get('/tree', async (c) => {
  const agent_id = c.req.query('agent_id')
  const search = c.req.query('search')

  let where = 'WHERE 1=1'
  const params: any[] = []
  if (agent_id) { where += ' AND r.agent_id = ?'; params.push(agent_id) }
  if (search) {
    where += ' AND (r.nom LIKE ? OR r.ville LIKE ? OR r.siret LIKE ?)'
    const s = `%${search}%`
    params.push(s, s, s)
  }

  const stmtR = c.env.DB.prepare(`
    SELECT r.id, r.nom, r.raison_sociale, r.siret, r.ville, r.code_postal, r.pays,
           r.telephone, r.email, r.contact_nom,
           r.agent_id, r.rang_apport, r.is_portefeuille_proprietaire,
           r.tablette_sr_shop, r.date_signature, r.date_lancement, r.actif,
           u.id as agent_uid, u.nom as agent_nom, u.prenom as agent_prenom,
           u.email as agent_email, u.niveau as agent_niveau,
           p.id as parent_uid, p.nom as parent_nom, p.prenom as parent_prenom, p.niveau as parent_niveau,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
           (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users p ON u.parent_id = p.id
    ${where}
    ORDER BY r.nom
  `)
  const { results: restaurants } = await (params.length ? stmtR.bind(...params) : stmtR).all() as any

  // Récupère toutes les marques des restos en une requête
  const restoIds = (restaurants as any[]).map(r => r.id)
  let marquesMap: Record<number, any[]> = {}
  if (restoIds.length > 0) {
    const placeholders = restoIds.map(() => '?').join(',')
    const { results: marques } = await c.env.DB.prepare(`
      SELECT m.id, m.restaurant_id, m.nom, m.uber_store_id, m.plateforme,
             m.rang_creation, m.is_portefeuille_proprietaire, m.date_lancement, m.actif,
             (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
             (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total,
             (SELECT MAX(c.date_commande) FROM commandes c WHERE c.marque_id = m.id) as derniere_commande
      FROM marques_virtuelles m
      WHERE m.restaurant_id IN (${placeholders})
      ORDER BY m.rang_creation, m.id
    `).bind(...restoIds).all() as any
    for (const m of marques as any[]) {
      if (!marquesMap[m.restaurant_id]) marquesMap[m.restaurant_id] = []
      marquesMap[m.restaurant_id].push(m)
    }
  }

  const tree = (restaurants as any[]).map(r => ({
    ...r,
    agent: r.agent_uid ? {
      id: r.agent_uid,
      nom: r.agent_nom,
      prenom: r.agent_prenom,
      email: r.agent_email,
      niveau: r.agent_niveau,
      parent: r.parent_uid ? {
        id: r.parent_uid, nom: r.parent_nom, prenom: r.parent_prenom, niveau: r.parent_niveau
      } : null
    } : null,
    marques: marquesMap[r.id] || []
  }))

  return c.json({ tree, total_restaurants: tree.length })
})

// GET /api/admin/restaurants - Tous les restaurants
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT r.*,
           u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id AND m.is_portefeuille_proprietaire = 1) as nb_marques_portefeuille,
           (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id WHERE m.restaurant_id = r.id) as ca_total
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.created_at DESC
  `).all()
  return c.json({ restaurants: results })
})

// GET /api/admin/restaurants/:id - Détail
app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const r = await c.env.DB.prepare(`
    SELECT r.*, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau, u.email as agent_email
    FROM restaurants r LEFT JOIN users u ON r.agent_id = u.id
    WHERE r.id = ?
  `).bind(id).first()
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)

  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.*,
           (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
           (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id) as ca_total
    FROM marques_virtuelles m
    WHERE m.restaurant_id = ?
    ORDER BY m.rang_creation, m.id
  `).bind(id).all()

  return c.json({ restaurant: r, marques })
})

// POST /api/admin/restaurants - Créer (avec gérant + RIB manuel + signature portefeuille)
app.post('/', async (c) => {
  const data = await c.req.json()
  const {
    nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
    contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes,
    // Gérant
    gerant_nom, gerant_prenom, gerant_telephone, gerant_email,
    // RIB manuel
    rib_titulaire, rib_iban, rib_bic, rib_banque_nom, rib_references,
    // Portefeuille (signature)
    is_portefeuille_proprietaire, date_signature_portefeuille
  } = data

  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  const result = await c.env.DB.prepare(`
    INSERT INTO restaurants (
      nom, raison_sociale, siret, adresse, code_postal, ville, pays, telephone, email,
      contact_nom, agent_id, date_signature, date_lancement, tablette_sr_shop, notes,
      gerant_nom, gerant_prenom, gerant_telephone, gerant_email,
      rib_titulaire, rib_iban, rib_bic, rib_banque_nom, rib_references,
      is_portefeuille_proprietaire, date_signature_portefeuille
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    nom, raison_sociale || null, siret || null, adresse || null,
    code_postal || null, ville || null, pays || 'France',
    telephone || null, email || null, contact_nom || null,
    agent_id || null, date_signature || null, date_lancement || null,
    tablette_sr_shop ? 1 : 0, notes || null,
    gerant_nom || null, gerant_prenom || null, gerant_telephone || null, gerant_email || null,
    rib_titulaire || null, rib_iban || null, rib_bic || null, rib_banque_nom || null, rib_references || null,
    is_portefeuille_proprietaire ? 1 : 0, date_signature_portefeuille || null
  ).run()

  const newId = result.meta.last_row_id as number

  // Pré-création de la checklist standard (KBIS/CNI/RIB/contrat/accès/tablette/onboarding/validation)
  const checklistStd = [
    { code: 'kbis', libelle: 'KBIS', obligatoire: 1 },
    { code: 'cni', libelle: 'Pièce d\'identité du gérant (CNI)', obligatoire: 1 },
    { code: 'rib', libelle: 'RIB (upload ou saisie manuelle)', obligatoire: 1 },
    { code: 'contrat_portefeuille', libelle: 'Contrat de portefeuille', obligatoire: 0 },
    { code: 'acces_uber_manager', libelle: 'Accès Uber Eats Manager', obligatoire: 1 },
    { code: 'acces_uber_orders', libelle: 'Accès Uber Eats Orders/Tablette', obligatoire: 1 },
    { code: 'tablette', libelle: 'Tablette fournie', obligatoire: 0 },
    { code: 'onboarding', libelle: 'Onboarding restaurant', obligatoire: 1 },
    { code: 'validation_admin', libelle: 'Validation administrateur', obligatoire: 1 }
  ]
  for (const item of checklistStd) {
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut)
      VALUES (?, ?, ?, ?, 'a_faire')
    `).bind(newId, item.code, item.libelle, item.obligatoire).run()
  }

  // Recalculer les rangs et qualifier dans la tranche ouverte de l'agent
  if (agent_id) {
    await recalculerRangsRestaurants(c.env.DB, agent_id)
    const q = await qualifierElement(c.env.DB, agent_id, 'client', newId)
    return c.json({
      success: true,
      id: newId,
      tranche: q.ok ? {
        position: q.position,
        attribution_100: q.attribution,
        numero_tranche: q.numero_tranche
      } : null,
      tranche_warning: q.ok ? null : q.reason
    })
  }

  return c.json({ success: true, id: newId })
})

// PUT /api/admin/restaurants/:id (dynamic - accepte tous les nouveaux champs gérant/RIB/portefeuille)
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const oldResto = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  const oldAgentId = oldResto?.agent_id

  const allowed = [
    'nom', 'raison_sociale', 'siret', 'adresse', 'code_postal', 'ville', 'pays',
    'telephone', 'email', 'contact_nom', 'agent_id', 'date_signature', 'date_lancement',
    'tablette_sr_shop', 'actif', 'notes',
    // Gérant
    'gerant_nom', 'gerant_prenom', 'gerant_telephone', 'gerant_email',
    // RIB manuel
    'rib_titulaire', 'rib_iban', 'rib_bic', 'rib_banque_nom', 'rib_references',
    // Portefeuille
    'is_portefeuille_proprietaire', 'date_signature_portefeuille'
  ]
  const updates: string[] = []
  const params: any[] = []
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      let v: any = (data as any)[k]
      if (v === '') v = null
      if (k === 'tablette_sr_shop' || k === 'is_portefeuille_proprietaire') v = v ? 1 : 0
      updates.push(`${k} = ?`)
      params.push(v)
    }
  }
  // Le champ "agent_id" est extrait pour gérer la tranche
  const agent_id = Object.prototype.hasOwnProperty.call(data, 'agent_id') ? (data.agent_id || null) : oldAgentId

  if (!updates.length) return c.json({ error: 'Aucun champ à mettre à jour' }, 400)
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  await c.env.DB.prepare(
    `UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  // Si changement d'agent : dé-qualifier de l'ancien, qualifier dans le nouveau
  if (oldAgentId !== agent_id) {
    if (oldAgentId) {
      await dequalifierElement(c.env.DB, oldAgentId, 'client', parseInt(id))
      await recalculerRangsRestaurants(c.env.DB, oldAgentId)
    }
    if (agent_id) {
      await recalculerRangsRestaurants(c.env.DB, agent_id)
      await qualifierElement(c.env.DB, agent_id, 'client', parseInt(id))
    }
  }

  return c.json({ success: true })
})

// DELETE /api/admin/restaurants/:id
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  // Récupérer marques pour les dé-qualifier
  const { results: marques } = await c.env.DB.prepare('SELECT id FROM marques_virtuelles WHERE restaurant_id = ?')
    .bind(id).all() as any
  await c.env.DB.prepare('DELETE FROM restaurants WHERE id = ?').bind(id).run()
  if (r?.agent_id) {
    await dequalifierElement(c.env.DB, r.agent_id, 'client', id)
    for (const m of marques as any[]) {
      await dequalifierElement(c.env.DB, r.agent_id, 'marque', m.id)
    }
    await recalculerRangsRestaurants(c.env.DB, r.agent_id)
  }
  return c.json({ success: true })
})

// POST /api/admin/restaurants/:id/reassign - Changer l'agent d'un resto
app.post('/:id/reassign', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { new_agent_id } = await c.req.json()

  const r = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?').bind(id).first() as any
  const oldAgentId = r?.agent_id

  await c.env.DB.prepare('UPDATE restaurants SET agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(new_agent_id || null, id).run()

  if (oldAgentId) {
    await dequalifierElement(c.env.DB, oldAgentId, 'client', id)
    await recalculerRangsRestaurants(c.env.DB, oldAgentId)
  }
  if (new_agent_id) {
    await recalculerRangsRestaurants(c.env.DB, new_agent_id)
    await qualifierElement(c.env.DB, new_agent_id, 'client', id)
  }

  return c.json({ success: true })
})

// POST /api/admin/restaurants/tranches/rebuild - Reconstruit les tranches à partir des données existantes
// (à utiliser après une migration ou un import en masse)
app.post('/tranches/rebuild', async (c) => {
  // Reset complet
  await c.env.DB.prepare('DELETE FROM tranche_elements').run()
  await c.env.DB.prepare('DELETE FROM tranches_attribution').run()
  await c.env.DB.prepare('UPDATE restaurants SET is_portefeuille_proprietaire = 0').run()
  await c.env.DB.prepare('UPDATE marques_virtuelles SET is_portefeuille_proprietaire = 0').run()

  // Pour chaque agent, re-qualifie ses restos par ordre de signature
  const { results: agents } = await c.env.DB.prepare(`SELECT id FROM users WHERE role = 'agent'`).all() as any
  let nbRestos = 0, nbMarques = 0, nbAttributionsRestos = 0, nbAttributionsMarques = 0
  for (const a of agents as any[]) {
    const { results: restos } = await c.env.DB.prepare(`
      SELECT id FROM restaurants WHERE agent_id = ? ORDER BY date_signature ASC, id ASC
    `).bind(a.id).all() as any
    for (const r of restos as any[]) {
      const q = await qualifierElement(c.env.DB, a.id, 'client', r.id)
      if (q.ok) { nbRestos++; if (q.attribution) nbAttributionsRestos++ }
    }
    // Marques par ordre de date de lancement (toutes marques de tous ses restos)
    const { results: marques } = await c.env.DB.prepare(`
      SELECT m.id FROM marques_virtuelles m
      JOIN restaurants r ON m.restaurant_id = r.id
      WHERE r.agent_id = ?
      ORDER BY m.date_lancement ASC, m.id ASC
    `).bind(a.id).all() as any
    for (const m of marques as any[]) {
      const q = await qualifierElement(c.env.DB, a.id, 'marque', m.id)
      if (q.ok) { nbMarques++; if (q.attribution) nbAttributionsMarques++ }
    }
  }
  return c.json({
    success: true,
    rebuilt: {
      nb_agents: agents.length,
      nb_restaurants_qualifies: nbRestos,
      nb_attributions_restaurants: nbAttributionsRestos,
      nb_marques_qualifiees: nbMarques,
      nb_attributions_marques: nbAttributionsMarques
    }
  })
})

// GET /api/admin/restaurants/tranches/:agent_id/:type - État des tranches d'un agent
app.get('/tranches/:agent_id/:type', async (c) => {
  const agent_id = parseInt(c.req.param('agent_id'))
  const type = c.req.param('type') as 'client' | 'marque'
  if (type !== 'client' && type !== 'marque') return c.json({ error: 'Type invalide' }, 400)
  const etat = await getEtatTranches(c.env.DB, agent_id, type)
  return c.json(etat)
})

// POST /api/admin/restaurants/:id/valider-tranche - Valider écrite la tranche clôturée
app.post('/:id/valider-tranche', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')
  await c.env.DB.prepare(`
    UPDATE tranches_attribution
    SET validation_ecrite = 1, date_validation = CURRENT_TIMESTAMP, validateur_user_id = ?
    WHERE id = ? AND statut = 'cloturee'
  `).bind(user.id, id).run()
  return c.json({ success: true })
})

// ========== MARQUES VIRTUELLES ==========

// GET /api/admin/restaurants/marques/all
app.get('/marques/all', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, r.nom as restaurant_nom, r.is_portefeuille_proprietaire as resto_portefeuille,
           u.nom as agent_nom, u.prenom as agent_prenom, u.id as agent_id
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.nom, m.rang_creation
  `).all()
  return c.json({ marques: results })
})

// POST /api/admin/restaurants/:id/marques
app.post('/:id/marques', async (c) => {
  const restaurant_id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const { nom, uber_store_id, plateforme, date_lancement, notes } = data

  if (!nom) return c.json({ error: 'Nom requis' }, 400)

  // Récupère l'agent du restaurant
  const resto = await c.env.DB.prepare('SELECT agent_id FROM restaurants WHERE id = ?')
    .bind(restaurant_id).first() as any
  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)

  const result = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles (restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    restaurant_id, nom, uber_store_id || null,
    plateforme || 'uber_eats', date_lancement || null, notes || null
  ).run()

  const newId = result.meta.last_row_id as number
  await recalculerRangsMarques(c.env.DB, restaurant_id)

  // Qualifier la nouvelle marque dans la tranche ouverte de l'agent
  let trancheInfo: any = null
  if (resto.agent_id) {
    const q = await qualifierElement(c.env.DB, resto.agent_id, 'marque', newId)
    if (q.ok) {
      trancheInfo = {
        position: q.position,
        attribution_100: q.attribution,
        numero_tranche: q.numero_tranche
      }
    }
  }

  return c.json({ success: true, id: newId, tranche: trancheInfo })
})

// PUT /api/admin/restaurants/marques/:marque_id
app.put('/marques/:marque_id', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const data = await c.req.json()
  const { nom, uber_store_id, plateforme, date_lancement, actif, notes } = data

  const m = await c.env.DB.prepare('SELECT restaurant_id FROM marques_virtuelles WHERE id = ?')
    .bind(marque_id).first() as any

  await c.env.DB.prepare(`
    UPDATE marques_virtuelles SET
      nom = ?, uber_store_id = ?, plateforme = ?, date_lancement = ?, actif = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    nom, uber_store_id || null, plateforme || 'uber_eats',
    date_lancement || null, actif !== undefined ? actif : 1, notes || null, marque_id
  ).run()

  if (m?.restaurant_id) await recalculerRangsMarques(c.env.DB, m.restaurant_id)

  return c.json({ success: true })
})

// DELETE marque
app.delete('/marques/:marque_id', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(marque_id).first() as any
  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(marque_id).run()
  if (m?.agent_id) {
    await dequalifierElement(c.env.DB, m.agent_id, 'marque', marque_id)
  }
  if (m?.restaurant_id) await recalculerRangsMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

// POST /api/admin/restaurants/marques/:marque_id/toggle-portefeuille
// Force manuellement le statut Portefeuille (override)
app.post('/marques/:marque_id/toggle-portefeuille', async (c) => {
  const marque_id = parseInt(c.req.param('marque_id'))
  const { is_portefeuille } = await c.req.json()
  await c.env.DB.prepare('UPDATE marques_virtuelles SET is_portefeuille_proprietaire = ? WHERE id = ?')
    .bind(is_portefeuille ? 1 : 0, marque_id).run()
  return c.json({ success: true })
})

export default app
