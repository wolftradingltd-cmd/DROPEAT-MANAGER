// ============================================================
// ADMIN SETTINGS — paramètres applicatifs (email, etc.)
// ============================================================
import { Hono } from 'hono'
import type { Bindings } from '../types'
import { requireSuperadmin, type AuthVariables } from '../middleware/auth'
import { loadAppSettings, updateAppSettings, sendEmail } from '../lib/email-service'

const app = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>()

app.use('*', requireSuperadmin)

// ============================================================
// GET /api/admin/settings/email — récupère la config email
// (masque la clé API pour ne pas la renvoyer en clair)
// ============================================================
app.get('/email', async (c) => {
  const s = await loadAppSettings(c.env.DB)
  return c.json({
    settings: {
      email_provider: s.email_provider,
      email_api_key_set: !!s.email_api_key,
      email_api_key_preview: s.email_api_key
        ? s.email_api_key.substring(0, 6) + '...' + s.email_api_key.substring(s.email_api_key.length - 4)
        : '',
      email_from_address: s.email_from_address,
      email_from_name: s.email_from_name,
      email_reply_to: s.email_reply_to,
      email_enabled: s.email_enabled,
      app_base_url: s.app_base_url
    }
  })
})

// ============================================================
// PUT /api/admin/settings/email — met à jour la config
// (ne touche pas à email_api_key si non fournie ou vide)
// ============================================================
app.put('/email', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const updates: Record<string, string> = {}

  if (typeof body.email_provider === 'string') updates.email_provider = body.email_provider
  if (typeof body.email_from_address === 'string') updates.email_from_address = body.email_from_address
  if (typeof body.email_from_name === 'string') updates.email_from_name = body.email_from_name
  if (typeof body.email_reply_to === 'string') updates.email_reply_to = body.email_reply_to
  if (typeof body.app_base_url === 'string') updates.app_base_url = body.app_base_url
  // email_enabled : on accepte '1', '0', true, false
  if (body.email_enabled !== undefined) {
    updates.email_enabled = (body.email_enabled === true || body.email_enabled === '1' || body.email_enabled === 1) ? '1' : '0'
  }
  // email_api_key : seulement si non vide (sinon on garde l'existante)
  if (typeof body.email_api_key === 'string' && body.email_api_key.trim()) {
    updates.email_api_key = body.email_api_key.trim()
  }

  await updateAppSettings(c.env.DB, updates, user.id)
  return c.json({ success: true })
})

// ============================================================
// DELETE /api/admin/settings/email/api-key — supprime la clé API
// ============================================================
app.delete('/email/api-key', async (c) => {
  const user = c.get('user')
  await updateAppSettings(c.env.DB, { email_api_key: '', email_enabled: '0' }, user.id)
  return c.json({ success: true })
})

// ============================================================
// POST /api/admin/settings/email/test — envoie un email de test
// Body: { to: string }
// ============================================================
app.post('/email/test', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const to = body.to
  if (!to || typeof to !== 'string') return c.json({ error: 'Email destinataire requis' }, 400)

  const s = await loadAppSettings(c.env.DB)
  const result = await sendEmail(c.env.DB, {
    to,
    subject: '[Test] Configuration email DropEat™',
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px">
      <h2 style="color:#1d4ed8">✓ Test de configuration email</h2>
      <p>Bonjour,</p>
      <p>Cet email confirme que la configuration email de votre instance DropEat™ fonctionne correctement.</p>
      <ul>
        <li><strong>Provider :</strong> ${s.email_provider}</li>
        <li><strong>Expéditeur :</strong> ${s.email_from_name} &lt;${s.email_from_address}&gt;</li>
        <li><strong>Mode :</strong> ${s.email_enabled === '1' ? 'Envoi réel (production)' : 'Mode log (désactivé)'}</li>
        <li><strong>URL :</strong> ${s.app_base_url}</li>
      </ul>
      <p style="color:#6b7280;font-size:13px">Email envoyé depuis l'interface de test de DropEat™.</p>
    </body></html>`
  })

  return c.json({
    success: result.success,
    mode: result.mode,
    error: result.error,
    message: result.mode === 'logged'
      ? '⚠️ Email non envoyé : mode log actif (email_enabled=0 ou clé API absente)'
      : result.success
        ? `✓ Email envoyé avec succès (id: ${result.message_id})`
        : `✗ Échec : ${result.error}`
  })
})

export default app
