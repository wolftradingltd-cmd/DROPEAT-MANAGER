// ============================================================
// MODULE DEMANDES D'ATTRIBUTION 5ème MARQUE
// ============================================================
// Workflow :
// 1) Agent atteint sa 4ème marque qualifiée → la 5ème ouvre attribution
// 2) Agent choisit une marque qualifiée parmi celles éligibles
// 3) Superadmin valide / refuse
// 4) Si validée → marque devient portefeuille propriétaire
//    + la 1ère marque "héritée" du resto attribué bascule en tranche suivante
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// GET /api/admin/attribution/eligibles - Liste des marques candidates pour l'agent
app.get('/eligibles', async (c) => {
  const user = c.get('user')
  const agent_id = user.role === 'superadmin'
    ? parseInt(c.req.query('agent_id') || '0')
    : user.id
  if (!agent_id) return c.json({ error: 'agent_id requis' }, 400)

  // Marques de l'agent NON encore portefeuille NON encore comptabilisées en tranche
  const { results } = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.plateforme, m.uber_store_id,
      r.id as restaurant_id, r.nom as restaurant_nom, r.ville,
      m.is_portefeuille_proprietaire,
      m.heritee_de_resto_id, m.exclue_tranche,
      (SELECT COUNT(*) FROM commandes c WHERE c.marque_id = m.id) as nb_commandes,
      (SELECT COALESCE(SUM(c.montant_brut),0) FROM commandes c WHERE c.marque_id = m.id) as ca_total,
      (SELECT te.id FROM tranche_elements te
        WHERE te.agent_id = ? AND te.type = 'marque' AND te.element_id = m.id LIMIT 1) as deja_compte
    FROM marques_virtuelles m
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE r.agent_id = ?
      AND m.is_portefeuille_proprietaire = 0
      AND m.exclue_tranche = 0
    ORDER BY ca_total DESC, m.created_at DESC
  `).bind(agent_id, agent_id).all() as any

  return c.json({ marques_eligibles: results })
})

// POST /api/admin/attribution/demande - Créer demande d'attribution
app.post('/demande', async (c) => {
  const user = c.get('user')
  const { marque_id, motif, tranche_id } = await c.req.json()
  if (!marque_id) return c.json({ error: 'marque_id requis' }, 400)

  // Vérifier que la marque appartient à l'agent
  const m = await c.env.DB.prepare(`
    SELECT m.id, r.agent_id, m.is_portefeuille_proprietaire
    FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id
    WHERE m.id = ?
  `).bind(marque_id).first() as any
  if (!m) return c.json({ error: 'Marque introuvable' }, 404)
  if (user.role !== 'superadmin' && m.agent_id !== user.id) {
    return c.json({ error: 'Cette marque ne vous appartient pas' }, 403)
  }
  if (m.is_portefeuille_proprietaire) {
    return c.json({ error: 'Marque déjà en portefeuille' }, 400)
  }

  // Tranche ouverte de l'agent (type marque)
  let trId = tranche_id
  if (!trId) {
    const t = await c.env.DB.prepare(`
      SELECT id FROM tranches_attribution
      WHERE agent_id = ? AND type = 'marque' AND statut = 'ouverte' LIMIT 1
    `).bind(m.agent_id).first() as any
    if (!t) {
      // Crée la tranche
      const cnt = await c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM tranches_attribution WHERE agent_id = ? AND type = 'marque'`
      ).bind(m.agent_id).first() as any
      const numero = (cnt?.n || 0) + 1
      const r = await c.env.DB.prepare(`
        INSERT INTO tranches_attribution (agent_id, type, numero_tranche, statut)
        VALUES (?, 'marque', ?, 'ouverte')
      `).bind(m.agent_id, numero).run()
      trId = r.meta.last_row_id
    } else {
      trId = t.id
    }
  }

  // Anti-doublon : une seule demande en attente par tranche
  const existing = await c.env.DB.prepare(`
    SELECT id FROM demandes_attribution_marque
    WHERE agent_id = ? AND tranche_id = ? AND statut = 'en_attente'
  `).bind(m.agent_id, trId).first()
  if (existing) return c.json({ error: 'Une demande est déjà en attente pour cette tranche' }, 400)

  const r = await c.env.DB.prepare(`
    INSERT INTO demandes_attribution_marque (agent_id, tranche_id, marque_choisie_id, motif, statut)
    VALUES (?, ?, ?, ?, 'en_attente')
  `).bind(m.agent_id, trId, marque_id, motif || null).run()

  // Notifier le superadmin
  const supers = await c.env.DB.prepare(`SELECT id FROM users WHERE role = 'superadmin'`).all() as any
  for (const s of supers.results) {
    await c.env.DB.prepare(`
      INSERT INTO notifications (destinataire_id, type, titre, message, lien)
      VALUES (?, 'demande_attribution', ?, ?, ?)
    `).bind(s.id, `Nouvelle demande d'attribution`,
      `Demande pour marque #${marque_id}, tranche #${trId}`,
      `/#paliers`).run()
  }

  return c.json({ success: true, id: r.meta.last_row_id, tranche_id: trId })
})

