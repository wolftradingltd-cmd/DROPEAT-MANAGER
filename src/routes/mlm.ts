// ============================================================
// VUE MLM HIÉRARCHIQUE — accessible par tout agent et superadmin
// ============================================================
// Un parent voit le CA de ses filleuls (N+1) et sous-filleuls (N+2).
// Routes :
//   GET /api/mlm/tree                - Arborescence complète depuis le user courant
//   GET /api/mlm/tree/full           - Toute la pyramide (superadmin uniquement)
//   GET /api/mlm/branche/:agent_id   - Branche d'un agent + CA cumulé
//   GET /api/mlm/ca-filleuls?annee=&mois= - Récap CA filleuls/sous-filleuls
//   POST /api/mlm/sous-agent          - Création directe d'un sous-agent (sans invitation)
// ============================================================

import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireAuth, type AuthVariables } from '../middleware/auth'
import { hashPassword } from '../lib/auth'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()
app.use('*', requireAuth)

/**
 * Récupère récursivement tous les descendants d'un user (filleuls + sous-filleuls + …).
 * Retourne aussi le CA de chacun (toutes commandes confondues + sur une période).
 */
async function buildArborescence(
  db: D1Database,
  rootUserId: number,
  periode?: { annee: number, mois: number }
): Promise<any> {
  // 1. Récupérer la racine
  const root = await db.prepare(`
    SELECT id, nom, prenom, email, niveau, parent_id, actif, telephone, derniere_connexion
    FROM users WHERE id = ?
  `).bind(rootUserId).first() as any
  if (!root) return null

  // 2. BFS pour récupérer tous les descendants (max 5 niveaux par sécurité)
  const all: Map<number, any> = new Map()
  all.set(root.id, { ...root, children: [] })
  let frontier = [root.id]
  for (let depth = 0; depth < 5 && frontier.length; depth++) {
    const ph = frontier.map(() => '?').join(',')
    const { results } = await db.prepare(`
      SELECT id, nom, prenom, email, niveau, parent_id, actif, telephone, derniere_connexion
      FROM users WHERE parent_id IN (${ph}) AND role = 'agent'
    `).bind(...frontier).all() as any
    const next: number[] = []
    for (const u of results as any[]) {
      all.set(u.id, { ...u, children: [] })
      next.push(u.id)
    }
    frontier = next
  }

  // 3. Pour chaque user, récupérer stats : nb restos, nb marques, CA total, CA période
  const ids = Array.from(all.keys())
  if (ids.length) {
    const ph = ids.map(() => '?').join(',')
    const { results: stats } = await db.prepare(`
      SELECT u.id,
        (SELECT COUNT(*) FROM restaurants r WHERE r.agent_id = u.id) as nb_restaurants,
        (SELECT COUNT(*) FROM marques_virtuelles m JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_marques,
        (SELECT COUNT(*) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as nb_commandes,
        (SELECT COALESCE(SUM(c.montant_brut), 0) FROM commandes c JOIN marques_virtuelles m ON c.marque_id = m.id JOIN restaurants r ON m.restaurant_id = r.id WHERE r.agent_id = u.id) as ca_total
      FROM users u
      WHERE u.id IN (${ph})
    `).bind(...ids).all() as any
    for (const s of stats as any[]) {
      const node = all.get(s.id)
      if (node) Object.assign(node, s)
    }
  }

  // 4. Si période fournie, ajouter ca_periode pour chacun
  if (periode && ids.length) {
    const debut = `${periode.annee}-${String(periode.mois).padStart(2, '0')}-01`
    const finJ = new Date(periode.annee, periode.mois, 0).getDate()
    const fin = `${periode.annee}-${String(periode.mois).padStart(2, '0')}-${String(finJ).padStart(2, '0')}`
    const ph = ids.map(() => '?').join(',')
    const { results: caPer } = await db.prepare(`
      SELECT r.agent_id as user_id,
             COALESCE(SUM(c.montant_brut), 0) as ca_periode,
             COUNT(c.id) as nb_cmds_periode
      FROM commandes c
      JOIN marques_virtuelles m ON c.marque_id = m.id
      JOIN restaurants r ON m.restaurant_id = r.id
      WHERE r.agent_id IN (${ph})
        AND c.date_commande >= ? AND c.date_commande <= ?
        AND c.statut != 'annulee'
      GROUP BY r.agent_id
    `).bind(...ids, debut, fin).all() as any
    for (const node of all.values()) {
      node.ca_periode = 0
      node.nb_cmds_periode = 0
    }
    for (const c of caPer as any[]) {
      const node = all.get(c.user_id)
      if (node) {
        node.ca_periode = c.ca_periode
        node.nb_cmds_periode = c.nb_cmds_periode
      }
    }
  }

  // 5. Construire l'arbre (children)
  for (const node of all.values()) {
    if (node.parent_id && all.has(node.parent_id) && node.id !== rootUserId) {
      all.get(node.parent_id).children.push(node)
    }
  }

  // 6. Calculer CA cumulé descendant (filleuls + sous-filleuls) en post-order
  function aggregeRecursif(node: any): { total: number, periode: number } {
    let totalCumul = node.ca_total || 0
    let periodeCumul = node.ca_periode || 0
    let caFilleuls = 0, caFilleulsPeriode = 0
    let caSousFilleuls = 0, caSousFilleulsPeriode = 0
    for (const child of node.children) {
      const sub = aggregeRecursif(child)
      // Niveau direct (filleul) = +1
      caFilleuls += child.ca_total || 0
      caFilleulsPeriode += child.ca_periode || 0
      // Niveau indirect (sous-filleul) = sous-arbre du child
      caSousFilleuls += (sub.total - (child.ca_total || 0))
      caSousFilleulsPeriode += (sub.periode - (child.ca_periode || 0))
      totalCumul += sub.total
      periodeCumul += sub.periode
    }
    node.ca_filleuls = caFilleuls
    node.ca_sous_filleuls = caSousFilleuls
    node.ca_filleuls_periode = caFilleulsPeriode
    node.ca_sous_filleuls_periode = caSousFilleulsPeriode
    node.ca_branche_total = totalCumul        // tout l'arbre dont lui
    node.ca_branche_periode = periodeCumul
    node.nb_descendants = node.children.reduce((s: number, ch: any) => s + 1 + (ch.nb_descendants || 0), 0)
    return { total: totalCumul, periode: periodeCumul }
  }
  aggregeRecursif(all.get(rootUserId))

  return all.get(rootUserId)
}

