import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { getPaliers, calculerCommissionsPeriode, type CommandeWithContext } from '../lib/commissions'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

// GET /api/admin/dashboard
app.get('/', async (c) => {
  const db = c.env.DB

  const cnt = async (q: string, p: any[] = []) => {
    const r = await db.prepare(q).bind(...p).first() as any
    return r?.c || 0
  }

  const stats: any = {}
  stats.nb_users = await cnt("SELECT COUNT(*) as c FROM users WHERE actif = 1")
  stats.nb_superadmins = await cnt("SELECT COUNT(*) as c FROM users WHERE role = 'superadmin' AND actif = 1")
  stats.nb_agents = await cnt("SELECT COUNT(*) as c FROM users WHERE role = 'agent' AND actif = 1")
  stats.nb_agents_n0 = await cnt("SELECT COUNT(*) as c FROM users WHERE role = 'agent' AND actif = 1 AND niveau = 0")
  stats.nb_agents_n1 = await cnt("SELECT COUNT(*) as c FROM users WHERE role = 'agent' AND actif = 1 AND niveau = 1")
  stats.nb_agents_n2 = await cnt("SELECT COUNT(*) as c FROM users WHERE role = 'agent' AND actif = 1 AND niveau = 2")
  stats.nb_restaurants = await cnt("SELECT COUNT(*) as c FROM restaurants WHERE actif = 1")
  stats.nb_restaurants_portefeuille = await cnt("SELECT COUNT(*) as c FROM restaurants WHERE actif = 1 AND is_portefeuille_proprietaire = 1")
  stats.nb_marques = await cnt("SELECT COUNT(*) as c FROM marques_virtuelles WHERE actif = 1")
  stats.nb_marques_portefeuille = await cnt("SELECT COUNT(*) as c FROM marques_virtuelles WHERE actif = 1 AND is_portefeuille_proprietaire = 1")
  stats.nb_commandes = await cnt("SELECT COUNT(*) as c FROM commandes")
  stats.nb_tablettes_sr_shop = await cnt("SELECT COUNT(*) as c FROM restaurants WHERE actif = 1 AND tablette_sr_shop = 1")

  const ca = await db.prepare("SELECT COALESCE(SUM(montant_brut), 0) as t FROM commandes WHERE statut != 'annulee'").first() as any
  stats.ca_total = ca?.t || 0

  // Mois en cours
  const now = new Date()
  const annee = now.getFullYear()
  const mois = now.getMonth() + 1
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`
  const lastDay = new Date(annee, mois, 0).getDate()
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${lastDay} 23:59:59`

  const moisStats = await db.prepare(
    "SELECT COALESCE(SUM(montant_brut), 0) as ca, COUNT(*) as nb FROM commandes WHERE date_commande >= ? AND date_commande <= ? AND statut != 'annulee'"
  ).bind(debut, fin).first() as any
  stats.ca_mois = moisStats?.ca || 0
  stats.nb_commandes_mois = moisStats?.nb || 0

  // Commissions du mois courant
  const { results: cmds } = await db.prepare(`
    SELECT c.id, c.date_commande, c.montant_brut,
      m.id as marque_id, m.nom as marque_nom, m.is_portefeuille_proprietaire as marque_is_portefeuille,
      r.id as restaurant_id, r.nom as restaurant_nom, r.is_portefeuille_proprietaire as restaurant_is_portefeuille,
      r.tablette_sr_shop, r.agent_id,
      u.niveau as agent_niveau, u.parent_id as agent_parent_id, u2.parent_id as agent_grand_parent_id
    FROM commandes c
    JOIN marques_virtuelles m ON c.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    LEFT JOIN users u ON r.agent_id = u.id
    LEFT JOIN users u2 ON u.parent_id = u2.id
    WHERE c.date_commande >= ? AND c.date_commande <= ? AND c.statut != 'annulee' AND c.paye_integralement = 1
  `).bind(debut, fin).all() as any

  const paliers = await getPaliers(db)
  const calc = calculerCommissionsPeriode(cmds as CommandeWithContext[], paliers)

  // Top 5 restos (CA all-time)
  const { results: topRestos } = await db.prepare(`
    SELECT r.id, r.nom, r.is_portefeuille_proprietaire,
      COALESCE(SUM(c.montant_brut), 0) as ca, COUNT(c.id) as nb_commandes
    FROM restaurants r
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id AND c.statut != 'annulee'
    WHERE r.actif = 1
    GROUP BY r.id ORDER BY ca DESC LIMIT 5
  `).all()

  // Top 5 agents (par nombre de restos)
  const { results: topAgents } = await db.prepare(`
    SELECT u.id, u.nom, u.prenom, u.niveau,
      COUNT(DISTINCT r.id) as nb_restaurants,
      COUNT(DISTINCT m.id) as nb_marques,
      COALESCE(SUM(c.montant_brut), 0) as ca_total
    FROM users u
    LEFT JOIN restaurants r ON r.agent_id = u.id AND r.actif = 1
    LEFT JOIN marques_virtuelles m ON m.restaurant_id = r.id
    LEFT JOIN commandes c ON c.marque_id = m.id AND c.statut != 'annulee'
    WHERE u.role = 'agent' AND u.actif = 1
    GROUP BY u.id ORDER BY ca_total DESC LIMIT 5
  `).all()

  // Évolution 6 derniers mois
  const { results: evolution } = await db.prepare(`
    SELECT strftime('%Y-%m', date_commande) as mois,
      COALESCE(SUM(montant_brut), 0) as ca, COUNT(*) as nb_commandes
    FROM commandes WHERE date_commande >= date('now', '-6 months') AND statut != 'annulee'
    GROUP BY mois ORDER BY mois
  `).all()

  return c.json({
    stats,
    mois_courant: {
      annee, mois,
      ca_brut: calc.totaux.ca_brut,
      facturation_dropeat: calc.totaux.facturation_dropeat,
      commissions_agents: calc.totaux.commissions_agents_total,
      marge_dropeat: calc.totaux.marge_dropeat,
      nb_commandes: calc.totaux.nb_commandes
    },
    top_restaurants: topRestos,
    top_agents: topAgents,
    evolution
  })
})

export default app
