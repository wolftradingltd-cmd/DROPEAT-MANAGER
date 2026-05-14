// ============================================================
// Routes /api/challenges — CRUD challenges + participation + récompenses
// ============================================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import {
  calculerProgression,
  synchroniserParticipation,
  synchroniserToutesParticipations,
  getChallengesActifsPourAgent,
  inscrireAgent,
  attribuerRecompense,
  type Challenge
} from '../lib/challenges'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

// ============================================================
// AGENT — mes challenges
// ============================================================

// GET /api/challenges/mine — challenges actifs où je participe (ou tous publics)
app.get('/mine', async (c) => {
  const user = c.get('user')
  const list = await getChallengesActifsPourAgent(c.env.DB, user.id)
  return c.json({ challenges: list })
})

// GET /api/challenges/mine/:id — détail d'un challenge + ma progression + éléments
app.get('/mine/:id{[0-9]+}', async (c) => {
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const challenge = await c.env.DB.prepare('SELECT * FROM challenges WHERE id = ? AND actif = 1').bind(id).first() as Challenge | null
  if (!challenge) return c.json({ error: 'Challenge introuvable' }, 404)

  const part = await c.env.DB.prepare(
    'SELECT * FROM challenge_participations WHERE challenge_id = ? AND agent_id = ?'
  ).bind(id, user.id).first() as any

  if (!part && challenge.cible !== 'tous') {
    return c.json({ error: 'Vous ne participez pas à ce challenge' }, 403)
  }

  const { progression, restos, marques } = await calculerProgression(c.env.DB, challenge, user.id)

  const { results: elements } = await c.env.DB.prepare(`
    SELECT * FROM challenge_elements
    WHERE agent_id = ? AND challenge_id = ?
    ORDER BY date_apport ASC
  `).bind(user.id, id).all() as any

  return c.json({ challenge, participation: part, progression, restos, marques, elements: elements || [] })
})

// POST /api/challenges/:id/participer — agent s'inscrit (si cible=tous)
app.post('/:id{[0-9]+}/participer', async (c) => {
  const user = c.get('user')
  const idStr = c.req.param('id')
  const id = parseInt(idStr)
  if (!Number.isFinite(id)) return c.json({ error: 'ID invalide' }, 400)
  const challenge = await c.env.DB.prepare('SELECT * FROM challenges WHERE id = ? AND actif = 1').bind(id).first() as Challenge | null
  if (!challenge) return c.json({ error: 'Challenge introuvable' }, 404)
  if (challenge.cible !== 'tous' && user.role !== 'superadmin') {
    return c.json({ error: 'Inscription réservée — challenge sur sélection' }, 403)
  }
  const r = await inscrireAgent(c.env.DB, id, user.id, user.id)
  return c.json({ success: true, ...r })
})

// POST /api/challenges/:id/synchroniser — recalcule ma progression
app.post('/:id{[0-9]+}/synchroniser', async (c) => {
  const user = c.get('user')
  const idStr = c.req.param('id')
  const id = parseInt(idStr)
  if (!Number.isFinite(id)) return c.json({ error: 'ID invalide' }, 400)
  const r = await synchroniserParticipation(c.env.DB, id, user.id).catch(e => ({ error: e.message }))
  return c.json(r as any)
})

// ============================================================
// SUPERADMIN — gestion des challenges
// ============================================================

function ensureAdmin(c: any) {
  const user = c.get('user')
  if (user.role !== 'superadmin') {
    return c.json({ error: 'Accès refusé : superadmin requis' }, 403)
  }
  return null
}

