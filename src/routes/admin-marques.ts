// ============================================================
// MARQUES VIRTUELLES — module complet superadmin
// CRUD + filtres + assignation + bascule portefeuille + déplacement
// ============================================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { qualifierElement, dequalifierElement } from '../lib/tranches'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireSuperadmin)

// Helper : recalcul des rangs marques d'un resto
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

// ============================================================
// GET /api/admin/marques
// Liste filtrable + stats par marque (commandes / CA / commissions)
// Query : ?search=&restaurant_id=&agent_id=&portefeuille=1|0&actif=1|0
// ============================================================
app.get('/', async (c) => {
  const search = c.req.query('search')
  const restaurantId = c.req.query('restaurant_id')
  const agentId = c.req.query('agent_id')
  const portefeuille = c.req.query('portefeuille') // '1' | '0' | undefined
  const actif = c.req.query('actif')

  const where: string[] = ['1=1']
  const params: any[] = []
  if (search) {
    where.push('(m.nom LIKE ? OR r.nom LIKE ? OR m.uber_store_id LIKE ?)')
    const s = `%${search}%`
    params.push(s, s, s)
  }
  if (restaurantId) { where.push('m.restaurant_id = ?'); params.push(parseInt(restaurantId)) }
  if (agentId) { where.push('r.agent_id = ?'); params.push(parseInt(agentId)) }
  if (portefeuille === '1') where.push('m.is_portefeuille_proprietaire = 1')
  if (portefeuille === '0') where.push('COALESCE(m.is_portefeuille_proprietaire, 0) = 0')
  if (actif === '1') where.push('COALESCE(m.actif, 1) = 1')
  if (actif === '0') where.push('COALESCE(m.actif, 1) = 0')

  const sql = `
    SELECT
      m.id, m.nom, m.uber_store_id, m.plateforme, m.actif,
      m.date_lancement, m.rang_creation, m.notes,
      COALESCE(m.is_portefeuille_proprietaire, 0) as is_portefeuille_proprietaire,
      m.created_at, m.updated_at,
      r.id as restaurant_id, r.nom as restaurant_nom,
      r.ville as restaurant_ville,
      COALESCE(r.is_portefeuille_proprietaire, 0) as resto_portefeuille,
      u.id as agent_id, u.nom as agent_nom, u.prenom as agent_prenom,
      u.niveau as agent_niveau,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as ca_total,
      (SELECT COALESCE(SUM(c.commission_agent_montant + c.commission_portefeuille_montant), 0)
         FROM commandes c WHERE c.marque_id = m.id AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as commissions_total
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY r.nom ASC, m.rang_creation ASC, m.id ASC
  `
  const { results } = await c.env.DB.prepare(sql).bind(...params).all() as any

  // Stats globales
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_portefeuille_proprietaire = 1 THEN 1 ELSE 0 END) as nb_portefeuille,
      SUM(CASE WHEN COALESCE(actif, 1) = 1 THEN 1 ELSE 0 END) as nb_actives,
      SUM(CASE WHEN COALESCE(actif, 1) = 0 THEN 1 ELSE 0 END) as nb_inactives
    FROM marques_virtuelles
  `).first() as any

  return c.json({ marques: results, stats })
})

// ============================================================
// GET /api/admin/marques/restos-disponibles
// → Liste des restaurants pour le sélecteur (création/assignation)
// ============================================================
app.get('/restos-disponibles', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT r.id, r.nom, r.ville,
           COALESCE(r.is_portefeuille_proprietaire, 0) as resto_portefeuille,
           u.id as agent_id, u.prenom as agent_prenom, u.nom as agent_nom,
           (SELECT COUNT(*) FROM marques_virtuelles m WHERE m.restaurant_id = r.id) as nb_marques
    FROM restaurants r
    LEFT JOIN users u ON r.agent_id = u.id
    ORDER BY r.nom ASC
  `).all() as any
  return c.json({ restos: results })
})

