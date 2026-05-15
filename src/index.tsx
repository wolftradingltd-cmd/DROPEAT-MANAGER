import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import type { Bindings } from './types'

import auth from './routes/auth'
import adminUsers from './routes/admin-users'
import adminRestaurants from './routes/admin-restaurants'
import adminPaliers from './routes/admin-paliers'
import adminImports from './routes/admin-imports'
import adminCommissions from './routes/admin-commissions'
import adminPaiements from './routes/admin-paiements'
import adminDashboard from './routes/admin-dashboard'
import adminAgents from './routes/admin-agents'
import adminDocuments from './routes/admin-documents'
import adminProspects from './routes/admin-prospects'
import adminOmnipotence from './routes/admin-omnipotence'
import adminAttribution from './routes/admin-attribution'
import adminDashboardV2 from './routes/admin-dashboard-v2'
import adminTracabilite from './routes/admin-tracabilite'
import adminComptes from './routes/admin-comptes'
import adminShortener from './routes/admin-shortener'
import agentSousAgents from './routes/agent-sous-agents'
import register from './routes/register'
import mlm from './routes/mlm'
import agent from './routes/agent'
import societes from './routes/societes'
import factures from './routes/factures'
import adminAgentsCrud from './routes/admin-agents-crud'
import adminMarques from './routes/admin-marques'
import adminDerogations from './routes/admin-derogations'
import demandesPaiement from './routes/demandes-paiement'
import challenges from './routes/challenges'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({ credentials: true, origin: (o) => o }))
app.use(renderer)

// Auth (public)
app.route('/api/auth', auth)

// Superadmin
app.route('/api/admin/users', adminUsers)
app.route('/api/admin/restaurants', adminRestaurants)
app.route('/api/admin/paliers', adminPaliers)
app.route('/api/admin/imports', adminImports)
app.route('/api/admin/commissions', adminCommissions)
app.route('/api/admin/paiements', adminPaiements)
app.route('/api/admin/dashboard', adminDashboard)
app.route('/api/admin/agents', adminAgents)
app.route('/api/admin/documents', adminDocuments)
app.route('/api/admin/prospects', adminProspects)
app.route('/api/admin/omnipotence', adminOmnipotence)
app.route('/api/admin/attribution', adminAttribution)
app.route('/api/admin/dashboard-v2', adminDashboardV2)
app.route('/api/admin/tracabilite', adminTracabilite)
app.route('/api/admin/comptes', adminComptes)
app.route('/api/admin/agents-crud', adminAgentsCrud)
app.route('/api/admin/marques', adminMarques)
app.route('/api/admin/derogations', adminDerogations)
app.route('/api/shortener', adminShortener)

// Profils société (tout user authentifié)
app.route('/api/societes', societes)

// Factures (agent → DropEat + DropEat → restaurant)
app.route('/api/factures', factures)

// Agent : création de filleul + comptes
app.route('/api/agent/sous-agents', agentSousAgents)

// Register (public + protégé)
app.route('/api/register', register)

// MLM hiérarchique (tout user authentifié)
app.route('/api/mlm', mlm)

// Agent commercial
app.route('/api/agent', agent)

// Demandes de paiement (seuil 20€, tous niveaux MLM)
app.route('/api/demandes-paiement', demandesPaiement)

// Challenges commerciaux (CRUD superadmin + participation agent)
app.route('/api/challenges', challenges)

// Health
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))

// SPA shell : login + app
app.get('/', (c) => {
  return c.render(
    <div id="app">
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Chargement…</p>
      </div>
    </div>
  )
})

app.get('/login', (c) => {
  return c.render(
    <div id="app">
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Chargement…</p>
      </div>
    </div>
  )
})

app.get('/register', (c) => {
  return c.render(
    <div id="app">
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Chargement…</p>
      </div>
    </div>
  )
})

// URL Shortener public — /s/:code redirige vers l'URL originale
app.get('/s/:code', async (c) => {
  const code = c.req.param('code')
  const r = await c.env.DB.prepare(`
    SELECT * FROM url_courtes WHERE code = ? AND actif = 1
  `).bind(code).first() as any
  if (!r) return c.text('Lien introuvable ou expiré', 404)
  if (r.expire_at && new Date(r.expire_at) < new Date()) {
    return c.text('Lien expiré', 410)
  }
  // Stats clic
  await c.env.DB.prepare(`
    UPDATE url_courtes SET nb_clics = nb_clics + 1, derniere_visite = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(r.id).run()
  return c.redirect(r.url_originale, 302)
})

export default app