// GET /api/challenges/admin — liste de tous les challenges
app.get('/admin', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const { results } = await c.env.DB.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM challenge_participations WHERE challenge_id = c.id) as nb_participants,
      (SELECT COUNT(*) FROM challenge_participations WHERE challenge_id = c.id AND statut = 'reussi') as nb_reussis,
      (SELECT COUNT(*) FROM challenge_participations WHERE challenge_id = c.id AND statut = 'recompense_attribuee') as nb_recompenses
    FROM challenges c
    ORDER BY c.date_debut DESC
  `).all() as any
  return c.json({ challenges: results || [] })
})

// GET /api/challenges/admin/:id — détail challenge + liste participants
app.get('/admin/:id{[0-9]+}', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const id = parseInt(c.req.param('id'))
  const challenge = await c.env.DB.prepare('SELECT * FROM challenges WHERE id = ?').bind(id).first() as Challenge | null
  if (!challenge) return c.json({ error: 'Challenge introuvable' }, 404)

  const { results: participations } = await c.env.DB.prepare(`
    SELECT cp.*, u.nom, u.prenom, u.email
    FROM challenge_participations cp
    JOIN users u ON cp.agent_id = u.id
    WHERE cp.challenge_id = ?
    ORDER BY cp.progression_actuelle DESC, cp.date_participation ASC
  `).bind(id).all() as any

  return c.json({ challenge, participations: participations || [] })
})

// POST /api/challenges/admin — créer un challenge
app.post('/admin', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const user = c.get('user')
  const body = await c.req.json()
  const {
    code, nom, description,
    date_debut, date_fin,
    type_objectif, objectif_quantite,
    type_recompense, recompense_quantite, recompense_montant, recompense_description,
    suspend_tranche_standard, cible,
    notes_internes,
    participants_ids // array d'agent_id pour cible='selection'
  } = body

  if (!code || !nom || !date_debut || !date_fin || !type_objectif || !objectif_quantite || !type_recompense) {
    return c.json({ error: 'Champs obligatoires manquants : code, nom, date_debut, date_fin, type_objectif, objectif_quantite, type_recompense' }, 400)
  }

  try {
    const r = await c.env.DB.prepare(`
      INSERT INTO challenges (
        code, nom, description,
        date_debut, date_fin,
        type_objectif, objectif_quantite,
        type_recompense, recompense_quantite, recompense_montant, recompense_description,
        suspend_tranche_standard, cible,
        notes_internes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      code, nom, description || null,
      date_debut, date_fin,
      type_objectif, objectif_quantite,
      type_recompense, recompense_quantite || null, recompense_montant || null, recompense_description || null,
      suspend_tranche_standard ? 1 : 0, cible || 'tous',
      notes_internes || null, user.id
    ).run()
    const challengeId = r.meta.last_row_id as number

    // Inscrire les participants présélectionnés
    let nb_inscrits = 0
    if (Array.isArray(participants_ids) && participants_ids.length) {
      for (const aid of participants_ids) {
        try {
          await inscrireAgent(c.env.DB, challengeId, aid, user.id)
          nb_inscrits++
        } catch {}
      }
    } else if ((cible || 'tous') === 'tous') {
      // Auto-inscrire tous les agents actifs
      const { results } = await c.env.DB.prepare(`SELECT id FROM users WHERE role = 'agent' AND actif = 1`).all() as any
      for (const a of results || []) {
        try {
          await inscrireAgent(c.env.DB, challengeId, a.id, user.id)
          nb_inscrits++
        } catch {}
      }
    }

    return c.json({ success: true, challenge_id: challengeId, nb_inscrits })
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) {
      return c.json({ error: `Le code "${code}" existe déjà` }, 400)
    }
    return c.json({ error: e.message }, 500)
  }
})

// PUT /api/challenges/admin/:id — modifier
app.put('/admin/:id{[0-9]+}', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const fields: string[] = []
  const values: any[] = []
  const allowed = [
    'nom', 'description', 'date_debut', 'date_fin',
    'type_objectif', 'objectif_quantite',
    'type_recompense', 'recompense_quantite', 'recompense_montant', 'recompense_description',
    'suspend_tranche_standard', 'cible',
    'actif', 'notes_internes'
  ]
  for (const k of allowed) {
    if (k in body) {
      fields.push(`${k} = ?`)
      values.push(k === 'suspend_tranche_standard' || k === 'actif' ? (body[k] ? 1 : 0) : body[k])
    }
  }
  if (!fields.length) return c.json({ error: 'Aucun champ à modifier' }, 400)
  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)
  await c.env.DB.prepare(`UPDATE challenges SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// DELETE /api/challenges/admin/:id — supprimer (cascade participations + éléments)
app.delete('/admin/:id{[0-9]+}', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const id = parseInt(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM challenges WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// POST /api/challenges/admin/:id/inscrire — inscrire un agent manuellement
app.post('/admin/:id{[0-9]+}/inscrire', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const user = c.get('user')
  const id = parseInt(c.req.param('id'))
  const { agent_id } = await c.req.json()
  if (!agent_id) return c.json({ error: 'agent_id obligatoire' }, 400)
  const r = await inscrireAgent(c.env.DB, id, agent_id, user.id)
  return c.json({ success: true, ...r })
})

// DELETE /api/challenges/admin/:id/participations/:pid — retirer un participant
app.delete('/admin/:id{[0-9]+}/participations/:pid{[0-9]+}', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const pid = parseInt(c.req.param('pid'))
  await c.env.DB.prepare('DELETE FROM challenge_participations WHERE id = ?').bind(pid).run()
  return c.json({ success: true })
})

// POST /api/challenges/admin/synchroniser — recalcule toutes les progressions
app.post('/admin/synchroniser', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const n = await synchroniserToutesParticipations(c.env.DB)
  return c.json({ success: true, nb_synchronises: n })
})

// POST /api/challenges/admin/participations/:pid/recompenser
// Attribue les récompenses (ex : 15 restos en portefeuille 100%)
app.post('/admin/participations/:pid{[0-9]+}/recompenser', async (c) => {
  const guard = ensureAdmin(c); if (guard) return guard
  const user = c.get('user')
  const pid = parseInt(c.req.param('pid'))
  const body = await c.req.json().catch(() => ({}))
  try {
    const r = await attribuerRecompense(c.env.DB, pid, user.id, body)
    return c.json(r)
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

export default app