// ============================================================
// GET /api/admin/marques/:id
// Détail d'une marque + commandes récentes
// ============================================================
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const m = await c.env.DB.prepare(`
    SELECT m.*,
      r.id as restaurant_id, r.nom as restaurant_nom, r.ville as restaurant_ville,
      COALESCE(r.is_portefeuille_proprietaire, 0) as resto_portefeuille,
      u.id as agent_id, u.nom as agent_nom, u.prenom as agent_prenom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE m.id = ?
  `).bind(id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)

  const { results: recentes } = await c.env.DB.prepare(`
    SELECT id, date_commande, montant_brut, statut
    FROM commandes WHERE marque_id = ?
    ORDER BY date_commande DESC LIMIT 20
  `).bind(id).all() as any

  return c.json({ marque: m, commandes_recentes: recentes })
})

// ============================================================
// POST /api/admin/marques
// Création
// Body : { restaurant_id, nom, uber_store_id?, plateforme?, date_lancement?, notes?, is_portefeuille_proprietaire? }
// ============================================================
app.post('/', async (c) => {
  const data = await c.req.json()
  const {
    restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes,
    is_portefeuille_proprietaire, date_signature_portefeuille,
    uber_manager_email, uber_manager_password, uber_manager_url,
    uber_orders_email, uber_orders_password, uber_orders_url,
    tablette_fournie, tablette_serial, tablette_notes,
    commission_info, acces_operationnels, statut_marque
  } = data

  if (!restaurant_id) return c.json({ error: 'restaurant_id requis' }, 400)
  if (!nom || !nom.trim()) return c.json({ error: 'Nom requis' }, 400)

  const resto = await c.env.DB.prepare(
    'SELECT id, agent_id FROM restaurants WHERE id = ?'
  ).bind(restaurant_id).first() as any
  if (!resto) return c.json({ error: 'Restaurant introuvable' }, 404)

  const r = await c.env.DB.prepare(`
    INSERT INTO marques_virtuelles
      (restaurant_id, nom, uber_store_id, plateforme, date_lancement, notes,
       is_portefeuille_proprietaire, date_signature_portefeuille,
       uber_manager_email, uber_manager_password, uber_manager_url,
       uber_orders_email, uber_orders_password, uber_orders_url,
       tablette_fournie, tablette_serial, tablette_notes,
       commission_info, acces_operationnels, statut_marque,
       actif, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    restaurant_id,
    nom.trim(),
    uber_store_id || null,
    plateforme || 'uber_eats',
    date_lancement || null,
    notes || null,
    is_portefeuille_proprietaire ? 1 : 0,
    date_signature_portefeuille || null,
    uber_manager_email || null,
    uber_manager_password || null,
    uber_manager_url || null,
    uber_orders_email || null,
    uber_orders_password || null,
    uber_orders_url || null,
    tablette_fournie ? 1 : 0,
    tablette_serial || null,
    tablette_notes || null,
    commission_info || null,
    acces_operationnels || null,
    statut_marque || 'en_creation'
  ).run()

  const newId = r.meta.last_row_id as number
  await recalculerRangsMarques(c.env.DB, restaurant_id)

  // Qualifier dans la tranche de l'agent (si pas en portefeuille forcé)
  let trancheInfo: any = null
  if (resto.agent_id && !is_portefeuille_proprietaire) {
    const q = await qualifierElement(c.env.DB, resto.agent_id, 'marque', newId)
    if (q.ok) trancheInfo = { position: q.position, attribution_100: q.attribution, numero_tranche: q.numero_tranche }
  }

  return c.json({ success: true, id: newId, tranche: trancheInfo })
})

// ============================================================
// PUT /api/admin/marques/:id
// Modification (nom, uber_store_id, plateforme, date_lancement, actif, notes)
// ============================================================
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()
  const m = await c.env.DB.prepare(
    'SELECT restaurant_id FROM marques_virtuelles WHERE id = ?'
  ).bind(id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)

  // Champs autorisés
  const updates: string[] = []
  const params: any[] = []
  const allowed = [
    'nom', 'uber_store_id', 'plateforme', 'date_lancement', 'actif', 'notes',
    // Acces Uber Eats Manager
    'uber_manager_email', 'uber_manager_password', 'uber_manager_url',
    // Acces Uber Eats Orders / Tablette
    'uber_orders_email', 'uber_orders_password', 'uber_orders_url',
    // Tablette
    'tablette_fournie', 'tablette_serial', 'tablette_notes',
    // Commissions et operationnel
    'commission_info', 'acces_operationnels',
    // Statut marque
    'statut_marque',
    // Portefeuille (signature)
    'is_portefeuille_proprietaire', 'date_signature_portefeuille'
  ]
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      updates.push(`${k} = ?`)
      params.push(data[k] === '' ? null : data[k])
    }
  }
  if (!updates.length) return c.json({ error: 'Aucun champ à mettre à jour' }, 400)

  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  await c.env.DB.prepare(
    `UPDATE marques_virtuelles SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  if (m.restaurant_id) await recalculerRangsMarques(c.env.DB, m.restaurant_id)
  return c.json({ success: true })
})

// ============================================================
// POST /api/admin/marques/:id/toggle-portefeuille
// Bascule manuelle du statut portefeuille propriétaire (override admin)
// ============================================================
app.post('/:id/toggle-portefeuille', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { is_portefeuille } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE marques_virtuelles SET is_portefeuille_proprietaire = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(is_portefeuille ? 1 : 0, id).run()
  return c.json({ success: true, is_portefeuille: is_portefeuille ? 1 : 0 })
})

