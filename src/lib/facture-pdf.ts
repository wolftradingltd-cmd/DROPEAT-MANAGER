// ============================================================
// FACTURE PDF — Génération HTML imprimable côté serveur
// ============================================================
// Cloudflare Workers ne supporte pas les libs PDF Node.js (pdfkit, puppeteer).
// Stratégie : générer un HTML standalone optimisé impression (CSS @page A4) qui
// peut être :
//   - Affiché dans une iframe pour aperçu
//   - Imprimé / Sauvegardé en PDF par le navigateur (Ctrl+P → "Enregistrer en PDF")
//   - Joint en HTML aux emails (les clients email modernes le rendent correctement)
//
// Avantages :
//   - Aucune dépendance lourde, marche sur l'edge Cloudflare
//   - Rendu fidèle à l'aperçu écran
//   - Pas de différence entre ce qui est vu et imprimé
// ============================================================

interface FactureCompletePDF {
  facture: any
  lignes: any[]
}

function esc(s: any): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtMoney(n: any, sym: string): string {
  const v = parseFloat(n || 0)
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + sym
}

function fmtNum(n: any): string {
  const v = parseFloat(n || 0)
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

function fmtDateFR(d: any): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d).substring(0, 10)
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

/**
 * Rendu HTML complet d'une facture (standalone, prêt à imprimer / attacher en email)
 */
