// ============================================================
// MODULE TRAÇABILITÉ 100% — Historique commandes & commissions par marque
// ============================================================
// Pour chaque marque virtuelle, on peut consulter :
// - Toutes les commandes (date, prix, frais, net, statut, type)
// - La commission générée par chaque commande (propre, N+1, N+2)
// - Les paliers appliqués
// - Le récap CSV import par import
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// Helper : vérifier qu'un user a le droit de voir une marque
async function userPeutVoirMarque(db: D1Database, userId: number, role: string, marqueId: number): Promise<boolean> {
  if (role === 'superadmin') return true
  const r = await db.prepare(`
    SELECT r.agent_id FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(marqueId).first() as any
  if (!r) return false
  if (r.agent_id === userId) return true
  // Vérifier ascendance MLM
  let cur = r.agent_id
  for (let i = 0; i < 6; i++) {
    if (!cur) break
    const p = await db.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
    cur = p?.parent_id
    if (cur === userId) return true
  }
  return false
}

// GET /api/admin/tracabilite/marque/:id/commandes
// Historique complet des commandes pour une marque + commission ligne par ligne
app.get('/marque/:id/commandes', async (c) => {
  const user = c.get('user')
  const marqueId = parseInt(c.req.param('id'))
  const limit = parseInt(c.req.query('limit') || '500')
  const offset = parseInt(c.req.query('offset') || '0')
  const date_debut = c.req.query('date_debut')
  const date_fin = c.req.query('date_fin')
  const statut = c.req.query('statut')

  if (!await userPeutVoirMarque(c.env.DB, user.id, user.role, marqueId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  // Marque + restaurant + agent
  const marque = await c.env.DB.prepare(`
    SELECT m.*, r.nom as restaurant_nom, r.ville, r.is_portefeuille_proprietaire,
      r.agent_id, u.nom || ' ' || u.prenom as agent_nom, u.niveau as agent_niveau,
      u.email as agent_email
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    WHERE m.id = ?
  `).bind(marqueId).first() as any

  if (!marque) return c.json({ error: 'Marque introuvable' }, 404)

  // Filtres commandes
  const where: string[] = ['c.marque_id = ?']
  const params: any[] = [marqueId]
  if (date_debut) { where.push('c.date_commande >= ?'); params.push(date_debut) }
  if (date_fin) { where.push('c.date_commande <= ?'); params.push(date_fin + 'T23:59:59') }
  if (statut) { where.push('c.statut = ?'); params.push(statut) }

  // Commandes détaillées (avec facturation resto + paliers appliqués)
  const { results: commandes } = await c.env.DB.prepare(`
    SELECT c.id, c.uber_order_id, c.uber_uuid, c.date_commande, c.statut, c.type_honoree,
      c.montant_brut, c.frais_uber, c.montant_net,
      c.montant_facture_resto,
      c.commission_agent_montant, c.commission_portefeuille_montant,
      c.commission_n1_montant, c.commission_n2_montant,
      c.marge_dropeat_montant,
      c.commission_taux_propre, c.commission_calculee_at,
      c.is_portefeuille_snapshot, c.is_tablette_snapshot,
      c.palier_facture_id, c.palier_agent_id,
      pf.type as palier_facture_type, pf.seuil_min as palier_facture_min,
      pf.seuil_max as palier_facture_max, pf.montant_par_commande as palier_facture_montant,
      pa.type as palier_agent_type, pa.seuil_min as palier_agent_min,
      pa.seuil_max as palier_agent_max, pa.montant_par_commande as palier_agent_montant,
      i.nom_fichier as import_nom, i.created_at as import_date
    FROM commandes c
    LEFT JOIN paliers_commissions pf ON c.palier_facture_id = pf.id
    LEFT JOIN paliers_commissions pa ON c.palier_agent_id = pa.id
    LEFT JOIN imports_csv i ON c.import_id = i.id
    WHERE ${where.join(' AND ')}
    ORDER BY c.date_commande DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all() as any

  // Stats globales (avec facturation resto + marge DropEat)
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca_total,
      COALESCE(SUM(c.frais_uber), 0) as frais_uber_total,
      COALESCE(SUM(c.montant_net), 0) as net_total,
      COALESCE(SUM(c.montant_facture_resto), 0) as facture_resto_total,
      COALESCE(SUM(c.commission_agent_montant), 0) as commission_propre_total,
      COALESCE(SUM(c.commission_portefeuille_montant), 0) as commission_portefeuille_total,
      COALESCE(SUM(c.commission_n1_montant), 0) as commission_n1_total,
      COALESCE(SUM(c.commission_n2_montant), 0) as commission_n2_total,
      COALESCE(SUM(c.marge_dropeat_montant), 0) as marge_dropeat_total,
      MIN(c.date_commande) as premiere,
      MAX(c.date_commande) as derniere
    FROM commandes c
    WHERE ${where.join(' AND ')}
  `).bind(...params).first() as any

  // Stats par mois (pour graphique)
  const { results: mensuel } = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m', c.date_commande) as mois,
      COUNT(*) as nb,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.commission_agent_montant + c.commission_n1_montant + c.commission_n2_montant), 0) as commissions
    FROM commandes c
    WHERE ${where.join(' AND ')}
    GROUP BY mois ORDER BY mois
  `).bind(...params).all()

  // Stats par statut
  const { results: par_statut } = await c.env.DB.prepare(`
    SELECT c.statut, COUNT(*) as nb, COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c WHERE ${where.join(' AND ')}
    GROUP BY c.statut
  `).bind(...params).all()

  // Stats par type honorée
  const { results: par_type } = await c.env.DB.prepare(`
    SELECT COALESCE(c.type_honoree, 'inconnu') as type, COUNT(*) as nb,
      COALESCE(SUM(c.montant_brut), 0) as ca
    FROM commandes c WHERE ${where.join(' AND ')}
    GROUP BY type
  `).bind(...params).all()

  return c.json({
    marque,
    stats,
    mensuel,
    par_statut,
    par_type,
    commandes,
    pagination: { limit, offset, has_more: commandes.length === limit }
  })
})

