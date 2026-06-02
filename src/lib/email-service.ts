// ============================================================
// EMAIL SERVICE — envoi via Resend API (compatible Cloudflare Workers)
// ============================================================
// Stratégie :
//   - Lit la config depuis la table app_settings
//   - Si email_enabled = 0 → mode LOG (n'envoie rien, écrit en facture_envois)
//   - Si email_enabled = 1 + email_api_key → appelle Resend API via fetch()
//   - Historise systématiquement l'envoi (succès ou échec) dans facture_envois
// ============================================================

export interface AppSettings {
  email_provider: string         // 'resend' (par défaut, seul supporté pour l'instant)
  email_api_key: string          // clé API Resend
  email_from_address: string     // expéditeur (doit être domaine vérifié dans Resend)
  email_from_name: string        // nom expéditeur
  email_reply_to: string         // reply-to optionnel
  email_enabled: string          // '1' = actif, '0' = mode log
  app_base_url: string           // URL publique (utilisée dans liens email)
}

const DEFAULTS: AppSettings = {
  email_provider: 'resend',
  email_api_key: '',
  email_from_address: 'no-reply@dropeat.com',
  email_from_name: 'DropEat™',
  email_reply_to: '',
  email_enabled: '0',
  app_base_url: 'https://webapp.pages.dev'
}

/**
 * Charge tous les paramètres applicatifs sous forme d'objet
 */
export async function loadAppSettings(db: D1Database): Promise<AppSettings> {
  const { results } = await db.prepare('SELECT key, value FROM app_settings').all()
  const map: Record<string, string> = {}
  for (const r of results as any[]) {
    map[r.key] = r.value || ''
  }
  return {
    email_provider: map.email_provider || DEFAULTS.email_provider,
    email_api_key: map.email_api_key || DEFAULTS.email_api_key,
    email_from_address: map.email_from_address || DEFAULTS.email_from_address,
    email_from_name: map.email_from_name || DEFAULTS.email_from_name,
    email_reply_to: map.email_reply_to || DEFAULTS.email_reply_to,
    email_enabled: map.email_enabled || DEFAULTS.email_enabled,
    app_base_url: map.app_base_url || DEFAULTS.app_base_url
  }
}

/**
 * Met à jour un ou plusieurs paramètres applicatifs
 */
export async function updateAppSettings(
  db: D1Database,
  updates: Partial<Record<keyof AppSettings, string>>,
  userId?: number
): Promise<void> {
  const entries = Object.entries(updates)
  for (const [key, value] of entries) {
    await db.prepare(`
      INSERT INTO app_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `).bind(key, value ?? '', userId ?? null).run()
  }
}

export interface SendEmailParams {
  to: string
  to_name?: string
  subject: string
  html: string
  text?: string                  // texte brut alternatif
  reply_to?: string
}

export interface SendEmailResult {
  success: boolean
  message_id?: string
  error?: string
  mode: 'sent' | 'logged' | 'failed'
}

/**
 * Envoie un email via Resend (ou mode log si désactivé)
 */
export async function sendEmail(
  db: D1Database,
  params: SendEmailParams
): Promise<SendEmailResult> {
  const settings = await loadAppSettings(db)

  // Mode log si désactivé ou clé manquante
  if (settings.email_enabled !== '1' || !settings.email_api_key) {
    console.log('[email-service] MODE LOG (non envoyé):', {
      to: params.to,
      subject: params.subject,
      reason: settings.email_enabled !== '1' ? 'email_enabled=0' : 'clé API manquante'
    })
    return {
      success: true,
      mode: 'logged',
      message_id: `log-${Date.now()}`
    }
  }

  // Envoi via Resend
  if (settings.email_provider !== 'resend') {
    return {
      success: false,
      mode: 'failed',
      error: `Provider non supporté : ${settings.email_provider}`
    }
  }

  const fromHeader = settings.email_from_name
    ? `${settings.email_from_name} <${settings.email_from_address}>`
    : settings.email_from_address

  const toHeader = params.to_name
    ? `${params.to_name} <${params.to}>`
    : params.to

  const body: Record<string, any> = {
    from: fromHeader,
    to: [toHeader],
    subject: params.subject,
    html: params.html
  }
  if (params.text) body.text = params.text
  const replyTo = params.reply_to || settings.email_reply_to
  if (replyTo) body.reply_to = replyTo

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.email_api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const data = await resp.json().catch(() => ({})) as any
    if (!resp.ok) {
      return {
        success: false,
        mode: 'failed',
        error: data?.message || `HTTP ${resp.status}`
      }
    }
    return {
      success: true,
      mode: 'sent',
      message_id: data?.id || null
    }
  } catch (err: any) {
    return {
      success: false,
      mode: 'failed',
      error: err?.message || String(err)
    }
  }
}