/**
 * Vérifie si un user peut voir l'arbre d'un autre.
 * Règle : chacun voit son propre arbre (descendants).
 * Superadmin voit tout. Un parent voit ses filleuls et sous-filleuls.
 */
async function userPeutVoirArbre(db: D1Database, viewerId: number, viewerRole: string, targetId: number): Promise<boolean> {
  if (viewerRole === 'superadmin') return true
  if (viewerId === targetId) return true
  // Remonter depuis target : si on trouve viewer comme ancêtre → OK
  let cur = targetId
  for (let i = 0; i < 5; i++) {
    const u = await db.prepare('SELECT parent_id FROM users WHERE id = ?').bind(cur).first() as any
    if (!u || !u.parent_id) return false
    if (u.parent_id === viewerId) return true
    cur = u.parent_id
  }
  return false
}

// GET /api/mlm/tree - Mon arborescence (depuis moi vers mes filleuls)
app.get('/tree', async (c) => {
  const user = c.get('user')
  const annee = c.req.query('annee')
  const mois = c.req.query('mois')
  const periode = (annee && mois) ? { annee: parseInt(annee), mois: parseInt(mois) } : undefined

  // Superadmin : par défaut, retourne la pyramide complète (tous les agents N0)
  if (user.role === 'superadmin') {
    const { results: roots } = await c.env.DB.prepare(`
      SELECT id FROM users WHERE role = 'agent' AND parent_id IS NULL ORDER BY nom
    `).all() as any
    const trees: any[] = []
    for (const r of roots as any[]) {
      const t = await buildArborescence(c.env.DB, r.id, periode)
      if (t) trees.push(t)
    }
    return c.json({ mode: 'superadmin', trees })
  }

  const tree = await buildArborescence(c.env.DB, user.id, periode)
  return c.json({ mode: 'agent', tree })
})