// GET /api/admin/tracabilite/marque/:id/recap
// Récap synthétique pour vue rapide (badge marque)
app.get('/marque/:id/recap', async (c) => {
  const user = c.get('user')
  const marqueId = parseInt(c.req.param('id'))
  if (!await userPeutVoirMarque(c.env.DB, user.id, user.role, marqueId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  const r = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as nb_commandes,
      COALESCE(SUM(montant_brut), 0) as ca_total,
      COALESCE(SUM(montant_facture_resto), 0) as facture_resto_total,
      COALESCE(SUM(commission_agent_montant), 0) as comm_propre,
      COALESCE(SUM(commission_portefeuille_montant), 0) as comm_portefeuille,
      COALESCE(SUM(commission_n1_montant), 0) as comm_n1,
      COALESCE(SUM(commission_n2_montant), 0) as comm_n2,
      COALESCE(SUM(marge_dropeat_montant), 0) as marge_dropeat,
      MIN(date_commande) as premiere,
      MAX(date_commande) as derniere
    FROM commandes WHERE marque_id = ?
  `).bind(marqueId).first()
  return c.json(r)
})

// ============================================================
// GET /api/admin/tracabilite/marque/:id/facture?annee=YYYY&mois=MM
// FACTURE DROPEAT POUR UNE MARQUE — détail par palier
// ============================================================
// Retourne :
//   - récap (nb cmds, CA, facturation, commission agent N0/N1/N2, marge DropEat)
//   - détail par palier (nb cmds dans le palier, montant facturé, montant commission)
//   - lignes : agent qui touche, parent, grand-parent
// ============================================================
app.get('/marque/:id/facture', async (c) => {
  const user = c.get('user')
  const marqueId = parseInt(c.req.param('id'))
  const annee = parseInt(c.req.query('annee') || String(new Date().getFullYear()))
  const mois  = parseInt(c.req.query('mois')  || String(new Date().getMonth() + 1))
  if (!await userPeutVoirMarque(c.env.DB, user.id, user.role, marqueId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }

  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const finJ  = new Date(annee, mois, 0).getDate()
  const fin   = `${annee}-${String(mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}T23:59:59`

  // En-tête marque + restaurant + agent
  const marque = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.plateforme, m.is_portefeuille_proprietaire,
      r.id as restaurant_id, r.nom as restaurant_nom, r.tablette_sr_shop,
      r.is_portefeuille_proprietaire as resto_portefeuille,
      r.agent_id, u.nom as agent_nom, u.prenom as agent_prenom, u.niveau as agent_niveau,
      pa.id as parent_id, pa.nom as parent_nom, pa.prenom as parent_prenom,
      gpa.id as grand_parent_id, gpa.nom as grand_parent_nom, gpa.prenom as grand_parent_prenom
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u   ON r.agent_id = u.id
    LEFT JOIN users pa  ON u.parent_id = pa.id
    LEFT JOIN users gpa ON pa.parent_id = gpa.id
    WHERE m.id = ?
  `).bind(marqueId).first() as any
  if (!marque) return c.json({ error: 'Marque introuvable' }, 404)

  // Récap période
  const recap = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as nb_commandes,
      COALESCE(SUM(montant_brut), 0) as ca,
      COALESCE(SUM(montant_facture_resto), 0) as facturation_resto,
      COALESCE(SUM(commission_agent_montant), 0) as commission_agent,
      COALESCE(SUM(commission_portefeuille_montant), 0) as commission_portefeuille,
      COALESCE(SUM(commission_n1_montant), 0) as commission_n1,
      COALESCE(SUM(commission_n2_montant), 0) as commission_n2,
      COALESCE(SUM(marge_dropeat_montant), 0) as marge_dropeat
    FROM commandes
    WHERE marque_id = ? AND date_commande >= ? AND date_commande <= ?
      AND statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
  `).bind(marqueId, debut, fin).first() as any

  // Détail par palier facturation : combien de commandes dans chaque tranche, combien facturé
  const { results: par_palier_facture } = await c.env.DB.prepare(`
    SELECT
      c.palier_facture_id as palier_id,
      p.type as palier_type,
      p.seuil_min, p.seuil_max, p.montant_par_commande,
      COUNT(*) as nb_commandes,
      COALESCE(SUM(c.montant_brut), 0) as ca,
      COALESCE(SUM(c.montant_facture_resto), 0) as facturation
    FROM commandes c
    LEFT JOIN paliers_commissions p ON c.palier_facture_id = p.id
    WHERE c.marque_id = ? AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY c.palier_facture_id
    ORDER BY p.seuil_min
  `).bind(marqueId, debut, fin).all()

  // Détail par palier commission agent
  const { results: par_palier_agent } = await c.env.DB.prepare(`
    SELECT
      c.palier_agent_id as palier_id,
      p.type as palier_type,
      p.seuil_min, p.seuil_max, p.montant_par_commande,
      COUNT(*) as nb_commandes,
      COALESCE(SUM(c.commission_agent_montant + c.commission_portefeuille_montant), 0) as commission
    FROM commandes c
    LEFT JOIN paliers_commissions p ON c.palier_agent_id = p.id
    WHERE c.marque_id = ? AND c.date_commande >= ? AND c.date_commande <= ?
      AND c.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')
    GROUP BY c.palier_agent_id
    ORDER BY p.seuil_min
  `).bind(marqueId, debut, fin).all()

  return c.json({
    periode: { annee, mois, debut, fin },
    marque,
    recap,
    par_palier_facture,
    par_palier_agent
  })
})

// GET /api/admin/tracabilite/restaurant/:id/synthese
// Synthèse globale pour un restaurant (toutes ses marques)
app.get('/restaurant/:id/synthese', async (c) => {
  const user = c.get('user')
  const restoId = parseInt(c.req.param('id'))

  // Permission via marque (au moins une marque visible)
  const r = await c.env.DB.prepare(`
    SELECT agent_id FROM restaurants WHERE id = ?
  `).bind(restoId).first() as any
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404)

  if (user.role !== 'superadmin') {
    let ok = r.agent_id === user.id
    if (!ok) {
      let cur = r.agent_id
      for (let i = 0; i < 6 && cur; i++) {
        const p = await c.env.DB.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
        cur = p?.parent_id
        if (cur === user.id) { ok = true; break }
      }
    }
    if (!ok) return c.json({ error: 'Accès refusé' }, 403)
  }

  // Marques avec leurs stats (incluant facturation resto + marge DropEat)
  const { results: marques } = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.plateforme, m.uber_store_id, m.actif,
      m.is_portefeuille_proprietaire, m.heritee_de_resto_id, m.exclue_tranche,
      m.date_lancement, m.created_at,
      (SELECT COUNT(*) FROM commandes WHERE marque_id = m.id) as nb_commandes,
      (SELECT COALESCE(SUM(montant_brut), 0) FROM commandes WHERE marque_id = m.id) as ca_total,
      (SELECT COALESCE(SUM(montant_facture_resto), 0) FROM commandes WHERE marque_id = m.id) as facture_resto_total,
      (SELECT COALESCE(SUM(commission_agent_montant), 0) FROM commandes WHERE marque_id = m.id) as comm_propre,
      (SELECT COALESCE(SUM(commission_portefeuille_montant), 0) FROM commandes WHERE marque_id = m.id) as comm_portefeuille,
      (SELECT COALESCE(SUM(commission_n1_montant), 0) FROM commandes WHERE marque_id = m.id) as comm_n1,
      (SELECT COALESCE(SUM(commission_n2_montant), 0) FROM commandes WHERE marque_id = m.id) as comm_n2,
      (SELECT COALESCE(SUM(marge_dropeat_montant), 0) FROM commandes WHERE marque_id = m.id) as marge_dropeat,
      (SELECT MIN(date_commande) FROM commandes WHERE marque_id = m.id) as premiere_cmd,
      (SELECT MAX(date_commande) FROM commandes WHERE marque_id = m.id) as derniere_cmd,
      (SELECT COUNT(*) FROM marque_plateformes WHERE marque_id = m.id) as nb_plateformes
    FROM marques_virtuelles m
    WHERE m.restaurant_id = ?
    ORDER BY m.created_at
  `).bind(restoId).all()

  return c.json({ restaurant_id: restoId, marques })
})

export default app