export function renderFactureHTML(data: FactureCompletePDF, opts?: { embedded?: boolean }): string {
  const f = data.facture
  const lignes = data.lignes || []
  const e = (typeof f.emetteur_snapshot === 'string' ? JSON.parse(f.emetteur_snapshot || '{}') : f.emetteur_snapshot) || {}
  const d = (typeof f.dest_snapshot === 'string' ? JSON.parse(f.dest_snapshot || '{}') : f.dest_snapshot) || {}
  const mentions = (typeof f.mentions_legales === 'string' ? JSON.parse(f.mentions_legales || '[]') : f.mentions_legales) || []
  const sym = f.devise === 'GBP' ? '£' : '€'
  const isUK = f.devise === 'GBP'

  // Regroupement par marque pour affichage groupé
  const groupes = new Map<string, { marque_id: number | null; lignes: any[]; total: number }>()
  for (const l of lignes) {
    const key = l.marque_id ? `m_${l.marque_id}` : '_no_marque'
    if (!groupes.has(key)) groupes.set(key, { marque_id: l.marque_id || null, lignes: [], total: 0 })
    const g = groupes.get(key)!
    g.lignes.push(l)
    g.total += parseFloat(l.montant_ht || 0)
  }
  const multiMarque = groupes.size > 1

  let lignesHTML = ''
  if (!multiMarque) {
    lignesHTML = lignes.map((l: any) => `
      <tr>
        <td>${esc(l.ordre)}</td>
        <td><strong>${esc(l.libelle)}</strong>${l.description ? `<br><span class="muted">${esc(l.description)}</span>` : ''}</td>
        <td class="text-right">${fmtNum(l.quantite)}</td>
        <td class="text-right">${fmtMoney(l.prix_unitaire, sym)}</td>
        <td class="text-right">${fmtMoney(l.montant_ht, sym)}</td>
      </tr>
    `).join('')
  } else {
    const arr = Array.from(groupes.values())
    arr.sort((a, b) => (a.marque_id === null ? 1 : (b.marque_id === null ? -1 : 0)))
    lignesHTML = arr.map(g => {
      let label = 'MLM (commissions N+1 / N+2)'
      let color = '#9333ea'
      let bg = '#faf5ff'
      if (g.marque_id) {
        const sample = g.lignes[0]?.libelle || ''
        const parts = sample.split('—')
        label = parts.length > 1 ? parts.slice(1).join('—').trim() : `Marque #${g.marque_id}`
        color = '#1d4ed8'
        bg = '#eff6ff'
      }
      return `
        <tr class="group-header" style="background:${bg};color:${color}">
          <td colspan="4" style="font-weight:bold;font-size:11pt">${esc(label)}</td>
          <td class="text-right" style="font-weight:bold">Sous-total : ${fmtMoney(g.total, sym)}</td>
        </tr>
        ${g.lignes.map((l: any) => `
          <tr>
            <td>${esc(l.ordre)}</td>
            <td>${esc(l.libelle)}${l.description ? `<br><span class="muted">${esc(l.description)}</span>` : ''}</td>
            <td class="text-right">${fmtNum(l.quantite)}</td>
            <td class="text-right">${fmtMoney(l.prix_unitaire, sym)}</td>
            <td class="text-right">${fmtMoney(l.montant_ht, sym)}</td>
          </tr>
        `).join('')}
      `
    }).join('')
  }

  const typeLabel =
    f.type === 'agent_to_dropeat'
      ? (String(f.numero || '').startsWith('AGT-MLM-') ? 'Commissions MLM (N+1/N+2)' : 'Commissions standard')
      : f.type === 'agent_to_resto' ? 'Facturation directe — Portefeuille Propriétaire 100%'
      : 'Service DropEat → Restaurant'

  const statutLabel: Record<string, string> = {
    brouillon: 'Brouillon',
    envoyee: 'Envoyée',
    validee: 'Validée',
    refusee: 'Refusée',
    payee: 'PAYÉE',
    annulee: 'Annulée'
  }
  const statutColor: Record<string, string> = {
    brouillon: '#9ca3af',
    envoyee: '#3b82f6',
    validee: '#10b981',
    refusee: '#ef4444',
    payee: '#059669',
    annulee: '#9ca3af'
  }

  const body = `
<div class="invoice-page">
  <div class="invoice-header">
    <div class="emetteur">
      ${e.logo_url ? `<img src="${esc(e.logo_url)}" alt="Logo" style="max-height:60px;margin-bottom:.5rem"/>` : ''}
      <div class="raison"><strong>${esc(e.raison_sociale || '')}</strong></div>
      ${e.nom_commercial ? `<div class="muted">${esc(e.nom_commercial)}</div>` : ''}
      ${e.forme_juridique ? `<div>${esc(e.forme_juridique)}${e.capital ? ' au capital de ' + esc(e.capital) + ' ' + sym : ''}</div>` : ''}
      ${e.adresse_rue ? `<div>${esc(e.adresse_rue)}</div>` : ''}
      ${e.adresse_complement ? `<div>${esc(e.adresse_complement)}</div>` : ''}
      ${(e.code_postal || e.ville) ? `<div>${esc(e.code_postal || '')} ${esc(e.ville || '')}</div>` : ''}
      ${e.pays ? `<div>${esc(e.pays)}</div>` : ''}
      ${e.telephone ? `<div>Tél : ${esc(e.telephone)}</div>` : ''}
      ${e.email_facturation ? `<div>Email : ${esc(e.email_facturation)}</div>` : ''}
      ${isUK
        ? `${e.company_number ? `<div>Company No: ${esc(e.company_number)}</div>` : ''}${e.vat_uk ? `<div>VAT: ${esc(e.vat_uk)}</div>` : ''}`
        : `${e.siret ? `<div>SIRET : ${esc(e.siret)}</div>` : ''}${e.numero_tva ? `<div>TVA : ${esc(e.numero_tva)}</div>` : ''}${e.rcs ? `<div>${esc(e.rcs)}</div>` : ''}`
      }
    </div>
    <div class="title">
      <h1>FACTURE</h1>
      <div class="numero">${esc(f.numero)}</div>
      <div class="statut" style="background:${statutColor[f.statut] || '#9ca3af'};color:#fff">${statutLabel[f.statut] || esc(f.statut)}</div>
    </div>
  </div>

  <div class="invoice-meta">
    <div class="dest">
      <div class="label">FACTURÉ À</div>
      <div class="strong">${esc(d.raison_sociale || d.nom_commercial || '')}</div>
      ${d.nom_commercial && d.nom_commercial !== d.raison_sociale ? `<div class="muted">${esc(d.nom_commercial)}</div>` : ''}
      ${d.adresse_rue ? `<div>${esc(d.adresse_rue)}</div>` : ''}
      ${(d.code_postal || d.ville) ? `<div>${esc(d.code_postal || '')} ${esc(d.ville || '')}</div>` : ''}
      ${d.pays ? `<div>${esc(d.pays)}</div>` : ''}
      ${d.siret ? `<div>SIRET : ${esc(d.siret)}</div>` : ''}
      ${d.company_number ? `<div>Company No: ${esc(d.company_number)}</div>` : ''}
      ${d.email_facturation ? `<div>${esc(d.email_facturation)}</div>` : ''}
    </div>
    <div class="meta">
      <table class="meta-table">
        <tr><th>Date d'émission</th><td>${fmtDateFR(f.date_emission)}</td></tr>
        <tr><th>Date d'échéance</th><td>${fmtDateFR(f.date_echeance)}</td></tr>
        <tr><th>Période</th><td>${MONTHS_FR[(f.periode_mois || 1) - 1]} ${f.periode_annee || ''}</td></tr>
        <tr><th>Type</th><td>${typeLabel}</td></tr>
        ${f.reference_paiement ? `<tr><th>Réf. paiement</th><td>${esc(f.reference_paiement)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <table class="lignes">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Libellé</th>
        <th class="text-right" style="width:60px">Qté</th>
        <th class="text-right" style="width:100px">P.U.</th>
        <th class="text-right" style="width:110px">Montant HT</th>
      </tr>
    </thead>
    <tbody>${lignesHTML}</tbody>
  </table>

  <div class="totaux">
    <div class="t-row"><span>Total HT</span><span>${fmtMoney(f.montant_ht, sym)}</span></div>
    <div class="t-row"><span>TVA (${f.taux_tva || 0}%)</span><span>${fmtMoney(f.montant_tva, sym)}</span></div>
    <div class="t-row total"><span>Total TTC</span><span>${fmtMoney(f.montant_ttc, sym)}</span></div>
  </div>

  ${e.iban ? `
  <div class="paiement">
    <div class="section-title">Modalités de paiement</div>
    <div>Virement bancaire sous <strong>30 jours</strong></div>
    <div><strong>IBAN :</strong> <span class="mono">${esc(e.iban)}</span></div>
    ${e.bic ? `<div><strong>BIC :</strong> <span class="mono">${esc(e.bic)}</span></div>` : ''}
    ${e.banque_nom ? `<div><strong>Banque :</strong> ${esc(e.banque_nom)}</div>` : ''}
  </div>
  ` : ''}

  ${mentions.length ? `
  <div class="mentions">
    <div class="section-title">Mentions légales</div>
    <ul>${mentions.map((m: string) => `<li>${esc(m)}</li>`).join('')}</ul>
  </div>
  ` : ''}

  ${f.motif_refus ? `<div class="refus"><strong>Motif de refus :</strong> ${esc(f.motif_refus)}</div>` : ''}

  ${e.signature_url ? `
  <div class="signature">
    <div class="muted">Signature de l'émetteur :</div>
    <img src="${esc(e.signature_url)}" alt="Signature" style="max-height:60px;margin-top:.3rem"/>
  </div>
  ` : ''}

  <div class="footer">
    Document généré automatiquement par DropEat™ — ${esc(f.numero)} — ${fmtDateFR(f.date_emission)}
  </div>
</div>
  `

  // Si embedded (à inclure dans le HTML de l'app), on retourne juste le body avec ses styles inline scoped
  // Sinon, document HTML complet (pour iframe / téléchargement / email)
  const css = `
  @page { size: A4; margin: 1.5cm; }
  * { box-sizing: border-box }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
         font-size: 10pt; color: #1f2937; margin: 0; padding: 0; background: #fff; }
  .invoice-page { max-width: 21cm; margin: 0 auto; padding: 1.5cm; background: #fff; }
  .invoice-header { display: flex; justify-content: space-between; align-items: flex-start;
                    border-bottom: 3px solid #1d4ed8; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .emetteur { font-size: 9.5pt; line-height: 1.5; max-width: 55%; }
  .emetteur .raison { font-size: 12pt; margin-bottom: .2rem; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 28pt; color: #1d4ed8; letter-spacing: 2px; font-weight: 700; }
  .title .numero { font-family: 'SF Mono', Menlo, monospace; font-size: 12pt; margin-top: .3rem; font-weight: bold; }
  .title .statut { display: inline-block; padding: .25rem .75rem; border-radius: 4px;
                   font-size: 9pt; margin-top: .5rem; font-weight: bold; letter-spacing: 1px; }

  .invoice-meta { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
  .invoice-meta .dest { flex: 1; padding: 1rem; background: #f9fafb; border-left: 3px solid #1d4ed8; }
  .invoice-meta .meta { flex: 1; }
  .invoice-meta .label { font-size: 9pt; color: #6b7280; font-weight: bold; letter-spacing: 1px; margin-bottom: .4rem; }
  .invoice-meta .strong { font-size: 11pt; font-weight: bold; margin-bottom: .2rem; }
  .meta-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .meta-table th { text-align: left; padding: .3rem .5rem; color: #6b7280; font-weight: 600; width: 40%; }
  .meta-table td { padding: .3rem .5rem; }
  .meta-table tr { border-bottom: 1px solid #f3f4f6; }

  table.lignes { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 9.5pt; }
  table.lignes thead { background: #1d4ed8; color: #fff; }
  table.lignes th { padding: .5rem .6rem; text-align: left; font-weight: 600; font-size: 9pt; letter-spacing: .5px; }
  table.lignes td { padding: .5rem .6rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.lignes tr.group-header td { padding: .4rem .6rem; }
  .muted { color: #6b7280; font-size: 8.5pt; }
  .text-right { text-align: right; }

  .totaux { margin-left: auto; max-width: 35%; margin-bottom: 1.5rem; }
  .t-row { display: flex; justify-content: space-between; padding: .35rem .5rem; font-size: 10pt; }
  .t-row.total { font-size: 12pt; font-weight: bold; background: #1d4ed8; color: #fff;
                 border-radius: 4px; padding: .6rem .7rem; margin-top: .3rem; }

  .paiement, .mentions, .refus, .signature { margin: 1rem 0; padding: .75rem 1rem; border-radius: 4px; }
  .paiement { background: #ecfdf5; border-left: 3px solid #10b981; }
  .mentions { background: #fafaf9; border-left: 3px solid #6b7280; font-size: 8.5pt; }
  .mentions ul { margin: .3rem 0 0 1rem; padding: 0; }
  .mentions li { margin-bottom: .2rem; }
  .refus { background: #fef2f2; border-left: 3px solid #ef4444; }
  .section-title { font-weight: bold; margin-bottom: .3rem; font-size: 10pt; }
  .mono { font-family: 'SF Mono', Menlo, monospace; }
  .signature { background: #fff; text-align: right; font-size: 9pt; padding: 0; }
  .footer { margin-top: 2rem; text-align: center; font-size: 8pt; color: #9ca3af;
            border-top: 1px solid #e5e7eb; padding-top: .5rem; }

  @media print {
    body { background: #fff; }
    .invoice-page { padding: 0; margin: 0; }
    .no-print { display: none !important; }
  }
  `

  if (opts?.embedded) {
    return `<style>${css}</style>${body}`
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Facture ${esc(f.numero)}</title>
  <style>${css}</style>
</head>
<body>
${body}
<script>
  // Auto-print si query ?print=1
  if (location.search.indexOf('print=1') !== -1) {
    window.addEventListener('load', () => setTimeout(() => window.print(), 400));
  }
</script>
</body>
</html>`
}
