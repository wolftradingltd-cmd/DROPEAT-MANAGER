import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { renderer } from './renderer'
import type { Bindings } from './types'

import agents from './routes/agents'
import restaurants from './routes/restaurants'
import paliers from './routes/paliers'
import imports from './routes/imports'
import commissions from './routes/commissions'
import paiements from './routes/paiements'
import dashboard from './routes/dashboard'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use(renderer)

// Routes API
app.route('/api/agents', agents)
app.route('/api/restaurants', restaurants)
app.route('/api/paliers', paliers)
app.route('/api/imports', imports)
app.route('/api/commissions', commissions)
app.route('/api/paiements', paiements)
app.route('/api/dashboard', dashboard)

// Health check
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))

// Page principale - SPA
app.get('/', (c) => {
  return c.render(
    <div id="app">
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Chargement...</p>
      </div>
    </div>
  )
})

export default app