// ============================================================
// POST /api/admin/marques/:id/move
// Déplacer une marque vers un autre restaurant (réassignation)
// Body : { restaurant_id }
// ============================================================
app.post('/:id/move', async (c) => {
  const id = parseInt(c.req.param('id'))
  const { restaurant_id } = await c.req.json()
  if (!restaurant_id) return c.json({ error: 'restaurant_id requis' }, 400)

  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id as old_resto, r.agent_id as old_agent
    FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)

  const newResto = await c.env.DB.prepare(
    'SELECT id, agent_id FROM restaurants WHERE id = ?'
  ).bind(restaurant_id).first() as any
  if (!newResto) return c.json({ error: 'Restaurant cible introuvable' }, 404)

  if (m.old_resto === restaurant_id) {
    return c.json({ error: 'La marque est déjà sur ce restaurant' }, 400)
  }

  // Déqualifier de l'ancien agent puis qualifier dans le nouveau
  if (m.old_agent) {
    await dequalifierElement(c.env.DB, m.old_agent, 'marque', id)
  }
  await c.env.DB.prepare(
    'UPDATE marques_virtuelles SET restaurant_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(restaurant_id, id).run()
  await recalculerRangsMarques(c.env.DB, m.old_resto)
  await recalculerRangsMarques(c.env.DB, restaurant_id)
  if (newResto.agent_id) {
    await qualifierElement(c.env.DB, newResto.agent_id, 'marque', id)
  }

  return c.json({ success: true })
})

// ============================================================
// DELETE /api/admin/marques/:id
// Suppression (refuse si commandes existantes — soft sinon)
// Query : ?force=1 pour supprimer aussi les commandes
// ============================================================
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const force = c.req.query('force') === '1'

  const m = await c.env.DB.prepare(`
    SELECT m.restaurant_id, r.agent_id FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id WHERE m.id = ?
  `).bind(id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)

  const cnt = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM commandes WHERE marque_id = ?'
  ).bind(id).first() as any

  if (cnt.n > 0 && !force) {
    return c.json({
      error: `Cette marque a ${cnt.n} commande(s) associée(s). Ajoutez ?force=1 pour la supprimer avec ses commandes, ou désactivez-la plutôt.`,
      nb_commandes: cnt.n
    }, 400)
  }

  if (force && cnt.n > 0) {
    await c.env.DB.prepare('DELETE FROM commandes WHERE marque_id = ?').bind(id).run()
  }

  await c.env.DB.prepare('DELETE FROM marques_virtuelles WHERE id = ?').bind(id).run()
  if (m.agent_id) await dequalifierElement(c.env.DB, m.agent_id, 'marque', id)
  if (m.restaurant_id) await recalculerRangsMarques(c.env.DB, m.restaurant_id)

  return c.json({ success: true, nb_commandes_supprimees: force ? cnt.n : 0 })
})

// ============================================================
// POST /api/admin/marques/bulk-toggle-actif
// Body : { ids: number[], actif: 0|1 }
// ============================================================
app.post('/bulk-toggle-actif', async (c) => {
  const { ids, actif } = await c.req.json()
  if (!Array.isArray(ids) || !ids.length) return c.json({ error: 'ids requis' }, 400)
  const placeholders = ids.map(() => '?').join(',')
  await c.env.DB.prepare(
    `UPDATE marques_virtuelles SET actif = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`
  ).bind(actif ? 1 : 0, ...ids).run()
  return c.json({ success: true, nb: ids.length })
})

export default app