// GET /api/admin/attribution/demandes - Liste des demandes
app.get('/demandes', async (c) => {
  const user = c.get('user')
  const statut = c.req.query('statut')

  let where = '1=1'
  const params: any[] = []
  if (user.role !== 'superadmin') {
    where += ' AND d.agent_id = ?'
    params.push(user.id)
  }
  if (statut) { where += ' AND d.statut = ?'; params.push(statut) }

  const { results } = await c.env.DB.prepare(`
    SELECT d.*,
      a.nom || ' ' || a.prenom as agent_nom, a.email as agent_email,
      m.nom as marque_nom, m.plateforme,
      r.nom as restaurant_nom, r.ville,
      v.nom || ' ' || v.prenom as validateur_nom,
      t.numero_tranche
    FROM demandes_attribution_marque d
    JOIN users a ON d.agent_id = a.id
    JOIN marques_virtuelles m ON d.marque_choisie_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN tranches_attribution t ON d.tranche_id = t.id
    LEFT JOIN users v ON d.validateur_id = v.id
    WHERE ${where}
    ORDER BY d.statut = 'en_attente' DESC, d.created_at DESC
    LIMIT 200
  `).bind(...params).all()

  return c.json({ demandes: results })
})

// PUT /api/admin/attribution/demande/:id/decision { decision, notes }
app.put('/demande/:id/decision', async (c) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)

  const id = parseInt(c.req.param('id'))
  const { decision, notes } = await c.req.json()
  if (!['validee', 'refusee'].includes(decision)) return c.json({ error: 'decision invalide' }, 400)

  const d = await c.env.DB.prepare(`
    SELECT * FROM demandes_attribution_marque WHERE id = ?
  `).bind(id).first() as any
  if (!d) return c.json({ error: 'Demande introuvable' }, 404)
  if (d.statut !== 'en_attente') return c.json({ error: 'Demande déjà traitée' }, 400)

  await c.env.DB.prepare(`
    UPDATE demandes_attribution_marque
    SET statut = ?, validateur_id = ?, date_decision = CURRENT_TIMESTAMP, notes_validateur = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(decision, u.id, notes || null, id).run()

  if (decision === 'validee') {
    // 1) Marque la marque comme portefeuille propriétaire
    await c.env.DB.prepare(`
      UPDATE marques_virtuelles SET is_portefeuille_proprietaire = 1 WHERE id = ?
    `).bind(d.marque_choisie_id).run()

    // 2) Position 5 dans la tranche + clôture
    const cntRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM tranche_elements WHERE tranche_id = ?`
    ).bind(d.tranche_id).first() as any
    const pos = Math.min(5, (cntRow?.n || 0) + 1)

    await c.env.DB.prepare(`
      INSERT INTO tranche_elements (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, notes)
      VALUES (?, ?, 'marque', ?, ?, 1, 'Attribution validée par superadmin')
    `).bind(d.tranche_id, d.agent_id, d.marque_choisie_id, pos).run()

    await c.env.DB.prepare(`
      UPDATE tranches_attribution
      SET statut = 'cloturee', date_cloture = CURRENT_TIMESTAMP,
          element_attribue_id = ?, validation_ecrite = 1,
          date_validation = CURRENT_TIMESTAMP, validateur_user_id = ?
      WHERE id = ?
    `).bind(d.marque_choisie_id, u.id, d.tranche_id).run()
  }

  // Notifier l'agent
  await c.env.DB.prepare(`
    INSERT INTO notifications (destinataire_id, type, titre, message, lien)
    VALUES (?, 'demande_attribution', ?, ?, ?)
  `).bind(d.agent_id,
    decision === 'validee' ? 'Attribution VALIDÉE' : 'Attribution refusée',
    notes || (decision === 'validee' ? 'Votre 5ème marque a été attribuée.' : 'Votre demande a été refusée.'),
    '/#a-paliers'
  ).run()

  return c.json({ success: true })
})

export default app
