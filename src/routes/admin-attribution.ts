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
// Règle métier : l'agent ne peut choisir QUE parmi les marques de SA TRANCHE OUVERTE COURANTE
// (les marques 1, 2, 3, 4 déjà qualifiées dans cette tranche). Les marques d'anciennes
// tranches clôturées ou hors tranche ouverte ne sont pas visibles.
app.get('/eligibles', async (c) => {
  const user = c.get('user')
  const agent_id = user.role === 'superadmin'
    ? parseInt(c.req.query('agent_id') || '0')
    : user.id
  if (!agent_id) return c.json({ error: 'agent_id requis' }, 400)

  // 1) Tranche marque OUVERTE de l'agent (s'il en a une)
  const trancheOuverte = await c.env.DB.prepare(`
    SELECT id, numero_tranche FROM tranches_attribution
    WHERE agent_id = ? AND type = 'marque' AND statut = 'ouverte' LIMIT 1
  `).bind(agent_id).first() as any

  // 2) Si pas de tranche ouverte → aucune marque éligible (l'agent n'a pas atteint le palier requis)
  if (!trancheOuverte) {
    return c.json({
      marques_eligibles: [],
      tranche_ouverte: null,
      message: "Aucune tranche ouverte : ajoutez des marques pour ouvrir un nouveau palier."
    })
  }

  // 3) Récupère les marques qualifiées dans cette tranche ouverte (positions 1..4)
  //    Ce sont les SEULES qui peuvent être candidates pour la 5e (portefeuille)
  const { results } = await c.env.DB.prepare(`
    SELECT m.id, m.nom, m.plateforme, m.uber_store_id,
      r.id as restaurant_id, r.nom as restaurant_nom, r.ville,
      m.is_portefeuille_proprietaire,
      m.heritee_de_resto_id, m.exclue_tranche,
      m.date_lancement, m.statut_marque,
      te.position_dans_tranche,
      (SELECT COUNT(*) FROM commandes co WHERE co.marque_id = m.id AND co.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as nb_commandes,
      (SELECT COALESCE(SUM(co.montant_brut),0) FROM commandes co WHERE co.marque_id = m.id AND co.statut NOT IN ('annulee', 'remboursee', 'impayee', 'resiliee')) as ca_total
    FROM tranche_elements te
    JOIN marques_virtuelles m ON te.element_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    WHERE te.agent_id = ?
      AND te.type = 'marque'
      AND te.tranche_id = ?
      AND te.is_attribution = 0
      AND m.is_portefeuille_proprietaire = 0
      AND COALESCE(m.exclue_tranche, 0) = 0
    ORDER BY ca_total DESC, te.position_dans_tranche ASC
  `).bind(agent_id, trancheOuverte.id).all() as any

  // 4) Compteur : on a besoin de 4 marques qualifiées avant la 5e (palier 5)
  const cntRow = await c.env.DB.prepare(`
    SELECT COUNT(*) as n FROM tranche_elements
    WHERE tranche_id = ? AND is_attribution = 0
  `).bind(trancheOuverte.id).first() as any
  const nbDansTranche = cntRow?.n || 0
  const palierPret = nbDansTranche >= 4

  return c.json({
    marques_eligibles: results,
    tranche_ouverte: {
      id: trancheOuverte.id,
      numero_tranche: trancheOuverte.numero_tranche,
      nb_qualifiees: nbDansTranche,
      palier_pret: palierPret,
      seuil: 5
    },
    message: palierPret
      ? "Vous pouvez choisir votre 5e marque parmi celles déjà qualifiées dans la tranche."
      : `Encore ${4 - nbDansTranche} marque(s) à qualifier avant d'ouvrir votre choix portefeuille.`
  })
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

  // Règle : la marque candidate doit faire partie de la tranche ouverte courante
  // (palier/tranche : on ne choisit que parmi 1..4 déjà qualifiées dans la tranche)
  const inTranche = await c.env.DB.prepare(`
    SELECT id, position_dans_tranche FROM tranche_elements
    WHERE tranche_id = ? AND element_id = ? AND type = 'marque' AND COALESCE(is_attribution, 0) = 0
  `).bind(trId, marque_id).first() as any
  if (!inTranche) {
    return c.json({
      error: "Cette marque n'est pas dans votre tranche ouverte courante. Seules les marques 1 à 4 qualifiées dans la tranche actuelle peuvent être choisies."
    }, 400)
  }

  // Le palier 5 doit être atteint : au moins 4 marques qualifiées dans la tranche
  const cntInTranche = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM tranche_elements WHERE tranche_id = ? AND COALESCE(is_attribution,0)=0`
  ).bind(trId).first() as any
  if ((cntInTranche?.n || 0) < 4) {
    return c.json({
      error: `Palier non atteint : ${cntInTranche?.n || 0}/4 marques qualifiées dans la tranche. Vous devez qualifier 4 marques avant de choisir la 5e en portefeuille.`
    }, 400)
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

// PUT /api/admin/attribution/demande/:id/decision { decision, notes, date_signature_portefeuille? }
//
// Règle métier importante :
//   - Si decision='validee', on DOIT enregistrer la date de signature du contrat
//     de portefeuille (date_signature_portefeuille). Par défaut = aujourd'hui.
//     Cette date marque le début effectif du régime "100% agent" pour la marque.
//     Les commandes < date_signature restent en commissions normales (DropEat+N+1/N+2).
//   - Si decision='refusee', la demande disparaît automatiquement de la liste
//     "en_attente" de l'agent (filtrée par statut côté front).
app.put('/demande/:id/decision', async (c) => {
  const u = c.get('user')
  if (u.role !== 'superadmin') return c.json({ error: 'Réservé superadmin' }, 403)

  const id = parseInt(c.req.param('id'))
  const { decision, notes, date_signature_portefeuille } = await c.req.json()
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
    // 1) Date de signature du contrat portefeuille (par défaut : aujourd'hui)
    const dateSign = (date_signature_portefeuille && /^\d{4}-\d{2}-\d{2}$/.test(date_signature_portefeuille))
      ? date_signature_portefeuille
      : new Date().toISOString().substring(0, 10)

    // 2) Marque la marque comme portefeuille propriétaire + enregistre la date de signature
    await c.env.DB.prepare(`
      UPDATE marques_virtuelles
      SET is_portefeuille_proprietaire = 1,
          date_signature_portefeuille = ?,
          statut_marque = 'portefeuille',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(dateSign, d.marque_choisie_id).run()

    // 3) Position 5 dans la tranche + clôture (si pas déjà au cnt=5)
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
  } else if (decision === 'refusee') {
    // Marque la marque comme "refusee" (statut_marque) pour info dans le dashboard
    // (la marque reste vivante mais ne sera plus présentée dans les éligibles tant
    // que l'agent ne refait pas une demande)
    await c.env.DB.prepare(`
      UPDATE marques_virtuelles SET statut_marque = 'refusee', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND COALESCE(statut_marque, '') = ''
    `).bind(d.marque_choisie_id).run()
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

// GET /api/admin/attribution/demandes-en-attente-agent
//   Pour l'agent : récupère uniquement ses demandes EN ATTENTE
//   (les refusées disparaissent automatiquement de cette liste).
app.get('/demandes-en-attente-agent', async (c) => {
  const user = c.get('user')
  const agent_id = user.role === 'superadmin'
    ? parseInt(c.req.query('agent_id') || '0')
    : user.id
  if (!agent_id) return c.json({ error: 'agent_id requis' }, 400)

  const { results } = await c.env.DB.prepare(`
    SELECT d.id, d.agent_id, d.tranche_id, d.marque_choisie_id, d.motif, d.statut, d.created_at,
      m.nom as marque_nom, m.plateforme,
      r.nom as restaurant_nom, r.ville,
      t.numero_tranche
    FROM demandes_attribution_marque d
    JOIN marques_virtuelles m ON d.marque_choisie_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    JOIN tranches_attribution t ON d.tranche_id = t.id
    WHERE d.agent_id = ? AND d.statut = 'en_attente'
    ORDER BY d.created_at DESC
  `).bind(agent_id).all() as any

  return c.json({ demandes_en_attente: results })
})

export default app