// GET /api/mlm/branche/:agent_id - Branche d'un agent spécifique
app.get('/branche/:agent_id', async (c) => {
  const user = c.get('user')
  const targetId = parseInt(c.req.param('agent_id'))
  if (!await userPeutVoirArbre(c.env.DB, user.id, user.role, targetId)) {
    return c.json({ error: 'Accès refusé' }, 403)
  }
  const annee = c.req.query('annee')
  const mois = c.req.query('mois')
  const periode = (annee && mois) ? { annee: parseInt(annee), mois: parseInt(mois) } : undefined
  const tree = await buildArborescence(c.env.DB, targetId, periode)
  return c.json({ tree })
})

// GET /api/mlm/ca-filleuls - Récap CA filleuls/sous-filleuls (vue plate)
app.get('/ca-filleuls', async (c) => {
  const user = c.get('user')
  const now = new Date()
  const annee = parseInt(c.req.query('annee') || String(now.getFullYear()))
  const mois = parseInt(c.req.query('mois') || String(now.getMonth() + 1))

  // Snapshot des commissions calculées (qui contient ca_filleuls et ca_sous_filleuls)
  let filtre = ''
  const params: any[] = [annee, mois]
  if (user.role !== 'superadmin') {
    filtre = ' AND cc.agent_id = ?'
    params.push(user.id)
  }
  const { results } = await c.env.DB.prepare(`
    SELECT cc.*, u.nom, u.prenom, u.niveau, u.email
    FROM commissions_calculees cc
    JOIN users u ON cc.agent_id = u.id
    WHERE cc.periode_annee = ? AND cc.periode_mois = ? ${filtre}
    ORDER BY (cc.ca_propre + cc.ca_filleuls + cc.ca_sous_filleuls) DESC
  `).bind(...params).all() as any

  return c.json({ periode: { annee, mois }, agents: results })
})

// POST /api/mlm/sous-agent - Création directe d'un sous-agent par son parent (sans invitation)
app.post('/sous-agent', async (c) => {
  const user = c.get('user')
  const data = await c.req.json()
  const { email, password, nom, prenom, telephone, iban, niveau } = data

  if (!email || !password || !nom || !prenom) {
    return c.json({ error: 'email, password, nom et prénom requis' }, 400)
  }
  if (password.length < 6) {
    return c.json({ error: 'Mot de passe trop court (6 min)' }, 400)
  }

  // Détermine le parent et le niveau
  let parentId = user.id
  let niveauCible: number

  if (user.role === 'superadmin') {
    // Superadmin peut créer un agent N0 (parent_id null) ou un sous-agent (parent_id explicite)
    if (data.parent_id) {
      parentId = parseInt(data.parent_id)
      const parent = await c.env.DB.prepare('SELECT niveau FROM users WHERE id = ?')
        .bind(parentId).first() as any
      if (!parent) return c.json({ error: 'Parent introuvable' }, 400)
      niveauCible = (niveau !== undefined) ? parseInt(niveau) : (parent.niveau + 1)
    } else {
      // Agent N0
      parentId = null as any
      niveauCible = (niveau !== undefined) ? parseInt(niveau) : 0
    }
  } else {
    if (user.niveau === null || user.niveau === undefined) {
      return c.json({ error: 'Niveau utilisateur indéterminé' }, 400)
    }
    if (user.niveau >= 2) {
      return c.json({ error: 'Vous êtes au dernier niveau, vous ne pouvez pas créer de sous-agent' }, 403)
    }
    niveauCible = user.niveau + 1
  }

  // Vérifier email unique
  const ex = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first()
  if (ex) return c.json({ error: 'Email déjà utilisé' }, 400)

  const passwordHash = await hashPassword(password)
  const r = await c.env.DB.prepare(`
    INSERT INTO users (email, password_hash, role, nom, prenom, telephone, iban, niveau, parent_id, actif)
    VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    email.toLowerCase(), passwordHash, nom, prenom,
    telephone || null, iban || null, niveauCible, parentId
  ).run()

  return c.json({
    success: true,
    id: r.meta.last_row_id,
    user: {
      id: r.meta.last_row_id, email: email.toLowerCase(), nom, prenom,
      niveau: niveauCible, parent_id: parentId
    }
  })
})

export default app
