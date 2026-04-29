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
import agent from './routes/agent'

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

// Agent commercial
app.route('/api/agent', agent)

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

export default app