/**
 * Enregistre l'envoi (réussi ou non) dans facture_envois et met à jour la facture
 */
export async function logFactureEnvoi(
  db: D1Database,
  params: {
    facture_id: number
    evenement: 'creee' | 'envoyee' | 'validee' | 'refusee' | 'payee' | 'rappel' | 'manuel'
    destinataire_email: string
    destinataire_nom?: string | null
    sujet: string
    result: SendEmailResult
    envoye_par?: number | null
  }
): Promise<void> {
  const statut = params.result.mode === 'sent' ? 'sent'
              : params.result.mode === 'logged' ? 'sent'
              : 'failed'

  await db.prepare(`
    INSERT INTO facture_envois
      (facture_id, evenement, destinataire_email, destinataire_nom, sujet,
       statut, message_id, error_message, envoye_par)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    params.facture_id,
    params.evenement,
    params.destinataire_email,
    params.destinataire_nom || null,
    params.sujet,
    statut,
    params.result.message_id || null,
    params.result.error || null,
    params.envoye_par || null
  ).run()

  // Si envoi réussi, incrémente compteur sur la facture
  if (params.result.success) {
    await db.prepare(`
      UPDATE factures
      SET nb_envois_email = COALESCE(nb_envois_email, 0) + 1,
          derniere_notif_at = CURRENT_TIMESTAMP,
          dest_email = COALESCE(dest_email, ?)
      WHERE id = ?
    `).bind(params.destinataire_email, params.facture_id).run()
  }
}

// ============================================================
// TEMPLATES EMAIL pour chaque événement facture
// ============================================================

export interface FactureEmailContext {
  facture: any
  baseUrl: string
  factureUrl: string             // lien direct vers la facture (PDF imprimable)
  destinataireNom?: string
}

const COMMON_STYLE = `
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
         color: #1f2937; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 600px; margin: 0 auto; padding: 20px; }
  .card { background: #fff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,.05); }
  .hdr { background: #1d4ed8; color: #fff; padding: 20px 30px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; }
  .hdr h1 { margin: 0; font-size: 22px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px;
           font-weight: bold; letter-spacing: 1px; }
  .badge.success { background: #d1fae5; color: #065f46; }
  .badge.warn { background: #fed7aa; color: #9a3412; }
  .badge.error { background: #fecaca; color: #991b1b; }
  .badge.info { background: #dbeafe; color: #1e40af; }
  .btn { display: inline-block; padding: 12px 28px; background: #1d4ed8; color: #fff !important;
         text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
  .meta { background: #f9fafb; padding: 14px 18px; border-left: 3px solid #1d4ed8; border-radius: 4px;
          margin: 16px 0; font-size: 14px; }
  .meta div { margin: 4px 0; }
  .meta strong { color: #374151; }
  .total { font-size: 22px; color: #1d4ed8; font-weight: bold; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px; padding: 16px; }
</style>
`

function fmtMoneyShort(n: any, devise: string): string {
  const sym = devise === 'GBP' ? '£' : '€'
  const v = parseFloat(n || 0)
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym
}

function metaBlock(f: any): string {
  const periode = `${String(f.periode_mois || '').padStart(2, '0')}/${f.periode_annee || ''}`
  return `<div class="meta">
    <div><strong>Numéro :</strong> ${f.numero || ''}</div>
    <div><strong>Période :</strong> ${periode}</div>
    <div><strong>Date d'émission :</strong> ${f.date_emission ? new Date(f.date_emission).toLocaleDateString('fr-FR') : ''}</div>
    <div><strong>Échéance :</strong> ${f.date_echeance ? new Date(f.date_echeance).toLocaleDateString('fr-FR') : ''}</div>
    <div class="total"><strong>Total TTC :</strong> ${fmtMoneyShort(f.montant_ttc, f.devise)}</div>
  </div>`
}

export function emailTemplateCreee(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Nouvelle facture ${f.numero} — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr"><h1>📄 Nouvelle facture émise</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>Une nouvelle facture <strong>${f.numero}</strong> vient d'être émise. <span class="badge info">BROUILLON</span></p>
        ${metaBlock(f)}
        <p>Vous pouvez la consulter et la télécharger via le lien ci-dessous :</p>
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}">Consulter la facture</a></p>
        <p style="color:#6b7280;font-size:13px">Cette facture est encore au statut <em>brouillon</em>. Elle vous sera officiellement envoyée pour validation prochainement.</p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

export function emailTemplateEnvoyee(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Facture ${f.numero} à valider — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr"><h1>📤 Facture à valider</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>La facture <strong>${f.numero}</strong> vient de vous être <strong>officiellement envoyée</strong> et est en attente de validation.</p>
        ${metaBlock(f)}
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}">Consulter et valider</a></p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

export function emailTemplateValidee(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Facture ${f.numero} validée ✓ — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr" style="background:#10b981"><h1>✓ Facture validée</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>Votre facture <strong>${f.numero}</strong> a été <span class="badge success">VALIDÉE</span> et sera réglée dans les délais convenus.</p>
        ${metaBlock(f)}
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}" style="background:#10b981">Voir la facture</a></p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

export function emailTemplateRefusee(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Facture ${f.numero} refusée — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr" style="background:#ef4444"><h1>✗ Facture refusée</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>Votre facture <strong>${f.numero}</strong> a été <span class="badge error">REFUSÉE</span>.</p>
        ${f.motif_refus ? `<div class="meta" style="border-left-color:#ef4444"><strong>Motif :</strong><br>${String(f.motif_refus).replace(/\n/g, '<br>')}</div>` : ''}
        ${metaBlock(f)}
        <p>Vous pouvez créer une facture corrective après avoir pris connaissance du motif.</p>
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}" style="background:#ef4444">Voir le détail</a></p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

export function emailTemplatePayee(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Facture ${f.numero} PAYÉE ✓ — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr" style="background:#059669"><h1>💰 Facture payée</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>Votre facture <strong>${f.numero}</strong> a été <span class="badge success">PAYÉE</span>.</p>
        ${metaBlock(f)}
        ${f.reference_paiement ? `<div class="meta" style="border-left-color:#059669"><strong>Référence paiement :</strong> ${f.reference_paiement}</div>` : ''}
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}" style="background:#059669">Télécharger la facture</a></p>
        <p style="color:#6b7280;font-size:13px">Merci pour votre collaboration.</p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

export function emailTemplateRappel(ctx: FactureEmailContext): { subject: string, html: string } {
  const f = ctx.facture
  return {
    subject: `Rappel : facture ${f.numero} en attente — DropEat™`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${COMMON_STYLE}</head><body>
      <div class="wrap"><div class="card">
        <div class="hdr" style="background:#f59e0b"><h1>⏰ Rappel facture</h1></div>
        <p>Bonjour${ctx.destinataireNom ? ' ' + ctx.destinataireNom : ''},</p>
        <p>Pour rappel, la facture <strong>${f.numero}</strong> est en attente de traitement. <span class="badge warn">EN ATTENTE</span></p>
        ${metaBlock(f)}
        <p style="text-align:center"><a class="btn" href="${ctx.factureUrl}" style="background:#f59e0b">Traiter la facture</a></p>
      </div><div class="footer">DropEat™ — Plateforme de gestion des commissions Uber Eats</div></div>
    </body></html>`
  }
}

/**
 * Sélectionne le bon template selon l'événement
 */
export function buildFactureEmail(
  evenement: 'creee' | 'envoyee' | 'validee' | 'refusee' | 'payee' | 'rappel',
  ctx: FactureEmailContext
): { subject: string, html: string } {
  switch (evenement) {
    case 'creee':    return emailTemplateCreee(ctx)
    case 'envoyee':  return emailTemplateEnvoyee(ctx)
    case 'validee':  return emailTemplateValidee(ctx)
    case 'refusee':  return emailTemplateRefusee(ctx)
    case 'payee':    return emailTemplatePayee(ctx)
    case 'rappel':   return emailTemplateRappel(ctx)
  }
}

/**
 * Helper : résout l'email destinataire d'une facture
 * Stratégie : dest_email manuel > dest_snapshot.email_facturation > dest user email
 */
export function resolveDestinataireEmail(f: any): { email: string | null, nom: string | null } {
  if (f.dest_email) return { email: f.dest_email, nom: null }
  let d: any = {}
  try { d = typeof f.dest_snapshot === 'string' ? JSON.parse(f.dest_snapshot || '{}') : (f.dest_snapshot || {}) } catch {}
  const email = d.email_facturation || f.dest_user_email || null
  const nom = d.raison_sociale || d.nom_commercial ||
              (f.dest_user_prenom && f.dest_user_nom ? `${f.dest_user_prenom} ${f.dest_user_nom}` : null)
  return { email, nom }
}
