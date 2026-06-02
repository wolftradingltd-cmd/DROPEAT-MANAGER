// ============================================================
// DropEat™ - Suivi Commissions Uber Eats MLM
// SPA frontend (vanilla JS, axios)
// ============================================================

const api = axios.create({ baseURL: '/api', withCredentials: true })

// ===== Helpers =====
const fmtEUR = n => {
  if (n === null || n === undefined || isNaN(n)) n = 0
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
const fmtNum = n => Number(n || 0).toLocaleString('fr-FR')
const fmtDate = s => {
  if (!s) return '-'
  const d = new Date(s); if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtDateTime = s => {
  if (!s) return '-'
  const d = new Date(s); if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const niveauLabel = n => n === 0 ? 'Agent commercial' : n === 1 ? 'Sous-agent N1' : n === 2 ? 'Sous-agent N2' : '—'
const niveauPill = n => `<span class="niveau-pill niveau-${n ?? 'admin'}">${escapeHtml(niveauLabel(n))}</span>`
const monthsFR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function toast(msg, type = 'success', duration = 3500) {
  let c = document.getElementById('toast-container')
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c) }
  const el = document.createElement('div')
  el.className = 'toast ' + type
  const icon = type === 'error' ? 'fa-circle-exclamation' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check'
  el.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(msg)}</span>`
  c.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300) }, duration)
}

function modal(title, html, opts = {}) {
  const w = document.createElement('div')
  w.className = 'modal-overlay'
  const sizeClass = opts.size === 'lg' ? ' modal-lg' : opts.size === 'xl' ? ' modal-xl' : ''
  w.innerHTML = `
    <div class="modal${sizeClass}">
      <div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="modal-close">&times;</button></div>
      <div class="modal-body">${html}</div>
      ${opts.footer ? `<div class="modal-footer">${opts.footer}</div>` : ''}
    </div>`
  document.body.appendChild(w)
  const close = () => w.remove()
  w.querySelector('.modal-close').addEventListener('click', close)
  w.addEventListener('click', e => { if (e.target === w) close() })
  return { el: w, close }
}

function confirmDialog(message, onConfirm) {
  const m = modal('Confirmer', `<p>${escapeHtml(message)}</p>`, {
    footer: `<button class="btn btn-secondary" id="confirmCancel">Annuler</button>
             <button class="btn btn-danger" id="confirmOK"><i class="fas fa-trash"></i> Confirmer</button>`
  })
  m.el.querySelector('#confirmCancel').onclick = m.close
  m.el.querySelector('#confirmOK').onclick = async () => { m.close(); await onConfirm() }
}

// Variante avec titre + description (utilisée par PAGES['marques'])
function confirmModal(title, description, onConfirm, opts = {}) {
  const m = modal(title, `<p>${escapeHtml(description)}</p>`, {
    footer: `<button class="btn btn-secondary" id="cmCancel">Annuler</button>
             <button class="btn btn-danger" id="cmOK"><i class="fas fa-${opts.icon || 'trash'}"></i> ${escapeHtml(opts.confirmText || 'Confirmer')}</button>`
  })
  m.el.querySelector('#cmCancel').onclick = m.close
  m.el.querySelector('#cmOK').onclick = async () => { m.close(); await onConfirm() }
}

// ===== Auth state =====
let CURRENT_USER = null

async function bootstrap() {
  // Détecter une URL d'invitation : /register?code=... ou hash #register?code=...
  const url = new URL(window.location.href)
  const codeFromQuery = url.searchParams.get('code')
  const isRegisterPath = url.pathname.startsWith('/register') || url.hash.startsWith('#register')
  if (isRegisterPath || codeFromQuery) {
    return renderRegister(codeFromQuery)
  }

  try {
    const { data } = await api.get('/auth/me')
    CURRENT_USER = data.user
  } catch { CURRENT_USER = null }

  if (!CURRENT_USER) {
    renderLogin()
  } else if (CURRENT_USER.role === 'superadmin') {
    renderApp('admin')
  } else {
    renderApp('agent')
  }
}

// ============================================================
// REGISTER (public, via code d'invitation)
// ============================================================
async function renderRegister(prefilledCode) {
  const root = document.getElementById('app')
  let invitation = null
  let invErr = null
  if (prefilledCode) {
    try {
      const { data } = await api.get('/register/check/' + encodeURIComponent(prefilledCode))
      if (data.valid) invitation = data.invitation
      else invErr = data.reason
    } catch (e) { invErr = 'Erreur lors de la vérification du code' }
  }

  root.innerHTML = `
    <div class="login-page">
      <div class="login-card" style="max-width:480px">
        <div class="login-header">
          <h1><i class="fas fa-user-plus"></i> Créer mon compte</h1>
          <div class="subtitle">Rejoindre le réseau DropEat™</div>
        </div>
        <div class="login-body">
          <div id="regError"></div>
          ${invitation ? `
            <div class="info-banner" style="background:#eef6ff;border-left:3px solid var(--primary);padding:.6rem .9rem;border-radius:6px;margin-bottom:.8rem;font-size:.85rem">
              <i class="fas fa-circle-info"></i>
              Invitation valide. Vous serez rattaché à
              <strong>${escapeHtml(invitation.parent.prenom + ' ' + invitation.parent.nom)}</strong>
              en tant que <strong>${niveauLabel(invitation.niveau_cible)}</strong>.
            </div>
          ` : ''}
          ${invErr ? `<div class="login-error">${escapeHtml(invErr)}</div>` : ''}
          <form id="regForm">
            <div class="form-group">
              <label>Code d'invitation <span class="req">*</span></label>
              <input id="rcode" required value="${escapeHtml(prefilledCode || '')}" placeholder="Reçu par votre parrain" />
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="rprenom" required /></div>
              <div class="form-group"><label>Nom <span class="req">*</span></label><input id="rnom" required /></div>
            </div>
            <div class="form-group">
              <label>Email <span class="req">*</span></label>
              <input id="remail" type="email" required value="${escapeHtml(invitation?.email_pre_rempli || '')}" />
            </div>
            <div class="form-grid">
              <div class="form-group"><label>Téléphone</label><input id="rtel" type="tel" /></div>
              <div class="form-group"><label>IBAN</label><input id="riban" placeholder="FR76..." /></div>
            </div>
            <div class="form-group">
              <label>Mot de passe <span class="req">*</span></label>
              <input id="rpwd" type="password" required minlength="6" autocomplete="new-password" />
              <small class="text-muted">6 caractères minimum</small>
            </div>
            <button type="submit" class="btn-login" id="btnReg">
              <i class="fas fa-user-plus"></i> Créer mon compte
            </button>
          </form>
          <div class="login-info">
            Déjà inscrit ? <a href="#" id="goLogin">Se connecter</a>
          </div>
        </div>
      </div>
    </div>`

  document.getElementById('goLogin').onclick = (e) => {
    e.preventDefault()
    history.replaceState(null, '', '/')
    renderLogin()
  }
  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault()
    const btn = document.getElementById('btnReg')
    const errBox = document.getElementById('regError')
    errBox.innerHTML = ''
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création…'
    try {
      const payload = {
        code: document.getElementById('rcode').value.trim(),
        nom: document.getElementById('rnom').value.trim(),
        prenom: document.getElementById('rprenom').value.trim(),
        email: document.getElementById('remail').value.trim(),
        password: document.getElementById('rpwd').value,
        telephone: document.getElementById('rtel').value.trim() || null,
        iban: document.getElementById('riban').value.trim() || null
      }
      const { data } = await api.post('/register', payload)
      CURRENT_USER = data.user
      history.replaceState(null, '', '/')
      toast('Bienvenue ' + data.user.prenom + ' ! Compte créé.')
      renderApp('agent')
    } catch (err) {
      errBox.innerHTML = `<div class="login-error">${escapeHtml(err.response?.data?.error || 'Erreur lors de la création')}</div>`
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer mon compte'
    }
  }
}

// ============================================================
// LOGIN
// ============================================================
function renderLogin() {
  const root = document.getElementById('app')
  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <h1><i class="fas fa-burger"></i> DropEat™</h1>
          <div class="subtitle">Suivi commissions Uber Eats - MLM</div>
        </div>
        <div class="login-body">
          <div id="loginError"></div>
          <form id="loginForm">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="email" required autocomplete="username" placeholder="admin@dropeat.io" />
            </div>
            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" id="password" required autocomplete="current-password" />
            </div>
            <button type="submit" class="btn-login" id="btnLogin">
              <i class="fas fa-right-to-bracket"></i> Se connecter
            </button>
          </form>
          <div class="login-info">
            <strong>Premier accès superadmin :</strong><br/>
            Email : <code>admin@dropeat.io</code> · Mot de passe : <code>admin123</code><br/>
            <em>Changez votre mot de passe immédiatement après connexion.</em>
            <hr style="margin:.6rem 0;border-color:#e2e8f0"/>
            <i class="fas fa-user-plus"></i> Vous avez reçu un code d'invitation ?
            <a href="#" id="goRegister"><strong>Créer mon compte</strong></a>
          </div>
        </div>
      </div>
    </div>`
  document.getElementById('goRegister').onclick = (e) => {
    e.preventDefault()
    renderRegister(null)
  }
  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault()
    const email = document.getElementById('email').value.trim()
    const password = document.getElementById('password').value
    const btn = document.getElementById('btnLogin')
    const errBox = document.getElementById('loginError')
    errBox.innerHTML = ''
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion…'
    try {
      const { data } = await api.post('/auth/login', { email, password })
      CURRENT_USER = data.user
      if (CURRENT_USER.role === 'superadmin') renderApp('admin')
      else renderApp('agent')
    } catch (err) {
      errBox.innerHTML = `<div class="login-error">${escapeHtml(err.response?.data?.error || 'Erreur de connexion')}</div>`
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Se connecter'
    }
  }
}

// ============================================================
// LAYOUT APP
// ============================================================
const ADMIN_NAV = [
  { section: 'GESTION' },
  { id: 'dashboard', label: 'Tableau de bord', icon: 'fa-chart-pie' },
  { id: 'gestion-utilisateurs', label: 'Utilisateurs & Agents', icon: 'fa-users-gear' },
  { id: 'agents', label: 'Agents (Drill-down)', icon: 'fa-user-tie' },
  { id: 'tree', label: 'Arborescence MLM', icon: 'fa-sitemap' },
  { id: 'mlm', label: 'CA filleuls & sous-filleuls', icon: 'fa-network-wired' },
  { id: 'restaurants', label: 'Restaurants', icon: 'fa-store' },
  { id: 'arborescence', label: 'Arborescence Restos', icon: 'fa-folder-tree' },
  { id: 'marques', label: 'Marques virtuelles', icon: 'fa-tags' },
  { section: 'PROSPECTION' },
  { id: 'prospects', label: 'Leads & Prospects', icon: 'fa-bullseye' },
  { section: 'OPÉRATIONS' },
  { id: 'imports', label: 'Imports CSV', icon: 'fa-file-csv' },
  { id: 'commissions', label: 'Commissions', icon: 'fa-coins' },
  { id: 'derogations', label: 'Dérogations 100%', icon: 'fa-star' },
  { id: 'paiements', label: 'Paiements', icon: 'fa-money-check-dollar' },
  { id: 'admin-demandes-paiement', label: 'Demandes de paiement', icon: 'fa-hand-holding-dollar' },
  { id: 'attributions', label: 'Demandes 5e marque', icon: 'fa-trophy' },
  { id: 'admin-challenges', label: 'Challenges commerciaux', icon: 'fa-flag-checkered' },
  { section: 'FACTURATION' },
  { id: 'admin-factures', label: 'Factures reçues / émises', icon: 'fa-file-invoice-dollar' },
  { id: 'admin-factures-resto', label: 'Facturer un restaurant', icon: 'fa-file-export' },
  { id: 'admin-profil-societe', label: 'DROPEAT LTD (mes coordonnées)', icon: 'fa-building' },
  { section: 'OMNIPOTENCE' },
  { id: 'omnipotence', label: 'Pouvoirs 2000%', icon: 'fa-user-shield' },
  { id: 'audit', label: 'Audit invisible', icon: 'fa-eye-slash' },
  { section: 'CONFIGURATION' },
  { id: 'paliers', label: 'Paliers', icon: 'fa-layer-group' },
  { id: 'admin-tranches', label: 'Audit & recalcul tranches', icon: 'fa-scale-balanced' },
  { id: 'admin-email-settings', label: 'Notifications email', icon: 'fa-envelope-open-text' },
  { id: 'profil', label: 'Mon profil', icon: 'fa-user' }
]

const AGENT_NAV = [
  { section: 'MON ACTIVITÉ' },
  { id: 'a-dashboard', label: 'Tableau de bord', icon: 'fa-chart-pie' },
  { id: 'a-restaurants', label: 'Mes restaurants', icon: 'fa-store' },
  { id: 'a-imports', label: 'Imports CSV', icon: 'fa-file-csv' },
  { id: 'a-commissions', label: 'Mes commissions', icon: 'fa-coins' },
  { id: 'a-historique-comm', label: 'Historique commissions', icon: 'fa-chart-line' },
  { id: 'a-historique', label: 'Historique paiements', icon: 'fa-receipt' },
  { id: 'a-demandes-paiement', label: 'Demander un paiement', icon: 'fa-hand-holding-dollar' },
  { section: 'FACTURATION' },
  { id: 'a-profil-societe', label: 'Ma société', icon: 'fa-building' },
  { id: 'a-factures', label: 'Mes factures', icon: 'fa-file-invoice-dollar' },
  { section: 'PROSPECTION' },
  { id: 'a-prospects', label: 'Mes prospects', icon: 'fa-bullseye' },
  { section: 'MON RÉSEAU' },
  { id: 'a-sous-agents', label: 'Mes sous-agents', icon: 'fa-people-group' },
  { id: 'a-mlm', label: 'CA filleuls & sous-filleuls', icon: 'fa-network-wired' },
  { id: 'a-sous-agents-comm', label: 'Commissions des sous-agents', icon: 'fa-chart-pie' },
  { section: 'PORTEFEUILLE' },
  { id: 'a-paliers', label: 'Grille des paliers', icon: 'fa-layer-group' },
  { id: 'a-attribution', label: 'Choisir ma 5e marque', icon: 'fa-trophy' },
  { id: 'a-challenges', label: 'Challenges', icon: 'fa-flag-checkered' },
  { section: 'AIDE' },
  { id: 'a-tutoriel', label: 'Tutoriel', icon: 'fa-graduation-cap' },
  { id: 'a-profil', label: 'Mon profil', icon: 'fa-user' }
]

function renderApp(mode) {
  const nav = mode === 'admin' ? ADMIN_NAV : AGENT_NAV
  const u = CURRENT_USER
  const navHtml = nav.map(item => {
    if (item.section) return `<div class="nav-section">${item.section}</div>`
    return `<a href="#" data-page="${item.id}"><i class="fas ${item.icon}"></i> ${item.label}</a>`
  }).join('')

  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <button class="mobile-toggle" id="mobileToggle"><i class="fas fa-bars"></i></button>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <i class="fas fa-burger" style="color:var(--primary);font-size:1.4rem"></i>
          <h2>DropEat™</h2>
          <span class="badge">${mode === 'admin' ? 'ADMIN' : 'AGENT'}</span>
        </div>
        <div class="sidebar-user">
          <div class="user-name">${escapeHtml(u.prenom)} ${escapeHtml(u.nom)}</div>
          <div class="user-role">${escapeHtml(u.email)}</div>
          <div class="user-role">${mode === 'admin' ? 'Super-administrateur' : niveauLabel(u.niveau)}</div>
        </div>
        <nav class="sidebar-nav">${navHtml}</nav>
        <div class="sidebar-footer">
          <button class="btn-logout" id="btnLogout"><i class="fas fa-right-from-bracket"></i> Déconnexion</button>
        </div>
      </aside>
      <main class="main-content" id="mainContent"></main>
    </div>`

  document.getElementById('btnLogout').onclick = async () => {
    await api.post('/auth/logout').catch(() => {})
    CURRENT_USER = null
    renderLogin()
  }
  document.getElementById('mobileToggle').onclick = () => {
    document.getElementById('sidebar').classList.toggle('open')
  }
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.onclick = e => {
      e.preventDefault()
      document.querySelectorAll('.sidebar-nav a').forEach(x => x.classList.remove('active'))
      a.classList.add('active')
      document.getElementById('sidebar').classList.remove('open')
      navigate(a.dataset.page)
    }
  })
  // Page par défaut
  const first = nav.find(i => i.id)?.id
  document.querySelector(`.sidebar-nav a[data-page="${first}"]`)?.classList.add('active')
  navigate(first)
}

function navigate(page) {
  const c = document.getElementById('mainContent')
  c.innerHTML = '<div class="loading-screen" style="min-height:300px"><div class="spinner"></div></div>'

  // Routes paramétrées : agent-detail-<id>
  const mDetail = /^agent-detail-(\d+)$/.exec(page)
  if (mDetail) {
    const id = parseInt(mDetail[1])
    PAGES['__agent_detail'](c, id).catch(err => {
      console.error(err)
      c.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><p>${escapeHtml(err.message || 'Erreur')}</p></div>`
    })
    document.querySelectorAll('.sidebar-nav a').forEach(x => x.classList.remove('active'))
    document.querySelector(`.sidebar-nav a[data-page="agents"]`)?.classList.add('active')
    return
  }

  const fn = PAGES[page]
  if (!fn) { c.innerHTML = `<div class="empty-state"><p>Page introuvable</p></div>`; return }
  fn(c).catch(err => {
    console.error(err)
    c.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><p>${escapeHtml(err.message || 'Erreur')}</p></div>`
  })
}

const PAGES = {}

// ============================================================
// ===== PAGES SUPERADMIN =====
// ============================================================
PAGES['dashboard'] = async (c) => {
  const [{ data }, { data: v2 }] = await Promise.all([
    api.get('/admin/dashboard'),
    api.get('/admin/dashboard-v2/overview')
  ])
  const s = data.stats, m = data.mois_courant
  const al = v2.alertes
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Tableau de bord</h1><div class="subtitle">Vue d'ensemble — ${monthsFR[m.mois - 1]} ${m.annee}</div></div>
    </div>
    <div class="stats-grid" style="margin-bottom:1rem">
      ${al.demandes_attribution > 0 ? `<div class="alert-card danger"><i class="fas fa-trophy alert-icon"></i><div><div class="alert-count">${al.demandes_attribution}</div>demande(s) d'attribution 5e marque</div></div>` : ''}
      ${al.documents_expirent > 0 ? `<div class="alert-card"><i class="fas fa-file-circle-exclamation alert-icon"></i><div><div class="alert-count">${al.documents_expirent}</div>document(s) expire(nt) sous 30 j</div></div>` : ''}
      ${al.relances_prospects_3j > 0 ? `<div class="alert-card info"><i class="fas fa-bell alert-icon"></i><div><div class="alert-count">${al.relances_prospects_3j}</div>relance(s) prospect dans 3 jours</div></div>` : ''}
      ${al.tranches_proches.length > 0 ? `<div class="alert-card"><i class="fas fa-bullseye alert-icon"></i><div><div class="alert-count">${al.tranches_proches.length}</div>tranche(s) proche(s) du 5e élément</div></div>` : ''}
      ${al.notifications_non_lues > 0 ? `<div class="alert-card info"><i class="fas fa-envelope alert-icon"></i><div><div class="alert-count">${al.notifications_non_lues}</div>notification(s) non lue(s)</div></div>` : ''}
    </div>
    <div class="stats-grid">
      <div class="stat-card primary"><div class="stat-label">CA brut du mois</div><div class="stat-value">${fmtEUR(m.ca_brut)}</div><div class="stat-extra">${fmtNum(m.nb_commandes)} commandes</div></div>
      <div class="stat-card accent"><div class="stat-label">Facturation DropEat</div><div class="stat-value">${fmtEUR(m.facturation_dropeat)}</div><div class="stat-extra">à facturer aux restaurants</div></div>
      <div class="stat-card gold"><div class="stat-label">Commissions agents</div><div class="stat-value">${fmtEUR(m.commissions_agents)}</div><div class="stat-extra">à payer aux agents</div></div>
      <div class="stat-card info"><div class="stat-label">Marge nette DropEat</div><div class="stat-value">${fmtEUR(m.marge_dropeat)}</div></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Restaurants</div><div class="stat-value">${s.nb_restaurants}</div><div class="stat-extra">${s.nb_restaurants_portefeuille} en Portefeuille</div></div>
      <div class="stat-card"><div class="stat-label">Marques virtuelles</div><div class="stat-value">${s.nb_marques}</div><div class="stat-extra">${s.nb_marques_portefeuille} en Portefeuille</div></div>
      <div class="stat-card"><div class="stat-label">Agents actifs</div><div class="stat-value">${s.nb_agents}</div><div class="stat-extra">N0:${s.nb_agents_n0} · N1:${s.nb_agents_n1} · N2:${s.nb_agents_n2}</div></div>
      <div class="stat-card"><div class="stat-label">Tablettes SR Shop</div><div class="stat-value">${s.nb_tablettes_sr_shop}</div></div>
    </div>
    <div class="form-grid mt-4">
      <div class="card">
        <div class="card-title"><i class="fas fa-trophy"></i> Top restaurants (CA all-time)</div>
        ${data.top_restaurants.length ? `
          <table class="data-table">
            <thead><tr><th>Restaurant</th><th class="text-right">Cmds</th><th class="text-right">CA</th></tr></thead>
            <tbody>${data.top_restaurants.map(r => `
              <tr>
                <td>${escapeHtml(r.nom)} ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}</td>
                <td class="text-right">${fmtNum(r.nb_commandes)}</td>
                <td class="text-right"><strong>${fmtEUR(r.ca)}</strong></td>
              </tr>`).join('')}</tbody>
          </table>` : '<p class="text-muted">Aucune donnée</p>'}
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-medal"></i> Top agents (CA généré)</div>
        ${data.top_agents.length ? `
          <table class="data-table">
            <thead><tr><th>Agent</th><th>Niveau</th><th class="text-right">Restos</th><th class="text-right">CA</th></tr></thead>
            <tbody>${data.top_agents.map(a => `
              <tr>
                <td>${escapeHtml(a.prenom)} ${escapeHtml(a.nom)}</td>
                <td>${niveauPill(a.niveau)}</td>
                <td class="text-right">${a.nb_restaurants}</td>
                <td class="text-right"><strong>${fmtEUR(a.ca_total)}</strong></td>
              </tr>`).join('')}</tbody>
          </table>` : '<p class="text-muted">Aucun agent</p>'}
      </div>
    </div>
    <div class="card mt-4">
      <div class="card-title"><i class="fas fa-chart-line"></i> Évolution 6 derniers mois</div>
      <canvas id="evoChart" height="80"></canvas>
    </div>

    <!-- Bandeau RÈGLE 100% PORTEFEUILLE (admin) -->
    <div class="card mt-4 portfolio-banner" style="display:grid;grid-template-columns:240px 1fr;gap:1.2rem;align-items:center;background:linear-gradient(135deg,#f0fdf4 0%,#fefce8 100%);border-left:4px solid var(--gold, #FFB800)">
      <img src="/static/img/portfolio-rule-100.jpg" alt="Règle 100% portefeuille"
           style="width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08)" />
      <div>
        <div class="card-title" style="margin-bottom:.4rem">
          <i class="fas fa-crown" style="color:var(--gold, #FFB800)"></i>
          Règle Portefeuille — 100% commission au 5ᵉ élément
        </div>
        <p style="font-size:.92rem;line-height:1.5;margin:.3rem 0 .7rem">
          Tous les <strong>5 éléments</strong> apportés par un agent (restaurants ou marques),
          le <strong>5ᵉ</strong> bascule automatiquement en <strong style="color:var(--gold, #FFB800)">portefeuille propriétaire</strong>
          (commission 100%). Les agents proposent leur 5ᵉ marque, vous validez via
          <a href="#" id="goAttrAdmin" style="color:#2563eb;font-weight:600">Demandes 5ᵉ marque</a>.
          <br><span class="text-muted" style="font-size:.85rem">
            <i class="fas fa-arrow-right"></i> Si la 5ᵉ position concerne un restaurant attribué, sa
            <strong>1ʳᵉ marque héritée</strong> bascule automatiquement en tranche suivante (position 1, exclue de la tranche en cours).
          </span>
        </p>
        ${al.demandes_attribution > 0
          ? `<button class="btn btn-warning" id="goAttrAdminBtn"><i class="fas fa-trophy"></i> ${al.demandes_attribution} demande${al.demandes_attribution > 1 ? 's' : ''} en attente</button>`
          : '<span class="text-muted" style="font-size:.85rem"><i class="fas fa-check-circle" style="color:#06A05A"></i> Aucune demande en attente.</span>'}
      </div>
    </div>

    `
  if (data.evolution.length) {
    const ctx = document.getElementById('evoChart')
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.evolution.map(e => e.mois),
        datasets: [
          { label: 'CA (€)', data: data.evolution.map(e => e.ca), backgroundColor: '#06A05A' },
          { label: 'Commandes', data: data.evolution.map(e => e.nb_commandes), backgroundColor: '#FF6B00', yAxisID: 'y2' }
        ]
      },
      options: { scales: { y: { beginAtZero: true }, y2: { beginAtZero: true, position: 'right', grid: { display: false } } } }
    })
  }
  // Liens vers Attributions
  const lk1 = document.getElementById('goAttrAdmin')
  if (lk1) lk1.onclick = (e) => { e.preventDefault(); navigate('attributions') }
  const lk2 = document.getElementById('goAttrAdminBtn')
  if (lk2) lk2.onclick = () => navigate('attributions')
}

// ============================================================
// === GESTION UTILISATEURS & AGENTS (page unifiée) ===========
// ============================================================
PAGES['gestion-utilisateurs'] = async (c) => {
  const [{ data: dataUsers }, { data: dataAgents }] = await Promise.all([
    api.get('/admin/users'),
    api.get('/admin/agents-crud')
  ])
  const allUsers = dataUsers.users || []
  const allAgents = dataAgents.agents || []
  const superadmins = allUsers.filter(u => u.role === 'superadmin')
  const agents = allAgents

  const nbActifs = agents.filter(a => a.actif).length
  const nbInactifs = agents.filter(a => !a.actif).length

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-users-gear"></i> Utilisateurs &amp; Agents</h1>
        <div class="subtitle">Superadmins, agents commerciaux et sous-agents — gestion centralisée</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="btnNewAdmin"><i class="fas fa-shield-halved"></i> Nouveau superadmin</button>
        <button class="btn btn-primary" id="btnNewAgent"><i class="fas fa-user-plus"></i> Nouvel agent</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1.25rem">
      <div class="stat-card"><div class="stat-label">Superadmins</div><div class="stat-value">${superadmins.length}</div></div>
      <div class="stat-card"><div class="stat-label">Agents totaux</div><div class="stat-value">${agents.length}</div></div>
      <div class="stat-card"><div class="stat-label">Agents actifs</div><div class="stat-value" style="color:var(--success)">${nbActifs}</div></div>
      <div class="stat-card"><div class="stat-label">Agents inactifs</div><div class="stat-value" style="color:var(--danger)">${nbInactifs}</div></div>
    </div>

    <!-- Onglets internes -->
    <div class="gu-tabs" style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:1.25rem">
      <button class="gu-tab active" data-tab="agents" style="padding:.6rem 1.4rem;border:none;background:none;cursor:pointer;font-weight:600;color:var(--primary);border-bottom:2px solid var(--primary);margin-bottom:-2px">
        <i class="fas fa-user-tie"></i> Agents (${agents.length})
      </button>
      <button class="gu-tab" data-tab="superadmins" style="padding:.6rem 1.4rem;border:none;background:none;cursor:pointer;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px">
        <i class="fas fa-shield-halved"></i> Superadmins (${superadmins.length})
      </button>
    </div>

    <!-- Panneau Agents -->
    <div class="gu-pane" id="pane-agents">
      <!-- Filtres -->
      <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
        <input id="filterAgentSearch" placeholder="🔍 Nom, email, téléphone…" style="flex:1;min-width:220px;padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem"/>
        <select id="filterAgentNiveau" style="padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem">
          <option value="">Tous les niveaux</option>
          <option value="0">N0 — Agent racine</option>
          <option value="1">N1 — Sous-agent</option>
          <option value="2">N2 — Sous-agent</option>
          <option value="3">N3</option><option value="4">N4</option><option value="5">N5</option>
        </select>
        <select id="filterAgentStatut" style="padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem">
          <option value="">Tous les statuts</option>
          <option value="1">Actifs seulement</option>
          <option value="0">Inactifs seulement</option>
        </select>
        <span id="filterAgentCount" style="font-size:.82rem;color:var(--text-muted)"></span>
      </div>

      <div class="table-wrap">
        <table class="data-table" id="tableAgents">
          <thead><tr>
            <th>Nom</th><th>Email</th><th>Niveau</th><th>Parent</th>
            <th class="text-right">Filleuls</th><th class="text-right">Restos</th>
            <th>Statut</th><th>Dernière connexion</th><th class="text-right">Actions</th>
          </tr></thead>
          <tbody id="tbodyAgents">${agents.map(a => `
            <tr data-nom="${escapeHtml((a.prenom+' '+a.nom).toLowerCase())}" data-email="${escapeHtml((a.email||'').toLowerCase())}" data-tel="${escapeHtml((a.telephone||'').toLowerCase())}" data-niveau="${a.niveau}" data-actif="${a.actif ? '1' : '0'}">
              <td><strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong></td>
              <td style="font-size:.85rem">${escapeHtml(a.email)}</td>
              <td>${niveauPill(a.niveau)}</td>
              <td>${a.parent_nom ? escapeHtml(a.parent_nom) : '<span class="text-muted">—</span>'}</td>
              <td class="text-right">${a.nb_enfants_directs}</td>
              <td class="text-right">${a.nb_restos}</td>
              <td>${a.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
              <td style="font-size:.85rem">${fmtDateTime(a.derniere_connexion)}</td>
              <td class="text-right" style="white-space:nowrap">
                <button class="btn btn-sm btn-secondary" data-agent-edit="${a.id}" title="Modifier"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm ${a.actif ? 'btn-warning' : 'btn-success'}" data-agent-toggle="${a.id}" data-actif="${a.actif ? '1' : '0'}" title="${a.actif ? 'Désactiver' : 'Activer'}"><i class="fas fa-${a.actif ? 'pause' : 'play'}"></i></button>
                <button class="btn btn-sm btn-info" data-agent-pwd="${a.id}" title="Reset mot de passe"><i class="fas fa-key"></i></button>
                <button class="btn btn-sm btn-secondary" data-agent-drill="${a.id}" title="Voir détail drill-down"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-danger" data-agent-del="${a.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Panneau Superadmins -->
    <div class="gu-pane" id="pane-superadmins" style="display:none">
      <div class="card" style="background:#eff6ff;border-left:3px solid #3b82f6;margin-bottom:1rem;padding:.75rem 1rem;font-size:.88rem">
        <i class="fas fa-circle-info" style="color:#3b82f6"></i>
        Les superadmins ont accès à l'intégralité du dashboard. Ils ne font pas partie de la hiérarchie MLM et n'ont pas de restaurants associés.
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Nom</th><th>Email</th><th>Téléphone</th><th>Statut</th><th>Dernière connexion</th><th>Créé le</th><th class="text-right">Actions</th>
          </tr></thead>
          <tbody>${superadmins.map(u => `
            <tr>
              <td><strong>${escapeHtml(u.prenom + ' ' + u.nom)}</strong></td>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.telephone || '—')}</td>
              <td>${u.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
              <td>${fmtDateTime(u.derniere_connexion)}</td>
              <td>${fmtDate(u.created_at)}</td>
              <td class="text-right" style="white-space:nowrap">
                <button class="btn btn-sm btn-secondary" data-admin-edit="${u.id}" title="Modifier"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-info" data-admin-pwd="${u.id}" title="Reset mot de passe"><i class="fas fa-key"></i></button>
                <button class="btn btn-sm btn-danger" data-admin-del="${u.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `

  // === Onglets internes ===
  c.querySelectorAll('.gu-tab').forEach(tab => {
    tab.onclick = () => {
      c.querySelectorAll('.gu-tab').forEach(t => {
        t.style.color = 'var(--text-muted)'; t.style.borderBottomColor = 'transparent'; t.classList.remove('active')
      })
      c.querySelectorAll('.gu-pane').forEach(p => p.style.display = 'none')
      tab.style.color = 'var(--primary)'; tab.style.borderBottomColor = 'var(--primary)'; tab.classList.add('active')
      document.getElementById('pane-' + tab.dataset.tab).style.display = ''
    }
  })

  // === Filtres agents ===
  const filterAgents = () => {
    const search = document.getElementById('filterAgentSearch').value.toLowerCase().trim()
    const niveau = document.getElementById('filterAgentNiveau').value
    const statut = document.getElementById('filterAgentStatut').value
    let visible = 0
    c.querySelectorAll('#tbodyAgents tr').forEach(tr => {
      const matchSearch = !search || tr.dataset.nom.includes(search) || tr.dataset.email.includes(search) || tr.dataset.tel.includes(search)
      const matchNiveau = !niveau || tr.dataset.niveau === niveau
      const matchStatut = !statut || tr.dataset.actif === statut
      const show = matchSearch && matchNiveau && matchStatut
      tr.style.display = show ? '' : 'none'
      if (show) visible++
    })
    document.getElementById('filterAgentCount').textContent = visible + ' agent(s) affiché(s)'
  }
  document.getElementById('filterAgentSearch').oninput = filterAgents
  document.getElementById('filterAgentNiveau').onchange = filterAgents
  document.getElementById('filterAgentStatut').onchange = filterAgents
  filterAgents()

  // === Boutons création ===
  document.getElementById('btnNewAgent').onclick = () => unifiedAgentModal(null, allUsers, () => navigate('gestion-utilisateurs'))
  document.getElementById('btnNewAdmin').onclick = () => unifiedSuperadminModal(null, () => navigate('gestion-utilisateurs'))

  // === Actions agents ===
  c.querySelectorAll('[data-agent-edit]').forEach(b => {
    const a = agents.find(x => x.id == b.dataset.agentEdit)
    b.onclick = () => unifiedAgentModal(a, allUsers, () => navigate('gestion-utilisateurs'))
  })
  c.querySelectorAll('[data-agent-toggle]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.agentToggle, actif = b.dataset.actif === '1'
      const url = actif ? '/admin/agents-crud/' + id + '/desactiver' : '/admin/agents-crud/' + id + '/activer'
      confirmDialog(actif ? 'Désactiver cet agent ? Toutes ses sessions seront fermées.' : 'Activer cet agent ?',
        async () => { await api.put(url); toast('Statut mis à jour'); navigate('gestion-utilisateurs') })
    }
  })
  c.querySelectorAll('[data-agent-pwd]').forEach(b => {
    b.onclick = () => resetPasswordModal(b.dataset.agentPwd, 'agent')
  })
  c.querySelectorAll('[data-agent-drill]').forEach(b => {
    b.onclick = () => navigate('agent-detail-' + b.dataset.agentDrill)
  })
  c.querySelectorAll('[data-agent-del]').forEach(b => {
    b.onclick = () => confirmDialog('Supprimer définitivement cet agent ? (Refusé s\'il a des filleuls ou restaurants associés)',
      async () => {
        try { await api.delete('/admin/agents-crud/' + b.dataset.agentDel); toast('Agent supprimé'); navigate('gestion-utilisateurs') }
        catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
      })
  })

  // === Actions superadmins ===
  c.querySelectorAll('[data-admin-edit]').forEach(b => {
    const u = allUsers.find(x => x.id == b.dataset.adminEdit)
    b.onclick = () => unifiedSuperadminModal(u, () => navigate('gestion-utilisateurs'))
  })
  c.querySelectorAll('[data-admin-pwd]').forEach(b => {
    b.onclick = () => resetPasswordModal(b.dataset.adminPwd, 'superadmin')
  })
  c.querySelectorAll('[data-admin-del]').forEach(b => {
    b.onclick = () => confirmDialog('Supprimer définitivement ce superadmin ? (Impossible s\'il est le dernier.)',
      async () => {
        try { await api.delete('/admin/users/' + b.dataset.adminDel); toast('Superadmin supprimé'); navigate('gestion-utilisateurs') }
        catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
      })
  })
}

// === Modal création/édition agent (unifié) ===
async function unifiedAgentModal(agent, allUsers, onSuccess) {
  const isEdit = !!agent
  const a = agent || { niveau: 1 }
  const niveau = a.niveau ?? 1
  const { data: pp } = await api.get('/admin/agents-crud/parents-possibles?level=' + niveau).catch(() => ({ data: { parents: [] } }))

  const m = modal(`<i class="fas fa-${isEdit ? 'pen' : 'user-plus'}"></i> ${isEdit ? 'Modifier l\'agent' : 'Créer un agent'}`, `
    <form id="uaForm">
      <div class="form-grid">
        <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="uaPrenom" value="${escapeHtml(a.prenom || '')}" required/></div>
        <div class="form-group"><label>Nom <span class="req">*</span></label><input id="uaNom" value="${escapeHtml(a.nom || '')}" required/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Email <span class="req">*</span></label><input id="uaEmail" type="email" value="${escapeHtml(a.email || '')}" required/></div>
        <div class="form-group"><label>Téléphone</label><input id="uaTel" value="${escapeHtml(a.telephone || '')}"/></div>
        <div class="form-group"><label>IBAN</label><input id="uaIban" value="${escapeHtml(a.iban || '')}"/></div>
        <div class="form-group"><label>Niveau MLM <span class="req">*</span></label>
          <select id="uaNiveau">
            ${[0,1,2,3,4,5].map(n => `<option value="${n}" ${n===niveau?'selected':''}>N${n}${n===0?' — Agent racine':''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Agent parent</label>
          <select id="uaParent">
            <option value="">— ${niveau === 0 ? 'Pas de parent' : 'Choisir parent'} —</option>
            ${pp.parents.map(p => `<option value="${p.id}" ${a.parent_id == p.id ? 'selected' : ''}>${escapeHtml(p.prenom + ' ' + p.nom)} (N${p.niveau})</option>`).join('')}
          </select>
        </div>
        ${!isEdit ? `<div class="form-group" style="grid-column:1/-1"><label>Mot de passe <small class="text-muted">(auto-généré si vide)</small></label><input id="uaPwd" type="text" placeholder="laisser vide pour auto-générer"/></div>` : ''}
        ${isEdit ? `<div class="form-group"><label>Statut</label><select id="uaActif"><option value="1" ${a.actif ? 'selected' : ''}>Actif</option><option value="0" ${!a.actif ? 'selected' : ''}>Inactif</option></select></div>` : ''}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>`)

  m.el.querySelector('[data-close]').onclick = m.close
  m.el.querySelector('#uaNiveau').onchange = async () => {
    const lvl = parseInt(m.el.querySelector('#uaNiveau').value)
    const { data: nn } = await api.get('/admin/agents-crud/parents-possibles?level=' + lvl).catch(() => ({ data: { parents: [] } }))
    m.el.querySelector('#uaParent').innerHTML = `<option value="">— ${lvl === 0 ? 'Pas de parent' : 'Choisir parent'} —</option>` +
      nn.parents.map(p => `<option value="${p.id}">${escapeHtml(p.prenom + ' ' + p.nom)} (N${p.niveau})</option>`).join('')
  }
  m.el.querySelector('#uaForm').onsubmit = async e => {
    e.preventDefault()
    const body = {
      email: m.el.querySelector('#uaEmail').value.trim(),
      nom: m.el.querySelector('#uaNom').value.trim(),
      prenom: m.el.querySelector('#uaPrenom').value.trim(),
      telephone: m.el.querySelector('#uaTel').value.trim() || null,
      iban: m.el.querySelector('#uaIban').value.trim() || null,
      niveau: parseInt(m.el.querySelector('#uaNiveau').value),
      parent_id: m.el.querySelector('#uaParent').value ? parseInt(m.el.querySelector('#uaParent').value) : null
    }
    if (isEdit) body.actif = parseInt(m.el.querySelector('#uaActif')?.value || '1')
    try {
      if (isEdit) {
        await api.put('/admin/agents-crud/' + agent.id, body)
        toast('Agent modifié'); m.close(); onSuccess && onSuccess()
      } else {
        body.password = m.el.querySelector('#uaPwd')?.value.trim() || null
        const r = await api.post('/admin/agents-crud/create', body)
        m.close()
        showAccessCodeModal(r.data.code_acces, () => onSuccess && onSuccess())
      }
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// === Modal création/édition superadmin ===
function unifiedSuperadminModal(user, onSuccess) {
  const isEdit = !!user
  const u = user || {}
  const m = modal(`<i class="fas fa-shield-halved"></i> ${isEdit ? 'Modifier le superadmin' : 'Nouveau superadmin'}`, `
    <form id="saForm">
      <div class="form-grid">
        <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="saPrenom" required value="${escapeHtml(u.prenom || '')}"/></div>
        <div class="form-group"><label>Nom <span class="req">*</span></label><input id="saNom" required value="${escapeHtml(u.nom || '')}"/></div>
        <div class="form-group"><label>Email <span class="req">*</span></label><input id="saEmail" type="email" required value="${escapeHtml(u.email || '')}"/></div>
        <div class="form-group"><label>Téléphone</label><input id="saTel" value="${escapeHtml(u.telephone || '')}"/></div>
        ${!isEdit ? `<div class="form-group" style="grid-column:1/-1"><label>Mot de passe <span class="req">*</span></label><input id="saPwd" type="password" required minlength="6" placeholder="Min 6 caractères"/></div>` : ''}
        ${isEdit ? `<div class="form-group"><label>Statut</label><select id="saActif"><option value="1" ${u.actif ? 'selected' : ''}>Actif</option><option value="0" ${!u.actif ? 'selected' : ''}>Inactif</option></select></div>` : ''}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="saCancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  m.el.querySelector('#saCancelBtn').onclick = m.close
  m.el.querySelector('#saForm').onsubmit = async e => {
    e.preventDefault()
    const payload = {
      prenom: m.el.querySelector('#saPrenom').value.trim(),
      nom: m.el.querySelector('#saNom').value.trim(),
      email: m.el.querySelector('#saEmail').value.trim(),
      telephone: m.el.querySelector('#saTel').value.trim() || null,
      role: 'superadmin',
      niveau: null
    }
    if (!isEdit) payload.password = m.el.querySelector('#saPwd').value
    if (isEdit) payload.actif = parseInt(m.el.querySelector('#saActif').value)
    try {
      if (isEdit) await api.put('/admin/users/' + user.id, payload)
      else await api.post('/admin/users', payload)
      toast('Enregistré'); m.close(); onSuccess && onSuccess()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// === Modal reset mot de passe (partagé) ===
function resetPasswordModal(id, type = 'agent') {
  const endpoint = type === 'superadmin'
    ? `/admin/users/${id}/reset-password`
    : `/admin/omnipotence/user/${id}/password`
  const isOmnipotence = type !== 'superadmin'
  const m = modal('Réinitialiser le mot de passe', `
    <form id="pwdForm">
      <div class="form-group"><label>Nouveau mot de passe <span class="req">*</span></label>
        <input id="np" type="password" required minlength="6" placeholder="Min 6 caractères"/></div>
      <p class="text-muted" style="font-size:.85rem">L'utilisateur sera déconnecté de toutes ses sessions actives.</p>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelPwdBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-key"></i> Réinitialiser</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelPwdBtn').onclick = m.close
  m.el.querySelector('#pwdForm').onsubmit = async e => {
    e.preventDefault()
    try {
      const pwd = m.el.querySelector('#np').value
      if (isOmnipotence) await api.put(endpoint, { new_password: pwd })
      else await api.post(endpoint, { new_password: pwd })
      toast('Mot de passe modifié'); m.close()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Arborescence MLM ---
PAGES['tree'] = async (c) => {
  const { data } = await api.get('/admin/users/tree')
  const renderNode = node => `
    <div class="tree-node">
      <div class="tree-line">
        ${niveauPill(node.niveau)}
        <strong>${escapeHtml(node.prenom)} ${escapeHtml(node.nom)}</strong>
        <span class="text-muted">${escapeHtml(node.email)}</span>
        <span class="badge badge-info">${node.nb_restaurants} restos</span>
        <span class="badge badge-slate">${node.nb_marques} marques</span>
        ${!node.actif ? '<span class="badge badge-danger">Inactif</span>' : ''}
      </div>
      ${node.enfants.length ? `<div class="tree-children">${node.enfants.map(renderNode).join('')}</div>` : ''}
    </div>`
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Arborescence MLM</h1><div class="subtitle">Hiérarchie des agents commerciaux et sous-agents</div></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-sitemap"></i> Réseau commercial</div>
      ${data.tree.length ? `<div class="tree">${data.tree.map(renderNode).join('')}</div>` : '<p class="text-muted">Aucun agent</p>'}
    </div>`
}

// --- Restaurants ---
PAGES['restaurants'] = async (c) => {
  const now = new Date()
  const curAnnee = now.getFullYear()
  const curMois = now.getMonth() + 1
  const [r, u, fact] = await Promise.all([
    api.get('/admin/restaurants'),
    api.get('/admin/users'),
    api.get(`/factures/resto/a-facturer-ce-mois?annee=${curAnnee}&mois=${curMois}`).catch(() => ({ data: { map: {} } }))
  ])
  const restos = r.data.restaurants
  const agents = u.data.users.filter(x => x.role === 'agent')
  const facturableMap = fact.data.map || {}

  function renderAFacturer(restoId) {
    const info = facturableMap[String(restoId)]
    if (!info) return '<span class="text-muted">—</span>'
    const total = Number(info.total_ht || 0)
    const fact = info.factures_existantes || []
    if (total <= 0 && fact.length === 0) {
      return '<span class="text-muted" style="font-size:.8rem">0 €</span>'
    }
    let badge = ''
    if (fact.length > 0) {
      const statuts = fact.map(f => f.statut)
      const aPay = statuts.some(s => s === 'envoyee' || s === 'validee')
      const payee = statuts.every(s => s === 'payee')
      if (payee) badge = `<span class="badge badge-success" style="font-size:.65rem" title="${fact.map(f => f.numero).join(', ')}">✓ Facturée</span>`
      else if (aPay) badge = `<span class="badge badge-info" style="font-size:.65rem" title="${fact.map(f => f.numero).join(', ')}">En cours</span>`
      else badge = `<span class="badge" style="background:#fef3c7;color:#92400e;font-size:.65rem" title="${fact.map(f => f.numero).join(', ')}">Brouillon</span>`
    } else if (total > 0) {
      badge = `<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:.65rem" title="Aucune facture émise ce mois">À facturer</span>`
    }
    return `<div style="line-height:1.2"><strong style="font-size:.85rem;color:${total > 0 ? '#1d4ed8' : '#6b7280'}">${fmtEUR(total)}</strong><br>${badge}</div>`
  }

  c.innerHTML = `
    <div class="page-header">
      <div><h1>Restaurants</h1><div class="subtitle">${restos.length} restaurants partenaires · Colonne « À facturer » = ${monthsFR[curMois - 1]} ${curAnnee}</div></div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="goBilling" title="Aller à l'écran de facturation"><i class="fas fa-file-export"></i> Facturer un restaurant</button>
        <button class="btn btn-primary" id="btnNew"><i class="fas fa-plus"></i> Nouveau restaurant</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Nom</th><th>Ville</th><th>Agent</th><th>Rang</th><th>Statut</th>
          <th class="text-right">Marques</th><th class="text-right">Cmds</th><th class="text-right">CA</th>
          <th class="text-right" style="background:#eff6ff" title="Total facturable DropEat→Resto pour ${monthsFR[curMois - 1]} ${curAnnee}">À facturer ${monthsFR[curMois - 1].substring(0, 3)}.</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${restos.map(r => `
          <tr>
            <td><strong>${escapeHtml(r.nom)}</strong>
              ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold" title="Portefeuille Propriétaire">PORTEFEUILLE</span>' : ''}
              ${r.tablette_sr_shop ? '<span class="badge badge-info" title="Tablette SR Shop fournie"><i class="fas fa-tablet-screen-button"></i> SR</span>' : ''}
            </td>
            <td>${escapeHtml(r.ville || '-')}</td>
            <td>${r.agent_nom ? escapeHtml(r.agent_prenom + ' ' + r.agent_nom) : '<span class="text-muted">—</span>'}</td>
            <td>${r.rang_apport ? '#' + r.rang_apport : '-'}</td>
            <td>${r.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
            <td class="text-right">${r.nb_marques}${r.nb_marques_portefeuille ? ` <small class="text-muted">(${r.nb_marques_portefeuille}P)</small>` : ''}</td>
            <td class="text-right">${fmtNum(r.nb_commandes)}</td>
            <td class="text-right"><strong>${fmtEUR(r.ca_total)}</strong></td>
            <td class="text-right" style="background:#f8fafc">${renderAFacturer(r.id)}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-primary" data-bill="${r.id}" title="Facturer ce restaurant"><i class="fas fa-file-invoice"></i></button>
              <button class="btn btn-sm btn-secondary" data-detail="${r.id}"><i class="fas fa-eye"></i></button>
              <button class="btn btn-sm btn-secondary" data-edit="${r.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del="${r.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
  document.getElementById('btnNew').onclick = () => restaurantModal(null, agents)
  const goBilling = c.querySelector('#goBilling')
  if (goBilling) goBilling.onclick = () => navigate('admin-factures-resto')
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const x = restos.find(r => r.id === parseInt(b.dataset.edit))
    restaurantModal(x, agents)
  })
  c.querySelectorAll('[data-bill]').forEach(b => b.onclick = () => {
    // Passer l'ID au localStorage pour pré-sélection puis naviguer
    try { sessionStorage.setItem('billing_preselect_resto', b.dataset.bill) } catch {}
    navigate('admin-factures-resto')
  })
  c.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => restaurantDetailModal(parseInt(b.dataset.detail), agents))
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer ce restaurant ? Toutes ses marques et commandes seront supprimées.',
    async () => { await api.delete('/admin/restaurants/' + b.dataset.del); toast('Supprimé'); navigate('restaurants') }
  ))
}

function restaurantModal(r, agents) {
  const isEdit = !!r
  const agentOptions = ['<option value="">— Aucun —</option>']
    .concat(agents.map(a => `<option value="${a.id}" ${r?.agent_id == a.id ? 'selected' : ''}>${escapeHtml(a.prenom + ' ' + a.nom)} (${niveauLabel(a.niveau)})</option>`)).join('')
  const m = modal(isEdit ? 'Modifier le restaurant' : 'Nouveau restaurant', `
    <form id="rForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom du restaurant <span class="req">*</span></label><input id="nom" required value="${escapeHtml(r?.nom || '')}"/></div>
        <div class="form-group"><label>Raison sociale</label><input id="raison_sociale" value="${escapeHtml(r?.raison_sociale || '')}"/></div>
        <div class="form-group"><label>SIRET</label><input id="siret" value="${escapeHtml(r?.siret || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Adresse</label><input id="adresse" value="${escapeHtml(r?.adresse || '')}"/></div>
        <div class="form-group"><label>Code postal</label><input id="code_postal" value="${escapeHtml(r?.code_postal || '')}"/></div>
        <div class="form-group"><label>Ville</label><input id="ville" value="${escapeHtml(r?.ville || '')}"/></div>
        <div class="form-group"><label>Téléphone</label><input id="telephone" value="${escapeHtml(r?.telephone || '')}"/></div>
        <div class="form-group"><label>Email</label><input id="email" type="email" value="${escapeHtml(r?.email || '')}"/></div>
        <div class="form-group"><label>Contact</label><input id="contact_nom" value="${escapeHtml(r?.contact_nom || '')}"/></div>
        <div class="form-group"><label>Agent apporteur</label><select id="agent_id">${agentOptions}</select></div>
        <div class="form-group"><label>Date de signature</label><input id="date_signature" type="date" value="${r?.date_signature || ''}"/></div>
        <div class="form-group"><label>Date de lancement</label><input id="date_lancement" type="date" value="${r?.date_lancement || ''}"/></div>
        <div class="form-group">
          <label>Tablette SR Shop ?</label>
          <select id="tablette_sr_shop">
            <option value="0" ${!r?.tablette_sr_shop ? 'selected' : ''}>Non</option>
            <option value="1" ${r?.tablette_sr_shop ? 'selected' : ''}>Oui (+0.05 € / commande)</option>
          </select>
        </div>
        ${isEdit ? `<div class="form-group"><label>Statut</label><select id="actif"><option value="1" ${r?.actif ? 'selected' : ''}>Actif</option><option value="0" ${!r?.actif ? 'selected' : ''}>Inactif</option></select></div>` : ''}
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(r?.notes || '')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#rForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = {
      nom: get('nom').trim(),
      raison_sociale: get('raison_sociale').trim() || null,
      siret: get('siret').trim() || null,
      adresse: get('adresse').trim() || null,
      code_postal: get('code_postal').trim() || null,
      ville: get('ville').trim() || null,
      telephone: get('telephone').trim() || null,
      email: get('email').trim() || null,
      contact_nom: get('contact_nom').trim() || null,
      agent_id: get('agent_id') ? parseInt(get('agent_id')) : null,
      date_signature: get('date_signature') || null,
      date_lancement: get('date_lancement') || null,
      tablette_sr_shop: parseInt(get('tablette_sr_shop')),
      notes: get('notes').trim() || null
    }
    if (isEdit) payload.actif = parseInt(get('actif'))
    try {
      if (isEdit) await api.put('/admin/restaurants/' + r.id, payload)
      else await api.post('/admin/restaurants', payload)
      toast('Enregistré'); m.close(); navigate('restaurants')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

async function restaurantDetailModal(id, agents) {
  const [restoR, docsR, checklistR, comptesR] = await Promise.all([
    api.get('/admin/restaurants/' + id),
    api.get('/admin/documents/restaurant/' + id).catch(() => ({ data: { checklist: [], documents: [], conformite: { pourcentage_completion: 0, conforme: false, documents_obligatoires_valides: 0, documents_obligatoires_total: 3, documents_expires: 0 } } })),
    api.get('/admin/comptes/restaurant/' + id + '/checklist').catch(() => ({ data: { checklist: [], resume: { pourcentage: 0, valides: 0, obligatoires: 8, manquants: 8, en_attente: 0, pret_activation: false } } })),
    api.get('/admin/comptes/restaurant/' + id).catch(() => ({ data: { comptes: [] } }))
  ])
  const r = restoR.data.restaurant, marques = restoR.data.marques
  const docs = docsR.data
  const conf = docs.conformite
  const cl = checklistR.data
  const comptes = comptesR.data.comptes || []

  const confColor = conf.conforme ? 'var(--success, #06A05A)' : (conf.pourcentage_completion >= 50 ? 'var(--warning, #ea8a00)' : 'var(--danger, #dc2626)')
  const activColor = cl.resume.pourcentage === 100 ? 'var(--success, #06A05A)' : (cl.resume.pourcentage >= 50 ? 'var(--warning, #ea8a00)' : 'var(--danger, #dc2626)')

  // Stats marques agrégées
  const totalCmd = marques.reduce((s, mq) => s + (mq.nb_commandes || 0), 0)
  const totalCA  = marques.reduce((s, mq) => s + (mq.ca_total || 0), 0)

  const m = modal(`<i class="fas fa-store"></i> ${escapeHtml(r.nom)}`, `
    <div class="resto-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.6rem;margin-bottom:1rem">
      <div class="summary-tile"><div class="summary-label">Marques</div><div class="summary-val">${marques.length}</div></div>
      <div class="summary-tile"><div class="summary-label">Commandes</div><div class="summary-val">${fmtNum(totalCmd)}</div></div>
      <div class="summary-tile"><div class="summary-label">CA cumulé</div><div class="summary-val">${fmtEUR(totalCA)}</div></div>
      <div class="summary-tile"><div class="summary-label">Conformité docs</div><div class="summary-val" style="color:${confColor}">${conf.pourcentage_completion}%</div></div>
      <div class="summary-tile"><div class="summary-label">Activation</div><div class="summary-val" style="color:${activColor}">${cl.resume.pourcentage}%</div></div>
      <div class="summary-tile"><div class="summary-label">Comptes</div><div class="summary-val">${comptes.length}</div></div>
    </div>

    <div class="resto-tabs">
      <button class="resto-tab active" data-tab="info"><i class="fas fa-circle-info"></i> Infos</button>
      <button class="resto-tab" data-tab="marques"><i class="fas fa-tags"></i> Marques (${marques.length})</button>
      <button class="resto-tab" data-tab="comptes"><i class="fas fa-key"></i> Comptes (${comptes.length})</button>
      <button class="resto-tab" data-tab="docs"><i class="fas fa-folder-open"></i> Documents <span class="badge ${conf.conforme ? 'badge-primary' : 'badge-warning'}" style="font-size:.6rem">${conf.documents_obligatoires_valides}/${conf.documents_obligatoires_total}</span></button>
      <button class="resto-tab" data-tab="check"><i class="fas fa-list-check"></i> Activation <span class="badge ${cl.resume.pret_activation ? 'badge-primary' : 'badge-warning'}" style="font-size:.6rem">${cl.resume.valides}/${cl.resume.obligatoires}</span></button>
    </div>

    <div class="resto-tab-pane active" data-pane="info">
      <div class="card-title" style="font-size:.95rem;margin-bottom:.4rem"><i class="fas fa-store"></i> Identité restaurant</div>
      <div class="form-grid mb-3">
        <div><strong>Agent :</strong> ${r.agent_nom ? escapeHtml((r.agent_prenom || '') + ' ' + r.agent_nom) : '—'}</div>
        <div><strong>Rang :</strong> #${r.rang_apport || '-'} ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}</div>
        <div><strong>Tablette SR :</strong> ${r.tablette_sr_shop ? '<span class="badge badge-primary">Oui</span>' : '<span class="badge badge-slate">Non</span>'}</div>
        <div><strong>Ville :</strong> ${escapeHtml(r.ville || '—')}</div>
        <div><strong>SIRET :</strong> ${escapeHtml(r.siret || '—')}</div>
        <div><strong>Raison sociale :</strong> ${escapeHtml(r.raison_sociale || '—')}</div>
        <div><strong>Email :</strong> ${escapeHtml(r.email || '—')}</div>
        <div><strong>Téléphone :</strong> ${escapeHtml(r.telephone || '—')}</div>
        <div style="grid-column:1/-1"><strong>Menu URL :</strong>
          ${r.menu_url ? `<a href="${escapeHtml(r.menu_url)}" target="_blank">${escapeHtml(r.menu_url)}</a>` : '<em class="text-muted">Non renseigné</em>'}
          <button class="btn btn-sm btn-secondary" id="btnSetMenuUrl" style="margin-left:.5rem"><i class="fas fa-link"></i> ${r.menu_url ? 'Modifier' : 'Définir'}</button>
        </div>
        <div><strong>Compte activé :</strong> ${r.compte_active ? `<span class="badge badge-primary"><i class="fas fa-check"></i> Oui (${fmtDate(r.date_activation)})</span>` : '<span class="badge badge-slate">Non</span>'}</div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin:.8rem 0 .4rem"><i class="fas fa-user-tie"></i> Gérant</div>
      <div class="form-grid mb-3">
        <div><strong>Nom complet :</strong> ${escapeHtml(((r.gerant_prenom || '') + ' ' + (r.gerant_nom || '')).trim() || '—')}</div>
        <div><strong>Téléphone :</strong> ${r.gerant_telephone ? `<a href="tel:${escapeHtml(r.gerant_telephone)}">${escapeHtml(r.gerant_telephone)}</a>` : '—'}</div>
        <div><strong>Email :</strong> ${r.gerant_email ? `<a href="mailto:${escapeHtml(r.gerant_email)}">${escapeHtml(r.gerant_email)}</a>` : '—'}</div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin:.8rem 0 .4rem">
        <i class="fas fa-piggy-bank"></i> RIB manuel
        ${r.rib_iban ? '<span class="badge badge-primary" style="font-size:.65rem;margin-left:.4rem">RENSEIGNÉ</span>' : '<span class="badge badge-warning" style="font-size:.65rem;margin-left:.4rem">À COMPLÉTER</span>'}
      </div>
      <div class="form-grid mb-3">
        <div><strong>Titulaire :</strong> ${escapeHtml(r.rib_titulaire || '—')}</div>
        <div><strong>Banque :</strong> ${escapeHtml(r.rib_banque_nom || '—')}</div>
        <div style="grid-column:1/-1"><strong>IBAN :</strong> <code style="font-family:monospace;font-size:.85rem">${escapeHtml(r.rib_iban || '—')}</code>${r.rib_iban ? `<button class="btn btn-sm btn-link" data-copy-iban="${escapeHtml(r.rib_iban)}" title="Copier"><i class="fas fa-copy"></i></button>` : ''}</div>
        <div><strong>BIC / SWIFT :</strong> <code style="font-family:monospace;font-size:.85rem">${escapeHtml(r.rib_bic || '—')}</code></div>
        <div style="grid-column:1/-1"><strong>Références :</strong> ${escapeHtml(r.rib_references || '—')}</div>
      </div>

      ${r.is_portefeuille_proprietaire ? `
      <div class="card-title" style="font-size:.95rem;margin:.8rem 0 .4rem">
        <i class="fas fa-crown" style="color:var(--gold, #FFB800)"></i> Portefeuille Propriétaire
      </div>
      <div class="form-grid mb-3" style="background:linear-gradient(135deg,#fffbeb 0%,#ffffff 100%);padding:.7rem;border-radius:6px;border-left:3px solid var(--gold, #FFB800)">
        <div><strong>Statut :</strong> <span class="badge badge-gold">PORTEFEUILLE 100%</span></div>
        <div><strong>Date de signature :</strong> ${r.date_signature_portefeuille ? '<span style="color:#06A05A"><i class="fas fa-check"></i> ' + escapeHtml((r.date_signature_portefeuille || '').substring(0,10)) + '</span>' : '<span class="text-danger">Non signée — facturable par DropEat jusqu&rsquo;à signature</span>'}</div>
        <div style="grid-column:1/-1;font-size:.78rem;color:#6b7280">
          <i class="fas fa-info-circle"></i> Règle : avant date de signature → commissions facturables par DropEat. Après signature → 100% pour l'agent.
        </div>
      </div>
      ` : ''}

      <div class="conformite-banner" style="border-left:4px solid ${confColor};padding:.7rem .9rem;background:#f8fafc;border-radius:6px;margin-bottom:.8rem">
        <strong><i class="fas fa-${conf.conforme ? 'check-circle' : 'triangle-exclamation'}"></i>
        Conformité documentaire : ${conf.pourcentage_completion}%</strong>
        — ${conf.documents_obligatoires_valides}/${conf.documents_obligatoires_total} pièces obligatoires validées
        ${conf.documents_expires ? ` · <span style="color:var(--danger)"><strong>${conf.documents_expires} document(s) expiré(s)</strong></span>` : ''}
      </div>
    </div>

    <div class="resto-tab-pane" data-pane="marques" style="display:none">
      <div class="card-title"><i class="fas fa-tags"></i> Marques virtuelles (${marques.length})
        <button class="btn btn-sm btn-primary" id="btnAddMarque" style="margin-left:auto"><i class="fas fa-plus"></i> Ajouter une marque</button>
      </div>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:.5rem">
        <i class="fas fa-circle-info"></i> Cliquez sur <strong>Voir l'historique</strong> pour consulter chaque commande avec sa commission (traçabilité 100%).
        Cliquez sur <strong>+ Plateforme</strong> pour ajouter Deliveroo, Just Eat, site web…
      </p>
      <table class="data-table">
        <thead><tr><th>#</th><th>Nom</th><th>Plateformes</th><th>Uber Store ID</th><th>Statut</th><th>Accès Uber</th><th>Tablette</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${marques.length ? marques.map(mq => {
          const statutMarqueBadge = mq.statut_marque === 'active' ? '<span class="badge badge-primary" style="font-size:.65rem"><i class="fas fa-check"></i> Active</span>' :
            mq.statut_marque === 'en_creation' ? '<span class="badge badge-warning" style="font-size:.65rem"><i class="fas fa-hourglass-half"></i> En création</span>' :
            mq.statut_marque === 'suspendue' ? '<span class="badge badge-danger" style="font-size:.65rem">Suspendue</span>' :
            mq.statut_marque === 'fermee' ? '<span class="badge badge-slate" style="font-size:.65rem">Fermée</span>' :
            '<span class="badge badge-slate" style="font-size:.65rem">—</span>'
          const hasMgr = !!(mq.uber_manager_email || mq.uber_manager_url)
          const hasOrd = !!(mq.uber_orders_email || mq.uber_orders_url)
          return `
          <tr>
            <td>${mq.rang_creation || '-'} ${mq.is_portefeuille_proprietaire ? '<span class="badge badge-gold" style="font-size:.6rem" title="Portefeuille 100%' + (mq.date_signature_portefeuille ? ' — signé ' + (mq.date_signature_portefeuille || '').substring(0,10) : ' — non signé') + '">P</span>' : ''}${mq.exclue_tranche ? '<span class="badge badge-slate" style="font-size:.6rem" title="Marque héritée d\'un resto attribué (décalée en tranche suivante)">H</span>' : ''}</td>
            <td><strong>${escapeHtml(mq.nom)}</strong>${mq.date_lancement ? `<div class="text-muted" style="font-size:.7rem">Lancée ${fmtDate(mq.date_lancement)}</div>` : ''}</td>
            <td>
              <span class="badge badge-slate">${escapeHtml(mq.plateforme || '—')}</span>
              <button class="btn btn-sm btn-link" data-mq-plats="${mq.id}" title="Gérer les plateformes" style="padding:.1rem .35rem"><i class="fas fa-plus-circle"></i></button>
            </td>
            <td><code>${escapeHtml(mq.uber_store_id || '-')}</code></td>
            <td>${statutMarqueBadge}</td>
            <td style="font-size:.75rem">
              ${hasMgr ? `<span title="Manager: ${escapeHtml(mq.uber_manager_email || mq.uber_manager_url || '')}" style="color:#06A05A"><i class="fas fa-check-circle"></i> Mgr</span>` : '<span class="text-muted">— Mgr</span>'}
              ${hasOrd ? `<span title="Orders: ${escapeHtml(mq.uber_orders_email || mq.uber_orders_url || '')}" style="color:#06A05A;margin-left:.3rem"><i class="fas fa-check-circle"></i> Ord</span>` : '<span class="text-muted" style="margin-left:.3rem">— Ord</span>'}
            </td>
            <td style="font-size:.75rem">${mq.tablette_fournie ? `<span style="color:#06A05A"><i class="fas fa-tablet-screen-button"></i>${mq.tablette_serial ? ' <code style="font-size:.7rem">' + escapeHtml(mq.tablette_serial) + '</code>' : ''}</span>` : '<span class="text-muted">Non</span>'}</td>
            <td class="text-right">${fmtNum(mq.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(mq.ca_total)}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-primary" data-mq-history="${mq.id}" title="Historique commandes"><i class="fas fa-clock-rotate-left"></i></button>
              <button class="btn btn-sm btn-secondary" data-edit-marque="${mq.id}" data-marque-data='${escapeHtml(JSON.stringify(mq))}'><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del-marque="${mq.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`}).join('') : '<tr><td colspan="10" class="text-center text-muted">Aucune marque — cliquez sur « Ajouter une marque »</td></tr>'}</tbody>
      </table>
    </div>

    <div class="resto-tab-pane" data-pane="comptes" style="display:none">
      <div class="card-title"><i class="fas fa-key"></i> Comptes & accès plateformes (${comptes.length})
        <button class="btn btn-sm btn-primary" id="btnAddCompte" style="margin-left:auto"><i class="fas fa-plus"></i> Ajouter un compte</button>
      </div>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:.5rem">
        <i class="fas fa-shield"></i> Centralisez tous les accès : Uber Eats Manager / Order, Deliveroo, Just Eat, site web,
        accès commercial DropEat… Mots de passe chiffrés et auditables.
      </p>
      <table class="data-table">
        <thead><tr><th>Plateforme</th><th>Type</th><th>Libellé</th><th>Email</th><th>URL</th><th>Marque</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${comptes.length ? comptes.map(co => `
          <tr>
            <td><span class="badge badge-slate"><i class="fas fa-${
              co.plateforme === 'uber_eats' || co.plateforme === 'uber_manager' || co.plateforme === 'uber_order' ? 'utensils' :
              co.plateforme === 'deliveroo' ? 'motorcycle' :
              co.plateforme === 'justeat' ? 'pizza-slice' :
              co.plateforme === 'site_web' ? 'globe' : 'circle-dot'
            }"></i> ${escapeHtml(co.plateforme)}</span></td>
            <td>${escapeHtml(co.type_acces || '—')}</td>
            <td>${escapeHtml(co.libelle || '—')}</td>
            <td style="font-family:monospace;font-size:.8rem">${escapeHtml(co.email_connexion || '—')}</td>
            <td>${co.url_acces ? `<a href="${escapeHtml(co.url_acces)}" target="_blank" title="${escapeHtml(co.url_acces)}"><i class="fas fa-external-link-alt"></i></a>` : '—'}</td>
            <td>${escapeHtml(co.marque_nom || '—')}</td>
            <td class="text-right">
              ${co.has_password ? `<button class="btn btn-sm btn-warning" data-reveal-cpt="${co.id}" title="Voir mot de passe"><i class="fas fa-eye"></i></button>` : ''}
              <button class="btn btn-sm btn-secondary" data-edit-cpt="${co.id}" data-cpt='${escapeHtml(JSON.stringify(co))}'><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del-cpt="${co.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucun compte — ajoutez vos accès Uber Manager, Order, Deliveroo, etc.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="resto-tab-pane" data-pane="docs" style="display:none">
      <div class="card-title"><i class="fas fa-folder-open"></i> Pièces administratives
        <button class="btn btn-sm btn-primary" id="btnAddDoc" style="margin-left:auto"><i class="fas fa-upload"></i> Ajouter un document</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Statut</th><th class="text-right">Documents</th><th>Dernière MAJ</th></tr></thead>
        <tbody>${docs.checklist.map(item => `
          <tr style="${item.obligatoire && !item.valide ? 'background:#fff8f0' : ''}">
            <td>
              <strong>${escapeHtml(item.label)}</strong>
              ${item.obligatoire ? '<span class="badge badge-danger" style="font-size:.6rem">OBLIGATOIRE</span>' : '<span class="badge badge-slate" style="font-size:.6rem">Optionnel</span>'}
            </td>
            <td>
              ${item.valide ? '<span class="badge badge-primary"><i class="fas fa-check"></i> Validé</span>' :
                item.fourni ? '<span class="badge badge-warning"><i class="fas fa-clock"></i> En attente</span>' :
                '<span class="badge badge-danger"><i class="fas fa-times"></i> Manquant</span>'}
              ${item.expire ? '<span class="badge badge-danger" style="font-size:.6rem">EXPIRÉ</span>' : ''}
            </td>
            <td class="text-right">${item.nb_documents}</td>
            <td>${fmtDateTime(item.derniere_maj)}</td>
          </tr>`).join('')}</tbody>
      </table>

      ${docs.documents.length ? `
        <div class="card-title mt-3"><i class="fas fa-file"></i> Fichiers uploadés (${docs.documents.length})</div>
        <table class="data-table">
          <thead><tr><th>Type</th><th>Fichier</th><th class="text-right">Taille</th><th>Statut</th><th>Émis le</th><th>Expire le</th><th>Uploader</th><th class="text-right">Actions</th></tr></thead>
          <tbody>${docs.documents.map(d => {
            const isImg = d.mime_type && d.mime_type.startsWith('image/')
            const isPdf = d.mime_type === 'application/pdf'
            const fileIcon = isImg ? 'fa-file-image' : isPdf ? 'fa-file-pdf' : (d.mime_type || '').includes('word') ? 'fa-file-word' : (d.mime_type || '').includes('excel') || (d.mime_type || '').includes('sheet') ? 'fa-file-excel' : 'fa-file'
            const fileColor = isImg ? '#10b981' : isPdf ? '#dc2626' : '#6b7280'
            const sizeKb = d.taille_octets ? (d.taille_octets > 1024*1024 ? (d.taille_octets/1024/1024).toFixed(1) + ' Mo' : Math.round(d.taille_octets/1024) + ' Ko') : '—'
            return `
            <tr>
              <td><span class="badge badge-slate" style="font-size:.7rem">${escapeHtml(d.type_document)}</span></td>
              <td><i class="fas ${fileIcon}" style="color:${fileColor}"></i> ${escapeHtml(d.nom_fichier)}${d.url_externe ? ' <i class="fas fa-link text-muted" title="Lien externe" style="font-size:.7rem"></i>' : ''}</td>
              <td class="text-right text-muted" style="font-size:.8rem">${sizeKb}</td>
              <td>${d.statut === 'valide' ? '<span class="badge badge-primary"><i class="fas fa-check"></i> Validé</span>' :
                  d.statut === 'rejete' ? '<span class="badge badge-danger"><i class="fas fa-times"></i> Rejeté</span>' :
                  d.statut === 'expire' ? '<span class="badge badge-danger">Expiré</span>' :
                  '<span class="badge badge-warning"><i class="fas fa-clock"></i> En attente</span>'}</td>
              <td>${fmtDate(d.date_emission)}</td>
              <td>${d.date_expiration ? (new Date(d.date_expiration) < new Date() ? '<span style="color:var(--danger)"><strong>' + fmtDate(d.date_expiration) + '</strong></span>' : fmtDate(d.date_expiration)) : '—'}</td>
              <td style="font-size:.8rem">${d.uploader_prenom ? escapeHtml(d.uploader_prenom + ' ' + d.uploader_nom) : '—'}</td>
              <td class="text-right" style="white-space:nowrap">
                <button class="btn btn-sm btn-secondary" data-view-doc="${d.id}" title="Prévisualiser"><i class="fas fa-eye"></i></button>
                <button class="btn btn-sm btn-secondary" data-download-doc="${d.id}" title="Télécharger"><i class="fas fa-download"></i></button>
                ${d.statut === 'en_attente' ? `<button class="btn btn-sm btn-primary" data-validate-doc="${d.id}" title="Valider"><i class="fas fa-check"></i></button>` : ''}
                ${d.statut === 'en_attente' ? `<button class="btn btn-sm btn-warning" data-reject-doc="${d.id}" title="Rejeter"><i class="fas fa-times"></i></button>` : ''}
                <button class="btn btn-sm btn-danger" data-del-doc="${d.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`}).join('')}</tbody>
        </table>
      ` : '<p class="text-muted" style="text-align:center;padding:1rem"><i class="fas fa-folder-open"></i> Aucun document uploadé pour ce restaurant.</p>'}
    </div>

    <div class="resto-tab-pane" data-pane="check" style="display:none">
      <div class="card-title">
        <i class="fas fa-list-check"></i> Checklist d'activation
        <span class="badge ${cl.resume.pret_activation ? 'badge-primary' : 'badge-warning'}" style="margin-left:.5rem">
          ${cl.resume.valides}/${cl.resume.obligatoires} obligatoires · ${cl.resume.pourcentage}%
        </span>
        ${cl.resume.pret_activation && !r.compte_active ? `
          <button class="btn btn-sm btn-primary" id="btnActiverCompte" style="margin-left:auto">
            <i class="fas fa-rocket"></i> Activer le compte
          </button>` : ''}
        ${r.compte_active ? `<span class="badge badge-primary" style="margin-left:auto"><i class="fas fa-check-circle"></i> Compte actif depuis ${fmtDate(r.date_activation)}</span>` : ''}
      </div>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:.5rem">
        <i class="fas fa-circle-info"></i> Validez chaque ligne lorsque le restaurateur a fourni l'élément. Les éléments rouges sont <strong>obligatoires</strong> avant l'activation officielle du compte.
      </p>
      <table class="data-table">
        <thead><tr><th style="width:32%">Élément</th><th>Catégorie</th><th>Statut</th><th>Source détectée</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${(cl.checklist || []).map(it => `
          <tr style="${it.obligatoire && it.statut === 'non_renseigne' ? 'background:#fff5f5' : ''}">
            <td>
              <strong>${escapeHtml(it.libelle)}</strong>
              ${it.obligatoire ? '<span class="badge badge-danger" style="font-size:.6rem;margin-left:.3rem">OBLIGATOIRE</span>' : '<span class="badge badge-slate" style="font-size:.6rem;margin-left:.3rem">Optionnel</span>'}
            </td>
            <td><span class="badge badge-slate"><i class="fas fa-${it.categorie === 'documents' ? 'folder' : 'key'}"></i> ${escapeHtml(it.categorie)}</span></td>
            <td>
              ${it.statut === 'valide' ? '<span class="badge badge-primary"><i class="fas fa-check"></i> Validé</span>' :
                it.statut === 'en_attente' ? '<span class="badge badge-warning"><i class="fas fa-clock"></i> En attente</span>' :
                '<span class="badge badge-danger"><i class="fas fa-times"></i> À fournir</span>'}
            </td>
            <td style="font-size:.8rem;color:var(--muted, #64748b)">${it.source ? `<i class="fas fa-link"></i> ${escapeHtml(it.source)}` : '—'}</td>
            <td class="text-right">
              ${it.statut !== 'valide' ? `<button class="btn btn-sm btn-primary" data-cl-set="${it.code}" data-cl-statut="valide" title="Marquer validé"><i class="fas fa-check"></i></button>` : ''}
              ${it.statut !== 'non_renseigne' ? `<button class="btn btn-sm btn-secondary" data-cl-set="${it.code}" data-cl-statut="non_renseigne" title="Réinitialiser"><i class="fas fa-undo"></i></button>` : ''}
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `, { wide: true })

  // Onglets
  m.el.querySelectorAll('.resto-tab').forEach(t => t.onclick = () => {
    m.el.querySelectorAll('.resto-tab').forEach(x => x.classList.remove('active'))
    m.el.querySelectorAll('.resto-tab-pane').forEach(p => p.style.display = 'none')
    t.classList.add('active')
    m.el.querySelector(`[data-pane="${t.dataset.tab}"]`).style.display = 'block'
  })

  // Marques
  m.el.querySelector('#btnAddMarque').onclick = () => marqueModal(id, null, m)
  m.el.querySelectorAll('[data-edit-marque]').forEach(b => {
    b.onclick = () => marqueModal(id, JSON.parse(b.dataset.marqueData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')), m)
  })
  m.el.querySelectorAll('[data-del-marque]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer cette marque virtuelle ? Toutes ses commandes seront supprimées.',
    async () => { await api.delete('/admin/restaurants/marques/' + b.dataset.delMarque); toast('Marque supprimée'); m.close(); restaurantDetailModal(id, agents) }
  ))

  // Documents
  m.el.querySelector('#btnAddDoc').onclick = () => documentUploadModal(id, () => { m.close(); restaurantDetailModal(id, agents) })
  m.el.querySelectorAll('[data-view-doc]').forEach(b => b.onclick = async () => {
    try {
      const { data } = await api.get('/admin/documents/' + b.dataset.viewDoc + '/contenu')
      if (data.url_externe) {
        window.open(data.url_externe, '_blank')
      } else if (data.contenu_base64) {
        const w = window.open('', '_blank')
        const title = escapeHtml(data.nom_fichier || 'Document')
        if (data.mime_type && data.mime_type.startsWith('image/')) {
          w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;box-shadow:0 4px 20px rgba(0,0,0,.5)}</style></head><body><img src="data:${data.mime_type};base64,${data.contenu_base64}" alt="${title}"/></body></html>`)
        } else if (data.mime_type === 'application/pdf') {
          w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body,html{margin:0;height:100%}</style></head><body><iframe src="data:application/pdf;base64,${data.contenu_base64}" style="width:100%;height:100vh;border:0"></iframe></body></html>`)
        } else {
          // Pour les autres MIME, on force le téléchargement
          const a = document.createElement('a')
          a.href = `data:${data.mime_type || 'application/octet-stream'};base64,${data.contenu_base64}`
          a.download = data.nom_fichier
          a.click()
          w.close()
        }
      } else {
        toast('Document vide ou indisponible', 'error')
      }
    } catch (err) { toast('Impossible d\'ouvrir le document', 'error') }
  })
  m.el.querySelectorAll('[data-download-doc]').forEach(b => b.onclick = async () => {
    try {
      const { data } = await api.get('/admin/documents/' + b.dataset.downloadDoc + '/contenu')
      if (data.url_externe) {
        // Lien externe : ouvre dans nouvel onglet (le navigateur gère le téléchargement)
        window.open(data.url_externe, '_blank')
      } else if (data.contenu_base64) {
        const a = document.createElement('a')
        a.href = `data:${data.mime_type || 'application/octet-stream'};base64,${data.contenu_base64}`
        a.download = data.nom_fichier || 'document'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast('Téléchargement lancé')
      } else {
        toast('Document vide ou indisponible', 'error')
      }
    } catch (err) { toast('Impossible de télécharger le document', 'error') }
  })
  m.el.querySelectorAll('[data-validate-doc]').forEach(b => b.onclick = async () => {
    try {
      await api.put('/admin/documents/' + b.dataset.validateDoc + '/valider', { statut: 'valide' })
      toast('Document validé'); m.close(); restaurantDetailModal(id, agents)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })
  m.el.querySelectorAll('[data-reject-doc]').forEach(b => b.onclick = () => {
    const reason = prompt('Raison du rejet (optionnel) :')
    api.put('/admin/documents/' + b.dataset.rejectDoc + '/valider', { statut: 'rejete', notes: reason || null })
      .then(() => { toast('Document rejeté'); m.close(); restaurantDetailModal(id, agents) })
      .catch(e => toast(e.response?.data?.error || 'Erreur', 'error'))
  })
  m.el.querySelectorAll('[data-del-doc]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer ce document ?',
    async () => {
      await api.delete('/admin/documents/' + b.dataset.delDoc)
      toast('Document supprimé'); m.close(); restaurantDetailModal(id, agents)
    }
  ))

  // Menu URL
  const btnMenu = m.el.querySelector('#btnSetMenuUrl')
  if (btnMenu) btnMenu.onclick = async () => {
    const newUrl = prompt('URL du menu (PDF, lien public, etc.) :', r.menu_url || '')
    if (newUrl === null) return
    try {
      await api.put('/admin/comptes/restaurant/' + id + '/menu', { menu_url: newUrl.trim() || null })
      toast('Menu mis à jour'); m.close(); restaurantDetailModal(id, agents)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  // Copy IBAN
  m.el.querySelectorAll('[data-copy-iban]').forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.copyIban).then(() => toast('IBAN copié dans le presse-papiers'))
  })

  // Historique commandes par marque (traçabilité 100%)
  m.el.querySelectorAll('[data-mq-history]').forEach(b => b.onclick = () => marqueHistoryModal(b.dataset.mqHistory))

  // Plateformes par marque
  m.el.querySelectorAll('[data-mq-plats]').forEach(b => b.onclick = () => marquePlateformesModal(b.dataset.mqPlats, () => { m.close(); restaurantDetailModal(id, agents) }))

  // Comptes plateformes
  const btnAddCompte = m.el.querySelector('#btnAddCompte')
  if (btnAddCompte) btnAddCompte.onclick = () => compteModal(id, null, marques, () => { m.close(); restaurantDetailModal(id, agents) })
  m.el.querySelectorAll('[data-edit-cpt]').forEach(b => b.onclick = () => {
    const co = JSON.parse(b.dataset.cpt.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    compteModal(id, co, marques, () => { m.close(); restaurantDetailModal(id, agents) })
  })
  m.el.querySelectorAll('[data-del-cpt]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer ce compte plateforme ?',
    async () => { await api.delete('/admin/comptes/' + b.dataset.delCpt); toast('Compte supprimé'); m.close(); restaurantDetailModal(id, agents) }
  ))
  m.el.querySelectorAll('[data-reveal-cpt]').forEach(b => b.onclick = async () => {
    try {
      const { data } = await api.get('/admin/comptes/' + b.dataset.revealCpt + '/reveal')
      const w = modal('<i class="fas fa-key"></i> Identifiants', `
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Email / login</label>
            <input value="${escapeHtml(data.email || '')}" readonly style="font-family:monospace" />
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Mot de passe</label>
            <input value="${escapeHtml(data.password || '')}" readonly style="font-family:monospace" />
          </div>
          ${data.url ? `<div class="form-group" style="grid-column:1/-1"><label>URL</label><a href="${escapeHtml(data.url)}" target="_blank">${escapeHtml(data.url)}</a></div>` : ''}
          <div style="grid-column:1/-1;color:var(--warning, #ea8a00);font-size:.85rem">
            <i class="fas fa-shield-halved"></i> Cette ouverture est tracée dans l'audit log.
          </div>
        </div>
      `)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })

  // Activation checklist
  m.el.querySelectorAll('[data-cl-set]').forEach(b => b.onclick = async () => {
    try {
      await api.put('/admin/comptes/restaurant/' + id + '/checklist/' + b.dataset.clSet + '/statut', { statut: b.dataset.clStatut })
      toast('Checklist mise à jour'); m.close(); restaurantDetailModal(id, agents)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })
  const btnActiv = m.el.querySelector('#btnActiverCompte')
  if (btnActiv) btnActiv.onclick = () => confirmDialog(
    'Activer officiellement le compte de ce restaurant ? Cette action est tracée.',
    async () => {
      try {
        await api.put('/admin/comptes/restaurant/' + id + '/activer', {})
        toast('Compte activé !'); m.close(); restaurantDetailModal(id, agents)
      } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  )
}

// ============================================================
// Modal — Historique commandes d'une marque (traçabilité 100%)
// ============================================================
async function marqueHistoryModal(marqueId) {
  try {
    const [recapR, cmdR] = await Promise.all([
      api.get('/admin/tracabilite/marque/' + marqueId + '/recap'),
      api.get('/admin/tracabilite/marque/' + marqueId + '/commandes?limit=200')
    ])
    const recap = recapR.data
    const cmds = cmdR.data.commandes || []
    const totalCom = cmds.reduce((s, c) => s + (c.commission_agent_montant || 0) + (c.commission_n1_montant || 0) + (c.commission_n2_montant || 0), 0)
    const totalCA = cmds.reduce((s, c) => s + (c.montant_brut || 0), 0)

    modal(`<i class="fas fa-clock-rotate-left"></i> Historique — ${escapeHtml(recap.marque?.nom || 'Marque')}`, `
      <div class="resto-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.6rem;margin-bottom:1rem">
        <div class="summary-tile"><div class="summary-label">Commandes</div><div class="summary-val">${fmtNum(cmds.length)}</div></div>
        <div class="summary-tile"><div class="summary-label">CA total</div><div class="summary-val">${fmtEUR(totalCA)}</div></div>
        <div class="summary-tile"><div class="summary-label">Commissions cumulées</div><div class="summary-val">${fmtEUR(totalCom)}</div></div>
        <div class="summary-tile"><div class="summary-label">Période</div><div class="summary-val" style="font-size:.9rem">${recap.periode_min ? fmtDate(recap.periode_min) : '—'} → ${recap.periode_max ? fmtDate(recap.periode_max) : '—'}</div></div>
      </div>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:.5rem">
        <i class="fas fa-circle-info"></i> Chaque ligne montre la commission appliquée (palier, agent porteur, parent N+1, grand-parent N+2). Traçabilité 100%.
      </p>
      <div style="max-height:55vh;overflow:auto">
        <table class="data-table">
          <thead><tr>
            <th>Date</th><th>UUID</th><th>Type</th><th class="text-right">Brut</th>
            <th class="text-right">Facturé</th><th>Palier</th>
            <th class="text-right" title="Commission agent porteur">C. Agent</th>
            <th class="text-right" title="N+1 parent">C. N+1</th>
            <th class="text-right" title="N+2 grand-parent">C. N+2</th>
            <th>Statut</th>
          </tr></thead>
          <tbody>${cmds.length ? cmds.map(c => `
            <tr>
              <td style="font-size:.78rem;white-space:nowrap">${fmtDateTime(c.date_commande)}</td>
              <td style="font-family:monospace;font-size:.7rem">${escapeHtml((c.uuid || c.order_id || '').toString().substring(0, 12))}…</td>
              <td><span class="badge badge-slate" style="font-size:.65rem">${escapeHtml(c.type_honoree || c.type || '—')}</span></td>
              <td class="text-right">${fmtEUR(c.montant_brut)}</td>
              <td class="text-right">${fmtEUR(c.montant_facture_resto)}</td>
              <td style="font-size:.75rem">${escapeHtml(c.palier_libelle || (c.palier_applique_id ? '#'+c.palier_applique_id : '—'))}</td>
              <td class="text-right" style="color:var(--primary, #2563eb)">
                ${fmtEUR(c.commission_agent_montant)}
                ${c.commission_taux_propre ? `<div class="text-muted" style="font-size:.65rem">${(c.commission_taux_propre*100).toFixed(1)}%</div>` : ''}
              </td>
              <td class="text-right">${c.commission_n1_montant ? fmtEUR(c.commission_n1_montant) : '—'}</td>
              <td class="text-right">${c.commission_n2_montant ? fmtEUR(c.commission_n2_montant) : '—'}</td>
              <td>${c.statut === 'completee' ? '<span class="badge badge-primary">OK</span>' : c.statut === 'annulee' ? '<span class="badge badge-danger">Annulée</span>' : c.statut === 'remboursee' ? '<span class="badge badge-warning">Remboursée</span>' : escapeHtml(c.statut || '—')}</td>
            </tr>`).join('') : '<tr><td colspan="10" class="text-center text-muted">Aucune commande pour cette marque</td></tr>'}</tbody>
        </table>
      </div>
    `, { wide: true })
  } catch (e) {
    toast(e.response?.data?.error || 'Impossible de charger l\'historique', 'error')
  }
}

// ============================================================
// Modal — Gérer les plateformes d'une marque (Uber/Deliveroo/JustEat/Site)
// ============================================================
async function marquePlateformesModal(marqueId, onClose) {
  const PLATEFORMES = [
    { code: 'uber_eats', label: 'Uber Eats' },
    { code: 'deliveroo', label: 'Deliveroo' },
    { code: 'justeat', label: 'Just Eat' },
    { code: 'site_web', label: 'Site web' },
    { code: 'autre', label: 'Autre' }
  ]
  const { data } = await api.get('/admin/comptes/marque/' + marqueId + '/plateformes')
  const plats = data.plateformes || []

  const m = modal('<i class="fas fa-plus-circle"></i> Plateformes de la marque', `
    <p class="text-muted" style="font-size:.85rem;margin-bottom:.5rem">
      Ajoutez ou modifiez les URLs publiques de cette marque virtuelle sur chaque plateforme. Un raccourcisseur d'URL est intégré pour partager facilement les liens (QR, flyers, etc.).
    </p>
    <table class="data-table">
      <thead><tr><th>Plateforme</th><th>URL publique</th><th>Store ID</th><th>Lancée le</th><th>URL courte</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${plats.length ? plats.map(p => `
        <tr>
          <td><span class="badge badge-slate">${escapeHtml(p.plateforme)}</span></td>
          <td style="font-size:.8rem">${p.url_publique ? `<a href="${escapeHtml(p.url_publique)}" target="_blank">${escapeHtml(p.url_publique.substring(0, 40))}…</a>` : '—'}</td>
          <td><code>${escapeHtml(p.store_id_externe || '—')}</code></td>
          <td>${fmtDate(p.date_lancement)}</td>
          <td>${p.url_code ? `<code>${escapeHtml(p.url_code)}</code> <button class="btn btn-sm btn-link" data-copy-short="${p.url_code}" title="Copier"><i class="fas fa-copy"></i></button>` : '<button class="btn btn-sm btn-secondary" data-make-short="' + escapeHtml(p.plateforme) + '" data-url="' + escapeHtml(p.url_publique || '') + '"><i class="fas fa-link"></i> Créer</button>'}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-edit-plat="${escapeHtml(p.plateforme)}" data-plat='${escapeHtml(JSON.stringify(p))}'><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" data-del-plat="${escapeHtml(p.plateforme)}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted">Aucune plateforme — ajoutez Uber Eats, Deliveroo, etc.</td></tr>'}</tbody>
    </table>
    <hr style="margin:1rem 0">
    <h4 style="margin-bottom:.5rem"><i class="fas fa-plus"></i> Ajouter / mettre à jour</h4>
    <form id="platForm">
      <div class="form-grid">
        <div class="form-group">
          <label>Plateforme <span class="req">*</span></label>
          <select id="pPlateforme" required>
            ${PLATEFORMES.map(pl => `<option value="${pl.code}">${escapeHtml(pl.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Store ID externe</label>
          <input id="pStore" placeholder="ex: 7e3b…" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>URL publique</label>
          <input id="pUrl" type="url" placeholder="https://www.ubereats.com/store/…" />
        </div>
        <div class="form-group">
          <label>Date de lancement</label>
          <input id="pDate" type="date" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Notes</label>
          <textarea id="pNotes" rows="2"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>
  `, { wide: true })

  m.el.querySelector('#platForm').onsubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/comptes/marque/' + marqueId + '/plateforme', {
        plateforme: m.el.querySelector('#pPlateforme').value,
        url_publique: m.el.querySelector('#pUrl').value || null,
        store_id_externe: m.el.querySelector('#pStore').value || null,
        date_lancement: m.el.querySelector('#pDate').value || null,
        notes: m.el.querySelector('#pNotes').value || null
      })
      toast('Plateforme enregistrée'); m.close(); onClose && onClose()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }

  m.el.querySelectorAll('[data-edit-plat]').forEach(b => b.onclick = () => {
    const p = JSON.parse(b.dataset.plat.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    m.el.querySelector('#pPlateforme').value = p.plateforme
    m.el.querySelector('#pStore').value = p.store_id_externe || ''
    m.el.querySelector('#pUrl').value = p.url_publique || ''
    m.el.querySelector('#pDate').value = p.date_lancement ? p.date_lancement.substring(0,10) : ''
    m.el.querySelector('#pNotes').value = p.notes || ''
  })
  m.el.querySelectorAll('[data-del-plat]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer cette plateforme ?',
    async () => { await api.delete('/admin/comptes/marque/' + marqueId + '/plateforme/' + b.dataset.delPlat); toast('Supprimée'); m.close(); onClose && onClose() }
  ))
  m.el.querySelectorAll('[data-make-short]').forEach(b => b.onclick = async () => {
    const url = b.dataset.url
    if (!url) return toast('Renseignez d\'abord l\'URL publique', 'error')
    try {
      await api.post('/shortener', { url: url, marque_id: parseInt(marqueId), libelle: 'Marque #' + marqueId + ' / ' + b.dataset.makeShort })
      toast('URL courte créée'); m.close(); marquePlateformesModal(marqueId, onClose)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })
  m.el.querySelectorAll('[data-copy-short]').forEach(b => b.onclick = () => {
    const code = b.dataset.copyShort
    const fullUrl = window.location.origin + '/s/' + code
    navigator.clipboard.writeText(fullUrl).then(() => toast('Lien copié : ' + fullUrl))
  })
}

// ============================================================
// Modal — Compte plateforme (création / édition)
// ============================================================
function compteModal(restaurantId, co, marques, onClose) {
  const isEdit = !!co
  const PLATEFORMES = [
    { code: 'uber_eats', label: 'Uber Eats' },
    { code: 'uber_manager', label: 'Uber Eats Manager' },
    { code: 'uber_order', label: 'Uber Eats Order (tablette)' },
    { code: 'deliveroo', label: 'Deliveroo' },
    { code: 'justeat', label: 'Just Eat' },
    { code: 'site_web', label: 'Site web' },
    { code: 'commercial', label: 'Accès commercial DropEat' },
    { code: 'autre', label: 'Autre' }
  ]
  const m = modal((isEdit ? '<i class="fas fa-pen"></i> Modifier' : '<i class="fas fa-plus"></i> Nouveau') + ' compte plateforme', `
    <form id="cptForm">
      <div class="form-grid">
        <div class="form-group">
          <label>Plateforme <span class="req">*</span></label>
          <select id="cPlateforme" required>
            ${PLATEFORMES.map(p => `<option value="${p.code}" ${co?.plateforme === p.code ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Type d'accès</label>
          <select id="cTypeAcces">
            <option value="manager" ${co?.type_acces === 'manager' ? 'selected' : ''}>Manager (admin)</option>
            <option value="order" ${co?.type_acces === 'order' ? 'selected' : ''}>Order (tablette)</option>
            <option value="commercial" ${co?.type_acces === 'commercial' ? 'selected' : ''}>Commercial</option>
            <option value="lecture" ${co?.type_acces === 'lecture' ? 'selected' : ''}>Lecture seule</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Libellé</label>
          <input id="cLibelle" value="${escapeHtml(co?.libelle || '')}" placeholder="ex: Compte principal" />
        </div>
        <div class="form-group">
          <label>Email / login</label>
          <input id="cEmail" value="${escapeHtml(co?.email_connexion || '')}" />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input id="cPassword" type="password" placeholder="${isEdit ? '(inchangé si vide)' : ''}" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>URL d'accès</label>
          <input id="cUrl" type="url" value="${escapeHtml(co?.url_acces || '')}" placeholder="https://manager.uber.com/" />
        </div>
        <div class="form-group">
          <label>Store ID externe</label>
          <input id="cStore" value="${escapeHtml(co?.store_id_externe || '')}" />
        </div>
        <div class="form-group">
          <label>Marque associée</label>
          <select id="cMarque">
            <option value="">— Toutes / général —</option>
            ${(marques || []).map(mq => `<option value="${mq.id}" ${co?.marque_id === mq.id ? 'selected' : ''}>${escapeHtml(mq.nom)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Propriétaire de l'accès</label>
          <select id="cProprio">
            <option value="restaurant" ${co?.proprietaire_acces === 'restaurant' ? 'selected' : ''}>Restaurateur</option>
            <option value="dropeat" ${co?.proprietaire_acces === 'dropeat' ? 'selected' : ''}>DropEat</option>
            <option value="agent" ${co?.proprietaire_acces === 'agent' ? 'selected' : ''}>Agent</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Notes</label>
          <textarea id="cNotes" rows="2">${escapeHtml(co?.notes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Modifier' : 'Créer'}</button>
      </div>
    </form>
  `, { wide: true })

  m.el.querySelector('#cptForm').onsubmit = async (e) => {
    e.preventDefault()
    const payload = {
      restaurant_id: restaurantId,
      plateforme: m.el.querySelector('#cPlateforme').value,
      type_acces: m.el.querySelector('#cTypeAcces').value,
      libelle: m.el.querySelector('#cLibelle').value || null,
      email_connexion: m.el.querySelector('#cEmail').value || null,
      url_acces: m.el.querySelector('#cUrl').value || null,
      store_id_externe: m.el.querySelector('#cStore').value || null,
      marque_id: m.el.querySelector('#cMarque').value ? parseInt(m.el.querySelector('#cMarque').value) : null,
      proprietaire_acces: m.el.querySelector('#cProprio').value,
      notes: m.el.querySelector('#cNotes').value || null
    }
    const pwd = m.el.querySelector('#cPassword').value
    if (pwd) payload.password = pwd
    try {
      if (isEdit) {
        await api.put('/admin/comptes/' + co.id, payload)
        toast('Compte modifié')
      } else {
        await api.post('/admin/comptes', payload)
        toast('Compte créé')
      }
      m.close(); onClose && onClose()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// Modal d'upload de document
async function documentUploadModal(restaurantId, onSuccess) {
  const { data: types } = await api.get('/admin/documents/types')
  const allTypes = [...types.obligatoires, ...types.optionnels]

  const m = modal('Ajouter un document', `
    <form id="docForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>Type de document <span class="req">*</span></label>
          <select id="dtype" required>
            <option value="">— Choisir —</option>
            <optgroup label="Obligatoires">
              ${types.obligatoires.map(t => `<option value="${t.code}">${escapeHtml(t.label)}</option>`).join('')}
            </optgroup>
            <optgroup label="Optionnels">
              ${types.optionnels.map(t => `<option value="${t.code}">${escapeHtml(t.label)}</option>`).join('')}
            </optgroup>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Fichier (max 1 Mo) <span class="req">*</span></label>
          <input id="dfile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" />
          <small class="text-muted">PDF, JPG ou PNG. Sera encodé en base64 et stocké en BDD.</small>
        </div>
        <div class="form-group">
          <label>Date d'émission</label>
          <input id="ddate_em" type="date" />
        </div>
        <div class="form-group">
          <label>Date d'expiration</label>
          <input id="ddate_ex" type="date" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Notes</label>
          <textarea id="dnotes" rows="2"></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-upload"></i> Uploader</button>
      </div>
    </form>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#docForm').onsubmit = async e => {
    e.preventDefault()
    const file = document.getElementById('dfile').files[0]
    if (!file) return toast('Sélectionnez un fichier', 'error')
    if (file.size > 750_000) return toast('Fichier trop volumineux (max 750 Ko)', 'error')

    // Convertir en base64
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    try {
      await api.post('/admin/documents/restaurant/' + restaurantId, {
        type_document: document.getElementById('dtype').value,
        nom_fichier: file.name,
        taille_octets: file.size,
        mime_type: file.type,
        contenu_base64: b64,
        date_emission: document.getElementById('ddate_em').value || null,
        date_expiration: document.getElementById('ddate_ex').value || null,
        notes: document.getElementById('dnotes').value.trim() || null
      })
      toast('Document uploadé')
      m.close()
      onSuccess && onSuccess()
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur upload', 'error')
    }
  }
}

// Création rapide d'une marque depuis l'arborescence (avec affichage du retour de tranche)
async function marqueQuickModal(restaurantId, onSuccess) {
  // Récupère le resto pour afficher contexte
  let resto = null
  try { const r = await api.get('/admin/restaurants/' + restaurantId); resto = r.data.restaurant } catch {}

  const m = modal('Nouvelle marque virtuelle' + (resto ? ` — ${resto.nom}` : ''), `
    <div class="info-banner" style="background:#eef6ff;border-left:3px solid var(--primary);padding:.6rem .9rem;border-radius:6px;margin-bottom:.8rem;font-size:.85rem">
      <i class="fas fa-circle-info"></i>
      Cette marque sera comptabilisée dans la tranche ouverte de l'agent.
      Si elle est la <strong>5ᵉ</strong> de sa tranche, elle déclenchera une attribution 100% portefeuille.
    </div>
    <form id="mqQuickForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom de la marque <span class="req">*</span></label><input id="nom" required autofocus/></div>
        <div class="form-group"><label>Plateforme</label>
          <select id="plateforme">
            <option value="uber_eats" selected>Uber Eats</option>
            <option value="deliveroo">Deliveroo</option>
            <option value="just_eat">Just Eat</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group"><label>Uber Store ID</label><input id="uber_store_id" placeholder="ex: 1a2b3c4d-..."/></div>
        <div class="form-group"><label>Date de lancement</label><input id="date_lancement" type="date"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Créer la marque</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#mqQuickForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = {
      nom: get('nom').trim(),
      plateforme: get('plateforme'),
      uber_store_id: get('uber_store_id').trim() || null,
      date_lancement: get('date_lancement') || null,
      notes: get('notes').trim() || null
    }
    try {
      const r = await api.post(`/admin/restaurants/${restaurantId}/marques`, payload)
      const t = r.data.tranche
      if (t?.attribution_100) {
        toast(`🏆 Marque créée — 5ᵉ de la tranche n°${t.numero_tranche} : ATTRIBUTION 100% PORTEFEUILLE !`, 'success')
      } else if (t) {
        toast(`Marque créée — position ${t.position}/5 dans la tranche n°${t.numero_tranche}`, 'success')
      } else {
        toast('Marque créée')
      }
      m.close()
      if (onSuccess) onSuccess()
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }
}

function marqueModal(restaurantId, mq, parentModal) {
  const isEdit = !!mq
  const m = modal(isEdit ? 'Modifier la marque' : 'Nouvelle marque virtuelle', `
    <form id="mqForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom <span class="req">*</span></label><input id="nom" required value="${escapeHtml(mq?.nom || '')}"/></div>
        <div class="form-group"><label>Plateforme</label>
          <select id="plateforme">
            <option value="uber_eats" ${mq?.plateforme === 'uber_eats' || !mq ? 'selected' : ''}>Uber Eats</option>
            <option value="deliveroo" ${mq?.plateforme === 'deliveroo' ? 'selected' : ''}>Deliveroo</option>
            <option value="just_eat" ${mq?.plateforme === 'just_eat' ? 'selected' : ''}>Just Eat</option>
            <option value="autre" ${mq?.plateforme === 'autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group"><label>Uber Store ID</label><input id="uber_store_id" value="${escapeHtml(mq?.uber_store_id || '')}"/></div>
        <div class="form-group"><label>Date de lancement</label><input id="date_lancement" type="date" value="${mq?.date_lancement || ''}"/></div>
        ${isEdit ? `<div class="form-group"><label>Statut</label><select id="actif"><option value="1" ${mq?.actif ? 'selected' : ''}>Actif</option><option value="0" ${!mq?.actif ? 'selected' : ''}>Inactif</option></select></div>` : ''}
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(mq?.notes || '')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#mqForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = {
      nom: get('nom').trim(),
      plateforme: get('plateforme'),
      uber_store_id: get('uber_store_id').trim() || null,
      date_lancement: get('date_lancement') || null,
      notes: get('notes').trim() || null
    }
    if (isEdit) payload.actif = parseInt(get('actif'))
    try {
      if (isEdit) await api.put('/admin/restaurants/marques/' + mq.id, payload)
      else await api.post(`/admin/restaurants/${restaurantId}/marques`, payload)
      toast('Enregistré'); m.close()
      if (parentModal) { parentModal.close(); restaurantDetailModal(restaurantId, []) }
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Liste des agents avec drill-down ---
PAGES['agents'] = async (c) => {
  const { data } = await api.get('/admin/agents')
  const agents = data.agents
  const totalCA = agents.reduce((s, a) => s + (a.ca_total || 0), 0)
  const totalRestos = agents.reduce((s, a) => s + (a.nb_restaurants || 0), 0)
  const totalMarques = agents.reduce((s, a) => s + (a.nb_marques || 0), 0)

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-user-tie"></i> Agents commerciaux</h1>
        <div class="subtitle">${agents.length} agents — cliquez pour voir leurs restaurants, marques et CA</div>
      </div>
      <button class="btn btn-secondary" id="btnRebuildTranches" title="Reconstruit toutes les tranches à partir des données existantes">
        <i class="fas fa-rotate"></i> Reconstruire tranches
      </button>
    </div>
    <div class="stats-grid" style="margin-bottom:1.25rem">
      <div class="stat-card"><div class="stat-label">Agents</div><div class="stat-value">${agents.length}</div></div>
      <div class="stat-card"><div class="stat-label">Restaurants</div><div class="stat-value">${totalRestos}</div></div>
      <div class="stat-card"><div class="stat-label">Marques</div><div class="stat-value">${totalMarques}</div></div>
      <div class="stat-card"><div class="stat-label">CA cumulé</div><div class="stat-value">${fmtEUR(totalCA)}</div></div>
    </div>
    <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
      <input id="agentDrillSearch" placeholder="🔍 Filtrer par nom, email…" style="flex:1;min-width:220px;padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem"/>
      <select id="agentDrillNiveau" style="padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem">
        <option value="">Tous niveaux</option>
        <option value="0">N0</option><option value="1">N1</option><option value="2">N2</option>
        <option value="3">N3</option><option value="4">N4</option><option value="5">N5</option>
      </select>
      <select id="agentDrillStatut" style="padding:.45rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.88rem">
        <option value="">Tous statuts</option><option value="1">Actifs</option><option value="0">Inactifs</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Agent</th><th>Niveau</th><th>Parent</th>
          <th class="text-right">Restos</th>
          <th class="text-right">Marques</th>
          <th class="text-right">Sous-agents</th>
          <th class="text-right">Commandes</th>
          <th class="text-right">CA total</th>
          <th>Statut</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${agents.map(a => `
          <tr style="cursor:pointer" data-row="${a.id}" data-nom="${escapeHtml((a.prenom+' '+a.nom).toLowerCase())}" data-email="${escapeHtml((a.email||'').toLowerCase())}" data-niveau="${a.niveau}" data-actif="${a.actif ? '1' : '0'}">
            <td>
              <strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong>
              <div class="text-muted" style="font-size:.8rem">${escapeHtml(a.email)}</div>
            </td>
            <td>${niveauLabel(a.niveau)}</td>
            <td>${a.parent_nom ? escapeHtml(a.parent_prenom + ' ' + a.parent_nom) : '<span class="text-muted">—</span>'}</td>
            <td class="text-right">${a.nb_restaurants}${a.nb_restos_portefeuille ? ` <small class="text-muted">(${a.nb_restos_portefeuille}P)</small>` : ''}</td>
            <td class="text-right">${a.nb_marques}${a.nb_marques_portefeuille ? ` <small class="text-muted">(${a.nb_marques_portefeuille}P)</small>` : ''}</td>
            <td class="text-right">${a.nb_sous_agents}</td>
            <td class="text-right">${fmtNum(a.nb_commandes)}</td>
            <td class="text-right"><strong>${fmtEUR(a.ca_total)}</strong></td>
            <td>${a.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-primary" data-detail="${a.id}"><i class="fas fa-eye"></i> Détail</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
  `
  c.querySelectorAll('[data-detail], [data-row]').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation()
      const id = parseInt(b.dataset.detail || b.dataset.row)
      navigate('agent-detail-' + id)
    }
  })
  document.getElementById('btnRebuildTranches').onclick = () => confirmDialog(
    'Reconstruire toutes les tranches à partir des restaurants et marques existants ?\n\nLes tranches actuelles seront supprimées et reconstituées dans l\'ordre chronologique.',
    async () => {
      const r = await api.post('/admin/restaurants/tranches/rebuild')
      const x = r.data.rebuilt
      toast(`Reconstruites : ${x.nb_restaurants_qualifies} restos (${x.nb_attributions_restaurants} attributions), ${x.nb_marques_qualifiees} marques (${x.nb_attributions_marques} attributions)`)
      navigate('agents')
    }
  )

  // Filtres drill-down
  const filterDrill = () => {
    const s = document.getElementById('agentDrillSearch').value.toLowerCase().trim()
    const n = document.getElementById('agentDrillNiveau').value
    const st = document.getElementById('agentDrillStatut').value
    c.querySelectorAll('[data-row]').forEach(tr => {
      const ok = (!s || tr.dataset.nom?.includes(s) || tr.dataset.email?.includes(s)) &&
                 (!n || tr.dataset.niveau === n) &&
                 (!st || tr.dataset.actif === st)
      tr.style.display = ok ? '' : 'none'
    })
  }
  document.getElementById('agentDrillSearch').oninput = filterDrill
  document.getElementById('agentDrillNiveau').onchange = filterDrill
  document.getElementById('agentDrillStatut').onchange = filterDrill
}

// --- Détail d'un agent (drill-down) ---
// Routage spécial : page id "agent-detail-<id>"
const _origNavigate = typeof navigate === 'function' ? navigate : null
PAGES['__agent_detail'] = async (c, agentId) => {
  const { data } = await api.get('/admin/agents/' + agentId)
  const a = data.agent
  const t = data.totaux
  const tc = data.tranches.client
  const tm = data.tranches.marque

  const renderTrancheBlock = (tranche, label, type) => {
    const open = tranche.tranche_ouverte
    const closes = tranche.tranches_cloturees || []
    const dotColor = (i, max) => i < (open?.compteur || 0) ? 'var(--primary)' : '#e2e8f0'
    return `
      <div class="card" style="margin-bottom:.75rem">
        <div class="card-title"><i class="fas fa-${type === 'client' ? 'store' : 'tags'}"></i> Tranches — ${label}</div>
        <div class="tranche-block">
          ${open ? `
            <div class="tranche-current">
              <div><strong>Tranche n°${open.numero_tranche} (ouverte)</strong> — ${open.compteur}/5 éléments · ${open.restant} restant${open.restant > 1 ? 's' : ''}</div>
              <div class="tranche-dots">
                ${[1,2,3,4,5].map(i => `<span class="tranche-dot${i <= open.compteur ? ' filled' : ''}${i === 5 ? ' final' : ''}" title="Position ${i}"></span>`).join('')}
              </div>
              ${open.elements?.length ? `<ul class="tranche-list">${open.elements.map(e => `
                <li><strong>#${e.position_dans_tranche}</strong> ${escapeHtml(e.element_nom || '?')}</li>
              `).join('')}</ul>` : ''}
            </div>
          ` : `<div class="text-muted">Aucune tranche ouverte (aucun ${type === 'client' ? 'restaurant' : 'marque'} en attente).</div>`}
          ${closes.length ? `
            <div class="tranche-history">
              <strong>Tranches clôturées (${closes.length}) :</strong>
              <ul>${closes.map(c => `
                <li>
                  Tranche #${c.numero_tranche} → <strong class="text-success">${escapeHtml(c.element_attribue_nom || '?')}</strong> attribué 100%
                  ${c.validation_ecrite ? '<span class="badge badge-primary" style="font-size:.65rem">VALIDÉE</span>' : '<span class="badge badge-warning" style="font-size:.65rem">À VALIDER</span>'}
                  <span class="text-muted">— ${c.date_cloture ? new Date(c.date_cloture).toLocaleDateString('fr-FR') : ''}</span>
                </li>
              `).join('')}</ul>
            </div>
          ` : ''}
        </div>
      </div>
    `
  }

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-user-tie"></i> ${escapeHtml(a.prenom + ' ' + a.nom)}</h1>
        <div class="subtitle">
          ${escapeHtml(a.email)} · ${niveauLabel(a.niveau)}
          ${a.parent_nom ? ` · sous ${escapeHtml(a.parent_prenom + ' ' + a.parent_nom)}` : ''}
        </div>
      </div>
      <div>
        <button class="btn btn-secondary" id="btnBack"><i class="fas fa-arrow-left"></i> Retour</button>
        <button class="btn btn-secondary" id="btnEdit"><i class="fas fa-pen"></i> Modifier</button>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">Restaurants</div><div class="stat-value">${t.nb_restaurants}</div></div>
      <div class="stat-card"><div class="stat-label">Marques</div><div class="stat-value">${t.nb_marques}</div></div>
      <div class="stat-card"><div class="stat-label">Commandes</div><div class="stat-value">${fmtNum(t.nb_commandes)}</div></div>
      <div class="stat-card"><div class="stat-label">CA total</div><div class="stat-value">${fmtEUR(t.ca_total)}</div></div>
      <div class="stat-card"><div class="stat-label">Sous-agents</div><div class="stat-value">${t.nb_sous_agents}</div></div>
    </div>

    ${renderTrancheBlock(tc, 'Restaurants (clients)', 'client')}
    ${renderTrancheBlock(tm, 'Marques virtuelles', 'marque')}

    <div class="card">
      <div class="card-title"><i class="fas fa-store"></i> Restaurants & marques (drill-down)</div>
      ${data.restaurants.length ? data.restaurants.map(r => `
        <details class="tree-resto" data-resto="${r.id}">
          <summary class="tree-resto-summary">
            <i class="fas fa-chevron-right tree-chevron"></i>
            <i class="fas fa-store" style="color:var(--primary)"></i>
            <strong class="tree-resto-name">${escapeHtml(r.nom)}</strong>
            ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}
            ${r.tablette_sr_shop ? '<span class="badge badge-info"><i class="fas fa-tablet-screen-button"></i> SR</span>' : ''}
            <span class="text-muted">· ${escapeHtml(r.ville || '—')} · #${r.rang_apport || '?'}</span>
            <span class="tree-resto-meta">
              <span><i class="fas fa-tags"></i> ${r.marques.length}</span>
              <span><i class="fas fa-receipt"></i> ${fmtNum(r.nb_commandes)}</span>
              <span><i class="fas fa-euro-sign"></i> ${fmtEUR(r.ca_total)}</span>
            </span>
            <span class="tree-actions">
              <button class="btn btn-sm btn-primary" data-add-marque="${r.id}"><i class="fas fa-plus"></i> Marque</button>
            </span>
          </summary>
          <div class="tree-resto-body">
            ${r.marques.length ? `
              <table class="data-table tree-marques-table">
                <thead><tr>
                  <th>#</th><th>Marque</th><th>Plateforme</th><th>Uber ID</th>
                  <th class="text-right">Cmds</th><th class="text-right">CA brut</th><th class="text-right">CA net</th>
                  <th>Période activité</th><th>Statut</th><th></th>
                </tr></thead>
                <tbody>${r.marques.map(m => `
                  <tr>
                    <td>${m.rang_creation || '-'}</td>
                    <td><strong>${escapeHtml(m.nom)}</strong>${m.is_portefeuille_proprietaire ? ' <span class="badge badge-gold">P</span>' : ''}</td>
                    <td>${escapeHtml(m.plateforme || '-')}</td>
                    <td><code style="font-size:.75rem">${escapeHtml(m.uber_store_id || '—')}</code></td>
                    <td class="text-right">${fmtNum(m.nb_commandes)}</td>
                    <td class="text-right"><strong>${fmtEUR(m.ca_total)}</strong></td>
                    <td class="text-right">${fmtEUR(m.ca_net)}</td>
                    <td style="font-size:.8rem">
                      ${m.premiere_commande ? new Date(m.premiere_commande).toLocaleDateString('fr-FR') : '—'}
                      → ${m.derniere_commande ? new Date(m.derniere_commande).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td>${m.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" data-cmds="${m.id}" title="Voir commandes"><i class="fas fa-list"></i></button>
                    </td>
                  </tr>
                `).join('')}</tbody>
              </table>
            ` : '<p class="text-muted" style="padding:.5rem 0">Aucune marque virtuelle. <button class="btn btn-sm btn-primary" data-add-marque="' + r.id + '"><i class="fas fa-plus"></i> Créer une marque</button></p>'}
          </div>
        </details>
      `).join('') : '<p class="text-muted">Aucun restaurant assigné à cet agent.</p>'}
    </div>

    ${data.sous_agents.length ? `
      <div class="card">
        <div class="card-title"><i class="fas fa-people-group"></i> Sous-agents (${data.sous_agents.length})</div>
        <table class="data-table">
          <thead><tr><th>Nom</th><th>Email</th><th>Niveau</th><th class="text-right">Restos</th><th class="text-right">CA</th><th></th></tr></thead>
          <tbody>${data.sous_agents.map(s => `
            <tr>
              <td><strong>${escapeHtml(s.prenom + ' ' + s.nom)}</strong></td>
              <td>${escapeHtml(s.email)}</td>
              <td>${niveauLabel(s.niveau)}</td>
              <td class="text-right">${s.nb_restaurants}</td>
              <td class="text-right">${fmtEUR(s.ca_total)}</td>
              <td><button class="btn btn-sm btn-primary" data-sa="${s.id}"><i class="fas fa-eye"></i></button></td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    ` : ''}
  `

  document.getElementById('btnBack').onclick = () => navigate('agents')
  document.getElementById('btnEdit').onclick = () => navigate('gestion-utilisateurs')
  c.querySelectorAll('[data-add-marque]').forEach(b => {
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation()
      marqueQuickModal(parseInt(b.dataset.addMarque), () => navigate('agent-detail-' + agentId))
    }
  })
  c.querySelectorAll('[data-cmds]').forEach(b => {
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation()
      const mqId = b.dataset.cmds
      const r = await api.get(`/admin/agents/${agentId}/marques/${mqId}/commandes`)
      const cmds = r.data.commandes
      const m = modal('Commandes (' + cmds.length + ')', `
        <div class="table-wrap" style="max-height:60vh">
          <table class="data-table"><thead><tr>
            <th>Date</th><th>Order ID</th><th class="text-right">Brut</th><th class="text-right">Frais Uber</th><th class="text-right">Net</th><th>Statut</th>
          </tr></thead>
          <tbody>${cmds.map(c => `
            <tr>
              <td>${new Date(c.date_commande).toLocaleDateString('fr-FR')}</td>
              <td><code style="font-size:.75rem">${escapeHtml(c.uber_order_id || '—')}</code></td>
              <td class="text-right">${fmtEUR(c.montant_brut)}</td>
              <td class="text-right text-muted">${fmtEUR(c.frais_uber || 0)}</td>
              <td class="text-right"><strong>${fmtEUR(c.montant_net)}</strong></td>
              <td>${escapeHtml(c.statut || '—')}</td>
            </tr>
          `).join('')}</tbody></table>
        </div>`, { wide: true })
    }
  })
  c.querySelectorAll('[data-sa]').forEach(b => {
    b.onclick = () => navigate('agent-detail-' + b.dataset.sa)
  })
}

// --- Arborescence Restaurants → Marques → Agent ---
PAGES['arborescence'] = async (c) => {
  const [t, u] = await Promise.all([
    api.get('/admin/restaurants/tree'),
    api.get('/admin/users')
  ])
  const tree = t.data.tree
  const agents = u.data.users.filter(x => x.role === 'agent')
  const agentOptions = ['<option value="">Tous les agents</option>']
    .concat(agents.map(a => `<option value="${a.id}">${escapeHtml(a.prenom + ' ' + a.nom)} (${niveauLabel(a.niveau)})</option>`))
    .join('')

  // Stats globales
  const totalMarques = tree.reduce((s, r) => s + (r.marques?.length || 0), 0)
  const totalCmds = tree.reduce((s, r) => s + (r.nb_commandes || 0), 0)
  const totalCA = tree.reduce((s, r) => s + (r.ca_total || 0), 0)

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-folder-tree"></i> Arborescence Restaurants</h1>
        <div class="subtitle">Vue hiérarchique : Restaurant → Marques virtuelles → Agent commercial</div>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1.25rem">
      <div class="stat-card"><div class="stat-label">Restaurants</div><div class="stat-value">${tree.length}</div></div>
      <div class="stat-card"><div class="stat-label">Marques</div><div class="stat-value">${totalMarques}</div></div>
      <div class="stat-card"><div class="stat-label">Commandes</div><div class="stat-value">${fmtNum(totalCmds)}</div></div>
      <div class="stat-card"><div class="stat-label">CA total</div><div class="stat-value">${fmtEUR(totalCA)}</div></div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="form-grid" style="grid-template-columns: 2fr 2fr auto auto">
        <div class="form-group"><label>Recherche (nom / ville / SIRET)</label><input id="treeSearch" placeholder="Tapez pour filtrer…"/></div>
        <div class="form-group"><label>Agent</label><select id="treeAgent">${agentOptions}</select></div>
        <div class="form-group" style="align-self:end"><button class="btn btn-secondary" id="btnExpandAll"><i class="fas fa-angles-down"></i> Tout déplier</button></div>
        <div class="form-group" style="align-self:end"><button class="btn btn-secondary" id="btnCollapseAll"><i class="fas fa-angles-up"></i> Tout replier</button></div>
      </div>
    </div>

    <div id="treeContainer"></div>
  `

  const renderNiveauBadge = (niv) => {
    if (niv === 0) return '<span class="badge badge-primary">Agent N0</span>'
    if (niv === 1) return '<span class="badge badge-info">Sous-agent N1</span>'
    if (niv === 2) return '<span class="badge badge-warning">Sous-agent N2</span>'
    return ''
  }

  const renderTree = (data) => {
    const container = document.getElementById('treeContainer')
    if (!data.length) {
      container.innerHTML = '<div class="card"><p class="text-muted" style="text-align:center;padding:2rem">Aucun restaurant trouvé</p></div>'
      return
    }
    container.innerHTML = data.map(r => {
      const agentBlock = r.agent
        ? `<div class="tree-agent">
             <i class="fas fa-user-tie"></i>
             <strong>${escapeHtml(r.agent.prenom + ' ' + r.agent.nom)}</strong>
             ${renderNiveauBadge(r.agent.niveau)}
             <span class="text-muted">${escapeHtml(r.agent.email)}</span>
             ${r.agent.parent ? `<span class="text-muted"> · sous ${escapeHtml(r.agent.parent.prenom + ' ' + r.agent.parent.nom)} (${niveauLabel(r.agent.parent.niveau)})</span>` : ''}
           </div>`
        : `<div class="tree-agent text-muted"><i class="fas fa-user-slash"></i> Aucun agent assigné</div>`

      const marquesBlock = r.marques.length
        ? `<table class="data-table tree-marques-table">
             <thead><tr>
               <th>#</th><th>Marque virtuelle</th><th>Plateforme</th><th>Uber Store ID</th>
               <th class="text-right">Commandes</th><th class="text-right">CA</th>
               <th>Dernière commande</th><th>Statut</th>
             </tr></thead>
             <tbody>${r.marques.map(m => `
               <tr>
                 <td>${m.rang_creation || '-'}</td>
                 <td><strong>${escapeHtml(m.nom)}</strong>
                   ${m.is_portefeuille_proprietaire ? ' <span class="badge badge-gold" title="Portefeuille Propriétaire">P</span>' : ''}
                 </td>
                 <td>${escapeHtml(m.plateforme || '-')}</td>
                 <td><code>${escapeHtml(m.uber_store_id || '—')}</code></td>
                 <td class="text-right">${fmtNum(m.nb_commandes)}</td>
                 <td class="text-right"><strong>${fmtEUR(m.ca_total)}</strong></td>
                 <td>${m.derniere_commande ? new Date(m.derniere_commande).toLocaleDateString('fr-FR') : '<span class="text-muted">—</span>'}</td>
                 <td>${m.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
               </tr>`).join('')}</tbody>
           </table>`
        : `<p class="text-muted" style="padding:.75rem 0"><i class="fas fa-info-circle"></i> Aucune marque virtuelle créée pour ce restaurant.</p>`

      return `
        <details class="tree-resto" data-resto="${r.id}" open>
          <summary class="tree-resto-summary">
            <i class="fas fa-chevron-right tree-chevron"></i>
            <i class="fas fa-store" style="color:var(--primary)"></i>
            <strong class="tree-resto-name">${escapeHtml(r.nom)}</strong>
            ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold" title="Portefeuille Propriétaire">PORTEFEUILLE</span>' : ''}
            ${r.tablette_sr_shop ? '<span class="badge badge-info" title="Tablette SR Shop"><i class="fas fa-tablet-screen-button"></i> SR</span>' : ''}
            ${!r.actif ? '<span class="badge badge-danger">Inactif</span>' : ''}
            <span class="text-muted">· ${escapeHtml(r.ville || '—')}</span>
            <span class="tree-resto-meta">
              <span title="Marques"><i class="fas fa-tags"></i> ${r.marques.length}</span>
              <span title="Commandes"><i class="fas fa-receipt"></i> ${fmtNum(r.nb_commandes)}</span>
              <span title="CA"><i class="fas fa-euro-sign"></i> ${fmtEUR(r.ca_total)}</span>
            </span>
            <span class="tree-actions">
              <button class="btn btn-sm btn-primary" data-add-marque="${r.id}" title="Ajouter une marque virtuelle"><i class="fas fa-plus"></i> Marque</button>
              <button class="btn btn-sm btn-secondary" data-edit-resto="${r.id}" title="Modifier le restaurant"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-secondary" data-detail="${r.id}" title="Voir détail"><i class="fas fa-eye"></i></button>
              <button class="btn btn-sm btn-danger" data-del-resto="${r.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
            </span>
          </summary>
          <div class="tree-resto-body">
            ${agentBlock}
            ${r.siret || r.raison_sociale ? `<div class="tree-info"><i class="fas fa-building"></i> ${escapeHtml(r.raison_sociale || '')} ${r.siret ? `· SIRET ${escapeHtml(r.siret)}` : ''}</div>` : ''}
            <div class="tree-marques-title">
              <i class="fas fa-tags"></i> Marques virtuelles (${r.marques.length})
              <button class="btn btn-sm btn-primary" style="margin-left:.5rem" data-add-marque-inline="${r.id}"><i class="fas fa-plus"></i> Nouvelle marque</button>
            </div>
            ${marquesBlock}
          </div>
        </details>
      `
    }).join('')

    // Bind detail buttons
    const stop = (e) => { e.preventDefault(); e.stopPropagation() }
    container.querySelectorAll('[data-detail]').forEach(b => {
      b.onclick = (e) => { stop(e); restaurantDetailModal(parseInt(b.dataset.detail), agents) }
    })
    container.querySelectorAll('[data-edit-resto]').forEach(b => {
      b.onclick = (e) => {
        stop(e)
        const r = tree.find(x => x.id === parseInt(b.dataset.editResto))
        if (r) restaurantModal(r, agents)
      }
    })
    container.querySelectorAll('[data-del-resto]').forEach(b => {
      b.onclick = (e) => {
        stop(e)
        confirmDialog(
          'Supprimer ce restaurant ? Toutes ses marques et commandes seront supprimées. La tranche en cours sera réajustée.',
          async () => {
            await api.delete('/admin/restaurants/' + b.dataset.delResto)
            toast('Restaurant supprimé')
            navigate('arborescence')
          }
        )
      }
    })
    container.querySelectorAll('[data-add-marque], [data-add-marque-inline]').forEach(b => {
      b.onclick = (e) => {
        stop(e)
        const restoId = parseInt(b.dataset.addMarque || b.dataset.addMarqueInline)
        marqueQuickModal(restoId, () => navigate('arborescence'))
      }
    })
  }

  // Filtres
  const applyFilters = () => {
    const q = (document.getElementById('treeSearch').value || '').toLowerCase().trim()
    const aid = document.getElementById('treeAgent').value
    let filtered = tree
    if (aid) filtered = filtered.filter(r => String(r.agent_id) === String(aid))
    if (q) filtered = filtered.filter(r =>
      (r.nom || '').toLowerCase().includes(q)
      || (r.ville || '').toLowerCase().includes(q)
      || (r.siret || '').toLowerCase().includes(q)
      || (r.marques || []).some(m => (m.nom || '').toLowerCase().includes(q))
    )
    renderTree(filtered)
  }

  document.getElementById('treeSearch').oninput = applyFilters
  document.getElementById('treeAgent').onchange = applyFilters
  document.getElementById('btnExpandAll').onclick = () =>
    document.querySelectorAll('.tree-resto').forEach(d => d.open = true)
  document.getElementById('btnCollapseAll').onclick = () =>
    document.querySelectorAll('.tree-resto').forEach(d => d.open = false)

  renderTree(tree)
}

// ============================================================
// --- Marques virtuelles (refonte complète, CRUD admin) ---
// ============================================================
PAGES['marques'] = async (c) => {
  // État local
  const state = {
    search: '',
    restaurant_id: '',
    agent_id: '',
    portefeuille: '',     // '', '1', '0'
    actif: '1',           // '' (tout), '1', '0'
    selection: new Set()
  }

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-tags"></i> Marques virtuelles</h1>
        <div class="subtitle">Gestion complète des marques — création, assignation, portefeuille propriétaire, suppression</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="btnReloadMarques"><i class="fas fa-sync"></i> Rafraîchir</button>
        <button class="btn btn-primary" id="btnNewMarque"><i class="fas fa-plus"></i> Nouvelle marque</button>
      </div>
    </div>

    <div id="mqStats" class="stats-grid" style="margin-bottom:1rem"></div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-title"><i class="fas fa-filter"></i> Filtres</div>
      <div class="form-grid" style="grid-template-columns:2fr 1.5fr 1.5fr 1fr 1fr auto;gap:.6rem;align-items:end">
        <div class="form-group">
          <label style="font-size:.78rem">Recherche</label>
          <input id="fSearch" placeholder="Nom marque, restaurant, Uber Store ID…" />
        </div>
        <div class="form-group">
          <label style="font-size:.78rem">Restaurant</label>
          <select id="fResto"><option value="">— Tous —</option></select>
        </div>
        <div class="form-group">
          <label style="font-size:.78rem">Agent</label>
          <select id="fAgent"><option value="">— Tous —</option></select>
        </div>
        <div class="form-group">
          <label style="font-size:.78rem">Portefeuille</label>
          <select id="fPortefeuille">
            <option value="">— Tous —</option>
            <option value="1">Portefeuille</option>
            <option value="0">Standard</option>
          </select>
        </div>
        <div class="form-group">
          <label style="font-size:.78rem">Statut</label>
          <select id="fActif">
            <option value="1">Actives</option>
            <option value="0">Inactives</option>
            <option value="">Toutes</option>
          </select>
        </div>
        <button class="btn btn-secondary" id="btnClearFilters" title="Réinitialiser"><i class="fas fa-eraser"></i></button>
      </div>
    </div>

    <div id="mqBulkBar" class="card" style="display:none;background:#eff6ff;border-left:3px solid var(--primary);margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:.8rem">
        <strong id="mqBulkCount" style="color:var(--primary)"></strong>
        <button class="btn btn-sm btn-secondary" data-bulk="activate"><i class="fas fa-check"></i> Activer</button>
        <button class="btn btn-sm btn-secondary" data-bulk="deactivate"><i class="fas fa-ban"></i> Désactiver</button>
        <button class="btn btn-sm btn-link" id="mqClearSel" style="margin-left:auto">Annuler la sélection</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <i class="fas fa-list"></i> Liste des marques
        <span id="mqCount" class="text-muted" style="font-weight:400;margin-left:.5rem"></span>
      </div>
      <div id="mqTableWrap" class="table-wrap">
        <div class="text-muted" style="padding:1.5rem;text-align:center">
          <i class="fas fa-circle-notch fa-spin"></i> Chargement…
        </div>
      </div>
    </div>
  `

  // Chargement initial des restos pour le sélecteur + filtres + agents
  let allRestos = []
  let allAgents = []
  try {
    const [rR, rA] = await Promise.all([
      api.get('/admin/marques/restos-disponibles'),
      api.get('/admin/agents-crud/').catch(() => ({ data: { agents: [] } }))
    ])
    allRestos = rR.data.restos || []
    allAgents = rA.data.agents || []
  } catch (e) {
    toast('Erreur de chargement des données', 'error')
  }

  const fResto = c.querySelector('#fResto')
  for (const r of allRestos) {
    const o = document.createElement('option')
    o.value = r.id
    o.textContent = r.nom + (r.ville ? ' — ' + r.ville : '') + (r.resto_portefeuille ? ' [P]' : '')
    fResto.appendChild(o)
  }
  const fAgent = c.querySelector('#fAgent')
  for (const a of allAgents) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = (a.prenom || '') + ' ' + (a.nom || '') + (typeof a.niveau === 'number' ? ` (N${a.niveau})` : '')
    fAgent.appendChild(o)
  }

  // Listeners filtres (debounced search)
  let searchTimer = null
  c.querySelector('#fSearch').oninput = (e) => {
    clearTimeout(searchTimer)
    state.search = e.target.value
    searchTimer = setTimeout(load, 300)
  }
  c.querySelector('#fResto').onchange = (e) => { state.restaurant_id = e.target.value; load() }
  c.querySelector('#fAgent').onchange = (e) => { state.agent_id = e.target.value; load() }
  c.querySelector('#fPortefeuille').onchange = (e) => { state.portefeuille = e.target.value; load() }
  c.querySelector('#fActif').onchange = (e) => { state.actif = e.target.value; load() }
  c.querySelector('#btnClearFilters').onclick = () => {
    state.search = ''; state.restaurant_id = ''; state.agent_id = ''; state.portefeuille = ''; state.actif = '1'
    c.querySelector('#fSearch').value = ''
    c.querySelector('#fResto').value = ''
    c.querySelector('#fAgent').value = ''
    c.querySelector('#fPortefeuille').value = ''
    c.querySelector('#fActif').value = '1'
    load()
  }
  c.querySelector('#btnReloadMarques').onclick = load
  c.querySelector('#btnNewMarque').onclick = () => marqueFormModal(null, allRestos, load)

  async function load() {
    const tw = c.querySelector('#mqTableWrap')
    tw.innerHTML = '<div class="text-muted" style="padding:1.5rem;text-align:center"><i class="fas fa-circle-notch fa-spin"></i> Chargement…</div>'
    const q = new URLSearchParams()
    if (state.search) q.set('search', state.search)
    if (state.restaurant_id) q.set('restaurant_id', state.restaurant_id)
    if (state.agent_id) q.set('agent_id', state.agent_id)
    if (state.portefeuille !== '') q.set('portefeuille', state.portefeuille)
    if (state.actif !== '') q.set('actif', state.actif)
    try {
      const { data } = await api.get('/admin/marques?' + q.toString())
      renderStats(data.stats)
      renderTable(data.marques)
    } catch (e) {
      tw.innerHTML = '<div class="text-danger" style="padding:1rem">Erreur : ' + escapeHtml(e.response?.data?.error || e.message) + '</div>'
    }
  }

  function renderStats(s) {
    const sg = c.querySelector('#mqStats')
    sg.innerHTML = `
      <div class="stat-card"><div class="stat-label">Total marques</div><div class="stat-value">${s.total || 0}</div></div>
      <div class="stat-card" style="border-left:3px solid #ea8a00"><div class="stat-label">Portefeuille (100%)</div><div class="stat-value" style="color:#ea8a00">${s.nb_portefeuille || 0}</div><div class="stat-extra">5e marque/resto</div></div>
      <div class="stat-card" style="border-left:3px solid #06A05A"><div class="stat-label">Actives</div><div class="stat-value" style="color:#06A05A">${s.nb_actives || 0}</div></div>
      <div class="stat-card" style="border-left:3px solid #94a3b8"><div class="stat-label">Inactives</div><div class="stat-value" style="color:#94a3b8">${s.nb_inactives || 0}</div></div>
    `
  }

  function renderTable(marques) {
    state.selection.clear()
    updateBulkBar()
    c.querySelector('#mqCount').textContent = `(${marques.length} résultat${marques.length > 1 ? 's' : ''})`
    const tw = c.querySelector('#mqTableWrap')
    if (!marques.length) {
      tw.innerHTML = `
        <div style="padding:2rem;text-align:center;color:#6b7280">
          <i class="fas fa-tags" style="font-size:2.5rem;color:#cbd5e1;margin-bottom:.5rem"></i>
          <p>Aucune marque ne correspond aux filtres.</p>
          <button class="btn btn-primary btn-sm" id="emptyNewMarque"><i class="fas fa-plus"></i> Créer une marque</button>
        </div>`
      const b = tw.querySelector('#emptyNewMarque')
      if (b) b.onclick = () => marqueFormModal(null, allRestos, load)
      return
    }
    tw.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th style="width:32px"><input type="checkbox" id="mqSelAll" /></th>
          <th>Marque</th>
          <th>Restaurant</th>
          <th>Agent</th>
          <th class="text-right">Rang</th>
          <th class="text-right">Cmd</th>
          <th class="text-right">CA</th>
          <th class="text-right">Commissions</th>
          <th>Plateforme</th>
          <th>Uber ID</th>
          <th>Statut</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${marques.map(m => `
          <tr data-id="${m.id}" ${!m.actif ? 'style="opacity:.55"' : ''}>
            <td><input type="checkbox" class="mqSel" data-id="${m.id}" /></td>
            <td>
              <strong>${escapeHtml(m.nom)}</strong>
              ${m.is_portefeuille_proprietaire ? '<span class="badge badge-gold" title="Marque en portefeuille propriétaire — agent facture le resto à 100%">PORTEFEUILLE</span>' : ''}
              ${m.notes ? `<div class="text-muted" style="font-size:.72rem;margin-top:.15rem">${escapeHtml((m.notes||'').substring(0,60))}${(m.notes||'').length>60?'…':''}</div>` : ''}
            </td>
            <td>
              ${escapeHtml(m.restaurant_nom)}
              ${m.restaurant_ville ? `<div class="text-muted" style="font-size:.72rem">${escapeHtml(m.restaurant_ville)}</div>` : ''}
              ${m.resto_portefeuille ? '<span class="badge badge-gold" style="font-size:.62rem">resto P</span>' : ''}
            </td>
            <td>${m.agent_nom ? `<strong>${escapeHtml(m.agent_prenom + ' ' + m.agent_nom)}</strong>${typeof m.agent_niveau==='number' ? `<div class="text-muted" style="font-size:.7rem">N${m.agent_niveau}</div>`:''}` : '<span class="text-muted">—</span>'}</td>
            <td class="text-right">${m.rang_creation || '—'}</td>
            <td class="text-right">${fmtNum(m.nb_commandes || 0)}</td>
            <td class="text-right">${fmtEUR(m.ca_total || 0)}</td>
            <td class="text-right text-success">${fmtEUR(m.commissions_total || 0)}</td>
            <td><span class="badge badge-slate">${escapeHtml(m.plateforme || 'uber_eats')}</span></td>
            <td><code style="font-size:.75rem">${escapeHtml(m.uber_store_id || '—')}</code></td>
            <td>${m.actif ? '<span class="niveau-pill niveau-1">Active</span>' : '<span class="text-muted">Inactive</span>'}</td>
            <td class="text-right" style="white-space:nowrap">
              <button class="btn btn-sm btn-secondary" data-edit="${m.id}" title="Modifier"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-secondary" data-move="${m.id}" title="Déplacer vers un autre resto"><i class="fas fa-exchange-alt"></i></button>
              <button class="btn btn-sm ${m.is_portefeuille_proprietaire ? 'btn-secondary' : 'btn-warning'}" data-pf="${m.id}" data-pfval="${m.is_portefeuille_proprietaire ? 0 : 1}" title="${m.is_portefeuille_proprietaire ? 'Retirer du portefeuille' : 'Marquer comme portefeuille'}">
                <i class="fas fa-${m.is_portefeuille_proprietaire ? 'star-half-alt' : 'star'}"></i>
              </button>
              <button class="btn btn-sm btn-danger" data-del="${m.id}" data-nom="${escapeHtml(m.nom)}" data-cmd="${m.nb_commandes||0}" title="Supprimer"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`

    // Sélection
    c.querySelector('#mqSelAll').onchange = (e) => {
      c.querySelectorAll('.mqSel').forEach(cb => {
        cb.checked = e.target.checked
        const id = parseInt(cb.dataset.id)
        if (e.target.checked) state.selection.add(id)
        else state.selection.delete(id)
      })
      updateBulkBar()
    }
    c.querySelectorAll('.mqSel').forEach(cb => {
      cb.onchange = (e) => {
        const id = parseInt(e.target.dataset.id)
        if (e.target.checked) state.selection.add(id)
        else state.selection.delete(id)
        updateBulkBar()
      }
    })

    // Actions
    c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const m = marques.find(x => x.id === parseInt(b.dataset.edit))
      marqueFormModal(m, allRestos, load)
    })
    c.querySelectorAll('[data-move]').forEach(b => b.onclick = () => {
      const m = marques.find(x => x.id === parseInt(b.dataset.move))
      marqueMoveModal(m, allRestos, load)
    })
    c.querySelectorAll('[data-pf]').forEach(b => b.onclick = async () => {
      const id = parseInt(b.dataset.pf)
      const val = parseInt(b.dataset.pfval)
      try {
        await api.post(`/admin/marques/${id}/toggle-portefeuille`, { is_portefeuille: val })
        toast(val ? 'Marque marquée en portefeuille' : 'Marque retirée du portefeuille')
        load()
      } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    })
    c.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const id = parseInt(b.dataset.del)
      const nom = b.dataset.nom
      const cmd = parseInt(b.dataset.cmd)
      if (cmd > 0) {
        confirmModal(
          `Supprimer la marque "${nom}" ?`,
          `Cette marque a ${cmd} commande(s). La suppression est définitive et supprimera aussi les commandes associées.`,
          async () => {
            try {
              await api.delete(`/admin/marques/${id}?force=1`)
              toast('Marque supprimée avec ses commandes')
              load()
            } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
          }
        )
      } else {
        confirmModal(
          `Supprimer la marque "${nom}" ?`,
          'Action irréversible.',
          async () => {
            try {
              await api.delete(`/admin/marques/${id}`)
              toast('Marque supprimée')
              load()
            } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
          }
        )
      }
    })
  }

  function updateBulkBar() {
    const bar = c.querySelector('#mqBulkBar')
    const n = state.selection.size
    if (!n) { bar.style.display = 'none'; return }
    bar.style.display = 'block'
    c.querySelector('#mqBulkCount').textContent = `${n} marque${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}`
  }
  c.querySelector('#mqClearSel').onclick = () => {
    state.selection.clear()
    c.querySelectorAll('.mqSel').forEach(cb => cb.checked = false)
    const all = c.querySelector('#mqSelAll'); if (all) all.checked = false
    updateBulkBar()
  }
  c.querySelectorAll('[data-bulk]').forEach(b => b.onclick = async () => {
    const action = b.dataset.bulk
    if (!state.selection.size) return
    try {
      await api.post('/admin/marques/bulk-toggle-actif', {
        ids: Array.from(state.selection),
        actif: action === 'activate' ? 1 : 0
      })
      toast(action === 'activate' ? 'Marques activées' : 'Marques désactivées')
      load()
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })

  await load()
}

// ============================================================
// Modal de création/édition d'une marque
// ============================================================
function marqueFormModal(marque, restos, onSuccess) {
  const isEdit = !!marque
  const m = modal(
    `<i class="fas fa-${isEdit ? 'pen' : 'plus'}"></i> ${isEdit ? 'Modifier la marque' : 'Nouvelle marque virtuelle'}`,
    `
    <form id="mqForm">
      <div class="form-grid">
        ${isEdit ? '' : `
        <div class="form-group" style="grid-column:1/-1">
          <label>Restaurant <span class="req">*</span></label>
          <select id="mqResto" required>
            <option value="">— Choisir un restaurant —</option>
            ${restos.map(r => `<option value="${r.id}">${escapeHtml(r.nom)}${r.ville ? ' — ' + escapeHtml(r.ville) : ''}${r.agent_prenom ? ' · ' + escapeHtml(r.agent_prenom + ' ' + r.agent_nom) : ''}${r.resto_portefeuille ? ' [Portefeuille]' : ''}</option>`).join('')}
          </select>
        </div>`}
        <div class="form-group" style="grid-column:1/-1">
          <label>Nom de la marque <span class="req">*</span></label>
          <input id="mqNom" required value="${escapeHtml(marque?.nom || '')}" placeholder="Ex: Pizza Nostra, Burger Lab…" />
        </div>
        <div class="form-group">
          <label>Plateforme</label>
          <select id="mqPlat">
            <option value="uber_eats" ${(!marque || marque.plateforme === 'uber_eats') ? 'selected' : ''}>Uber Eats</option>
            <option value="deliveroo" ${marque?.plateforme === 'deliveroo' ? 'selected' : ''}>Deliveroo</option>
            <option value="just_eat" ${marque?.plateforme === 'just_eat' ? 'selected' : ''}>Just Eat</option>
            <option value="autre" ${marque?.plateforme === 'autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Uber Store ID / Réf plateforme</label>
          <input id="mqUber" value="${escapeHtml(marque?.uber_store_id || '')}" placeholder="ex: 1a2b3c4d-5e6f" />
        </div>
        <div class="form-group">
          <label>Date de lancement</label>
          <input id="mqDate" type="date" value="${marque?.date_lancement ? marque.date_lancement.substring(0,10) : ''}" />
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label>Statut</label>
          <select id="mqActif">
            <option value="1" ${marque.actif !== 0 ? 'selected' : ''}>Active</option>
            <option value="0" ${marque.actif === 0 ? 'selected' : ''}>Inactive</option>
          </select>
        </div>` : `
        <div class="form-group" style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;background:#fef3c7;padding:.5rem .7rem;border-radius:6px;border:1px solid #fcd34d">
            <input id="mqPf" type="checkbox" />
            <span><i class="fas fa-star" style="color:#ea8a00"></i> Forcer en <strong>Portefeuille propriétaire</strong> (100% agent, pas de DropEat ni N+1/N+2)</span>
          </label>
        </div>`}
        <div class="form-group" style="grid-column:1/-1">
          <label>Notes internes</label>
          <textarea id="mqNotes" rows="2" placeholder="Notes facultatives…">${escapeHtml(marque?.notes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Enregistrer' : 'Créer la marque'}</button>
      </div>
    </form>
    `
  )
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#mqForm').onsubmit = async (e) => {
    e.preventDefault()
    const payload = {
      nom: m.el.querySelector('#mqNom').value.trim(),
      uber_store_id: m.el.querySelector('#mqUber').value.trim() || null,
      plateforme: m.el.querySelector('#mqPlat').value,
      date_lancement: m.el.querySelector('#mqDate').value || null,
      notes: m.el.querySelector('#mqNotes').value.trim() || null
    }
    if (isEdit) {
      payload.actif = parseInt(m.el.querySelector('#mqActif').value)
    } else {
      payload.restaurant_id = parseInt(m.el.querySelector('#mqResto').value)
      payload.is_portefeuille_proprietaire = m.el.querySelector('#mqPf').checked ? 1 : 0
      if (!payload.restaurant_id) return toast('Sélectionnez un restaurant', 'error')
    }
    try {
      if (isEdit) {
        await api.put(`/admin/marques/${marque.id}`, payload)
        toast('Marque mise à jour')
      } else {
        const r = await api.post('/admin/marques', payload)
        let msg = 'Marque créée'
        if (r.data.tranche?.attribution_100) {
          msg += ` — 🎉 5e élément qualifiant ! Attribution 100% (tranche ${r.data.tranche.numero_tranche})`
        }
        toast(msg, 'success', 4000)
      }
      m.close()
      onSuccess && onSuccess()
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }
}

// ============================================================
// Modal de déplacement d'une marque vers un autre restaurant
// ============================================================
function marqueMoveModal(marque, restos, onSuccess) {
  const others = restos.filter(r => r.id !== marque.restaurant_id)
  const m = modal(
    '<i class="fas fa-exchange-alt"></i> Déplacer la marque',
    `
    <div style="background:#fffbeb;padding:.7rem;border-radius:6px;border-left:3px solid #ea8a00;margin-bottom:1rem;font-size:.85rem">
      <strong>⚠ Attention :</strong> déplacer la marque <strong>"${escapeHtml(marque.nom)}"</strong>
      changera son rattachement de restaurant et donc d'agent. Toutes les commandes existantes resteront liées à la marque.
    </div>
    <div class="form-grid">
      <div class="form-group" style="grid-column:1/-1">
        <label>Restaurant actuel</label>
        <input value="${escapeHtml(marque.restaurant_nom)}" readonly style="background:#f3f4f6" />
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>Nouveau restaurant <span class="req">*</span></label>
        <select id="mvResto" required>
          <option value="">— Choisir —</option>
          ${others.map(r => `<option value="${r.id}">${escapeHtml(r.nom)}${r.ville ? ' — ' + escapeHtml(r.ville) : ''}${r.agent_prenom ? ' · ' + escapeHtml(r.agent_prenom + ' ' + r.agent_nom) : ''}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="btnMove"><i class="fas fa-exchange-alt"></i> Déplacer</button>
    </div>
    `
  )
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#btnMove').onclick = async () => {
    const newId = parseInt(m.el.querySelector('#mvResto').value)
    if (!newId) return toast('Sélectionnez un restaurant', 'error')
    try {
      await api.post(`/admin/marques/${marque.id}/move`, { restaurant_id: newId })
      toast('Marque déplacée')
      m.close()
      onSuccess && onSuccess()
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Imports CSV ---
PAGES['imports'] = async (c) => loadImportsPage(c, '/admin/imports')

async function loadImportsPage(c, baseEndpoint) {
  const isAdmin = baseEndpoint.startsWith('/admin')
  const [imp, marquesRes] = await Promise.all([
    api.get(baseEndpoint),
    api.get(isAdmin ? '/admin/restaurants/marques/all' : '/agent/restaurants').catch(() => ({ data: { restaurants: [] } }))
  ])
  // Pour l'agent, construire la liste des marques depuis ses restos
  let marques = []
  if (isAdmin) marques = marquesRes.data.marques
  else {
    for (const r of marquesRes.data.restaurants) {
      const det = await api.get('/agent/restaurants/' + r.id).catch(() => null)
      if (det) det.data.marques.forEach(m => marques.push({ ...m, restaurant_nom: r.nom }))
    }
  }

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-cloud-arrow-up"></i> Imports CSV / PDF</h1><div class="subtitle">Importer les commandes Uber Eats — détection auto. de la marque + calcul auto. des commissions</div></div>
    </div>
    <div class="card mb-4">
      <div class="card-title"><i class="fas fa-cloud-arrow-up"></i> Nouvel import</div>
      <div class="info-banner" style="background:#eef6ff;border-left:3px solid var(--primary);padding:.6rem .9rem;border-radius:6px;margin-bottom:.8rem;font-size:.85rem">
        <i class="fas fa-circle-info"></i>
        Glissez votre fichier : la marque est <strong>auto-détectée</strong> (par Uber Store ID ou nom).
        Les commissions de tous les agents (N0, N+1, N+2) sont <strong>recalculées automatiquement</strong> à la fin de l'import.
      </div>
      <div class="form-grid mb-3">
        <div class="form-group">
          <label>Marque virtuelle <span class="req">*</span> <small class="text-muted">(auto-détectée si possible)</small></label>
          <select id="marqueSelect">
            <option value="">— Sélectionner —</option>
            ${marques.map(m => `<option value="${m.id}" data-uber="${escapeHtml(m.uber_store_id || '')}" data-nom="${escapeHtml(m.nom)}">${escapeHtml(m.restaurant_nom + ' / ' + m.nom)}${m.uber_store_id ? ' · ' + escapeHtml(m.uber_store_id) : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="upload-zone" id="dropZone">
        <i class="fas fa-file-csv"></i>
        <h3>Glissez-déposez votre fichier ici</h3>
        <div class="hint">ou cliquez pour parcourir · CSV, TSV, TXT, PDF — Uber Eats ou autres plateformes</div>
        <input type="file" id="fileInput" style="display:none" accept=".csv,.tsv,.txt,.pdf"/>
      </div>
      <div id="previewBox"></div>
    </div>
    ${imp.data.totaux && imp.data.imports.length ? `
      <div class="stats-grid mb-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem;margin-bottom:1rem">
        <div class="stat-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:.9rem">
          <div class="text-muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">CA brut restaurants</div>
          <div style="font-size:1.4rem;font-weight:700;color:#0f172a">${fmtEUR(imp.data.totaux.ca_brut)}</div>
          <div class="text-muted" style="font-size:.78rem">${imp.data.totaux.nb_imports} import(s)</div>
        </div>
        <div class="stat-card" style="background:#eef6ff;border:1px solid #c7dffd;border-radius:8px;padding:.9rem">
          <div class="text-muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">CA DropEat brut</div>
          <div style="font-size:1.4rem;font-weight:700;color:#1e40af">${fmtEUR(imp.data.totaux.ca_dropeat_brut)}</div>
          <div class="text-muted" style="font-size:.78rem">facturable aux restaurants</div>
        </div>
        <div class="stat-card" style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:.9rem">
          <div class="text-muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">Commissions agents</div>
          <div style="font-size:1.4rem;font-weight:700;color:#92400e">${fmtEUR(imp.data.totaux.commissions_total)}</div>
          <div class="text-muted" style="font-size:.78rem">
            propre ${fmtEUR(imp.data.totaux.commissions_propre)} · pf ${fmtEUR(imp.data.totaux.commissions_portefeuille)}<br>
            N+1 ${fmtEUR(imp.data.totaux.commissions_n1)} · N+2 ${fmtEUR(imp.data.totaux.commissions_n2)}
          </div>
        </div>
        <div class="stat-card" style="background:#e8f7ee;border:1px solid #bbe5cb;border-radius:8px;padding:.9rem">
          <div class="text-muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">Marge nette DropEat</div>
          <div style="font-size:1.4rem;font-weight:700;color:#06A05A">${fmtEUR(imp.data.totaux.marge_dropeat_nette)}</div>
          <div class="text-muted" style="font-size:.78rem">CA DropEat − toutes commissions</div>
        </div>
      </div>` : ''}
    <div class="card">
      <div class="card-title"><i class="fas fa-history"></i> Historique des imports — financier</div>
      ${imp.data.imports.length ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Date</th><th>Restaurant / Marque</th><th>Période</th>
              <th class="text-right">Cmd</th>
              <th class="text-right">CA resto</th>
              <th class="text-right">CA DropEat</th>
              <th class="text-right">Comm. agents</th>
              <th class="text-right">Marge nette</th>
              <th>Agent</th>
              <th class="text-right">Actions</th>
            </tr></thead>
            <tbody>${imp.data.imports.map(i => {
              const pf = i.marque_pf || i.resto_pf
              return `
              <tr>
                <td>
                  ${fmtDateTime(i.created_at)}
                  <div class="text-muted" style="font-size:.72rem">${escapeHtml(i.nom_fichier || '-')}</div>
                </td>
                <td>
                  ${escapeHtml(i.restaurant_nom + ' / ' + i.marque_nom)}
                  ${pf ? '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem;margin-left:.3rem">PORTEFEUILLE 100%</span>' : ''}
                </td>
                <td>${i.periode_debut ? fmtDate(i.periode_debut) + ' → ' + fmtDate(i.periode_fin) : '-'}</td>
                <td class="text-right">${fmtNum(i.nb_commandes_reel || 0)}</td>
                <td class="text-right">${fmtEUR(i.ca_brut || 0)}</td>
                <td class="text-right" style="color:#1e40af;font-weight:600">${pf ? '<span class="text-muted">—</span>' : fmtEUR(i.ca_dropeat_brut || 0)}</td>
                <td class="text-right" style="color:#92400e">
                  ${fmtEUR((i.commissions_propre || 0) + (i.commissions_portefeuille || 0) + (i.commissions_n1 || 0) + (i.commissions_n2 || 0))}
                </td>
                <td class="text-right" style="color:#06A05A;font-weight:600">${pf ? '0,00 €' : fmtEUR(i.marge_dropeat_nette || 0)}</td>
                <td>${i.agent_prenom ? escapeHtml(i.agent_prenom + ' ' + i.agent_nom) : '-'}</td>
                <td class="text-right" style="white-space:nowrap">
                  <button class="btn btn-sm btn-secondary" data-details="${i.id}" title="Détail commissions"><i class="fas fa-eye"></i></button>
                  <button class="btn btn-sm btn-secondary" data-download="${i.id}" title="Télécharger CSV"><i class="fas fa-download"></i></button>
                  ${isAdmin ? `<button class="btn btn-sm btn-secondary" data-recalc="${i.id}" title="Recalculer commissions"><i class="fas fa-calculator"></i></button>` : ''}
                  ${isAdmin && !pf ? `<button class="btn btn-sm btn-primary" data-fact="${i.id}" data-resto="${i.restaurant_nom}" title="Créer facture"><i class="fas fa-file-invoice"></i></button>` : ''}
                  <button class="btn btn-sm btn-danger" data-del="${i.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`}).join('')}</tbody>
          </table>
        </div>` : '<p class="text-muted">Aucun import pour le moment</p>'}
    </div>`

  const drop = c.querySelector('#dropZone'), inp = c.querySelector('#fileInput')
  drop.onclick = () => inp.click()
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('dragover') }
  drop.ondragleave = () => drop.classList.remove('dragover')
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]) }
  inp.onchange = e => { if (e.target.files[0]) handleFile(e.target.files[0]) }

  let pendingCsv = null, pendingFilename = null

  async function handleFile(file) {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
    if (isPdf) {
      toast('PDF détecté : extraction du texte en cours…', 'success', 2500)
      try {
        const text = await extractPdfText(file)
        if (!text || text.trim().length < 20) {
          toast('Impossible d\'extraire le texte du PDF (PDF scanné ?). Convertissez-le en CSV.', 'error', 5000)
          return
        }
        // Convertir en pseudo-CSV : la 1ère ligne est l'en-tête détecté par heuristique tabulaire
        pendingCsv = pdfTextToCsv(text)
        pendingFilename = file.name
        const { data } = await api.post(baseEndpoint + '/preview', { csv: pendingCsv })
        renderPreview(data, file.name)
      } catch (err) {
        toast('Erreur extraction PDF : ' + (err.message || ''), 'error')
      }
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      pendingCsv = reader.result
      pendingFilename = file.name
      try {
        const { data } = await api.post(baseEndpoint + '/preview', { csv: pendingCsv })
        renderPreview(data, file.name)
      } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
    }
    reader.readAsText(file)
  }

  // Extraction texte d'un PDF via pdf.js CDN (chargé à la demande)
  async function extractPdfText(file) {
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }
    const buf = await file.arrayBuffer()
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
    let allText = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      // Reconstituer ligne par ligne en groupant par y similaire
      const items = content.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }))
      items.sort((a, b) => b.y - a.y || a.x - b.x)
      let curY = null, line = []
      const lines = []
      for (const it of items) {
        if (curY === null || Math.abs(curY - it.y) < 2) {
          line.push(it.str); curY = it.y
        } else {
          if (line.length) lines.push(line.join('\t'))
          line = [it.str]; curY = it.y
        }
      }
      if (line.length) lines.push(line.join('\t'))
      allText += lines.join('\n') + '\n'
    }
    return allText
  }

  // Convertit un texte PDF tab-séparé en CSV exploitable
  function pdfTextToCsv(text) {
    // Normalise tabs → suite de tabs simples; les lignes vides sont sautées
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length)
    return lines.join('\n')
  }

  function renderPreview(data, filename) {
    const box = c.querySelector('#previewBox')
    // Auto-sélection de la marque si suggérée et trouvée
    const ms = data.marque_suggeree
    let suggestionHtml = ''
    if (ms) {
      if (ms.id) {
        // Marque trouvée → on pré-sélectionne dans le <select>
        const sel = c.querySelector('#marqueSelect')
        if (sel) {
          const opt = sel.querySelector(`option[value="${ms.id}"]`)
          if (opt) sel.value = String(ms.id)
        }
        suggestionHtml = `<div class="info-banner" style="background:#e8f7ee;border-left:3px solid var(--success,#06A05A);padding:.6rem .9rem;border-radius:6px;margin-bottom:.6rem;font-size:.85rem">
          <i class="fas fa-circle-check"></i>
          Marque détectée automatiquement : <strong>${escapeHtml(ms.restaurant_nom + ' / ' + ms.nom)}</strong>
          <span class="text-muted">(match par ${ms.match === 'uber_store_id' ? 'Uber Store ID' : 'nom'})</span>
        </div>`
      } else if (ms.match === 'nouveau') {
        suggestionHtml = `<div class="info-banner" style="background:#fff7ed;border-left:3px solid var(--warning,#ea8a00);padding:.6rem .9rem;border-radius:6px;margin-bottom:.6rem;font-size:.85rem">
          <i class="fas fa-triangle-exclamation"></i>
          Aucune marque enregistrée ne correspond à <strong>${escapeHtml(ms.nom_detecte || ms.uber_store_id_detecte || 'ce fichier')}</strong>.
          Sélectionnez une marque manuellement ou créez-la d'abord depuis « Restaurants ».
        </div>`
      }
    }
    box.innerHTML = `
      <div class="card mt-3" style="background:#f8fafc">
        <div class="card-title"><i class="fas fa-magnifying-glass-chart"></i> Aperçu — ${escapeHtml(filename)}</div>
        ${suggestionHtml}
        <p><strong>${data.nb_lignes}</strong> lignes détectées · délimiteur : <code>${escapeHtml(data.delimiter === '\t' ? 'TAB' : data.delimiter)}</code></p>
        <div class="form-grid">
          ${['order_id', 'date', 'total', 'uber_fee', 'net', 'status'].map(k => `
            <div class="form-group">
              <label>${k}${k === 'date' ? ' *' : ''}</label>
              <select id="map_${k}">
                <option value="">— Aucune —</option>
                ${data.headers.map(h => `<option value="${escapeHtml(h)}" ${data.detected[k] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
              </select>
            </div>`).join('')}
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" id="cancelPreview">Annuler</button>
          <button class="btn btn-primary" id="doImport"><i class="fas fa-cloud-arrow-up"></i> Importer ces ${data.nb_lignes} lignes</button>
        </div>
      </div>`
    box.querySelector('#cancelPreview').onclick = () => { box.innerHTML = ''; pendingCsv = null }
    box.querySelector('#doImport').onclick = async () => {
      const marque_id = c.querySelector('#marqueSelect').value
      if (!marque_id) { toast('Sélectionnez une marque', 'error'); return }
      const mapping = {}
      for (const k of ['order_id', 'date', 'total', 'uber_fee', 'net', 'status']) {
        mapping[k] = box.querySelector('#map_' + k).value || null
      }
      const btn = box.querySelector('#doImport')
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Import + calcul commissions…'
      try {
        const { data: r } = await api.post(baseEndpoint, { marque_id: parseInt(marque_id), csv: pendingCsv, nom_fichier: pendingFilename, mapping })
        toast(`Import OK : ${r.nb_importees} commandes / ${r.nb_doublons} doublons / ${r.nb_erreurs} erreurs`)
        renderImportResult(r, box)
      } catch (err) {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Importer'
        toast(err.response?.data?.error || 'Erreur d\'import', 'error')
      }
    }
  }

  // Affiche le récap après import : commissions auto-calculées par agent
  function renderImportResult(r, box) {
    const calculs = r.commissions_auto || []
    const allAgents = []
    let totalCommissions = 0, totalFacturation = 0, totalMarge = 0, nbCmds = 0
    for (const cl of calculs) {
      totalCommissions += cl.total_commissions || 0
      totalFacturation += cl.total_facturation || 0
      totalMarge += cl.total_marge || 0
      nbCmds += cl.nb_commandes || 0
      for (const a of (cl.agents || [])) {
        allAgents.push({ ...a, periode: cl.periode })
      }
    }
    box.innerHTML = `
      <div class="card mt-3" style="border-left:4px solid var(--success,#06A05A)">
        <div class="card-title"><i class="fas fa-circle-check" style="color:var(--success,#06A05A)"></i> Import terminé avec succès</div>
        <div class="stats-grid" style="margin-bottom:1rem">
          <div class="stat-card"><div class="stat-label">Commandes importées</div><div class="stat-value">${r.nb_importees}</div></div>
          <div class="stat-card"><div class="stat-label">Doublons ignorés</div><div class="stat-value">${r.nb_doublons}</div></div>
          <div class="stat-card"><div class="stat-label">Erreurs</div><div class="stat-value">${r.nb_erreurs}</div></div>
          <div class="stat-card"><div class="stat-label">CA importé</div><div class="stat-value">${fmtEUR(r.montant_total)}</div></div>
        </div>
        ${calculs.length ? `
          <div class="card-title" style="margin-top:1rem"><i class="fas fa-coins"></i> Commissions calculées automatiquement</div>
          <p class="text-muted" style="font-size:.85rem">
            Recalcul effectué sur ${calculs.length} période(s) : ${calculs.map(cl => monthsFR[cl.periode.mois - 1] + ' ' + cl.periode.annee).join(', ')}.
          </p>
          <div class="stats-grid" style="margin-bottom:.75rem">
            <div class="stat-card"><div class="stat-label">Commandes</div><div class="stat-value">${fmtNum(nbCmds)}</div></div>
            <div class="stat-card"><div class="stat-label">Facturation DropEat</div><div class="stat-value">${fmtEUR(totalFacturation)}</div></div>
            <div class="stat-card"><div class="stat-label">Total commissions</div><div class="stat-value">${fmtEUR(totalCommissions)}</div></div>
            <div class="stat-card"><div class="stat-label">Marge DropEat</div><div class="stat-value">${fmtEUR(totalMarge)}</div></div>
          </div>
          <table class="data-table">
            <thead><tr>
              <th>Période</th><th>Agent</th><th>Niveau</th>
              <th class="text-right">CA propre</th>
              <th class="text-right">Comm. propre</th>
              <th class="text-right">Comm. portefeuille</th>
              <th class="text-right">Comm. N+1</th>
              <th class="text-right">Comm. N+2</th>
              <th class="text-right">Total</th>
            </tr></thead>
            <tbody>${allAgents.map(a => `
              <tr>
                <td>${monthsFR[a.periode.mois - 1]} ${a.periode.annee}</td>
                <td><strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong></td>
                <td>${niveauLabel(a.niveau)}</td>
                <td class="text-right">${fmtEUR(a.ca_propre)}</td>
                <td class="text-right">${fmtEUR(a.commission_propre)}</td>
                <td class="text-right">${fmtEUR(a.commission_portefeuille)}</td>
                <td class="text-right">${fmtEUR(a.commission_n1)}</td>
                <td class="text-right">${fmtEUR(a.commission_n2)}</td>
                <td class="text-right"><strong>${fmtEUR(a.total)}</strong></td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<p class="text-muted">Aucune commission calculée (pas de période impactée).</p>'}
        <div class="form-actions">
          <button class="btn btn-secondary" id="newImport"><i class="fas fa-plus"></i> Nouvel import</button>
          <button class="btn btn-primary" id="goCommissions"><i class="fas fa-coins"></i> Voir toutes les commissions</button>
        </div>
      </div>
    `
    box.querySelector('#newImport').onclick = () => { box.innerHTML = ''; pendingCsv = null }
    box.querySelector('#goCommissions').onclick = () => navigate(isAdmin ? 'commissions' : 'a-commissions')
  }

  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer cet import et toutes ses commandes ?',
    async () => { await api.delete(baseEndpoint + '/' + b.dataset.del); toast('Supprimé'); navigate(isAdmin ? 'imports' : 'a-imports') }
  ))

  c.querySelectorAll('[data-details]').forEach(b => b.onclick = async () => {
    try {
      const { data } = await api.get(baseEndpoint + '/' + b.dataset.details + '/details')
      showImportDetailsModal(data, isAdmin, baseEndpoint)
    } catch (e) { toast(e.response?.data?.error || 'Erreur chargement détails', 'error') }
  })

  // Download CSV original (reconstitué depuis raw_data)
  c.querySelectorAll('[data-download]').forEach(b => b.onclick = async () => {
    const id = b.dataset.download
    try {
      const resp = await fetch(baseEndpoint + '/' + id + '/download', { credentials: 'include' })
      if (!resp.ok) { toast('Erreur téléchargement', 'error'); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `import-${id}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast('CSV téléchargé')
    } catch (e) { toast('Erreur', 'error') }
  })

  // Recalculer commissions (admin)
  c.querySelectorAll('[data-recalc]').forEach(b => b.onclick = () => confirmDialog(
    'Recalculer les commissions de cet import ?',
    async () => {
      try {
        const { data } = await api.post(baseEndpoint + '/' + b.dataset.recalc + '/recalculer')
        toast(`Commissions recalculées (${data.periodes_recalculees} période(s))`)
        navigate(isAdmin ? 'imports' : 'a-imports')
      } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  ))

  // Créer facture DropEat → Restaurant depuis l'import (admin uniquement)
  c.querySelectorAll('[data-fact]').forEach(b => b.onclick = async () => {
    const id = b.dataset.fact, restoNom = b.dataset.resto
    try {
      const { data } = await api.post(baseEndpoint + '/' + id + '/facturer')
      if (!data.success) { toast(data.error || 'Impossible', 'error'); return }
      confirmDialog(
        `Émettre une facture DropEat → ${restoNom}\nPériode : ${data.date_debut} → ${data.date_fin} ?`,
        async () => {
          try {
            const fres = await api.post('/factures/resto/create', {
              restaurant_id: data.restaurant_id,
              date_debut: data.date_debut,
              date_fin: data.date_fin
            })
            toast(`Facture ${fres.data.numero} créée — ${fmtEUR(fres.data.montant_ttc)}`)
            setTimeout(() => navigate('factures'), 800)
          } catch (e) { toast(e.response?.data?.error || 'Erreur création facture', 'error') }
        }
      )
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  })
}

// === Modal détail import : breakdown par marque + par agent ===
function showImportDetailsModal(data, isAdmin, baseEndpoint) {
  isAdmin = isAdmin !== false  // défaut admin si non précisé
  baseEndpoint = baseEndpoint || '/admin/imports'
  const imp = data.import || {}
  const t = data.totaux || {}
  const pf = imp.marque_pf || imp.resto_pf
  const m = openModal(
    `<i class="fas fa-receipt"></i> Détail commissions — Import #${imp.id}`,
    `
    <div style="margin-bottom:1rem;padding:.7rem .9rem;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0">
      <div style="font-weight:600;font-size:1.05rem">${escapeHtml(imp.restaurant_nom + ' / ' + imp.marque_nom)}</div>
      <div class="text-muted" style="font-size:.85rem">
        ${imp.periode_debut ? fmtDate(imp.periode_debut) + ' → ' + fmtDate(imp.periode_fin) : '-'}
        · Agent N0 : <strong>${imp.agent_prenom ? escapeHtml(imp.agent_prenom + ' ' + imp.agent_nom) : '-'}</strong>
        · Upload : ${imp.uploader_prenom ? escapeHtml(imp.uploader_prenom + ' ' + imp.uploader_nom) : '-'}
        ${pf ? '<br><span class="badge" style="background:#fde68a;color:#92400e">PORTEFEUILLE 100% — DropEat ne facture pas, agent encaisse à 100%</span>' : ''}
      </div>
    </div>

    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.6rem;margin-bottom:1rem">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:.6rem">
        <div class="text-muted" style="font-size:.7rem;text-transform:uppercase">Commandes</div>
        <div style="font-size:1.1rem;font-weight:700">${fmtNum(t.nb_commandes || 0)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:.6rem">
        <div class="text-muted" style="font-size:.7rem;text-transform:uppercase">CA brut resto</div>
        <div style="font-size:1.1rem;font-weight:700">${fmtEUR(t.ca_brut || 0)}</div>
      </div>
      <div style="background:#eef6ff;border:1px solid #c7dffd;border-radius:6px;padding:.6rem">
        <div class="text-muted" style="font-size:.7rem;text-transform:uppercase">CA DropEat brut</div>
        <div style="font-size:1.1rem;font-weight:700;color:#1e40af">${pf ? '0,00 €' : fmtEUR(t.ca_dropeat_brut || 0)}</div>
      </div>
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:.6rem">
        <div class="text-muted" style="font-size:.7rem;text-transform:uppercase">Comm. totales</div>
        <div style="font-size:1.1rem;font-weight:700;color:#92400e">${fmtEUR(t.commissions_total || 0)}</div>
      </div>
      <div style="background:#e8f7ee;border:1px solid #bbe5cb;border-radius:6px;padding:.6rem">
        <div class="text-muted" style="font-size:.7rem;text-transform:uppercase">Marge DropEat</div>
        <div style="font-size:1.1rem;font-weight:700;color:#06A05A">${pf ? '0,00 €' : fmtEUR(t.marge_dropeat_nette || 0)}</div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-title" style="font-size:.95rem"><i class="fas fa-tags"></i> Par marque (${(data.par_marque || []).length})</div>
      ${(data.par_marque || []).length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Marque</th>
          <th class="text-right">Cmd</th>
          <th class="text-right">CA brut</th>
          <th class="text-right">CA DropEat</th>
          <th class="text-right">Comm propre</th>
          <th class="text-right">Comm pf</th>
          <th class="text-right">N+1</th>
          <th class="text-right">N+2</th>
        </tr></thead>
        <tbody>${data.par_marque.map(m => `
          <tr>
            <td>${escapeHtml(m.marque_nom)}${m.marque_pf ? ' <span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">PF</span>' : ''}</td>
            <td class="text-right">${fmtNum(m.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(m.ca_brut)}</td>
            <td class="text-right">${m.marque_pf ? '<span class="text-muted">—</span>' : fmtEUR(m.ca_dropeat_brut)}</td>
            <td class="text-right">${fmtEUR(m.comm_propre)}</td>
            <td class="text-right">${fmtEUR(m.comm_portefeuille)}</td>
            <td class="text-right">${fmtEUR(m.comm_n1)}</td>
            <td class="text-right">${fmtEUR(m.comm_n2)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted">Aucune marque</p>'}
    </div>

    <div class="card mb-3">
      <div class="card-title" style="font-size:.95rem"><i class="fas fa-sitemap"></i> Par agent (chaîne MLM + DropEat)</div>
      ${(data.par_agent || []).length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Niveau</th><th>Agent</th>
          <th class="text-right">Propre</th>
          <th class="text-right">Portefeuille</th>
          <th class="text-right">N+1</th>
          <th class="text-right">N+2</th>
          <th class="text-right">Total</th>
        </tr></thead>
        <tbody>${data.par_agent.map(a => `
          <tr style="${a.niveau === 'DROPEAT' ? 'background:#e8f7ee' : ''}">
            <td><strong>${a.niveau}</strong></td>
            <td>${escapeHtml((a.prenom || '') + ' ' + a.nom)}</td>
            <td class="text-right">${a.commission_propre ? fmtEUR(a.commission_propre) : '-'}</td>
            <td class="text-right">${a.commission_portefeuille ? fmtEUR(a.commission_portefeuille) : '-'}</td>
            <td class="text-right">${a.commission_n1 ? fmtEUR(a.commission_n1) : '-'}</td>
            <td class="text-right">${a.commission_n2 ? fmtEUR(a.commission_n2) : '-'}</td>
            <td class="text-right" style="font-weight:600">${fmtEUR(a.total)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted">Aucun agent</p>'}
    </div>

    ${(data.commandes || []).length ? `
    <div class="card">
      <div class="card-title" style="font-size:.95rem">
        <i class="fas fa-list"></i> Commandes (${data.commandes.length})
        ${isAdmin ? '<small class="text-muted" style="font-weight:normal;margin-left:.5rem">Cliquez sur une ligne pour ajuster</small>' : ''}
      </div>
      <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table class="data-table">
        <thead><tr>
          <th>Date</th><th>Marque</th>
          <th class="text-right">Brut</th>
          <th class="text-right">Net</th>
          <th class="text-right">DropEat</th>
          <th class="text-right">Comm agent</th>
          <th class="text-right">N+1</th><th class="text-right">N+2</th>
          ${isAdmin ? '<th class="text-right">Action</th>' : ''}
        </tr></thead>
        <tbody>${data.commandes.map(co => `
          <tr>
            <td style="font-size:.78rem">${fmtDateTime(co.date_commande)}</td>
            <td style="font-size:.8rem">${escapeHtml(co.marque_nom)}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR(co.montant_brut || 0)}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR(co.montant_net || 0)}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR(co.montant_facture_resto || 0)}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR((co.commission_agent_montant || 0) + (co.commission_portefeuille_montant || 0))}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR(co.commission_n1_montant || 0)}</td>
            <td class="text-right" style="font-size:.8rem">${fmtEUR(co.commission_n2_montant || 0)}</td>
            ${isAdmin ? `<td class="text-right"><button class="btn btn-sm btn-secondary" data-edit-cmd='${escapeHtml(JSON.stringify(co))}' title="Ajuster"><i class="fas fa-pen"></i></button></td>` : ''}
          </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="form-actions" style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
      ${isAdmin ? `
        <button type="button" class="btn btn-secondary" data-dl-csv><i class="fas fa-download"></i> Télécharger CSV</button>
        <button type="button" class="btn btn-secondary" data-recalc-modal><i class="fas fa-calculator"></i> Recalculer commissions</button>
        ${!pf ? '<button type="button" class="btn btn-primary" data-fact-modal><i class="fas fa-file-invoice"></i> Créer facture</button>' : ''}
      ` : ''}
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
    `,
    { size: 'xl' }
  )
  m.el.querySelector('[data-close]').onclick = () => m.close()

  // Bouton Télécharger CSV (admin)
  const dlBtn = m.el.querySelector('[data-dl-csv]')
  if (dlBtn) dlBtn.onclick = async () => {
    try {
      const resp = await fetch(baseEndpoint + '/' + imp.id + '/download', { credentials: 'include' })
      if (!resp.ok) { toast('Erreur téléchargement', 'error'); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `import-${imp.id}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast('CSV téléchargé')
    } catch (e) { toast('Erreur', 'error') }
  }

  // Bouton Recalculer (admin)
  const rcBtn = m.el.querySelector('[data-recalc-modal]')
  if (rcBtn) rcBtn.onclick = () => confirmDialog(
    'Recalculer les commissions de cet import ?',
    async () => {
      try {
        const { data: r } = await api.post(baseEndpoint + '/' + imp.id + '/recalculer')
        toast(`Commissions recalculées (${r.periodes_recalculees} période(s))`)
        m.close()
        navigate('imports')
      } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  )

  // Bouton Créer facture (admin, non-portefeuille)
  const factBtn = m.el.querySelector('[data-fact-modal]')
  if (factBtn) factBtn.onclick = async () => {
    try {
      const { data: r } = await api.post(baseEndpoint + '/' + imp.id + '/facturer')
      if (!r.success) { toast(r.error || 'Impossible', 'error'); return }
      confirmDialog(
        `Émettre une facture DropEat → ${imp.restaurant_nom}\nPériode : ${r.date_debut} → ${r.date_fin} ?`,
        async () => {
          try {
            const fres = await api.post('/factures/resto/create', {
              restaurant_id: r.restaurant_id,
              date_debut: r.date_debut,
              date_fin: r.date_fin
            })
            toast(`Facture ${fres.data.numero} créée — ${fmtEUR(fres.data.montant_ttc)}`)
            m.close()
            setTimeout(() => navigate('factures'), 600)
          } catch (e) { toast(e.response?.data?.error || 'Erreur création facture', 'error') }
        }
      )
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  // Édition d'une commande individuelle (admin)
  m.el.querySelectorAll('[data-edit-cmd]').forEach(b => b.onclick = () => {
    let co
    try { co = JSON.parse(b.dataset.editCmd) } catch { return }
    openEditCommandeModal(co, baseEndpoint, imp.id, () => { m.close(); navigate('imports') })
  })
}

// === Modal édition d'une commande ===
function openEditCommandeModal(co, baseEndpoint, importId, onSaved) {
  const m = openModal(
    `<i class="fas fa-pen"></i> Ajuster commande #${co.id}`,
    `
    <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:.6rem .8rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem">
      <i class="fas fa-info-circle"></i> Les ajustements manuels sont tracés (auditeur + date). Le recalcul automatique écrasera ces valeurs — utilisez « Recalculer » uniquement si voulu.
    </div>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem">
      <div class="form-group"><label>Montant brut</label><input id="ec_brut" type="number" step="0.01" value="${co.montant_brut || 0}"/></div>
      <div class="form-group"><label>Frais Uber</label><input id="ec_fu" type="number" step="0.01" value="${co.frais_uber || 0}"/></div>
      <div class="form-group"><label>Montant net</label><input id="ec_net" type="number" step="0.01" value="${co.montant_net || 0}"/></div>
      <div class="form-group"><label>Facturation DropEat</label><input id="ec_fact" type="number" step="0.01" value="${co.montant_facture_resto || 0}"/></div>
      <div class="form-group"><label>Comm. agent propre</label><input id="ec_ca" type="number" step="0.01" value="${co.commission_agent_montant || 0}"/></div>
      <div class="form-group"><label>Comm. portefeuille</label><input id="ec_cp" type="number" step="0.01" value="${co.commission_portefeuille_montant || 0}"/></div>
      <div class="form-group"><label>Comm. N+1</label><input id="ec_n1" type="number" step="0.01" value="${co.commission_n1_montant || 0}"/></div>
      <div class="form-group"><label>Comm. N+2</label><input id="ec_n2" type="number" step="0.01" value="${co.commission_n2_montant || 0}"/></div>
    </div>
    <div class="form-group" style="margin-top:.8rem">
      <label>Note d'ajustement (raison)</label>
      <textarea id="ec_notes" rows="2" placeholder="Ex: correction frais Uber suite refacturation"></textarea>
    </div>
    <div class="form-actions" style="margin-top:1rem;display:flex;gap:.5rem">
      <button type="button" class="btn btn-primary" data-save><i class="fas fa-save"></i> Enregistrer ajustement</button>
      <button type="button" class="btn btn-secondary" data-cancel>Annuler</button>
    </div>
    `,
    { size: 'lg' }
  )
  m.el.querySelector('[data-cancel]').onclick = () => m.close()
  m.el.querySelector('[data-save]').onclick = async () => {
    const payload = {
      montant_brut: parseFloat(m.el.querySelector('#ec_brut').value || 0),
      frais_uber: parseFloat(m.el.querySelector('#ec_fu').value || 0),
      montant_net: parseFloat(m.el.querySelector('#ec_net').value || 0),
      montant_facture_resto: parseFloat(m.el.querySelector('#ec_fact').value || 0),
      commission_agent_montant: parseFloat(m.el.querySelector('#ec_ca').value || 0),
      commission_portefeuille_montant: parseFloat(m.el.querySelector('#ec_cp').value || 0),
      commission_n1_montant: parseFloat(m.el.querySelector('#ec_n1').value || 0),
      commission_n2_montant: parseFloat(m.el.querySelector('#ec_n2').value || 0),
      notes_ajustement: m.el.querySelector('#ec_notes').value || null
    }
    try {
      await api.put(baseEndpoint + '/commandes/' + co.id, payload)
      toast('Commande ajustée')
      m.close()
      if (onSaved) onSaved()
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Commissions ---
PAGES['commissions'] = async (c) => {
  const now = new Date()
  let annee = now.getFullYear(), mois = now.getMonth() + 1
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Commissions</h1><div class="subtitle">Calcul automatique selon les paliers DropEat™</div></div>
    </div>
    <div class="card mb-3">
      <div class="form-grid">
        <div class="form-group"><label>Année</label><input id="annee" type="number" value="${annee}" min="2024" max="2030"/></div>
        <div class="form-group"><label>Mois</label>
          <select id="mois">${monthsFR.map((m, i) => `<option value="${i+1}" ${i+1===mois?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="display:flex;align-items:end"><button class="btn btn-primary" id="btnLoad"><i class="fas fa-calculator"></i> Calculer</button></div>
      </div>
    </div>
    <div id="commResult"></div>`
  const load = async () => {
    annee = parseInt(c.querySelector('#annee').value); mois = parseInt(c.querySelector('#mois').value)
    const { data } = await api.get(`/admin/commissions/recap?annee=${annee}&mois=${mois}`)
    renderCommissionsRecap(c.querySelector('#commResult'), data, true)
  }
  c.querySelector('#btnLoad').onclick = load
  await load()
}

function renderCommissionsRecap(box, data, isAdmin) {
  const t = data.totaux
  box.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card primary"><div class="stat-label">CA brut</div><div class="stat-value">${fmtEUR(t.ca_brut)}</div><div class="stat-extra">${fmtNum(t.nb_commandes)} commandes</div></div>
      <div class="stat-card accent"><div class="stat-label">Facturation DropEat → resto</div><div class="stat-value">${fmtEUR(t.facturation_dropeat)}</div></div>
      <div class="stat-card gold"><div class="stat-label">Commissions agents</div><div class="stat-value">${fmtEUR(t.commissions_agents_total)}</div></div>
      <div class="stat-card info"><div class="stat-label">Marge nette DropEat</div><div class="stat-value">${fmtEUR(t.marge_dropeat)}</div></div>
    </div>
    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-store"></i> Par restaurant</div>
      ${data.par_restaurant.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Restaurant</th><th class="text-right">Cmds</th><th class="text-right">CA</th>
          <th class="text-right">Facturation</th><th class="text-right">Commissions</th><th class="text-right">Marge</th></tr></thead>
        <tbody>${data.par_restaurant.map(r => `
          <tr>
            <td>${escapeHtml(r.restaurant_nom)}</td>
            <td class="text-right">${fmtNum(r.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(r.ca)}</td>
            <td class="text-right">${fmtEUR(r.facturation)}</td>
            <td class="text-right">${fmtEUR(r.commissions)}</td>
            <td class="text-right text-success">${fmtEUR(r.marge_dropeat)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted">Aucune commande</p>'}
    </div>
    ${isAdmin ? `
    <div class="card">
      <div class="card-title"><i class="fas fa-users"></i> Par agent (à payer)</div>
      ${data.par_agent.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Agent</th><th>Niveau</th>
          <th class="text-right">Standard</th><th class="text-right">Portefeuille</th>
          <th class="text-right">Sur N1</th><th class="text-right">Sur N2</th>
          <th class="text-right">Total</th><th class="text-right"></th></tr></thead>
        <tbody>${data.par_agent.map(a => `
          <tr>
            <td><strong>${escapeHtml(a.prenom)} ${escapeHtml(a.nom)}</strong></td>
            <td>${niveauPill(a.niveau)}</td>
            <td class="text-right">${fmtEUR(a.commission_propre)}<br><small class="text-muted">${a.nb_commandes_propres} cmds</small></td>
            <td class="text-right text-success">${fmtEUR(a.commission_portefeuille)}<br><small class="text-muted">${a.nb_commandes_portefeuille} cmds</small></td>
            <td class="text-right">${fmtEUR(a.commission_n1)}<br><small class="text-muted">${a.nb_commandes_n1} cmds</small></td>
            <td class="text-right">${fmtEUR(a.commission_n2)}<br><small class="text-muted">${a.nb_commandes_n2} cmds</small></td>
            <td class="text-right"><strong style="color:var(--primary-dark)">${fmtEUR(a.total)}</strong></td>
            <td class="text-right"><button class="btn btn-sm btn-primary" data-pay="${a.agent_id}" data-amount="${a.total}"><i class="fas fa-money-check"></i> Payer</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p class="text-muted">Aucune commission ce mois-ci</p>'}
    </div>` : ''}`

  if (isAdmin) {
    box.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => paiementModal({
      agent_id: parseInt(b.dataset.pay), montant: parseFloat(b.dataset.amount),
      periode_annee: data.periode.annee, periode_mois: data.periode.mois
    }))
  }
}

function paiementModal(p) {
  const m = modal('Enregistrer un paiement', `
    <form id="pForm">
      <div class="form-grid">
        <div class="form-group"><label>Période</label><input value="${monthsFR[p.periode_mois-1]} ${p.periode_annee}" disabled/></div>
        <div class="form-group"><label>Montant <span class="req">*</span></label><input id="montant" type="number" step="0.01" value="${p.montant.toFixed(2)}" required/></div>
        <div class="form-group"><label>Statut</label>
          <select id="statut">
            <option value="en_attente">En attente</option>
            <option value="paye" selected>Payé</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div class="form-group"><label>Date paiement</label><input id="date_paiement" type="date" value="${new Date().toISOString().substring(0,10)}"/></div>
        <div class="form-group"><label>Méthode</label>
          <select id="methode">
            <option value="virement">Virement</option>
            <option value="especes">Espèces</option>
            <option value="cheque">Chèque</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group"><label>Référence</label><input id="reference"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#pForm').onsubmit = async e => {
    e.preventDefault()
    try {
      await api.post('/admin/paiements', {
        agent_id: p.agent_id, periode_annee: p.periode_annee, periode_mois: p.periode_mois,
        montant: parseFloat(m.el.querySelector('#montant').value),
        statut: m.el.querySelector('#statut').value,
        date_paiement: m.el.querySelector('#date_paiement').value || null,
        methode: m.el.querySelector('#methode').value,
        reference: m.el.querySelector('#reference').value || null,
        notes: m.el.querySelector('#notes').value || null
      })
      toast('Paiement enregistré'); m.close(); navigate('paiements')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Paiements ---
PAGES['paiements'] = async (c) => {
  const { data } = await api.get('/admin/paiements')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Paiements</h1><div class="subtitle">${data.paiements.length} paiements enregistrés</div></div>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Période</th><th>Agent</th><th class="text-right">Montant</th><th>Statut</th><th>Date</th><th>Méthode</th><th>Réf.</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${data.paiements.length ? data.paiements.map(p => `
        <tr>
          <td>${monthsFR[p.periode_mois-1]} ${p.periode_annee}</td>
          <td>${escapeHtml(p.agent_prenom + ' ' + p.agent_nom)} ${niveauPill(p.agent_niveau)}</td>
          <td class="text-right"><strong>${fmtEUR(p.montant)}</strong></td>
          <td>${p.statut === 'paye' ? '<span class="badge badge-primary">Payé</span>' : p.statut === 'en_attente' ? '<span class="badge badge-accent">En attente</span>' : '<span class="badge badge-danger">Annulé</span>'}</td>
          <td>${fmtDate(p.date_paiement)}</td>
          <td>${escapeHtml(p.methode || '-')}</td>
          <td>${escapeHtml(p.reference || '-')}</td>
          <td class="text-right">
            ${p.statut !== 'paye' ? `<button class="btn btn-sm btn-success" data-pay="${p.id}"><i class="fas fa-check"></i></button>` : ''}
            <button class="btn btn-sm btn-danger" data-del="${p.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucun paiement</td></tr>'}
      </tbody>
    </table></div>`
  c.querySelectorAll('[data-pay]').forEach(b => b.onclick = async () => {
    await api.post(`/admin/paiements/${b.dataset.pay}/marquer-paye`, { date_paiement: new Date().toISOString().substring(0,10), methode: 'virement' })
    toast('Marqué comme payé'); navigate('paiements')
  })
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog('Supprimer ce paiement ?',
    async () => { await api.delete('/admin/paiements/' + b.dataset.del); toast('Supprimé'); navigate('paiements') }))
}

// ============================================================
// --- PROSPECTS (admin & agent) ---
// ============================================================
async function loadProspectsPage(c, baseEndpoint) {
  const [{ data: list }, { data: stats }] = await Promise.all([
    api.get(`${baseEndpoint}`),
    api.get(`${baseEndpoint}/stats`)
  ])
  const STATUTS = [
    { key: 'a_contacter', label: 'À contacter', color: '#94a3b8', icon: 'fa-phone' },
    { key: 'contacte', label: 'Contacté', color: '#3b82f6', icon: 'fa-envelope' },
    { key: 'rdv_planifie', label: 'RDV planifié', color: '#8b5cf6', icon: 'fa-calendar' },
    { key: 'negociation', label: 'Négociation', color: '#f59e0b', icon: 'fa-handshake' },
    { key: 'signe', label: 'Signé', color: '#10b981', icon: 'fa-check-circle' },
    { key: 'perdu', label: 'Perdu', color: '#ef4444', icon: 'fa-times-circle' }
  ]
  const byStatut = {}
  for (const p of list.prospects) {
    if (!byStatut[p.statut]) byStatut[p.statut] = []
    byStatut[p.statut].push(p)
  }
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-bullseye"></i> Prospection — Leads</h1>
        <div class="subtitle">Pipeline complet avec aide à la prospection IA</div>
      </div>
      <button class="btn btn-primary" id="btnNewProspect"><i class="fas fa-plus"></i> Nouveau prospect</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card primary"><div class="stat-label">Total leads</div><div class="stat-value">${stats.total}</div></div>
      <div class="stat-card gold"><div class="stat-label">Conversions</div><div class="stat-value">${stats.conversions}</div></div>
      <div class="stat-card accent"><div class="stat-label">Taux conversion</div><div class="stat-value">${stats.taux_conversion}%</div></div>
      <div class="stat-card info"><div class="stat-label">Relances 3 jours</div><div class="stat-value">${stats.relances_3j}</div></div>
    </div>
    <div class="kanban-board">
      ${STATUTS.map(s => `
        <div class="kanban-col" data-statut="${s.key}">
          <div class="kanban-head" style="border-color:${s.color}">
            <i class="fas ${s.icon}" style="color:${s.color}"></i>
            <span>${s.label}</span>
            <span class="kanban-count">${(byStatut[s.key] || []).length}</span>
          </div>
          <div class="kanban-list">
            ${(byStatut[s.key] || []).map(p => `
              <div class="kanban-card" data-id="${p.id}">
                <div class="kanban-title">${escapeHtml(p.nom_etablissement)}</div>
                ${p.contact_nom ? `<div class="kanban-meta"><i class="fas fa-user"></i> ${escapeHtml(p.contact_nom)} ${escapeHtml(p.contact_prenom || '')}</div>` : ''}
                ${p.ville ? `<div class="kanban-meta"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(p.ville)}</div>` : ''}
                ${p.telephone ? `<div class="kanban-meta"><i class="fas fa-phone"></i> ${escapeHtml(p.telephone)}</div>` : ''}
                <div class="kanban-foot">
                  <span class="score-pill" style="background:${p.score >= 70 ? '#dcfce7' : p.score >= 40 ? '#fef3c7' : '#fee2e2'};color:${p.score >= 70 ? '#166534' : p.score >= 40 ? '#92400e' : '#991b1b'}">Score ${p.score}</span>
                  ${p.agent_nom ? `<span class="kanban-agent">${escapeHtml(p.agent_nom)}</span>` : ''}
                </div>
              </div>
            `).join('') || '<div class="kanban-empty">Aucun</div>'}
          </div>
        </div>
      `).join('')}
    </div>`

  document.getElementById('btnNewProspect').onclick = () => prospectModal(null, baseEndpoint)
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.onclick = () => prospectDetailModal(parseInt(card.dataset.id), baseEndpoint)
  })
}

PAGES['prospects'] = async (c) => loadProspectsPage(c, '/admin/prospects')
PAGES['a-prospects'] = async (c) => loadProspectsPage(c, '/admin/prospects')

async function prospectModal(prospect, baseEndpoint) {
  const isEdit = !!prospect
  const html = `
    <div class="modal-overlay" id="prospectModal">
      <div class="modal-content" style="max-width:600px">
        <div class="modal-header">
          <h2><i class="fas fa-bullseye"></i> ${isEdit ? 'Modifier' : 'Nouveau'} prospect</h2>
          <button class="modal-close" onclick="document.getElementById('prospectModal').remove()">&times;</button>
        </div>
        <form id="prospectForm">
          <div class="form-group"><label>Nom établissement *</label><input id="pNom" required value="${escapeHtml(prospect?.nom_etablissement || '')}" /></div>
          <div class="form-row">
            <div class="form-group"><label>Contact nom</label><input id="pContactNom" value="${escapeHtml(prospect?.contact_nom || '')}" /></div>
            <div class="form-group"><label>Contact prénom</label><input id="pContactPrenom" value="${escapeHtml(prospect?.contact_prenom || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Téléphone</label><input id="pTel" value="${escapeHtml(prospect?.telephone || '')}" /></div>
            <div class="form-group"><label>Email</label><input id="pEmail" type="email" value="${escapeHtml(prospect?.email || '')}" /></div>
          </div>
          <div class="form-group"><label>Adresse</label><input id="pAdr" value="${escapeHtml(prospect?.adresse || '')}" /></div>
          <div class="form-row">
            <div class="form-group"><label>Code postal</label><input id="pCp" value="${escapeHtml(prospect?.code_postal || '')}" /></div>
            <div class="form-group"><label>Ville</label><input id="pVille" value="${escapeHtml(prospect?.ville || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Type cuisine</label>
              <select id="pCuisine">
                <option value="">--</option>
                <option ${prospect?.type_cuisine === 'pizza' ? 'selected' : ''}>pizza</option>
                <option ${prospect?.type_cuisine === 'burger' ? 'selected' : ''}>burger</option>
                <option ${prospect?.type_cuisine === 'asiatique' ? 'selected' : ''}>asiatique</option>
                <option ${prospect?.type_cuisine === 'kebab' ? 'selected' : ''}>kebab</option>
                <option ${prospect?.type_cuisine === 'libanais' ? 'selected' : ''}>libanais</option>
                <option ${prospect?.type_cuisine === 'mexicain' ? 'selected' : ''}>mexicain</option>
                <option ${prospect?.type_cuisine === 'indien' ? 'selected' : ''}>indien</option>
                <option ${prospect?.type_cuisine === 'healthy' ? 'selected' : ''}>healthy</option>
              </select>
            </div>
            <div class="form-group"><label>Source</label>
              <select id="pSource">
                <option value="terrain">Terrain</option>
                <option value="referral">Recommandation</option>
                <option value="ubereats">Uber Eats</option>
                <option value="deliveroo">Deliveroo</option>
                <option value="web">Web</option>
                <option value="inconnu">Inconnu</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Statut</label>
              <select id="pStatut">
                <option value="a_contacter">À contacter</option>
                <option value="contacte">Contacté</option>
                <option value="rdv_planifie">RDV planifié</option>
                <option value="negociation">Négociation</option>
                <option value="signe">Signé</option>
                <option value="perdu">Perdu</option>
              </select>
            </div>
            <div class="form-group"><label>Prochaine relance</label><input id="pRelance" type="date" value="${prospect?.prochaine_relance || ''}" /></div>
          </div>
          <div class="form-group"><label>Notes</label><textarea id="pNotes" rows="3">${escapeHtml(prospect?.notes || '')}</textarea></div>
          <div class="modal-footer">
            <button type="button" class="btn" onclick="document.getElementById('prospectModal').remove()">Annuler</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </form>
      </div>
    </div>`
  document.body.insertAdjacentHTML('beforeend', html)
  if (prospect?.statut) document.getElementById('pStatut').value = prospect.statut
  if (prospect?.source) document.getElementById('pSource').value = prospect.source

  document.getElementById('prospectForm').onsubmit = async e => {
    e.preventDefault()
    const payload = {
      nom_etablissement: document.getElementById('pNom').value,
      contact_nom: document.getElementById('pContactNom').value,
      contact_prenom: document.getElementById('pContactPrenom').value,
      telephone: document.getElementById('pTel').value,
      email: document.getElementById('pEmail').value,
      adresse: document.getElementById('pAdr').value,
      code_postal: document.getElementById('pCp').value,
      ville: document.getElementById('pVille').value,
      type_cuisine: document.getElementById('pCuisine').value,
      source: document.getElementById('pSource').value,
      statut: document.getElementById('pStatut').value,
      prochaine_relance: document.getElementById('pRelance').value || null,
      notes: document.getElementById('pNotes').value
    }
    try {
      if (isEdit) {
        await api.put(`${baseEndpoint}/${prospect.id}`, payload)
        toast('Prospect modifié', 'success')
      } else {
        await api.post(baseEndpoint, payload)
        toast('Prospect créé', 'success')
      }
      document.getElementById('prospectModal').remove()
      navigate(CURRENT_PAGE)
    } catch (e) { toast(e.message || 'Erreur', 'error') }
  }
}

async function prospectDetailModal(id, baseEndpoint) {
  const { data } = await api.get(`${baseEndpoint}/${id}`)
  const p = data.prospect
  const html = `
    <div class="modal-overlay" id="prospectDetail">
      <div class="modal-content" style="max-width:700px">
        <div class="modal-header">
          <h2>${escapeHtml(p.nom_etablissement)}</h2>
          <button class="modal-close" onclick="document.getElementById('prospectDetail').remove()">&times;</button>
        </div>
        <div class="prospect-info">
          <div><strong>Contact :</strong> ${escapeHtml((p.contact_nom || '') + ' ' + (p.contact_prenom || '')) || '—'}</div>
          <div><strong>Tél :</strong> ${escapeHtml(p.telephone || '—')} · <strong>Email :</strong> ${escapeHtml(p.email || '—')}</div>
          <div><strong>Lieu :</strong> ${escapeHtml(p.adresse || '')} ${escapeHtml(p.code_postal || '')} ${escapeHtml(p.ville || '')}</div>
          <div><strong>Cuisine :</strong> ${escapeHtml(p.type_cuisine || '—')} · <strong>Source :</strong> ${escapeHtml(p.source || '—')}</div>
          <div><strong>Statut :</strong> <span class="badge">${escapeHtml(p.statut)}</span> · <strong>Score :</strong> ${p.score}</div>
          <div><strong>Agent assigné :</strong> ${escapeHtml(p.agent_nom || '—')}</div>
          ${p.notes ? `<div><strong>Notes :</strong> ${escapeHtml(p.notes)}</div>` : ''}
        </div>
        <div class="action-bar">
          <button class="btn btn-sm" id="btnAddAction"><i class="fas fa-plus"></i> Action</button>
          <button class="btn btn-sm btn-primary" id="btnConvert" ${p.restaurant_cree_id ? 'disabled' : ''}><i class="fas fa-store"></i> Convertir en restaurant</button>
          <button class="btn btn-sm" id="btnEditProspect"><i class="fas fa-edit"></i> Modifier</button>
          <button class="btn btn-sm btn-danger" id="btnDelProspect"><i class="fas fa-trash"></i> Archiver</button>
        </div>
        <h3 class="mt-3"><i class="fas fa-clock"></i> Timeline (${data.actions.length})</h3>
        <div class="timeline">
          ${data.actions.length ? data.actions.map(a => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="timeline-head"><strong>${escapeHtml(a.type_action)}</strong> · ${escapeHtml(a.user_nom)} · <small>${fmtDateTime(a.created_at)}</small></div>
                <div>${escapeHtml(a.description || '')}</div>
              </div>
            </div>
          `).join('') : '<p class="text-muted">Aucune action enregistrée</p>'}
        </div>
      </div>
    </div>`
  document.body.insertAdjacentHTML('beforeend', html)

  document.getElementById('btnAddAction').onclick = async () => {
    const type = prompt('Type (appel/email/rdv/sms/note/relance) :', 'appel')
    if (!type) return
    const desc = prompt('Description :', '')
    await api.post(`${baseEndpoint}/${id}/action`, { type_action: type, description: desc })
    document.getElementById('prospectDetail').remove()
    prospectDetailModal(id, baseEndpoint)
  }
  document.getElementById('btnConvert').onclick = async () => {
    if (!confirm('Convertir ce prospect en restaurant ?')) return
    try {
      const { data } = await api.post(`${baseEndpoint}/${id}/convert`)
      toast(`Restaurant #${data.restaurant_id} créé`, 'success')
      document.getElementById('prospectDetail').remove()
      navigate(CURRENT_PAGE)
    } catch (e) { toast(e.message || 'Erreur', 'error') }
  }
  document.getElementById('btnEditProspect').onclick = () => {
    document.getElementById('prospectDetail').remove()
    prospectModal(p, baseEndpoint)
  }
  document.getElementById('btnDelProspect').onclick = async () => {
    if (!confirm('Archiver ce prospect ?')) return
    await api.delete(`${baseEndpoint}/${id}`)
    toast('Archivé', 'success')
    document.getElementById('prospectDetail').remove()
    navigate(CURRENT_PAGE)
  }
}

// --- IA Prospection : stand-by (feature désactivée) ---
PAGES['prospect-ai'] = async (c) => {
  c.innerHTML = `
    <div class="page-header"><div>
      <h1><i class="fas fa-pause-circle"></i> IA Prospection</h1>
      <div class="subtitle">Fonctionnalité en stand-by</div>
    </div></div>
    <div class="card"><p class="text-muted">Cette section est temporairement mise en stand-by et sera réactivée prochainement.</p></div>`
}
PAGES['a-prospect-ai'] = PAGES['prospect-ai']

// ============================================================
// --- ATTRIBUTIONS (5e marque) ---
// ============================================================
PAGES['attributions'] = async (c) => {
  const { data } = await api.get('/admin/attribution/demandes')
  const enAttente = data.demandes.filter(d => d.statut === 'en_attente')
  const traitees = data.demandes.filter(d => d.statut !== 'en_attente')

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-trophy" style="color:var(--gold, #FFB800)"></i> Demandes d'attribution 5ᵉ marque</h1>
        <div class="subtitle">${enAttente.length} en attente · ${traitees.length} traitée(s) · Validation superadmin</div>
      </div>
    </div>

    <div class="card portfolio-banner mb-3" style="display:grid;grid-template-columns:200px 1fr;gap:1rem;align-items:center;background:linear-gradient(135deg,#fef3c7 0%,#f0fdf4 100%);border-left:4px solid var(--gold, #FFB800)">
      <img src="/static/img/portfolio-rule-100.jpg" alt="Règle 100% portefeuille"
           style="width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08)" />
      <div>
        <strong style="font-size:1rem;color:#92400e"><i class="fas fa-circle-info"></i> Procédure de validation</strong>
        <p style="font-size:.88rem;line-height:1.5;margin:.4rem 0 .6rem">
          L'agent propose une marque parmi ses marques éligibles. À votre validation,
          la marque devient <strong>portefeuille propriétaire</strong> (commission 100%) et est ajoutée
          à la <strong>tranche en cours</strong> de l'agent. La 5ᵉ position clôture la tranche.
        </p>
        <div style="background:white;padding:.5rem .7rem;border-radius:6px;font-size:.82rem;border:1px solid #fbbf24">
          <i class="fas fa-arrow-right"></i> Si une marque héritée est concernée, elle est automatiquement
          décalée vers la <strong>tranche suivante (position 1)</strong>.
        </div>
      </div>
    </div>

    ${enAttente.length ? `
      <div class="card mb-3" style="border-left:4px solid var(--warning, #ea8a00)">
        <div class="card-title"><i class="fas fa-clock"></i> En attente de votre décision (${enAttente.length})</div>
        <table class="data-table">
          <thead><tr><th>Date</th><th>Agent</th><th>Marque proposée</th><th>Restaurant</th><th>Tranche</th><th class="text-right">Actions</th></tr></thead>
          <tbody>${enAttente.map(d => `
            <tr style="background:#fffbeb">
              <td>${fmtDate(d.created_at)}</td>
              <td><strong>${escapeHtml(d.agent_nom)}</strong></td>
              <td>${escapeHtml(d.marque_nom)} <small class="text-muted">(${escapeHtml(d.plateforme)})</small></td>
              <td>${escapeHtml(d.restaurant_nom)} · ${escapeHtml(d.ville || '')}</td>
              <td><span class="badge badge-slate">#${d.numero_tranche}</span></td>
              <td class="text-right">
                <button class="btn btn-sm btn-primary" data-action="validate" data-id="${d.id}"><i class="fas fa-check"></i> Valider</button>
                <button class="btn btn-sm btn-danger" data-action="reject" data-id="${d.id}"><i class="fas fa-times"></i> Refuser</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}

    <div class="card">
      <div class="card-title"><i class="fas fa-clock-rotate-left"></i> Historique (${traitees.length})</div>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Agent</th><th>Marque</th><th>Restaurant</th><th>Tranche</th><th>Statut</th><th>Notes</th></tr></thead>
        <tbody>${traitees.length ? traitees.map(d => `
          <tr>
            <td>${fmtDate(d.created_at)}</td>
            <td>${escapeHtml(d.agent_nom)}</td>
            <td>${escapeHtml(d.marque_nom)} <small class="text-muted">(${escapeHtml(d.plateforme)})</small></td>
            <td>${escapeHtml(d.restaurant_nom)} · ${escapeHtml(d.ville || '')}</td>
            <td>#${d.numero_tranche}</td>
            <td>${d.statut === 'validee' ? '<span class="badge badge-gold"><i class="fas fa-crown"></i> VALIDÉE</span>' : '<span class="badge badge-danger"><i class="fas fa-times"></i> REFUSÉE</span>'}</td>
            <td><small class="text-muted">${escapeHtml(d.notes_validateur || '—')}</small></td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucun historique</td></tr>'}</tbody>
      </table>
    </div>`
  document.querySelectorAll('[data-action="validate"], [data-action="reject"]').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id
      const decision = b.dataset.action === 'validate' ? 'validee' : 'refusee'
      const notes = prompt(decision === 'validee' ? 'Notes de validation (optionnel) :' : 'Motif du refus (optionnel) :', '')
      try {
        await api.put(`/admin/attribution/demande/${id}/decision`, { decision, notes })
        toast(decision === 'validee' ? '✓ Demande validée — marque en portefeuille 100%' : 'Demande refusée', 'success')
        navigate('attributions')
      } catch (e) { toast(e.response?.data?.error || e.message || 'Erreur', 'error') }
    }
  })
}

// Page agent: choisir sa 5e marque
PAGES['a-attribution'] = async (c) => {
  const [{ data: elig }, { data: dem }] = await Promise.all([
    api.get('/admin/attribution/eligibles'),
    api.get('/admin/attribution/demandes')
  ])
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-trophy" style="color:var(--gold, #FFB800)"></i> Choisir ma 5ᵉ marque propriétaire</h1>
        <div class="subtitle">À chaque tranche, sélectionnez la marque qui rejoindra votre portefeuille (commission 100%)</div>
      </div>
    </div>
    <div class="card portfolio-banner mb-3" style="display:grid;grid-template-columns:240px 1fr;gap:1.2rem;align-items:center;background:linear-gradient(135deg,#fef3c7 0%,#f0fdf4 100%);border-left:4px solid var(--gold, #FFB800)">
      <img src="/static/img/portfolio-rule-100.jpg" alt="Règle 100% portefeuille"
           style="width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08)" />
      <div>
        <strong style="font-size:1.05rem;color:#92400e"><i class="fas fa-circle-info"></i> Règle Portefeuille 100%</strong>
        <p style="font-size:.92rem;line-height:1.5;margin:.4rem 0">
          Tous les <strong>5 éléments qualifiés</strong> (restaurants OU marques), une attribution est ouverte.
          Vous proposez <strong>UNE marque</strong> parmi celles éligibles ci-dessous, le superadmin valide,
          puis vous touchez <strong style="color:var(--gold, #FFB800)">100% de la commission</strong> sur ses commandes.
        </p>
        <div style="background:white;padding:.6rem .8rem;border-radius:6px;font-size:.85rem;border:1px solid #fbbf24">
          <i class="fas fa-lightbulb" style="color:#ea8a00"></i>
          <strong>Astuce :</strong> si la 5ᵉ position concerne un restaurant attribué, sa
          <strong>1ʳᵉ marque héritée</strong> bascule automatiquement dans la tranche suivante (position 1)
          — elle ne compte pas dans le calcul de la tranche en cours.
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-list-check"></i> Mes marques éligibles</div>
      <table class="data-table">
        <thead><tr><th>Marque</th><th>Plateforme</th><th>Restaurant</th><th class="text-right">Cmds</th><th class="text-right">CA total</th><th>Action</th></tr></thead>
        <tbody>${elig.marques_eligibles.length ? elig.marques_eligibles.map(m => `
          <tr>
            <td>${escapeHtml(m.nom)}</td>
            <td>${escapeHtml(m.plateforme)}</td>
            <td>${escapeHtml(m.restaurant_nom)} · ${escapeHtml(m.ville || '')}</td>
            <td class="text-right">${fmtNum(m.nb_commandes)}</td>
            <td class="text-right"><strong>${fmtEUR(m.ca_total)}</strong></td>
            <td><button class="btn btn-xs btn-primary" data-marque="${m.id}"><i class="fas fa-flag"></i> Proposer</button></td>
          </tr>
        `).join('') : '<tr><td colspan="6" class="text-muted text-center">Aucune marque éligible. Créez d\'abord vos marques.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card mt-3">
      <div class="card-title"><i class="fas fa-clock-rotate-left"></i> Mes demandes</div>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Marque</th><th>Tranche</th><th>Statut</th><th>Notes</th></tr></thead>
        <tbody>${dem.demandes.length ? dem.demandes.map(d => `
          <tr>
            <td>${fmtDate(d.created_at)}</td>
            <td>${escapeHtml(d.marque_nom)}</td>
            <td>#${d.numero_tranche}</td>
            <td>${d.statut === 'en_attente' ? '<span class="badge badge-warn">EN ATTENTE</span>' : d.statut === 'validee' ? '<span class="badge badge-gold">VALIDÉE</span>' : '<span class="badge badge-danger">REFUSÉE</span>'}</td>
            <td><small>${escapeHtml(d.notes_validateur || '—')}</small></td>
          </tr>
        `).join('') : '<tr><td colspan="5" class="text-muted text-center">Aucune demande</td></tr>'}</tbody>
      </table>
    </div>`
  document.querySelectorAll('[data-marque]').forEach(b => {
    b.onclick = async () => {
      const marque_id = parseInt(b.dataset.marque)
      const motif = prompt('Motif de votre choix (optionnel) :', '')
      try {
        await api.post('/admin/attribution/demande', { marque_id, motif })
        toast('Demande envoyée au superadmin', 'success')
        navigate('a-attribution')
      } catch (e) { toast(e.message || 'Erreur', 'error') }
    }
  })
}

// ============================================================
// --- OMNIPOTENCE SUPERADMIN ---
// ============================================================
PAGES['omnipotence'] = async (c) => {
  const [{ data: users }, { data: masques }] = await Promise.all([
    api.get('/admin/users'),
    api.get('/admin/omnipotence/users-masques')
  ])
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-user-shield"></i> Pouvoirs 2000% Superadmin</h1>
        <div class="subtitle">Contrôle absolu sur la hiérarchie, les attributions et les commissions</div>
      </div>
    </div>
    <div class="info-banner" style="background:#fee2e2;color:#991b1b;padding:1rem;border-radius:8px;margin-bottom:1rem">
      <i class="fas fa-exclamation-triangle"></i>
      <strong>Mode omnipotent activé.</strong> Toutes les actions sont enregistrées dans l'audit invisible.
      Les agents ne voient pas ces opérations dans leur historique.
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-eye-slash"></i> Visibilité hiérarchie</div>
      <table class="data-table">
        <thead><tr><th>User</th><th>Email</th><th>Niveau</th><th>Parent visible ?</th><th>Masqué entièrement ?</th><th>Actions</th></tr></thead>
        <tbody>${users.users.map(u => `
          <tr>
            <td>${escapeHtml(u.prenom)} ${escapeHtml(u.nom)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td>${niveauPill(u.niveau)}</td>
            <td>${u.parent_visible_par_enfant !== 0 ? '<i class="fas fa-eye text-success"></i> Visible' : '<i class="fas fa-eye-slash text-danger"></i> Caché'}</td>
            <td>${u.masque_par_admin === 1 ? '<i class="fas fa-ghost text-danger"></i> Masqué' : '—'}</td>
            <td>
              <button class="btn btn-xs" data-omni="parent" data-user="${u.id}" data-current="${u.parent_visible_par_enfant !== 0 ? 1 : 0}">
                ${u.parent_visible_par_enfant !== 0 ? 'Cacher parent' : 'Réafficher parent'}
              </button>
              <button class="btn btn-xs" data-omni="masque" data-user="${u.id}" data-current="${u.masque_par_admin === 1 ? 1 : 0}">
                ${u.masque_par_admin === 1 ? 'Réafficher' : 'Masquer'}
              </button>
              <button class="btn btn-xs" data-omni="reparent" data-user="${u.id}">Réassigner</button>
              <button class="btn btn-xs btn-warn" data-omni="password" data-user="${u.id}">Reset MdP</button>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>`

  document.querySelectorAll('[data-omni]').forEach(b => {
    b.onclick = async () => {
      const action = b.dataset.omni
      const userId = b.dataset.user
      try {
        if (action === 'parent') {
          const visible = b.dataset.current === '1' ? 0 : 1
          await api.put(`/admin/omnipotence/user/${userId}/parent-visible`, { visible })
          toast(visible ? 'Parent visible' : 'Parent caché', 'success')
        } else if (action === 'masque') {
          const masque = b.dataset.current === '1' ? 0 : 1
          await api.put(`/admin/omnipotence/user/${userId}/masque`, { masque })
          toast(masque ? 'User masqué' : 'User réaffiché', 'success')
        } else if (action === 'reparent') {
          const newParent = prompt('Nouveau parent_id (vide = racine) :', '')
          const niveau = prompt('Nouveau niveau (0/1/2) :', '1')
          const motif = prompt('Motif :', '')
          await api.put(`/admin/omnipotence/user/${userId}/reparent`, {
            parent_id: newParent ? parseInt(newParent) : null,
            niveau: niveau ? parseInt(niveau) : undefined,
            motif
          })
          toast('Réassignation effectuée', 'success')
        } else if (action === 'password') {
          const pwd = prompt('Nouveau mot de passe (≥6 car.) :', '')
          if (!pwd || pwd.length < 6) return
          await api.put(`/admin/omnipotence/user/${userId}/password`, { new_password: pwd })
          toast('Mot de passe réinitialisé', 'success')
        }
        navigate('omnipotence')
      } catch (e) { toast(e.message || 'Erreur', 'error') }
    }
  })
}

PAGES['audit'] = async (c) => {
  const { data } = await api.get('/admin/omnipotence/audit?limit=200')
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-eye-slash"></i> Audit invisible (réservé superadmin)</h1>
        <div class="subtitle">Historique des actions omnipotentes — invisibles aux agents</div>
      </div>
    </div>
    <div class="card">
      <table class="data-table">
        <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Cible</th><th>Détails</th><th>Visible ?</th></tr></thead>
        <tbody>${data.logs.map(l => `
          <tr>
            <td>${fmtDateTime(l.created_at)}</td>
            <td>${escapeHtml(l.user_nom || '—')}</td>
            <td><code>${escapeHtml(l.action)}</code></td>
            <td>${escapeHtml(l.entity_type || '')} #${l.entity_id || '—'}</td>
            <td><small>${escapeHtml(l.details || '')}</small></td>
            <td>${l.visible_agent === 0 ? '<span class="badge badge-danger">CACHÉ</span>' : '<span class="badge">Public</span>'}</td>
          </tr>
        `).join('') || '<tr><td colspan="6" class="text-muted text-center">Aucune action</td></tr>'}</tbody>
      </table>
    </div>`
}

// --- Dérogations 100% exceptionnelles ---
PAGES['derogations'] = async (c) => {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-star"></i> Dérogations 100% exceptionnelles</h1>
        <div class="subtitle">Octroyer ponctuellement 100% de la facturation à un agent (hors régime Portefeuille Propriétaire)</div>
      </div>
      <button class="btn btn-primary" id="btn-nouvelle-derog"><i class="fas fa-plus"></i> Nouvelle dérogation</button>
    </div>

    <div class="card mb-3" style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;">
      <div style="font-size:13px;color:#78350f;">
        <i class="fas fa-info-circle"></i> <strong>Règles métier :</strong>
        Une dérogation 100% reverse la totalité de la facturation à l'agent (DropEat marge = 0, pas de remontée N+1/N+2).
        Elle ne peut s'appliquer qu'à un resto/marque <strong>NON</strong> en portefeuille propriétaire.
        Pour les Portefeuilles Propriétaires, le régime 100% est déjà actif via le contrat signé.
      </div>
    </div>

    <div class="filters">
      <select id="filter-statut" class="form-control">
        <option value="">Tous statuts</option>
        <option value="active">Actives</option>
        <option value="cloturee">Clôturées</option>
        <option value="expiree">Expirées</option>
      </select>
    </div>

    <div id="derog-list">Chargement…</div>
  `

  async function loadList() {
    const statut = c.querySelector('#filter-statut').value
    const params = statut ? `?statut=${statut}` : ''
    const { data } = await api.get(`/admin/derogations${params}`)
    const list = data.derogations || []
    const listEl = c.querySelector('#derog-list')
    if (list.length === 0) {
      listEl.innerHTML = '<div class="card empty-state"><i class="fas fa-inbox"></i><div>Aucune dérogation pour le moment</div></div>'
      return
    }
    listEl.innerHTML = `
      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Cible</th>
              <th>Agent bénéficiaire</th>
              <th>Période</th>
              <th>Motif</th>
              <th>Créée par</th>
              <th>Statut</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(d => `
              <tr>
                <td>#${d.id}</td>
                <td>
                  ${d.marque_id
                    ? `<span class="badge badge-info"><i class="fas fa-tag"></i> Marque</span><br><strong>${d.marque_nom || '—'}</strong>`
                    : `<span class="badge badge-secondary"><i class="fas fa-store"></i> Restaurant</span><br><strong>${d.restaurant_nom || '—'}</strong>`}
                </td>
                <td>${d.agent_prenom || ''} ${d.agent_nom || ''}<br><small>${d.agent_email || ''}</small></td>
                <td>${d.date_debut}<br>→ ${d.date_fin || '<em>ouvert</em>'}</td>
                <td><small>${(d.motif || '').substring(0, 80)}${(d.motif || '').length > 80 ? '…' : ''}</small></td>
                <td><small>${d.cree_par_prenom || ''} ${d.cree_par_nom || ''}<br>${d.cree_at ? new Date(d.cree_at).toLocaleDateString('fr-FR') : ''}</small></td>
                <td>
                  ${d.statut === 'active' ? '<span class="badge badge-success">Active</span>' :
                    d.statut === 'cloturee' ? '<span class="badge badge-secondary">Clôturée</span>' :
                    '<span class="badge badge-warning">Expirée</span>'}
                </td>
                <td class="text-right">
                  <button class="btn btn-sm btn-secondary" data-view="${d.id}" title="Voir détail + impact"><i class="fas fa-eye"></i></button>
                  ${d.statut === 'active' ? `<button class="btn btn-sm btn-warning" data-cloturer="${d.id}" title="Clôturer"><i class="fas fa-stop"></i></button>` : ''}
                  ${d.statut === 'active' ? `<button class="btn btn-sm btn-danger" data-del="${d.id}" title="Supprimer (si pas de commandes)"><i class="fas fa-trash"></i></button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `

    // Click handlers
    listEl.querySelectorAll('[data-view]').forEach(b => b.onclick = () => openDerogDetailModal(b.dataset.view, loadList))
    listEl.querySelectorAll('[data-cloturer]').forEach(b => b.onclick = async () => {
      const motif = prompt('Motif de clôture (min 3 caractères) :')
      if (!motif || motif.trim().length < 3) return
      try {
        await api.post(`/admin/derogations/${b.dataset.cloturer}/cloturer`, { motif_cloture: motif })
        toast('Dérogation clôturée + recalcul des commissions effectué')
        loadList()
      } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
    })
    listEl.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('Supprimer définitivement cette dérogation ? (impossible si des commandes y sont déjà rattachées)')) return
      try {
        await api.delete(`/admin/derogations/${b.dataset.del}`)
        toast('Supprimée')
        loadList()
      } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
    })
  }

  c.querySelector('#filter-statut').onchange = loadList
  c.querySelector('#btn-nouvelle-derog').onclick = () => openDerogCreateModal(loadList)
  await loadList()
}

// Modal : créer une dérogation
async function openDerogCreateModal(onSaved) {
  // Charger les éligibles + commerciaux
  const [eligRes, usersRes] = await Promise.all([
    api.get('/admin/derogations/eligibles'),
    api.get('/admin/agents-crud')
  ])
  const restaurants = eligRes.data.restaurants || []
  const marques = eligRes.data.marques || []
  const agents = (usersRes.data.agents || usersRes.data || []).filter(u => ['agent_commercial', 'sous_agent_n1', 'sous_agent_n2', 'agent', 'commercial'].includes(u.role) || u.niveau != null)

  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-header">
        <h3><i class="fas fa-star"></i> Nouvelle dérogation 100%</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Type de cible *</label>
          <div style="display:flex;gap:12px;">
            <label><input type="radio" name="cibleType" value="restaurant" checked> Restaurant entier</label>
            <label><input type="radio" name="cibleType" value="marque"> Marque virtuelle</label>
          </div>
        </div>

        <div class="form-group" id="grp-resto">
          <label>Restaurant *</label>
          <select id="cible-resto" class="form-control">
            <option value="">— Choisir —</option>
            ${restaurants.map(r => `<option value="${r.id}" data-agent="${r.agent_id || ''}">
              ${r.nom} (${r.ville || ''}) ${r.agent_prenom ? '- ' + r.agent_prenom + ' ' + r.agent_nom : '⚠️ aucun agent'}
              ${r.nb_derogations_actives > 0 ? ' [⚠️ ' + r.nb_derogations_actives + ' active(s)]' : ''}
            </option>`).join('')}
          </select>
        </div>

        <div class="form-group" id="grp-marque" style="display:none;">
          <label>Marque virtuelle *</label>
          <select id="cible-marque" class="form-control">
            <option value="">— Choisir —</option>
            ${marques.map(m => `<option value="${m.id}" data-agent="${m.agent_id || ''}">
              ${m.nom} (resto: ${m.restaurant_nom || '?'}) ${m.agent_prenom ? '- ' + m.agent_prenom + ' ' + m.agent_nom : '⚠️ aucun agent'}
              ${m.nb_derogations_actives > 0 ? ' [⚠️ ' + m.nb_derogations_actives + ' active(s)]' : ''}
            </option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Agent bénéficiaire * <small>(par défaut : agent rattaché au resto/marque)</small></label>
          <select id="agent-id" class="form-control" required>
            <option value="">— Choisir —</option>
            ${agents.map(a => `<option value="${a.id}">${a.prenom || ''} ${a.nom || ''} (${a.email || ''})</option>`).join('')}
          </select>
        </div>

        <div class="form-row" style="display:flex;gap:12px;">
          <div class="form-group" style="flex:1;">
            <label>Date début *</label>
            <input type="date" id="date-debut" class="form-control" value="${new Date().toISOString().substring(0, 10)}" required>
          </div>
          <div class="form-group" style="flex:1;">
            <label>Date fin <small>(vide = ouverte)</small></label>
            <input type="date" id="date-fin" class="form-control">
          </div>
        </div>

        <div class="form-group">
          <label>Motif * <small>(obligatoire pour audit)</small></label>
          <textarea id="motif" class="form-control" rows="3" placeholder="Ex: Récompense exceptionnelle pour performance commerciale Mai 2026" required></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-close">Annuler</button>
        <button class="btn btn-primary" id="btn-save"><i class="fas fa-save"></i> Créer la dérogation</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  // Toggle resto/marque
  modal.querySelectorAll('input[name=cibleType]').forEach(r => r.onchange = () => {
    const type = modal.querySelector('input[name=cibleType]:checked').value
    modal.querySelector('#grp-resto').style.display = type === 'restaurant' ? '' : 'none'
    modal.querySelector('#grp-marque').style.display = type === 'marque' ? '' : 'none'
  })

  // Auto-sélection agent quand on choisit une cible
  const autoFillAgent = (sel) => {
    const opt = sel.options[sel.selectedIndex]
    const aid = opt?.dataset?.agent
    if (aid) modal.querySelector('#agent-id').value = aid
  }
  modal.querySelector('#cible-resto').onchange = (e) => autoFillAgent(e.target)
  modal.querySelector('#cible-marque').onchange = (e) => autoFillAgent(e.target)

  // Close handlers
  modal.querySelectorAll('.modal-close').forEach(b => b.onclick = () => modal.remove())

  // Save
  modal.querySelector('#btn-save').onclick = async () => {
    const type = modal.querySelector('input[name=cibleType]:checked').value
    const cibleId = type === 'restaurant'
      ? modal.querySelector('#cible-resto').value
      : modal.querySelector('#cible-marque').value
    if (!cibleId) { toast('Choisissez une cible', 'error'); return }
    const agentId = modal.querySelector('#agent-id').value
    if (!agentId) { toast('Choisissez un agent bénéficiaire', 'error'); return }
    const dateDebut = modal.querySelector('#date-debut').value
    const dateFin = modal.querySelector('#date-fin').value || null
    const motif = modal.querySelector('#motif').value.trim()
    if (!dateDebut) { toast('Date début obligatoire', 'error'); return }
    if (motif.length < 3) { toast('Motif obligatoire (min 3 caractères)', 'error'); return }

    const body = {
      agent_id: parseInt(agentId),
      date_debut: dateDebut,
      date_fin: dateFin,
      motif
    }
    if (type === 'restaurant') body.restaurant_id = parseInt(cibleId)
    else body.marque_id = parseInt(cibleId)

    try {
      await api.post('/admin/derogations', body)
      toast('Dérogation créée + recalcul des commissions effectué')
      modal.remove()
      onSaved?.()
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }
}

// Modal : voir détail + impact
async function openDerogDetailModal(id, onClosed) {
  try {
    const { data } = await api.get(`/admin/derogations/${id}`)
    const d = data.derogation
    const impact = data.impact || {}
    const modal = document.createElement('div')
    modal.className = 'modal-overlay'
    modal.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3><i class="fas fa-star"></i> Dérogation #${d.id}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><strong>Cible :</strong><br>${d.marque_id ? '🏷️ Marque <strong>' + (d.marque_nom || '—') + '</strong>' : '🏪 Restaurant <strong>' + (d.restaurant_nom || '—') + '</strong>'}</div>
            <div><strong>Agent :</strong><br>${d.agent_prenom || ''} ${d.agent_nom || ''}<br><small>${d.agent_email || ''}</small></div>
            <div><strong>Période :</strong><br>${d.date_debut} → ${d.date_fin || 'ouvert'}</div>
            <div><strong>Statut :</strong><br>${d.statut}</div>
          </div>
          <hr/>
          <div><strong>Motif :</strong><br><em>${d.motif || ''}</em></div>
          ${d.motif_cloture ? `<div style="margin-top:8px;"><strong>Motif clôture :</strong><br><em>${d.motif_cloture}</em></div>` : ''}
          <hr/>
          <div><strong>Créée par :</strong> ${d.cree_par_prenom || ''} ${d.cree_par_nom || ''} le ${d.cree_at ? new Date(d.cree_at).toLocaleString('fr-FR') : '—'}</div>
          ${d.cloturee_at ? `<div><strong>Clôturée par :</strong> ${d.cloturee_par_prenom || ''} ${d.cloturee_par_nom || ''} le ${new Date(d.cloturee_at).toLocaleString('fr-FR')}</div>` : ''}
          <hr/>
          <div class="card" style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px;">
            <strong><i class="fas fa-chart-line"></i> Impact sur les commandes :</strong>
            <table style="width:100%;margin-top:8px;font-size:14px;">
              <tr><td>Nombre de commandes :</td><td class="text-right"><strong>${impact.nb_commandes || 0}</strong></td></tr>
              <tr><td>CA brut (montant commandes) :</td><td class="text-right"><strong>${(impact.ca_brut || 0).toFixed(2)} €</strong></td></tr>
              <tr><td>Facturation redirigée vers agent :</td><td class="text-right"><strong>${(impact.facturation_redirigee || 0).toFixed(2)} €</strong></td></tr>
              <tr><td>Commission agent (100%) :</td><td class="text-right"><strong>${(impact.commission_agent_redirigee || 0).toFixed(2)} €</strong></td></tr>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary modal-close">Fermer</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelectorAll('.modal-close').forEach(b => b.onclick = () => { modal.remove(); onClosed?.() })
  } catch (err) {
    toast(err.response?.data?.error || 'Erreur', 'error')
  }
}

// ============================================================
// === PARAMÈTRES EMAIL (Resend) ==============================
// ============================================================
PAGES['admin-email-settings'] = async (c) => {
  const { data } = await api.get('/admin/settings/email')
  const s = data.settings
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-envelope-open-text"></i> Notifications email</h1>
        <div class="subtitle">Configuration des envois automatiques de factures (Resend API)</div>
      </div>
    </div>

    <div class="card" style="max-width:800px">
      <div class="card-title"><i class="fas fa-cog"></i> Configuration</div>

      <div class="form-group">
        <label>État du service</label>
        <div style="display:flex;gap:.75rem;align-items:center;padding:.6rem;background:${s.email_enabled === '1' ? '#ecfdf5' : '#fef3c7'};border-radius:6px">
          <strong style="color:${s.email_enabled === '1' ? '#065f46' : '#92400e'}">
            <i class="fas fa-${s.email_enabled === '1' ? 'check-circle' : 'pause-circle'}"></i>
            ${s.email_enabled === '1' ? 'Envoi réel ACTIF' : 'Mode LOG (aucun email envoyé)'}
          </strong>
          <label class="switch" style="margin-left:auto;display:flex;align-items:center;gap:.5rem;cursor:pointer">
            <input type="checkbox" id="emailEnabled" ${s.email_enabled === '1' ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
            <span>Activer l'envoi réel</span>
          </label>
        </div>
        <small class="text-muted">En mode log, les emails ne sont pas envoyés mais l'historique est tracé. Désactivez pour les phases de test.</small>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Provider</label>
          <select id="emailProvider">
            <option value="resend" ${s.email_provider === 'resend' ? 'selected' : ''}>Resend (recommandé)</option>
          </select>
        </div>
        <div class="form-group">
          <label>URL publique de l'application</label>
          <input id="appBaseUrl" type="url" value="${escapeHtml(s.app_base_url)}" placeholder="https://votre-domaine.com" />
          <small class="text-muted">Utilisé dans les liens des emails (lien vers le PDF de facture)</small>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label>Email expéditeur <span class="req">*</span></label>
          <input id="emailFromAddr" type="email" value="${escapeHtml(s.email_from_address)}" placeholder="no-reply@votredomaine.com" />
          <small class="text-muted">Doit être un domaine vérifié dans votre compte Resend</small>
        </div>
        <div class="form-group">
          <label>Nom expéditeur</label>
          <input id="emailFromName" value="${escapeHtml(s.email_from_name)}" placeholder="DropEat™" />
        </div>
      </div>

      <div class="form-group">
        <label>Adresse Reply-To (optionnel)</label>
        <input id="emailReplyTo" type="email" value="${escapeHtml(s.email_reply_to)}" placeholder="support@votredomaine.com" />
      </div>

      <div class="form-group">
        <label>Clé API Resend ${s.email_api_key_set ? '<span class="badge badge-primary">configurée</span>' : '<span class="badge badge-danger">non configurée</span>'}</label>
        ${s.email_api_key_set ? `<div style="padding:.5rem;background:#f9fafb;border-radius:6px;font-family:monospace;font-size:.85rem;margin-bottom:.5rem">${escapeHtml(s.email_api_key_preview)}</div>` : ''}
        <input id="emailApiKey" type="password" placeholder="${s.email_api_key_set ? 'Laisser vide pour conserver l’actuelle' : 'Saisir votre clé Resend re_xxxxxxxx'}" autocomplete="new-password" />
        <div style="margin-top:.5rem;display:flex;gap:.5rem">
          ${s.email_api_key_set ? `<button class="btn btn-sm btn-danger" id="delApiKey"><i class="fas fa-trash"></i> Supprimer la clé</button>` : ''}
          <a href="https://resend.com/api-keys" target="_blank" class="btn btn-sm btn-secondary"><i class="fas fa-external-link-alt"></i> Obtenir une clé Resend</a>
        </div>
        <small class="text-muted" style="display:block;margin-top:.4rem">La clé est stockée chiffrée en base. Format attendu : <code>re_...</code></small>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="saveSettings"><i class="fas fa-save"></i> Enregistrer</button>
        <button class="btn btn-secondary" id="testEmail"><i class="fas fa-paper-plane"></i> Envoyer un email de test</button>
      </div>
    </div>

    <div class="card" style="max-width:800px;margin-top:1rem">
      <div class="card-title"><i class="fas fa-info-circle"></i> Événements déclenchant un email</div>
      <ul style="line-height:1.8;padding-left:1.5rem">
        <li><span class="badge" style="background:#dbeafe;color:#1e40af">Créée</span> &mdash; déclenchable manuellement</li>
        <li><span class="badge" style="background:#fed7aa;color:#9a3412">Envoyée</span> &mdash; <strong>automatique</strong> lors du clic "Envoyer" par l'émetteur</li>
        <li><span class="badge" style="background:#d1fae5;color:#065f46">Validée</span> &mdash; <strong>automatique</strong> lors de la validation par superadmin</li>
        <li><span class="badge badge-danger">Refusée</span> &mdash; <strong>automatique</strong> lors du refus par superadmin (motif inclus)</li>
        <li><span class="badge badge-primary">Payée</span> &mdash; <strong>automatique</strong> lors du marquage paiement par superadmin</li>
        <li><span class="badge" style="background:#fef3c7;color:#92400e">Rappel</span> &mdash; déclenchable depuis le détail de la facture (bouton "Envoyer par email")</li>
      </ul>
      <p style="margin-top:.75rem;color:#6b7280;font-size:.88rem">
        <i class="fas fa-lightbulb"></i> L'email destinataire est résolu dans cet ordre :
        <code>facture.dest_email</code> → <code>destinataire.email_facturation</code> → email du user destinataire.
        Si aucun n'est trouvé, l'envoi est silencieusement ignoré (sans erreur).
      </p>
    </div>
  `

  document.getElementById('saveSettings').onclick = async () => {
    const apiKey = document.getElementById('emailApiKey').value.trim()
    const body = {
      email_enabled: document.getElementById('emailEnabled').checked,
      email_provider: document.getElementById('emailProvider').value,
      app_base_url: document.getElementById('appBaseUrl').value.trim(),
      email_from_address: document.getElementById('emailFromAddr').value.trim(),
      email_from_name: document.getElementById('emailFromName').value.trim(),
      email_reply_to: document.getElementById('emailReplyTo').value.trim()
    }
    if (apiKey) body.email_api_key = apiKey
    try {
      await api.put('/admin/settings/email', body)
      toast('Paramètres enregistrés')
      navigate('admin-email-settings')
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }

  document.getElementById('testEmail').onclick = async () => {
    const to = prompt('Email destinataire du test :', CURRENT_USER.email || '')
    if (!to) return
    try {
      const r = await api.post('/admin/settings/email/test', { to })
      toast(r.data.message, r.data.success ? 'success' : 'error')
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }

  const del = document.getElementById('delApiKey')
  if (del) del.onclick = () => confirmDialog(
    'Supprimer la clé API Resend ? Le service email sera désactivé.',
    async () => {
      await api.delete('/admin/settings/email/api-key')
      toast('Clé supprimée')
      navigate('admin-email-settings')
    }
  )
}

// =====================================================================
// AUDIT & RECALCUL DES TRANCHES (logique unifiée chronologique, migration 0020)
// =====================================================================
PAGES['admin-tranches'] = async (c) => {
  c.innerHTML = `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Audit & recalcul des tranches</h2>
        <p class="text-slate-600 mt-1">Système unifié : compteur de 5 éléments (restos + marques mélangés) par ordre chronologique. Les marques créées sur un resto déjà 100% portefeuille héritent automatiquement (exclues du MLM).</p>
      </div>

      <div id="zone-audit" class="bg-white rounded-xl border border-slate-200 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold flex items-center gap-2"><i class="fas fa-magnifying-glass-chart text-slate-600"></i>Audit global</h3>
          <button id="btn-refresh-audit" class="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"><i class="fas fa-arrows-rotate mr-1"></i>Actualiser</button>
        </div>
        <div id="audit-content" class="text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Chargement…</div>
      </div>

      <div class="bg-white rounded-xl border border-amber-300 p-6">
        <h3 class="text-lg font-semibold flex items-center gap-2 mb-3"><i class="fas fa-rotate text-amber-600"></i>Recalcul chronologique</h3>
        <p class="text-sm text-slate-600 mb-4">
          Le recalcul efface les tranches existantes (sans toucher aux agents/restos/marques) et les reconstruit dans l'ordre chronologique des apports (date_signature restos / date_lancement marques).
          <br><strong>Cette opération est sûre</strong> : les agents, restaurants et marques sont préservés à l'identique. Seuls les flags dérivés (is_portefeuille_proprietaire) et les tranches sont recalculés.
        </p>
        <div class="flex gap-3 flex-wrap">
          <button id="btn-recalc-all" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium">
            <i class="fas fa-rotate-right mr-1"></i>Recalculer TOUS les agents
          </button>
          <select id="select-agent-recalc" class="px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">— Choisir un agent —</option>
          </select>
          <button id="btn-recalc-one" class="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium">
            <i class="fas fa-rotate-right mr-1"></i>Recalculer l'agent sélectionné
          </button>
        </div>
        <div id="recalc-result" class="mt-4"></div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-6">
        <h3 class="text-lg font-semibold flex items-center gap-2 mb-3"><i class="fas fa-clock-rotate-left text-slate-600"></i>Chronologie d'un agent</h3>
        <p class="text-sm text-slate-600 mb-3">Visualise l'ordre dans lequel les apports d'un agent seraient pris en compte par le moteur de tranches.</p>
        <div class="flex gap-3 mb-4">
          <select id="select-agent-chrono" class="px-3 py-2 border border-slate-300 rounded-lg flex-1">
            <option value="">— Choisir un agent —</option>
          </select>
          <button id="btn-chrono" class="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg"><i class="fas fa-eye mr-1"></i>Afficher</button>
        </div>
        <div id="chrono-result"></div>
      </div>
    </div>
  `

  async function loadAudit() {
    const zone = c.querySelector('#audit-content')
    zone.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Chargement…'
    try {
      const { data } = await api.get('/admin/tranches/audit')
      const s = data.summary
      if (s.total === 0) {
        zone.innerHTML = `
          <div class="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-lg p-4">
            <i class="fas fa-circle-check text-2xl"></i>
            <div>
              <div class="font-semibold">Aucune anomalie détectée</div>
              <div class="text-sm text-green-600">L'ensemble des tranches est cohérent.</div>
            </div>
          </div>`
        return
      }
      const rowsHtml = data.anomalies.map(a => `
        <tr class="border-t border-slate-100">
          <td class="px-3 py-2"><span class="px-2 py-0.5 text-xs rounded ${a.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">${a.severity}</span></td>
          <td class="px-3 py-2 text-sm font-mono text-slate-500">${a.type}</td>
          <td class="px-3 py-2 text-sm">${a.agent_nom} <span class="text-slate-400">#${a.agent_id}</span></td>
          <td class="px-3 py-2 text-sm text-slate-700">${a.details}</td>
        </tr>
      `).join('')
      zone.innerHTML = `
        <div class="mb-3 flex gap-2">
          <span class="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm">${s.errors} erreur(s)</span>
          <span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm">${s.warnings} avertissement(s)</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left">
            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th class="px-3 py-2">Sévérité</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Agent</th><th class="px-3 py-2">Détails</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `
    } catch (e) {
      zone.innerHTML = `<div class="text-red-600 text-sm">Erreur : ${e.message}</div>`
    }
  }

  async function loadAgents() {
    try {
      const { data } = await api.get('/admin/users?role=commercial')
      const users = data.users || data || []
      const opts = users.map(u => `<option value="${u.id}">${u.prenom} ${u.nom} (#${u.id})</option>`).join('')
      c.querySelector('#select-agent-recalc').insertAdjacentHTML('beforeend', opts)
      c.querySelector('#select-agent-chrono').insertAdjacentHTML('beforeend', opts)
    } catch (e) { /* ignore */ }
  }

  c.querySelector('#btn-refresh-audit').onclick = loadAudit
  c.querySelector('#btn-recalc-all').onclick = async () => {
    if (!confirm('Recalculer les tranches de TOUS les agents ? (les apports/agents/restos/marques sont préservés)')) return
    const out = c.querySelector('#recalc-result')
    out.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Recalcul en cours…'
    try {
      const { data } = await api.post('/admin/tranches/recalculer', { all: true })
      const s = data.summary
      out.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="font-semibold text-green-800 mb-2"><i class="fas fa-check mr-1"></i>Recalcul terminé pour ${data.total_agents} agents</div>
          <div class="text-sm text-green-700">${s.total_attributions} attribution(s), ${s.total_heritages} héritage(s), ${s.total_warnings} avertissement(s) (skip apports déjà comptés).</div>
        </div>
      `
      loadAudit()
    } catch (e) {
      out.innerHTML = `<div class="text-red-600">Erreur : ${e.message}</div>`
    }
  }
  c.querySelector('#btn-recalc-one').onclick = async () => {
    const id = c.querySelector('#select-agent-recalc').value
    if (!id) { toast('Choisir un agent', 'warning'); return }
    const out = c.querySelector('#recalc-result')
    out.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Recalcul en cours…'
    try {
      const { data } = await api.post('/admin/tranches/recalculer', { agent_id: parseInt(id) })
      const r = data.reports[0]
      out.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="font-semibold text-green-800 mb-2">Agent #${r.agent_id} recalculé</div>
          <div class="text-sm text-green-700">Tranches : ${r.tranches_creees}, attributions : ${r.attributions}, héritages : ${r.marques_heritees}</div>
          ${r.warnings.length ? `<details class="mt-2 text-xs text-slate-600"><summary>${r.warnings.length} avertissement(s)</summary><ul class="mt-2 space-y-1 pl-4 list-disc">${r.warnings.map(w => `<li>${w}</li>`).join('')}</ul></details>` : ''}
        </div>
      `
      loadAudit()
    } catch (e) {
      out.innerHTML = `<div class="text-red-600">Erreur : ${e.message}</div>`
    }
  }
  c.querySelector('#btn-chrono').onclick = async () => {
    const id = c.querySelector('#select-agent-chrono').value
    if (!id) { toast('Choisir un agent', 'warning'); return }
    const out = c.querySelector('#chrono-result')
    out.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Chargement…'
    try {
      const { data } = await api.get(`/admin/tranches/chronologie?agent_id=${id}`)
      if (data.total === 0) { out.innerHTML = '<div class="text-slate-500">Aucun apport pour cet agent.</div>'; return }
      const etat = await api.get(`/admin/tranches/etat?agent_id=${id}`)
      const apports = data.apports
      // construire colonne "tranche d'appartenance" en lisant tranche_elements
      const rows = apports.map((a, i) => `
        <tr class="border-t border-slate-100 ${a.is_portefeuille_already ? 'bg-amber-50' : ''}">
          <td class="px-3 py-2 text-sm text-slate-500">${i + 1}</td>
          <td class="px-3 py-2 text-sm">${a.date_validation}</td>
          <td class="px-3 py-2 text-sm"><span class="px-2 py-0.5 text-xs rounded ${a.kind === 'client' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">${a.kind}</span></td>
          <td class="px-3 py-2 text-sm font-medium">${a.nom}</td>
          <td class="px-3 py-2 text-sm text-slate-500">#${a.element_id}${a.resto_id ? ` (sur resto #${a.resto_id})` : ''}</td>
          <td class="px-3 py-2 text-sm">${a.is_portefeuille_already ? '<span class="text-amber-700"><i class="fas fa-crown mr-1"></i>100% PF</span>' : ''}</td>
        </tr>
      `).join('')
      const heritees = etat.data.marques_heritees || []
      const heriteesHtml = heritees.length ? `
        <div class="mt-6">
          <h4 class="font-semibold text-slate-800 mb-2"><i class="fas fa-arrow-down-up-across-line text-emerald-600 mr-1"></i>Marques héritées (resto déjà 100% portefeuille)</h4>
          <ul class="text-sm space-y-1">
            ${heritees.map(h => `<li class="text-slate-600">• <strong>${h.nom}</strong> (resto ${h.resto_nom}) — héritée le ${h.date_heritage || 'n/a'}</li>`).join('')}
          </ul>
        </div>
      ` : ''
      const tranchesHtml = `
        <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          ${(etat.data.tranches_cloturees || []).map(t => `
            <div class="bg-amber-50 border border-amber-300 rounded-lg p-3">
              <div class="text-xs text-amber-700 uppercase">Tranche #${t.numero_tranche} clôturée</div>
              <div class="font-semibold text-amber-900">${t.element_attribue_nom || 'n/a'}</div>
              <div class="text-xs text-amber-700">100% portefeuille (${t.element_attribue_kind || t.type})</div>
            </div>
          `).join('')}
          ${etat.data.tranche_ouverte ? `
            <div class="bg-blue-50 border border-blue-300 rounded-lg p-3">
              <div class="text-xs text-blue-700 uppercase">Tranche #${etat.data.tranche_ouverte.numero_tranche} ouverte</div>
              <div class="font-semibold text-blue-900">${etat.data.tranche_ouverte.compteur} / 5</div>
              <div class="text-xs text-blue-700">${etat.data.tranche_ouverte.restant} restant(s)</div>
            </div>
          ` : ''}
        </div>
      `
      out.innerHTML = `
        ${tranchesHtml}
        <div class="overflow-x-auto">
          <table class="min-w-full text-left bg-white border border-slate-200 rounded-lg">
            <thead class="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th class="px-3 py-2">#</th><th class="px-3 py-2">Date</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Nom</th><th class="px-3 py-2">Réf</th><th class="px-3 py-2">PF</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${heriteesHtml}
      `
    } catch (e) {
      out.innerHTML = `<div class="text-red-600">Erreur : ${e.message}</div>`
    }
  }

  loadAudit()
  loadAgents()
}

// --- Paliers ---
PAGES['paliers'] = async (c) => {
  const { data } = await api.get('/admin/paliers')
  const TYPES = [
    { key: 'facturation_restaurant', label: 'Facturation restaurant (sans tablette)', icon: 'fa-file-invoice', color: 'accent' },
    { key: 'facturation_restaurant_tablette', label: 'Facturation restaurant (avec tablette SR Shop)', icon: 'fa-tablet-screen-button', color: 'info' },
    { key: 'agent_standard', label: 'Agent commercial — standard', icon: 'fa-user-tie', color: 'primary' },
    { key: 'agent_portefeuille', label: 'Agent — Portefeuille Propriétaire (5e)', icon: 'fa-crown', color: 'gold' },
    { key: 'sous_agent_n1', label: 'Sur sous-agent N1 (perçu par parent)', icon: 'fa-user-plus', color: 'info' },
    { key: 'sous_agent_n2', label: 'Sur sous-agent N2 (perçu par grand-parent)', icon: 'fa-users', color: 'slate' }
  ]
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Paliers de commission</h1><div class="subtitle">Règles de calcul par tranche de montant de commande</div></div>
    </div>
    ${TYPES.map(t => {
      const list = (data.paliers[t.key] || []).sort((a, b) => a.seuil_min - b.seuil_min)
      return `
      <div class="card mb-3">
        <div class="card-title"><i class="fas ${t.icon}"></i> ${t.label}</div>
        <table class="data-table">
          <thead><tr><th>Seuil min</th><th>Seuil max</th><th class="text-right">Montant / commande</th></tr></thead>
          <tbody id="rows_${t.key}">${list.map(p => `
            <tr>
              <td><input type="number" step="0.01" value="${p.seuil_min}" data-f="seuil_min"/></td>
              <td><input type="number" step="0.01" value="${p.seuil_max ?? ''}" placeholder="∞" data-f="seuil_max"/></td>
              <td class="text-right"><input type="number" step="0.01" value="${p.montant_par_commande}" data-f="montant_par_commande"/></td>
            </tr>`).join('')}</tbody>
        </table>
        <div class="form-actions">
          <button class="btn btn-secondary btn-sm" data-add="${t.key}"><i class="fas fa-plus"></i> Ajouter</button>
          <button class="btn btn-primary btn-sm" data-save="${t.key}"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </div>`
    }).join('')}`

  c.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const tbody = c.querySelector('#rows_' + b.dataset.add)
    const tr = document.createElement('tr')
    tr.innerHTML = `<td><input type="number" step="0.01" value="0" data-f="seuil_min"/></td>
      <td><input type="number" step="0.01" value="" placeholder="∞" data-f="seuil_max"/></td>
      <td class="text-right"><input type="number" step="0.01" value="0" data-f="montant_par_commande"/></td>`
    tbody.appendChild(tr)
  })
  c.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
    const type = b.dataset.save
    const rows = [...c.querySelectorAll('#rows_' + type + ' tr')]
    const paliers = rows.map(r => ({
      seuil_min: parseFloat(r.querySelector('[data-f=seuil_min]').value || 0),
      seuil_max: r.querySelector('[data-f=seuil_max]').value ? parseFloat(r.querySelector('[data-f=seuil_max]').value) : null,
      montant_par_commande: parseFloat(r.querySelector('[data-f=montant_par_commande]').value || 0)
    }))
    try {
      await api.post(`/admin/paliers/replace/${type}`, { paliers })
      toast('Paliers enregistrés')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

// --- Profil (commun) ---
PAGES['profil'] = PAGES['a-profil'] = async (c) => {
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Mon profil</h1><div class="subtitle">${escapeHtml(CURRENT_USER.email)}</div></div>
    </div>
    <div class="card" style="max-width:520px">
      <div class="card-title"><i class="fas fa-key"></i> Changer mon mot de passe</div>
      <form id="pf">
        <div class="form-group"><label>Mot de passe actuel</label><input id="cur" type="password" required/></div>
        <div class="form-group"><label>Nouveau mot de passe</label><input id="np" type="password" required minlength="6"/></div>
        <div class="form-group"><label>Confirmer</label><input id="np2" type="password" required minlength="6"/></div>
        <div class="form-actions"><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Modifier</button></div>
      </form>
    </div>`
  c.querySelector('#pf').onsubmit = async e => {
    e.preventDefault()
    const np = c.querySelector('#np').value, np2 = c.querySelector('#np2').value
    if (np !== np2) { toast('Les mots de passe ne correspondent pas', 'error'); return }
    try {
      await api.post('/auth/change-password', { current_password: c.querySelector('#cur').value, new_password: np })
      toast('Mot de passe modifié'); c.querySelector('#pf').reset()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// ===== PAGES AGENT COMMERCIAL =====
// ============================================================
PAGES['a-dashboard'] = async (c) => {
  const now = new Date()
  const annee = now.getFullYear(), mois = now.getMonth() + 1
  const [me, com, codesR, tree, histR, portR, cumR] = await Promise.all([
    api.get('/agent/me'),
    api.get(`/agent/commissions?annee=${annee}&mois=${mois}`),
    api.get('/agent/sous-agents/codes').catch(() => ({ data: { codes: [] } })),
    api.get(`/agent/mlm-tree?annee=${annee}&mois=${mois}`).catch(() => ({ data: { filleuls: [], total_n1: 0, total_n2: 0 } })),
    api.get('/agent/commissions/history?type=monthly').catch(() => ({ data: { history: [] } })),
    api.get(`/agent/portefeuille?annee=${annee}&mois=${mois}`).catch(() => ({ data: { marques_portefeuille: [], stats: { nb_marques_portefeuille: 0, ca_periode: 0, commissions_periode: 0, nb_commandes_periode: 0 } } })),
    api.get('/demandes-paiement/cumul').catch(() => ({ data: { cumul: { total_disponible: 0, total_propre: 0, total_portefeuille: 0, total_n1: 0, total_n2: 0, nb_periodes: 0, seuil_min: 20, eligible: false } } }))
  ])
  const cumul = cumR.data.cumul || { total_disponible: 0, seuil_min: 20, eligible: false }
  const u = me.data.user, s = me.data.stats, d = com.data.detail
  const reste = me.data.reste_avant_portefeuille
  const myRestos = s.nb_restaurants_propres
  const palier = 5
  const filledSteps = (myRestos % palier)
  const codesRecents = (codesR.data.codes || []).slice(0, 5)
  const mlmTree = tree.data
  const history = histR.data.history || []
  const portefeuille = portR.data || { marques_portefeuille: [], stats: { nb_marques_portefeuille: 0, ca_periode: 0, commissions_periode: 0, nb_commandes_periode: 0 } }
  const portMarques = portefeuille.marques_portefeuille || []
  const portStats = portefeuille.stats || { nb_marques_portefeuille: 0, ca_periode: 0, commissions_periode: 0, nb_commandes_periode: 0 }

  c.innerHTML = `
    <div class="page-header">
      <div><h1>Bonjour ${escapeHtml(u.prenom)} 👋</h1>
        <div class="subtitle">${niveauLabel(u.niveau)}${u.parent_nom ? ' · Rattaché à ' + escapeHtml(u.parent_prenom + ' ' + u.parent_nom) : ''}</div>
      </div>
      <div class="quick-actions" style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="qaAddSousAgent"><i class="fas fa-user-plus"></i> Créer un filleul</button>
        <button class="btn btn-secondary" id="qaAddProspect"><i class="fas fa-bullseye"></i> Nouveau prospect</button>
        <button class="btn btn-secondary" id="qaImport"><i class="fas fa-file-csv"></i> Import CSV</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card primary"><div class="stat-label">Mes commissions du mois</div><div class="stat-value">${fmtEUR(d.total)}</div><div class="stat-extra">${monthsFR[mois-1]} ${annee}</div></div>
      <div class="stat-card accent"><div class="stat-label">Mes restaurants directs</div><div class="stat-value">${s.nb_restaurants_propres}</div><div class="stat-extra">${s.nb_marques} marques · ${s.nb_restaurants} dans ma branche</div></div>
      <div class="stat-card gold"><div class="stat-label">Mon réseau MLM</div><div class="stat-value">${mlmTree.total_n1} <span style="font-size:0.8rem;color:#6b7280">+ ${mlmTree.total_n2}</span></div><div class="stat-extra">${mlmTree.total_n1} filleul${mlmTree.total_n1 > 1 ? 's' : ''} N+1 · ${mlmTree.total_n2} sous-filleul${mlmTree.total_n2 > 1 ? 's' : ''} N+2</div></div>
      <div class="stat-card info" style="${cumul.eligible ? 'cursor:pointer;border-left:3px solid #06A05A' : ''}" ${cumul.eligible ? 'data-goto="a-demandes-paiement"' : ''}>
        <div class="stat-label">Cumul à demander</div>
        <div class="stat-value" style="color:${cumul.eligible ? '#06A05A' : '#64748b'}">${fmtEUR(cumul.total_disponible || 0)}</div>
        <div class="stat-extra">${cumul.eligible
          ? `<i class="fas fa-hand-holding-dollar"></i> Cliquez pour demander (seuil ${fmtEUR(cumul.seuil_min)})`
          : `Seuil minimum ${fmtEUR(cumul.seuil_min)} non atteint`
        }</div>
      </div>
    </div>

    <!-- ===== ARBORESCENCE MLM 2 NIVEAUX (style org-chart) ===== -->
    <div class="card mb-3">
      <div class="card-title">
        <i class="fas fa-sitemap"></i> Mon arborescence MLM (${monthsFR[mois-1]} ${annee})
        <span class="text-muted" style="font-weight:normal;font-size:.85rem;margin-left:.6rem">
          ${mlmTree.total_n1} filleul${mlmTree.total_n1 > 1 ? 's' : ''} directs · ${mlmTree.total_n2} sous-filleul${mlmTree.total_n2 > 1 ? 's' : ''} (2 niveaux max)
        </span>
        <button class="btn btn-sm btn-secondary" id="goMlm" style="margin-left:auto">
          <i class="fas fa-expand-arrows-alt"></i> Vue détaillée
        </button>
      </div>
      ${mlmTree.filleuls.length ? `
        <div class="mlm-tree-wrap">
          <!-- Racine = moi -->
          <div class="mlm-tree-root">
            <div class="mlm-tree-node mlm-tree-root-node">
              <div class="mlm-tree-avatar"><i class="fas fa-crown"></i></div>
              <div class="mlm-tree-name">${escapeHtml(u.prenom)} ${escapeHtml(u.nom)}</div>
              <div class="mlm-tree-meta">VOUS · ${niveauLabel(u.niveau)}</div>
              <div class="mlm-tree-stats">${mlmTree.total_n1 + mlmTree.total_n2 + 1} pers. au total</div>
            </div>
          </div>
          <!-- Connecteurs vers N+1 -->
          <div class="mlm-tree-connector"></div>
          <!-- Ligne N+1 -->
          <div class="mlm-tree-row mlm-tree-n1">
            ${mlmTree.filleuls.map(f => `
              <div class="mlm-tree-branch">
                <div class="mlm-tree-node mlm-tree-n1-node ${f.actif ? '' : 'inactive'}">
                  <div class="mlm-tree-avatar">${escapeHtml((f.prenom?.[0] || '') + (f.nom?.[0] || ''))}</div>
                  <div class="mlm-tree-name">${escapeHtml(f.prenom)} ${escapeHtml(f.nom)}</div>
                  <div class="mlm-tree-meta">N+1 · ${f.nb_restos} resto${f.nb_restos > 1 ? 's' : ''}</div>
                  <div class="mlm-tree-stats">CA mois : <strong>${fmtEUR(f.ca_periode || 0)}</strong></div>
                  ${!f.actif ? '<div class="mlm-tree-badge">Inactif</div>' : ''}
                </div>
                ${f.sous_filleuls && f.sous_filleuls.length ? `
                  <div class="mlm-tree-sub-connector"></div>
                  <div class="mlm-tree-row mlm-tree-n2">
                    ${f.sous_filleuls.map(sf => `
                      <div class="mlm-tree-node mlm-tree-n2-node ${sf.actif ? '' : 'inactive'}">
                        <div class="mlm-tree-avatar mlm-avatar-sm">${escapeHtml((sf.prenom?.[0] || '') + (sf.nom?.[0] || ''))}</div>
                        <div class="mlm-tree-name" style="font-size:.85rem">${escapeHtml(sf.prenom)} ${escapeHtml(sf.nom)}</div>
                        <div class="mlm-tree-meta">N+2 · ${sf.nb_restos} resto${sf.nb_restos > 1 ? 's' : ''}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : '<div class="mlm-tree-no-children">Aucun sous-filleul</div>'}
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div style="padding:2rem;text-align:center;color:#6b7280">
          <i class="fas fa-user-plus" style="font-size:2rem;color:#d1d5db;margin-bottom:.5rem"></i>
          <p>Vous n'avez pas encore de filleul. Cliquez sur « Créer un filleul » pour démarrer votre réseau MLM.</p>
        </div>
      `}
    </div>

    <!-- Bandeau RÈGLE 100% PORTEFEUILLE avec image -->
    <div class="card mb-3 portfolio-banner" style="display:grid;grid-template-columns:280px 1fr;gap:1.2rem;align-items:center;background:linear-gradient(135deg,#f0fdf4 0%,#fefce8 100%);border-left:4px solid var(--gold, #FFB800)">
      <img src="/static/img/portfolio-rule-100.jpg" alt="Règle 100% portefeuille"
           style="width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08)" />
      <div>
        <div class="card-title" style="margin-bottom:.4rem">
          <i class="fas fa-crown" style="color:var(--gold, #FFB800)"></i>
          Règle Portefeuille Propriétaire — 100%
        </div>
        <p style="font-size:.92rem;line-height:1.5;margin:.3rem 0 .7rem">
          Tous les <strong>5 restaurants</strong> que vous apportez, le <strong>5ᵉ</strong> (puis 10ᵉ, 15ᵉ…)
          vous appartient à <strong style="color:var(--gold, #FFB800)">100%</strong> :
          vous touchez l'intégralité de la commission DropEat sur ses commandes.
          <br><span class="text-muted" style="font-size:.85rem">
            Si ce restaurant possède plusieurs marques, sa <strong>1ʳᵉ marque héritée</strong> bascule
            automatiquement en tranche suivante (position 1) — elle ne compte pas dans la tranche en cours.
          </span>
        </p>
        <div class="portfolio-progress" style="display:flex;gap:.4rem;margin-top:.6rem">
          ${[1,2,3,4,5].map(i => `
            <div class="step ${filledSteps >= i ? (i === 5 ? 'gold' : 'filled') : ''}"
              style="flex:1;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;
              background:${filledSteps >= i ? (i === 5 ? 'linear-gradient(135deg,#FFB800,#FF8C00)' : '#06A05A') : '#e5e7eb'};
              color:${filledSteps >= i ? 'white' : '#9ca3af'};
              box-shadow:${filledSteps >= i ? '0 2px 6px rgba(0,0,0,.15)' : 'none'}">
              ${i === 5 ? '★' : i}
            </div>`).join('')}
        </div>
        <div class="mt-2" style="display:flex;justify-content:space-between;align-items:center;font-size:.85rem">
          <span><strong>${myRestos}</strong> restaurant${myRestos > 1 ? 's' : ''} apporté${myRestos > 1 ? 's' : ''}</span>
          <span>${reste === palier
            ? 'Le prochain restaurant compte pour la tranche suivante'
            : `Plus que <strong style="color:var(--gold, #FFB800)">${reste}</strong> avant votre prochain Portefeuille 🎁`}</span>
          <button class="btn btn-sm btn-primary" id="goAttribution">
            <i class="fas fa-trophy"></i> Choisir ma 5ᵉ marque
          </button>
        </div>
      </div>
    </div>

    <!-- ===== MON PORTEFEUILLE 100% — vue dédiée ===== -->
    <div class="card mb-3" style="border-left:4px solid var(--gold, #FFB800);background:linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)">
      <div class="card-title" style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
        <i class="fas fa-crown" style="color:var(--gold, #FFB800)"></i>
        Mon Portefeuille Propriétaire — 100%
        <span class="badge badge-gold" style="background:linear-gradient(135deg,#FFB800,#FF8C00);color:white;font-weight:700;padding:.18rem .6rem;border-radius:12px;font-size:.7rem">
          ${portStats.nb_marques_portefeuille} marque${portStats.nb_marques_portefeuille > 1 ? 's' : ''}
        </span>
        <span class="text-muted" style="font-weight:normal;font-size:.85rem;margin-left:.4rem">
          Vous touchez <strong>100%</strong> des commissions DropEat sur ces marques (selon date de signature contrat)
        </span>
        <button class="btn btn-sm btn-secondary" id="goPortefeuilleFull" style="margin-left:auto">
          <i class="fas fa-list"></i> Voir tout dans Mes Restaurants
        </button>
      </div>

      <!-- KPI Portefeuille -->
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);gap:.8rem;margin-bottom:1rem">
        <div class="stat-card gold" style="padding:.8rem">
          <div class="stat-label" style="font-size:.72rem">Marques en portefeuille</div>
          <div class="stat-value" style="font-size:1.4rem">${portStats.nb_marques_portefeuille}</div>
        </div>
        <div class="stat-card primary" style="padding:.8rem">
          <div class="stat-label" style="font-size:.72rem">CA portefeuille (${monthsFR[mois-1]})</div>
          <div class="stat-value" style="font-size:1.4rem">${fmtEUR(portStats.ca_periode)}</div>
        </div>
        <div class="stat-card accent" style="padding:.8rem">
          <div class="stat-label" style="font-size:.72rem">Commissions 100% (mois)</div>
          <div class="stat-value" style="font-size:1.4rem;color:#06A05A">${fmtEUR(portStats.commissions_periode)}</div>
        </div>
        <div class="stat-card info" style="padding:.8rem">
          <div class="stat-label" style="font-size:.72rem">Commandes (mois)</div>
          <div class="stat-value" style="font-size:1.4rem">${fmtNum(portStats.nb_commandes_periode)}</div>
        </div>
      </div>

      ${portMarques.length ? `
        <table class="data-table" style="font-size:.85rem">
          <thead>
            <tr>
              <th>Marque</th>
              <th>Restaurant</th>
              <th>Agent</th>
              <th>Signature</th>
              <th class="text-right">Cmds (mois)</th>
              <th class="text-right">CA (mois)</th>
              <th class="text-right">Commission 100%</th>
              <th class="text-right">CA total</th>
            </tr>
          </thead>
          <tbody>
            ${portMarques.map(m => `
              <tr>
                <td>
                  <strong><i class="fas fa-crown" style="color:var(--gold, #FFB800);font-size:.7rem"></i> ${escapeHtml(m.nom)}</strong>
                  <div class="text-muted" style="font-size:.7rem">${escapeHtml(m.plateforme || '')}${m.uber_store_id ? ' · ' + escapeHtml(m.uber_store_id) : ''}</div>
                </td>
                <td>${escapeHtml(m.restaurant_nom)}<div class="text-muted" style="font-size:.7rem">${escapeHtml(m.ville || '')}</div></td>
                <td>${escapeHtml((m.agent_prenom || '') + ' ' + (m.agent_nom || ''))}${m.agent_id === u.id ? ' <span class="badge" style="background:#dcfce7;color:#15803d;font-size:.65rem;padding:.1rem .4rem;border-radius:4px">VOUS</span>' : ''}</td>
                <td style="font-size:.78rem">${m.date_signature_portefeuille ? '<span style="color:#06A05A"><i class="fas fa-check"></i> ' + escapeHtml(m.date_signature_portefeuille.substring(0,10)) + '</span>' : '<span class="text-muted">Non signée</span>'}</td>
                <td class="text-right">${fmtNum(m.nb_commandes_periode || 0)}</td>
                <td class="text-right">${fmtEUR(m.ca_periode || 0)}</td>
                <td class="text-right"><strong style="color:#06A05A">${fmtEUR(m.commissions_portefeuille_periode || 0)}</strong></td>
                <td class="text-right text-muted">${fmtEUR(m.ca_total || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background:rgba(255,184,0,.1);font-weight:700">
              <td colspan="4">TOTAL — ${portStats.nb_marques_portefeuille} marque${portStats.nb_marques_portefeuille > 1 ? 's' : ''}</td>
              <td class="text-right">${fmtNum(portStats.nb_commandes_periode)}</td>
              <td class="text-right">${fmtEUR(portStats.ca_periode)}</td>
              <td class="text-right" style="color:#06A05A;font-size:1rem">${fmtEUR(portStats.commissions_periode)}</td>
              <td class="text-right"></td>
            </tr>
          </tfoot>
        </table>
      ` : `
        <div style="padding:1.5rem;text-align:center;color:#6b7280;background:#fafafa;border-radius:8px">
          <i class="fas fa-crown" style="font-size:2rem;color:#fde68a;margin-bottom:.5rem"></i>
          <p style="margin:.3rem 0"><strong>Aucune marque en portefeuille pour le moment.</strong></p>
          <p style="font-size:.85rem;margin:.2rem 0">Apportez 5 restaurants pour débloquer votre 1ʳᵉ marque Portefeuille 100% 🎁</p>
          <button class="btn btn-sm btn-primary mt-2" id="goAttributionEmpty">
            <i class="fas fa-trophy"></i> Voir l'attribution 5ᵉ marque
          </button>
        </div>
      `}
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-coins"></i> Détail commissions du mois</div>
      <table class="data-table">
        <tbody>
          <tr><td><i class="fas fa-store"></i> Mes ventes (clients standards)</td><td class="text-right">${d.nb_commandes_propres} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_propre)}</strong></td></tr>
          <tr><td><i class="fas fa-crown" style="color:var(--gold, #FFB800)"></i> Mes ventes (Portefeuille Propriétaire — 100%)</td><td class="text-right">${d.nb_commandes_portefeuille} cmds</td><td class="text-right"><strong class="text-success">${fmtEUR(d.commission_portefeuille)}</strong></td></tr>
          <tr><td><i class="fas fa-user-plus"></i> Sur ventes de mes sous-agents directs (N+1)</td><td class="text-right">${d.nb_commandes_n1} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_n1)}</strong></td></tr>
          <tr><td><i class="fas fa-users"></i> Sur ventes de mes sous-sous-agents (N+2)</td><td class="text-right">${d.nb_commandes_n2} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_n2)}</strong></td></tr>
          <tr style="background:rgba(6,160,90,.08)"><td><strong>TOTAL DU MOIS</strong></td><td></td><td class="text-right"><strong style="font-size:1.2rem;color:var(--primary, #06A05A)">${fmtEUR(d.total)}</strong></td></tr>
        </tbody>
      </table>
    </div>

    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <!-- Bloc historique des commissions (graphique mensuel) -->
      <div class="card">
        <div class="card-title">
          <i class="fas fa-chart-line"></i> Historique de mes commissions (12 derniers mois)
          <button class="btn btn-sm btn-link" id="goHistoComm" style="margin-left:auto">Détail →</button>
        </div>
        ${history.length ? `
          <div style="display:flex;align-items:end;gap:.3rem;height:140px;padding:.5rem 0;border-bottom:2px solid #e5e7eb">
            ${history.map(h => {
              const max = Math.max(...history.map(x => x.total)) || 1
              const pct = Math.max(2, (h.total / max) * 100)
              const [y, m] = h.periode.split('-')
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.2rem" title="${monthsFR[parseInt(m)-1]} ${y} : ${fmtEUR(h.total)}">
                <div style="font-size:.65rem;color:#6b7280">${fmtEUR(h.total).replace(' €','')}</div>
                <div style="width:100%;background:linear-gradient(to top,#06A05A,#4ade80);height:${pct}%;border-radius:4px 4px 0 0;min-height:4px"></div>
                <div style="font-size:.7rem;color:#374151;font-weight:600">${monthsFR[parseInt(m)-1]?.substring(0,3)}</div>
              </div>`
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:.5rem;font-size:.75rem;color:#6b7280">
            <span>Min : ${fmtEUR(Math.min(...history.map(x => x.total)))}</span>
            <span>Max : <strong style="color:#06A05A">${fmtEUR(Math.max(...history.map(x => x.total)))}</strong></span>
            <span>Total : ${fmtEUR(history.reduce((s, x) => s + x.total, 0))}</span>
          </div>
        ` : '<p class="text-muted" style="font-size:.85rem">Pas encore d\'historique disponible.</p>'}
      </div>

      <!-- Bloc derniers codes d'accès filleuls -->
      <div class="card">
        <div class="card-title">
          <i class="fas fa-key"></i> Derniers codes d'accès créés
          <button class="btn btn-sm btn-link" id="goSousAgents" style="margin-left:auto">Voir tout →</button>
        </div>
        ${codesRecents.length ? `
          <table class="data-table" style="font-size:.85rem">
            <thead><tr><th>Filleul</th><th>Email</th><th>Code</th><th class="text-right">Action</th></tr></thead>
            <tbody>${codesRecents.map(co => `
              <tr>
                <td><strong>${escapeHtml((co.prenom || '') + ' ' + (co.nom || ''))}</strong>
                  <div class="text-muted" style="font-size:.7rem">N${co.niveau} · ${co.user_actif ? '<span style="color:#06A05A">Actif</span>' : '<span style="color:#dc2626">Inactif</span>'}</div></td>
                <td style="font-family:monospace;font-size:.75rem">${escapeHtml(co.email || '')}</td>
                <td style="font-family:monospace">${co.masque ? '••••••••' : escapeHtml(co.password_temporaire || '—')}</td>
                <td class="text-right">
                  ${!co.masque ? `<button class="btn btn-sm btn-secondary" data-copy-code="${escapeHtml((co.email || '') + ' / ' + (co.password_temporaire || ''))}" title="Copier email + code"><i class="fas fa-copy"></i></button>` : ''}
                  <button class="btn btn-sm btn-warning" data-regen="${co.user_id}" title="Régénérer le code"><i class="fas fa-rotate"></i></button>
                </td>
              </tr>`).join('')}</tbody>
          </table>
        ` : '<p class="text-muted" style="font-size:.85rem">Aucun filleul créé pour le moment. Cliquez sur « Créer un filleul » en haut à droite pour démarrer votre réseau.</p>'}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-store"></i> Restaurants de ma branche (mois en cours)</div>
      ${com.data.restaurants.length ? `
      <table class="data-table">
        <thead><tr><th>Restaurant</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Facturation</th></tr></thead>
        <tbody>${com.data.restaurants.map(r => `<tr>
          <td>${escapeHtml(r.restaurant_nom)}</td>
          <td class="text-right">${fmtNum(r.nb_commandes)}</td>
          <td class="text-right">${fmtEUR(r.ca)}</td>
          <td class="text-right">${fmtEUR(r.facturation)}</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="text-muted">Aucune commande ce mois-ci. Importez vos CSV Uber Eats !</p>'}
    </div>`

  // Quick actions
  document.getElementById('qaAddSousAgent').onclick = () => quickSousAgentModal(() => navigate('a-dashboard'))
  document.getElementById('qaAddProspect').onclick = () => navigate('a-prospects')
  document.getElementById('qaImport').onclick = () => navigate('a-imports')
  // Card "Cumul à demander" cliquable si éligible
  c.querySelectorAll('[data-goto]').forEach(el => {
    el.onclick = () => navigate(el.dataset.goto)
  })
  const goAttr = document.getElementById('goAttribution')
  if (goAttr) goAttr.onclick = () => navigate('a-attribution')
  const goSA = document.getElementById('goSousAgents')
  if (goSA) goSA.onclick = () => navigate('a-sous-agents')
  const goMlm = document.getElementById('goMlm')
  if (goMlm) goMlm.onclick = () => navigate('a-mlm')
  const goHC = document.getElementById('goHistoComm')
  if (goHC) goHC.onclick = () => navigate('a-historique-comm')
  const goPF = document.getElementById('goPortefeuilleFull')
  if (goPF) goPF.onclick = () => navigate('a-restaurants')
  const goAE = document.getElementById('goAttributionEmpty')
  if (goAE) goAE.onclick = () => navigate('a-attribution')

  // Codes filleul actions
  c.querySelectorAll('[data-copy-code]').forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.copyCode).then(() => toast('Identifiants copiés'))
  })
  c.querySelectorAll('[data-regen]').forEach(b => b.onclick = () => confirmDialog(
    'Régénérer un nouveau mot de passe ? L\'ancien sera invalidé immédiatement.',
    async () => {
      try {
        const { data } = await api.post('/agent/sous-agents/' + b.dataset.regen + '/regenerer-code')
        showAccessCodeModal(data.code_acces, () => navigate('a-dashboard'))
      } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  ))
}

// ============================================================
// Quick modal — créer un filleul depuis le dashboard agent
// ============================================================
function quickSousAgentModal(onSuccess) {
  const m = modal('<i class="fas fa-user-plus"></i> Créer un filleul', `
    <p class="text-muted" style="font-size:.85rem;margin-bottom:.6rem">
      <i class="fas fa-circle-info"></i> Le filleul sera rattaché à vous au niveau N+1.
      Un mot de passe d'accès est généré automatiquement (vous pouvez aussi en saisir un).
    </p>
    <form id="qsaForm">
      <div class="form-grid">
        <div class="form-group">
          <label>Prénom <span class="req">*</span></label>
          <input id="qsaPrenom" required autofocus />
        </div>
        <div class="form-group">
          <label>Nom <span class="req">*</span></label>
          <input id="qsaNom" required />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Email <span class="req">*</span></label>
          <input id="qsaEmail" type="email" required placeholder="filleul@exemple.fr" />
        </div>
        <div class="form-group">
          <label>Téléphone</label>
          <input id="qsaTel" type="tel" />
        </div>
        <div class="form-group">
          <label>Mot de passe (optionnel)</label>
          <input id="qsaPwd" type="text" placeholder="laissez vide = auto-généré" />
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i> Créer & générer code</button>
      </div>
    </form>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#qsaForm').onsubmit = async (e) => {
    e.preventDefault()
    try {
      const { data } = await api.post('/agent/sous-agents/create', {
        prenom: m.el.querySelector('#qsaPrenom').value.trim(),
        nom: m.el.querySelector('#qsaNom').value.trim(),
        email: m.el.querySelector('#qsaEmail').value.trim(),
        telephone: m.el.querySelector('#qsaTel').value.trim() || null,
        password: m.el.querySelector('#qsaPwd').value.trim() || null
      })
      m.close()
      showAccessCodeModal(data.code_acces, onSuccess)
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// Modal d'affichage du code d'accès (visible une seule fois)
// ============================================================
function showAccessCodeModal(codeAcces, onClose) {
  const fullCreds = codeAcces.email + ' / ' + codeAcces.password_temporaire
  const m = modal('<i class="fas fa-key"></i> Code d\'accès du filleul', `
    <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);padding:1rem;border-radius:8px;border-left:4px solid #ea8a00;margin-bottom:1rem">
      <strong style="color:#92400e">⚠️ ${escapeHtml(codeAcces.message || 'Notez ce mot de passe : il ne sera plus affiché après cette page.')}</strong>
    </div>
    <div class="form-grid">
      <div class="form-group" style="grid-column:1/-1">
        <label>Email de connexion</label>
        <input value="${escapeHtml(codeAcces.email)}" readonly style="font-family:monospace;font-size:1rem;font-weight:600" />
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>Mot de passe temporaire</label>
        <input value="${escapeHtml(codeAcces.password_temporaire)}" readonly style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#06A05A;letter-spacing:.05em" />
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>URL de connexion</label>
        <input value="${window.location.origin}${escapeHtml(codeAcces.url_connexion || '/')}" readonly style="font-family:monospace;font-size:.85rem" />
      </div>
    </div>
    <div class="form-actions" style="display:flex;gap:.5rem">
      <button type="button" class="btn btn-primary" id="copyAllCreds" style="flex:1"><i class="fas fa-copy"></i> Copier tout</button>
      <button type="button" class="btn btn-secondary" id="copyPwdOnly"><i class="fas fa-key"></i> Mot de passe seul</button>
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => { m.close(); onClose && onClose() }
  m.el.querySelector('#copyAllCreds').onclick = () => {
    const txt = `Connexion DropEat\nURL : ${window.location.origin}${codeAcces.url_connexion || '/'}\nEmail : ${codeAcces.email}\nMot de passe : ${codeAcces.password_temporaire}`
    navigator.clipboard.writeText(txt).then(() => toast('Identifiants complets copiés'))
  }
  m.el.querySelector('#copyPwdOnly').onclick = () => {
    navigator.clipboard.writeText(codeAcces.password_temporaire).then(() => toast('Mot de passe copié'))
  }
}

// --- Mes Restaurants (CRM / MLM senior view) ---
// Arborescence Restaurant → Marques → Sous-agents → Statuts + checklist + docs + KPI
PAGES['a-restaurants'] = async (c) => {
  // State : période + filtre
  const now = new Date()
  const stState = {
    annee: now.getFullYear(),
    mois: now.getMonth() + 1,
    date_debut: '',
    date_fin: '',
    mode: 'mois', // mois | custom
    filtre: 'tous', // tous | portefeuille | en_attente | docs_manquants | refusees
    search: ''
  }

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-folder-tree"></i> Mes Restaurants</h1>
        <div class="subtitle">Gestion de portefeuille — vue arborescente CRM / MLM</div>
      </div>
      <button class="btn btn-primary" id="btnNewResto"><i class="fas fa-plus"></i> Nouveau restaurant</button>
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-calendar"></i> Période & filtres</div>
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));align-items:end">
        <div class="form-group">
          <label>Mode période</label>
          <select id="fMode">
            <option value="mois">Mois</option>
            <option value="custom">Plage personnalisée</option>
          </select>
        </div>
        <div class="form-group" id="grpMois">
          <label>Année / Mois</label>
          <div style="display:flex;gap:4px">
            <input id="fAnnee" type="number" value="${stState.annee}" min="2024" max="2030" style="width:80px"/>
            <select id="fMoisSel">${monthsFR.map((m,i)=>`<option value="${i+1}" ${i+1===stState.mois?'selected':''}>${m}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-group" id="grpDebut" style="display:none"><label>Du</label><input id="fDebut" type="date"/></div>
        <div class="form-group" id="grpFin" style="display:none"><label>Au</label><input id="fFin" type="date"/></div>
        <div class="form-group">
          <label>Filtre</label>
          <select id="fFiltre">
            <option value="tous">Tous</option>
            <option value="portefeuille">100% Portefeuille</option>
            <option value="en_attente">Marque en attente</option>
            <option value="refusees">Marque refusée</option>
            <option value="docs_manquants">Docs manquants</option>
          </select>
        </div>
        <div class="form-group">
          <label>Recherche</label>
          <input id="fSearch" placeholder="Nom resto ou marque..." />
        </div>
        <div class="form-group">
          <button class="btn btn-primary" id="btnReload"><i class="fas fa-rotate"></i> Actualiser</button>
        </div>
      </div>
    </div>

    <div id="kpiBar"></div>
    <div id="treeWrap" class="mb-3"><div class="text-center text-muted" style="padding:2rem"><i class="fas fa-spinner fa-spin"></i> Chargement de votre portefeuille…</div></div>
  `

  const grpMois = c.querySelector('#grpMois')
  const grpDebut = c.querySelector('#grpDebut')
  const grpFin = c.querySelector('#grpFin')
  c.querySelector('#fMode').onchange = e => {
    stState.mode = e.target.value
    if (stState.mode === 'mois') {
      grpMois.style.display = ''
      grpDebut.style.display = 'none'
      grpFin.style.display = 'none'
    } else {
      grpMois.style.display = 'none'
      grpDebut.style.display = ''
      grpFin.style.display = ''
    }
  }

  // Sous-agents pour modal création (qui peut apporter)
  const sa = await api.get('/agent/sous-agents').catch(() => ({ data: { sous_agents: [] } }))
  const allBranchAgents = [{ id: CURRENT_USER.id, prenom: CURRENT_USER.prenom, nom: CURRENT_USER.nom, niveau: CURRENT_USER.niveau }, ...sa.data.sous_agents]

  document.getElementById('btnNewResto').onclick = () => agentRestaurantModal(null, allBranchAgents, () => loadTree())

  async function loadTree() {
    // Construit la query string période
    const qp = new URLSearchParams()
    if (stState.mode === 'mois') {
      qp.set('annee', stState.annee)
      qp.set('mois', stState.mois)
    } else if (stState.date_debut && stState.date_fin) {
      qp.set('date_debut', stState.date_debut)
      qp.set('date_fin', stState.date_fin)
    } else {
      qp.set('annee', stState.annee)
      qp.set('mois', stState.mois)
    }

    const wrap = c.querySelector('#treeWrap')
    wrap.innerHTML = `<div class="text-center text-muted" style="padding:2rem"><i class="fas fa-spinner fa-spin"></i> Chargement…</div>`
    let data
    try {
      const r = await api.get('/agent/mes-restaurants/tree?' + qp.toString())
      data = r.data
    } catch (err) {
      wrap.innerHTML = `<div class="card"><div class="text-center text-danger" style="padding:2rem"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(err.response?.data?.error || 'Erreur de chargement')}</div></div>`
      return
    }

    // KPI bar
    const s = data.stats || {}
    c.querySelector('#kpiBar').innerHTML = `
      <div class="stats-grid mb-3">
        <div class="stat-card primary"><div class="stat-label">Restaurants</div><div class="stat-value">${fmtNum(s.nb_restos)}</div><div class="stat-extra">${fmtNum(s.nb_marques)} marques</div></div>
        <div class="stat-card gold"><div class="stat-label">100% Portefeuille</div><div class="stat-value">${fmtNum(s.nb_portefeuille)}</div><div class="stat-extra">marques signées</div></div>
        <div class="stat-card accent"><div class="stat-label">CA période</div><div class="stat-value">${fmtEUR(s.ca_total_periode)}</div><div class="stat-extra">CA all-time ${fmtEUR(s.ca_total_global)}</div></div>
        <div class="stat-card info"><div class="stat-label">Commissions période</div><div class="stat-value">${fmtEUR(s.commissions_periode)}</div></div>
        <div class="stat-card ${s.nb_docs_manquants_total > 0 ? 'danger' : ''}"><div class="stat-label">Docs manquants</div><div class="stat-value">${fmtNum(s.nb_docs_manquants_total)}</div><div class="stat-extra">à compléter</div></div>
      </div>`

    // Filtrer + trier l'arbre
    let tree = (data.tree || [])
    const filtre = stState.filtre
    const search = (stState.search || '').toLowerCase()
    if (search) {
      tree = tree.filter(r => (r.nom||'').toLowerCase().includes(search)
        || (r.marques||[]).some(m => (m.nom||'').toLowerCase().includes(search)))
    }
    if (filtre === 'portefeuille') tree = tree.filter(r => (r.marques||[]).some(m => m.is_portefeuille_proprietaire))
    if (filtre === 'en_attente') tree = tree.filter(r => (r.alertes?.nb_marques_en_attente || 0) > 0)
    if (filtre === 'refusees') tree = tree.filter(r => (r.alertes?.nb_marques_refusees || 0) > 0)
    if (filtre === 'docs_manquants') tree = tree.filter(r => (r.alertes?.nb_docs_manquants || 0) > 0)

    if (!tree.length) {
      wrap.innerHTML = `<div class="card"><div class="text-center text-muted" style="padding:2rem">
        <i class="fas fa-folder-open" style="font-size:2rem;opacity:.4"></i>
        <p>Aucun restaurant ne correspond à ces critères.</p>
        <button class="btn btn-primary" id="btnNewEmpty"><i class="fas fa-plus"></i> Ajouter un restaurant</button>
      </div></div>`
      const b = wrap.querySelector('#btnNewEmpty')
      if (b) b.onclick = () => agentRestaurantModal(null, allBranchAgents, () => loadTree())
      return
    }

    wrap.innerHTML = tree.map(r => renderRestoCard(r)).join('')

    // Wire toggles
    wrap.querySelectorAll('[data-toggle-resto]').forEach(btn => btn.onclick = () => {
      const id = btn.dataset.toggleResto
      const body = wrap.querySelector(`[data-resto-body="${id}"]`)
      if (!body) return
      const open = body.style.display !== 'none'
      body.style.display = open ? 'none' : ''
      btn.querySelector('i.toggle-icon')?.classList.toggle('fa-chevron-right', open)
      btn.querySelector('i.toggle-icon')?.classList.toggle('fa-chevron-down', !open)
    })

    // Wire actions resto
    wrap.querySelectorAll('[data-resto-edit]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      const r = tree.find(x => x.id == b.dataset.restoEdit)
      agentRestaurantModal(r, allBranchAgents, () => loadTree())
    })
    wrap.querySelectorAll('[data-resto-del]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      confirmDialog('Supprimer ce restaurant et toutes ses données ?', async () => {
        await api.delete('/agent/restaurants/' + b.dataset.restoDel)
        toast('Supprimé'); loadTree()
      })
    })
    wrap.querySelectorAll('[data-add-marque]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      agentMarqueModal(parseInt(b.dataset.addMarque), null, null, () => loadTree())
    })
    wrap.querySelectorAll('[data-edit-marque]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      const restoId = parseInt(b.dataset.restoId)
      const r = tree.find(x => x.id === restoId)
      const mq = r?.marques?.find(m => m.id == b.dataset.editMarque)
      if (mq) agentMarqueModal(restoId, mq, null, () => loadTree())
    })
    wrap.querySelectorAll('[data-del-marque]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      confirmDialog('Supprimer cette marque ?', async () => {
        await api.delete('/agent/marques/' + b.dataset.delMarque); toast('Supprimé'); loadTree()
      })
    })
    wrap.querySelectorAll('[data-facturer]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      const restoId = parseInt(b.dataset.facturer)
      const r = tree.find(x => x.id === restoId)
      if (r) agentFactureCibleeModal(r)
    })
    // Boutons upload doc + visualisation
    wrap.querySelectorAll('[data-upload-doc]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      agentUploadDocModal(parseInt(b.dataset.upload), b.dataset.docType, b.dataset.docLabel, () => loadTree())
    })
    // Voir document (preview)
    wrap.querySelectorAll('[data-view-doc-agent]').forEach(b => b.onclick = async (e) => {
      e.stopPropagation()
      try {
        const { data } = await api.get('/agent/documents/' + b.dataset.viewDocAgent + '/contenu')
        if (data.url_externe) { window.open(data.url_externe, '_blank'); return }
        if (!data.contenu_base64) { toast('Document vide ou indisponible', 'error'); return }
        const w = window.open('', '_blank')
        const title = escapeHtml(data.nom_fichier || 'Document')
        if (data.mime_type && data.mime_type.startsWith('image/')) {
          w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{margin:0;background:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;box-shadow:0 4px 20px rgba(0,0,0,.5)}</style></head><body><img src="data:${data.mime_type};base64,${data.contenu_base64}" alt="${title}"/></body></html>`)
        } else if (data.mime_type === 'application/pdf') {
          w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body,html{margin:0;height:100%}</style></head><body><iframe src="data:application/pdf;base64,${data.contenu_base64}" style="width:100%;height:100vh;border:0"></iframe></body></html>`)
        } else {
          const a = document.createElement('a')
          a.href = `data:${data.mime_type || 'application/octet-stream'};base64,${data.contenu_base64}`
          a.download = data.nom_fichier || 'document'
          a.click()
          w.close()
        }
      } catch (err) { toast('Impossible d\'ouvrir le document', 'error') }
    })
    // Télécharger document
    wrap.querySelectorAll('[data-download-doc-agent]').forEach(b => b.onclick = async (e) => {
      e.stopPropagation()
      try {
        const { data } = await api.get('/agent/documents/' + b.dataset.downloadDocAgent + '/contenu')
        if (data.url_externe) { window.open(data.url_externe, '_blank'); return }
        if (!data.contenu_base64) { toast('Document vide ou indisponible', 'error'); return }
        const a = document.createElement('a')
        a.href = `data:${data.mime_type || 'application/octet-stream'};base64,${data.contenu_base64}`
        a.download = data.nom_fichier || 'document'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        toast('Téléchargement lancé')
      } catch (err) { toast('Impossible de télécharger le document', 'error') }
    })
    // Supprimer document
    wrap.querySelectorAll('[data-del-doc-agent]').forEach(b => b.onclick = (e) => {
      e.stopPropagation()
      confirmDialog('Supprimer définitivement ce document ?', async () => {
        try {
          await api.delete('/agent/documents/' + b.dataset.delDocAgent)
          toast('Document supprimé'); loadTree()
        } catch (err) { toast(err.response?.data?.error || 'Erreur suppression', 'error') }
      })
    })
  }

  // Hooks
  c.querySelector('#btnReload').onclick = () => {
    stState.annee = parseInt(c.querySelector('#fAnnee').value)
    stState.mois = parseInt(c.querySelector('#fMoisSel').value)
    stState.date_debut = c.querySelector('#fDebut').value
    stState.date_fin = c.querySelector('#fFin').value
    stState.mode = c.querySelector('#fMode').value
    stState.filtre = c.querySelector('#fFiltre').value
    stState.search = c.querySelector('#fSearch').value
    loadTree()
  }
  c.querySelector('#fSearch').addEventListener('input', () => {
    stState.search = c.querySelector('#fSearch').value
    // debounce léger
    clearTimeout(window.__restoSearchT)
    window.__restoSearchT = setTimeout(loadTree, 250)
  })
  c.querySelector('#fFiltre').onchange = () => {
    stState.filtre = c.querySelector('#fFiltre').value
    loadTree()
  }

  loadTree()
}

// Rendu d'une carte resto (arborescence)
function renderRestoCard(r) {
  const cl = r.checklist_progression || { ok: 0, total_obligatoire: 0, pct: 0 }
  const a = r.alertes || {}
  const docs = r.documents || {}

  const statutBadges = []
  if ((r.marques || []).some(m => m.is_portefeuille_proprietaire)) {
    statutBadges.push('<span class="badge badge-gold"><i class="fas fa-crown"></i> Portefeuille</span>')
  }
  if (a.bloque_signature) statutBadges.push('<span class="badge badge-danger"><i class="fas fa-ban"></i> Bloqué signature</span>')
  if ((a.nb_marques_refusees || 0) > 0) statutBadges.push(`<span class="badge badge-danger"><i class="fas fa-circle-xmark"></i> ${a.nb_marques_refusees} refus</span>`)
  if ((a.nb_marques_en_attente || 0) > 0) statutBadges.push(`<span class="badge badge-warning"><i class="fas fa-clock"></i> ${a.nb_marques_en_attente} en attente</span>`)
  if ((a.nb_docs_manquants || 0) > 0) statutBadges.push(`<span class="badge badge-warning"><i class="fas fa-file-circle-exclamation"></i> ${a.nb_docs_manquants} docs</span>`)

  const apportePar = r.agent && r.agent.id === CURRENT_USER.id ? '<strong>Moi</strong>'
    : (r.agent ? escapeHtml((r.agent.prenom || '') + ' ' + (r.agent.nom || '')) + ' ' + niveauPill(r.agent.niveau) : '-')

  const pctColor = cl.pct >= 90 ? 'var(--primary)' : cl.pct >= 60 ? 'var(--accent)' : 'var(--danger)'

  return `
  <div class="card mb-3" data-resto-card="${r.id}" style="padding:0;overflow:hidden">
    <div data-toggle-resto="${r.id}" style="cursor:pointer;padding:1rem 1.25rem;display:flex;align-items:center;gap:1rem;background:linear-gradient(90deg,var(--bg-soft) 0%,transparent 60%);border-bottom:1px solid var(--border)">
      <i class="fas fa-chevron-right toggle-icon" style="color:var(--text-muted);width:14px"></i>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <h3 style="margin:0;font-size:1.05rem">${escapeHtml(r.nom)}</h3>
          ${statutBadges.join(' ')}
        </div>
        <div class="text-muted" style="font-size:.85rem;margin-top:.25rem">
          <i class="fas fa-location-dot"></i> ${escapeHtml(r.ville || '-')} · 
          <i class="fas fa-user-tie"></i> ${apportePar} · 
          <i class="fas fa-tags"></i> ${(r.marques || []).length} marque(s)
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.04em">CA période</div>
        <div style="font-weight:700;font-size:1.1rem">${fmtEUR(r.ca_periode || 0)}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${fmtNum(r.nb_commandes_periode || 0)} cmds</div>
      </div>
      <div style="text-align:right;min-width:120px">
        <div style="font-size:.7rem;text-transform:uppercase;color:var(--text-muted);letter-spacing:.04em">Checklist</div>
        <div style="font-weight:700;color:${pctColor}">${cl.ok}/${cl.total_obligatoire} (${cl.pct}%)</div>
        <div style="height:4px;background:var(--bg-soft);border-radius:2px;overflow:hidden;margin-top:.25rem">
          <div style="height:100%;width:${cl.pct}%;background:${pctColor};transition:width .3s"></div>
        </div>
      </div>
      <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" data-resto-edit="${r.id}" title="Modifier"><i class="fas fa-pen"></i></button>
        <button class="btn btn-sm btn-primary" data-facturer="${r.id}" title="Facturer ce resto"><i class="fas fa-file-invoice"></i></button>
        <button class="btn btn-sm btn-danger" data-resto-del="${r.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
      </div>
    </div>

    <div data-resto-body="${r.id}" style="display:none;padding:1.25rem">
      <!-- Bloc Infos -->
      <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:1rem">
        <div><strong>SIRET :</strong> ${escapeHtml(r.siret || '—')}</div>
        <div><strong>Gérant :</strong> ${escapeHtml(((r.gerant_prenom||'')+' '+(r.gerant_nom||'')).trim() || '—')}</div>
        <div><strong>Tél gérant :</strong> ${escapeHtml(r.gerant_telephone || '—')}</div>
        <div><strong>Email gérant :</strong> ${escapeHtml(r.gerant_email || '—')}</div>
        <div><strong>Signature :</strong> ${r.date_signature ? fmtDate(r.date_signature) : '—'}</div>
        <div><strong>Lancement :</strong> ${r.date_lancement ? fmtDate(r.date_lancement) : '—'}</div>
      </div>

      <!-- Bloc Checklist + Docs -->
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div>
          <div class="card-title" style="font-size:.95rem"><i class="fas fa-list-check"></i> Checklist (${cl.ok}/${cl.total_obligatoire})</div>
          ${(r.checklist || []).length ? `<div style="display:flex;flex-direction:column;gap:.35rem;max-height:240px;overflow:auto">
            ${(r.checklist || []).map(it => {
              const okIcon = it.statut === 'valide' ? '<i class="fas fa-circle-check" style="color:var(--primary)"></i>'
                : it.statut === 'fourni' ? '<i class="fas fa-hourglass-half" style="color:var(--accent)"></i>'
                : '<i class="far fa-circle" style="color:var(--text-muted)"></i>'
              return `<div style="display:flex;align-items:center;gap:.5rem;padding:.25rem .5rem;border-radius:6px;${it.obligatoire ? 'background:var(--bg-soft)' : ''}">
                ${okIcon}
                <span style="flex:1">${escapeHtml(it.libelle)}${it.obligatoire ? ' <span style="color:var(--danger);font-size:.8rem">*</span>' : ''}</span>
                <span class="badge ${it.statut === 'valide' ? 'badge-success' : it.statut === 'fourni' ? 'badge-info' : 'badge-warning'}" style="font-size:.65rem">${it.statut}</span>
              </div>`
            }).join('')}
          </div>` : '<p class="text-muted" style="font-size:.85rem">Aucun élément de checklist</p>'}
        </div>
        <div>
          <div class="card-title" style="font-size:.95rem"><i class="fas fa-folder-open"></i> Documents</div>
          ${[
            { code: 'kbis', label: 'KBIS' },
            { code: 'piece_identite', label: 'CNI gérant' },
            { code: 'rib', label: 'RIB' },
            { code: 'contrat', label: 'Contrat portefeuille' }
          ].map(({ code, label }) => {
            const d = docs[code]
            const fichiers = (d && d.fichiers) || []
            const fourni = fichiers.length > 0
            const valide = d && d.valide > 0
            const icon = fourni ? (valide ? 'circle-check' : 'hourglass-half') : 'file-circle-exclamation'
            const color = fourni ? (valide ? 'var(--primary)' : 'var(--accent)') : 'var(--danger)'
            return `<div style="padding:.35rem .5rem;border-radius:6px;background:var(--bg-soft);margin-bottom:.25rem">
              <div style="display:flex;align-items:center;gap:.5rem">
                <i class="fas fa-${icon}" style="color:${color}"></i>
                <span style="flex:1">${label} ${fourni ? `<span class="text-muted" style="font-size:.75rem">(${fichiers.length})</span>` : ''}</span>
                <button class="btn btn-sm btn-primary" data-upload-doc="${r.id}" data-doc-type="${code}" data-doc-label="${escapeHtml(label)}" title="Ajouter un fichier"><i class="fas fa-upload"></i></button>
              </div>
              ${fichiers.length ? `<div style="display:flex;flex-direction:column;gap:.2rem;margin-top:.3rem;padding-left:1.4rem">
                ${fichiers.map(f => `<div style="display:flex;align-items:center;gap:.4rem;font-size:.78rem">
                  <i class="fas fa-${(f.mime_type || '').startsWith('image/') ? 'file-image' : (f.mime_type === 'application/pdf') ? 'file-pdf' : 'file'}" style="color:var(--text-muted)"></i>
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(f.nom_fichier || '')}">${escapeHtml(f.nom_fichier || '')}</span>
                  <span class="badge ${f.statut === 'valide' ? 'badge-success' : f.statut === 'rejete' ? 'badge-danger' : 'badge-warning'}" style="font-size:.6rem">${f.statut}</span>
                  <button class="btn btn-sm btn-secondary" data-view-doc-agent="${f.id}" title="Voir"><i class="fas fa-eye"></i></button>
                  <button class="btn btn-sm btn-secondary" data-download-doc-agent="${f.id}" title="Télécharger"><i class="fas fa-download"></i></button>
                  <button class="btn btn-sm btn-danger" data-del-doc-agent="${f.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
                </div>`).join('')}
              </div>` : ''}
            </div>`
          }).join('')}
          ${r.rib_manuel_ok ? `<div class="text-muted" style="font-size:.78rem;margin-top:.25rem"><i class="fas fa-check"></i> RIB renseigné manuellement (IBAN, BIC, banque)</div>` : ''}
        </div>
      </div>

      <!-- Bloc Marques -->
      <div class="card-title" style="font-size:.95rem;justify-content:space-between;display:flex;align-items:center">
        <span><i class="fas fa-tags"></i> Marques (${(r.marques || []).length})</span>
        <button class="btn btn-sm btn-primary" data-add-marque="${r.id}"><i class="fas fa-plus"></i> Ajouter une marque</button>
      </div>
      ${(r.marques || []).length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>#</th><th>Marque</th><th>Statut</th><th>Uber Store</th><th>Tablette</th>
          <th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Comm</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${(r.marques || []).map(m => {
          const statutLabel = {
            'en_creation': '<span class="badge badge-info">En création</span>',
            'active': '<span class="badge badge-success">Active</span>',
            'suspendue': '<span class="badge badge-warning">Suspendue</span>',
            'portefeuille': '<span class="badge badge-gold">Portefeuille</span>',
            'refusee': '<span class="badge badge-danger">Refusée</span>',
            'en_attente': '<span class="badge badge-warning">En attente</span>'
          }[m.statut_marque] || (m.actif ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">Inactive</span>')
          return `<tr>
            <td>${m.rang_creation || '-'}</td>
            <td><strong>${escapeHtml(m.nom)}</strong>
              ${m.is_portefeuille_proprietaire ? '<span class="badge badge-gold" style="font-size:.6rem">100%</span>' : ''}
              ${m.date_signature_portefeuille ? `<div class="text-muted" style="font-size:.7rem">Signé ${fmtDate(m.date_signature_portefeuille)}</div>` : ''}
            </td>
            <td>${statutLabel}</td>
            <td><code style="font-size:.75rem">${escapeHtml(m.uber_store_id || '—')}</code></td>
            <td>${m.tablette_fournie ? '<i class="fas fa-tablet-screen-button" style="color:var(--primary)"></i>' : '—'}</td>
            <td class="text-right">${fmtNum(m.nb_commandes_periode || 0)}</td>
            <td class="text-right">${fmtEUR(m.ca_periode || 0)}</td>
            <td class="text-right">${fmtEUR(m.commissions_periode || 0)}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-secondary" data-edit-marque="${m.id}" data-resto-id="${r.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del-marque="${m.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`
        }).join('')}</tbody>
      </table></div>` : '<p class="text-muted" style="padding:.5rem">Aucune marque pour ce restaurant. Cliquez sur « Ajouter une marque ».</p>'}
    </div>
  </div>`
}

// --- Modal restaurant (créa / édition) — enrichi avec gérant + RIB manuel + portefeuille ---
function agentRestaurantModal(r, agents, onSaved) {
  const isEdit = !!r
  const opts = agents.map(a => `<option value="${a.id}" ${(r?.agent_id || CURRENT_USER.id) == a.id ? 'selected' : ''}>${a.id === CURRENT_USER.id ? 'Moi' : escapeHtml(a.prenom + ' ' + a.nom)} (${niveauLabel(a.niveau)})</option>`).join('')
  const m = modal(isEdit ? 'Modifier le restaurant' : 'Nouveau restaurant', `
    <form id="rForm">
      <div class="card-title" style="font-size:.95rem"><i class="fas fa-store"></i> Restaurant</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom <span class="req">*</span></label><input id="nom" required value="${escapeHtml(r?.nom || '')}"/></div>
        <div class="form-group"><label>Raison sociale</label><input id="raison_sociale" value="${escapeHtml(r?.raison_sociale || '')}"/></div>
        <div class="form-group"><label>SIRET</label><input id="siret" value="${escapeHtml(r?.siret || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Adresse</label><input id="adresse" value="${escapeHtml(r?.adresse || '')}"/></div>
        <div class="form-group"><label>Code postal</label><input id="code_postal" value="${escapeHtml(r?.code_postal || '')}"/></div>
        <div class="form-group"><label>Ville</label><input id="ville" value="${escapeHtml(r?.ville || '')}"/></div>
        <div class="form-group"><label>Téléphone</label><input id="telephone" value="${escapeHtml(r?.telephone || '')}"/></div>
        <div class="form-group"><label>Email</label><input id="email" type="email" value="${escapeHtml(r?.email || '')}"/></div>
        <div class="form-group"><label>Apporté par</label><select id="agent_id">${opts}</select></div>
        <div class="form-group"><label>Date signature</label><input id="date_signature" type="date" value="${r?.date_signature || ''}"/></div>
        <div class="form-group"><label>Date lancement</label><input id="date_lancement" type="date" value="${r?.date_lancement || ''}"/></div>
        <div class="form-group">
          <label>Tablette SR Shop ?</label>
          <select id="tablette_sr_shop">
            <option value="0" ${!r?.tablette_sr_shop ? 'selected' : ''}>Non</option>
            <option value="1" ${r?.tablette_sr_shop ? 'selected' : ''}>Oui (+0.05 € / commande)</option>
          </select>
        </div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-user-tie"></i> Gérant</div>
      <div class="form-grid">
        <div class="form-group"><label>Nom gérant</label><input id="gerant_nom" value="${escapeHtml(r?.gerant_nom || '')}"/></div>
        <div class="form-group"><label>Prénom gérant</label><input id="gerant_prenom" value="${escapeHtml(r?.gerant_prenom || '')}"/></div>
        <div class="form-group"><label>Téléphone gérant</label><input id="gerant_telephone" value="${escapeHtml(r?.gerant_telephone || '')}"/></div>
        <div class="form-group"><label>Email gérant</label><input id="gerant_email" type="email" value="${escapeHtml(r?.gerant_email || '')}"/></div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-building-columns"></i> RIB manuel (si pas d'upload)</div>
      <div class="form-grid">
        <div class="form-group"><label>Titulaire</label><input id="rib_titulaire" value="${escapeHtml(r?.rib_titulaire || '')}"/></div>
        <div class="form-group"><label>Banque</label><input id="rib_banque_nom" value="${escapeHtml(r?.rib_banque_nom || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>IBAN</label><input id="rib_iban" value="${escapeHtml(r?.rib_iban || '')}"/></div>
        <div class="form-group"><label>BIC / SWIFT</label><input id="rib_bic" value="${escapeHtml(r?.rib_bic || '')}"/></div>
        <div class="form-group"><label>Références</label><input id="rib_references" value="${escapeHtml(r?.rib_references || '')}"/></div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-crown"></i> Portefeuille propriétaire</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Statut</label>
          <select id="is_portefeuille_proprietaire">
            <option value="0" ${!r?.is_portefeuille_proprietaire ? 'selected' : ''}>Non</option>
            <option value="1" ${r?.is_portefeuille_proprietaire ? 'selected' : ''}>Oui (signature portefeuille)</option>
          </select>
        </div>
        <div class="form-group"><label>Date signature portefeuille</label><input id="date_signature_portefeuille" type="date" value="${r?.date_signature_portefeuille || ''}"/></div>
      </div>

      <div class="form-group" style="margin-top:1rem"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(r?.notes || '')}</textarea></div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`, { size: 'lg' })
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#rForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = {
      nom: get('nom').trim(), raison_sociale: get('raison_sociale').trim() || null,
      siret: get('siret').trim() || null, adresse: get('adresse').trim() || null,
      code_postal: get('code_postal').trim() || null, ville: get('ville').trim() || null,
      telephone: get('telephone').trim() || null, email: get('email').trim() || null,
      agent_id: parseInt(get('agent_id')),
      date_signature: get('date_signature') || null, date_lancement: get('date_lancement') || null,
      tablette_sr_shop: parseInt(get('tablette_sr_shop')),
      gerant_nom: get('gerant_nom').trim() || null,
      gerant_prenom: get('gerant_prenom').trim() || null,
      gerant_telephone: get('gerant_telephone').trim() || null,
      gerant_email: get('gerant_email').trim() || null,
      rib_titulaire: get('rib_titulaire').trim() || null,
      rib_banque_nom: get('rib_banque_nom').trim() || null,
      rib_iban: get('rib_iban').trim() || null,
      rib_bic: get('rib_bic').trim() || null,
      rib_references: get('rib_references').trim() || null,
      is_portefeuille_proprietaire: parseInt(get('is_portefeuille_proprietaire')),
      date_signature_portefeuille: get('date_signature_portefeuille') || null,
      notes: get('notes').trim() || null
    }
    try {
      if (isEdit) await api.put('/agent/restaurants/' + r.id, payload)
      else await api.post('/agent/restaurants', payload)
      toast('Enregistré'); m.close()
      if (onSaved) onSaved(); else navigate('a-restaurants')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Modal marque (créa / édition) — enrichi Uber Manager + Uber Orders + tablette + commission_info ---
function agentMarqueModal(restoId, mq, parentModal, onSaved) {
  const isEdit = !!mq
  const m = modal(isEdit ? 'Modifier la marque' : 'Nouvelle marque virtuelle', `
    <form id="mForm">
      <div class="card-title" style="font-size:.95rem"><i class="fas fa-tag"></i> Marque</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom <span class="req">*</span></label><input id="nom" required value="${escapeHtml(mq?.nom || '')}"/></div>
        <div class="form-group"><label>Plateforme</label>
          <select id="plateforme">
            <option value="uber_eats" ${!mq || mq.plateforme === 'uber_eats' ? 'selected' : ''}>Uber Eats</option>
            <option value="deliveroo" ${mq?.plateforme === 'deliveroo' ? 'selected' : ''}>Deliveroo</option>
            <option value="just_eat" ${mq?.plateforme === 'just_eat' ? 'selected' : ''}>Just Eat</option>
            <option value="autre" ${mq?.plateforme === 'autre' ? 'selected' : ''}>Autre</option>
          </select>
        </div>
        <div class="form-group"><label>Uber Store ID</label><input id="uber_store_id" value="${escapeHtml(mq?.uber_store_id || '')}"/></div>
        <div class="form-group"><label>Date lancement</label><input id="date_lancement" type="date" value="${mq?.date_lancement || ''}"/></div>
        <div class="form-group"><label>Statut marque</label>
          <select id="statut_marque">
            ${['en_creation','active','suspendue','portefeuille','refusee','en_attente'].map(s =>
              `<option value="${s}" ${(mq?.statut_marque || 'en_creation') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Active ?</label>
          <select id="actif"><option value="1" ${!mq || mq.actif ? 'selected' : ''}>Oui</option><option value="0" ${mq && !mq.actif ? 'selected' : ''}>Non</option></select>
        </div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-key"></i> Accès Uber Eats Manager</div>
      <div class="form-grid">
        <div class="form-group"><label>Email</label><input id="uber_manager_email" type="email" value="${escapeHtml(mq?.uber_manager_email || '')}"/></div>
        <div class="form-group"><label>Mot de passe</label><input id="uber_manager_password" type="text" value="${escapeHtml(mq?.uber_manager_password || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>URL</label><input id="uber_manager_url" value="${escapeHtml(mq?.uber_manager_url || '')}"/></div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-tablet-screen-button"></i> Accès Uber Eats Orders / Tablette</div>
      <div class="form-grid">
        <div class="form-group"><label>Email</label><input id="uber_orders_email" type="email" value="${escapeHtml(mq?.uber_orders_email || '')}"/></div>
        <div class="form-group"><label>Mot de passe</label><input id="uber_orders_password" type="text" value="${escapeHtml(mq?.uber_orders_password || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>URL</label><input id="uber_orders_url" value="${escapeHtml(mq?.uber_orders_url || '')}"/></div>
        <div class="form-group">
          <label>Tablette fournie ?</label>
          <select id="tablette_fournie">
            <option value="0" ${!mq?.tablette_fournie ? 'selected' : ''}>Non</option>
            <option value="1" ${mq?.tablette_fournie ? 'selected' : ''}>Oui</option>
          </select>
        </div>
        <div class="form-group"><label>N° série tablette</label><input id="tablette_serial" value="${escapeHtml(mq?.tablette_serial || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notes tablette</label><input id="tablette_notes" value="${escapeHtml(mq?.tablette_notes || '')}"/></div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-circle-info"></i> Commissions & opérationnel</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Infos commission (libre)</label><textarea id="commission_info" rows="2">${escapeHtml(mq?.commission_info || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1"><label>Accès / infos opérationnels</label><textarea id="acces_operationnels" rows="2">${escapeHtml(mq?.acces_operationnels || '')}</textarea></div>
      </div>

      <div class="card-title" style="font-size:.95rem;margin-top:1rem"><i class="fas fa-crown"></i> Portefeuille 100%</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Statut portefeuille</label>
          <select id="is_portefeuille_proprietaire">
            <option value="0" ${!mq?.is_portefeuille_proprietaire ? 'selected' : ''}>Non</option>
            <option value="1" ${mq?.is_portefeuille_proprietaire ? 'selected' : ''}>Oui</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date signature portefeuille</label>
          <input id="date_signature_portefeuille" type="date" value="${mq?.date_signature_portefeuille || ''}"/>
        </div>
      </div>

      <div class="form-group" style="margin-top:1rem"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(mq?.notes || '')}</textarea></div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`, { size: 'lg' })
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#mForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = {
      nom: get('nom').trim(),
      plateforme: get('plateforme'),
      uber_store_id: get('uber_store_id').trim() || null,
      date_lancement: get('date_lancement') || null,
      statut_marque: get('statut_marque'),
      actif: parseInt(get('actif')),
      uber_manager_email: get('uber_manager_email').trim() || null,
      uber_manager_password: get('uber_manager_password').trim() || null,
      uber_manager_url: get('uber_manager_url').trim() || null,
      uber_orders_email: get('uber_orders_email').trim() || null,
      uber_orders_password: get('uber_orders_password').trim() || null,
      uber_orders_url: get('uber_orders_url').trim() || null,
      tablette_fournie: parseInt(get('tablette_fournie')),
      tablette_serial: get('tablette_serial').trim() || null,
      tablette_notes: get('tablette_notes').trim() || null,
      commission_info: get('commission_info').trim() || null,
      acces_operationnels: get('acces_operationnels').trim() || null,
      is_portefeuille_proprietaire: parseInt(get('is_portefeuille_proprietaire')),
      date_signature_portefeuille: get('date_signature_portefeuille') || null,
      notes: get('notes').trim() || null
    }
    try {
      if (isEdit) await api.put('/agent/marques/' + mq.id, payload)
      else await api.post(`/agent/restaurants/${restoId}/marques`, payload)
      toast('Enregistré'); m.close()
      if (parentModal) parentModal.close()
      if (onSaved) onSaved()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// --- Modal facture ciblée (resto + marque + période) ---
function agentFactureCibleeModal(resto) {
  const marques = resto.marques || []
  const now = new Date()
  const m = modal('Facturer ' + resto.nom, `
    <form id="fForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>Marque (optionnel — laissez « Toutes » pour le resto entier)</label>
          <select id="marque_id">
            <option value="">Toutes les marques du resto</option>
            ${marques.map(mq => `<option value="${mq.id}">${escapeHtml(mq.nom)}${mq.is_portefeuille_proprietaire ? ' (Portefeuille)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Mode période</label>
          <select id="mode">
            <option value="mois">Mois</option>
            <option value="custom">Plage personnalisée</option>
          </select>
        </div>
        <div class="form-group" id="grpA"><label>Année</label><input id="annee" type="number" value="${now.getFullYear()}" min="2024" max="2030"/></div>
        <div class="form-group" id="grpM"><label>Mois</label>
          <select id="mois">${monthsFR.map((mm,i)=>`<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${mm}</option>`).join('')}</select>
        </div>
        <div class="form-group" id="grpD1" style="display:none"><label>Du</label><input id="date_debut" type="date"/></div>
        <div class="form-group" id="grpD2" style="display:none"><label>Au</label><input id="date_fin" type="date"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2"></textarea></div>
      </div>
      <div id="preview" class="mt-3"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="button" class="btn btn-secondary" id="btnPreview"><i class="fas fa-eye"></i> Aperçu</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-file-invoice"></i> Créer brouillon</button>
      </div>
    </form>`, { size: 'lg' })
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#mode').onchange = (e) => {
    const v = e.target.value
    m.el.querySelector('#grpA').style.display = v === 'mois' ? '' : 'none'
    m.el.querySelector('#grpM').style.display = v === 'mois' ? '' : 'none'
    m.el.querySelector('#grpD1').style.display = v === 'custom' ? '' : 'none'
    m.el.querySelector('#grpD2').style.display = v === 'custom' ? '' : 'none'
  }

  function buildPayload() {
    const get = id => m.el.querySelector('#' + id).value
    const mode = get('mode')
    const p = { restaurant_id: resto.id }
    const mq = get('marque_id')
    if (mq) p.marque_id = parseInt(mq)
    if (mode === 'mois') {
      p.annee = parseInt(get('annee'))
      p.mois = parseInt(get('mois'))
    } else {
      p.date_debut = get('date_debut')
      p.date_fin = get('date_fin')
    }
    return p
  }

  m.el.querySelector('#btnPreview').onclick = async () => {
    try {
      const { data } = await api.post('/factures/agent/preview', buildPayload())
      m.el.querySelector('#preview').innerHTML = data.lignes.length ? `
        <div class="card"><div class="card-title"><i class="fas fa-list"></i> Aperçu — ${escapeHtml(data.periode.label)}</div>
          <table class="data-table"><thead><tr><th>Libellé</th><th class="text-right">Qté</th><th class="text-right">PU</th><th class="text-right">HT</th></tr></thead>
          <tbody>${data.lignes.map(l => `<tr>
            <td>${escapeHtml(l.libelle)}<div class="text-muted" style="font-size:.75rem">${escapeHtml(l.description)}</div></td>
            <td class="text-right">${fmtNum(l.quantite)}</td>
            <td class="text-right">${fmtEUR(l.prix_unitaire)}</td>
            <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
          </tr>`).join('')}
          <tr><td colspan="3" class="text-right"><strong>Total HT</strong></td><td class="text-right"><strong>${fmtEUR(data.total)}</strong></td></tr>
          </tbody></table></div>` : '<p class="text-muted">Aucune commission à facturer pour cette sélection.</p>'
    } catch (err) { toast(err.response?.data?.error || 'Erreur preview', 'error') }
  }

  m.el.querySelector('#fForm').onsubmit = async e => {
    e.preventDefault()
    const p = buildPayload()
    p.notes = m.el.querySelector('#notes').value.trim() || null
    try {
      const r = await api.post('/factures/agent/create', p)
      toast('Facture créée : ' + (r.data.numero || '#' + r.data.id))
      m.close()
      if (typeof loadTree === 'function') loadTree()
    } catch (err) { toast(err.response?.data?.error || 'Erreur création', 'error') }
  }
}

// --- Modal upload document (KBIS / CNI / RIB / contrat) ---
function agentUploadDocModal(restaurantId, docType, docLabel, onUploaded) {
  const m = modal('Upload ' + docLabel, `
    <form id="dForm">
      <p class="text-muted">Sélectionnez un fichier (PDF / image, max 5 Mo) pour le document <strong>${escapeHtml(docLabel)}</strong>.</p>
      <div class="form-group"><label>Fichier <span class="req">*</span></label><input type="file" id="fichier" accept=".pdf,image/*" required/></div>
      <div class="form-group"><label>Commentaire (optionnel)</label><input id="commentaire"/></div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-upload"></i> Téléverser</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#dForm').onsubmit = async e => {
    e.preventDefault()
    const f = m.el.querySelector('#fichier').files[0]
    if (!f) return toast('Sélectionnez un fichier', 'error')
    if (f.size > 5 * 1024 * 1024) return toast('Fichier trop volumineux (max 5 Mo)', 'error')
    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = reader.result.split(',')[1]
      try {
        await api.post('/agent/documents', {
          restaurant_id: restaurantId,
          type_document: docType,
          nom_fichier: f.name,
          mime_type: f.type,
          taille: f.size,
          contenu_base64: b64,
          commentaire: m.el.querySelector('#commentaire').value.trim() || null
        })
        toast('Document téléversé'); m.close(); if (onUploaded) onUploaded()
      } catch (err) { toast(err.response?.data?.error || 'Erreur upload', 'error') }
    }
    reader.readAsDataURL(f)
  }
}

// Compat : agentRestaurantDetail (popup détaillé) — conservé pour les anciens appels (admin marques etc.)
async function agentRestaurantDetail(id) {
  const { data } = await api.get('/agent/restaurants/' + id)
  const r = data.restaurant, marques = data.marques
  const m = modal(`${r.nom} — Marques virtuelles`, `
    <div class="form-grid mb-3">
      <div><strong>Apporté par :</strong> ${r.agent_id === CURRENT_USER.id ? 'Moi' : escapeHtml((r.agent_prenom||'') + ' ' + (r.agent_nom||''))}</div>
      <div><strong>Rang :</strong> #${r.rang_apport || '-'} ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}</div>
    </div>
    <div class="card-title"><i class="fas fa-tags"></i> Marques (${marques.length})
      <button class="btn btn-sm btn-primary" id="btnAdd" style="margin-left:auto"><i class="fas fa-plus"></i> Ajouter</button>
    </div>
    <table class="data-table">
      <thead><tr><th>#</th><th>Nom</th><th>Plateforme</th><th>Uber ID</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${marques.length ? marques.map(mq => `
        <tr>
          <td>${mq.rang_creation || '-'} ${mq.is_portefeuille_proprietaire ? '<span class="badge badge-gold" style="font-size:.6rem">P</span>' : ''}</td>
          <td><strong>${escapeHtml(mq.nom)}</strong></td>
          <td>${escapeHtml(mq.plateforme)}</td>
          <td><code>${escapeHtml(mq.uber_store_id || '-')}</code></td>
          <td class="text-right">${fmtNum(mq.nb_commandes)}</td>
          <td class="text-right">${fmtEUR(mq.ca_total)}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-em="${mq.id}"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" data-dm="${mq.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune marque</td></tr>'}</tbody>
    </table>`)
  m.el.querySelector('#btnAdd').onclick = () => agentMarqueModal(id, null, m, () => { m.close(); agentRestaurantDetail(id) })
  m.el.querySelectorAll('[data-em]').forEach(b => b.onclick = () => {
    const mq = marques.find(x => x.id == b.dataset.em)
    agentMarqueModal(id, mq, m, () => { m.close(); agentRestaurantDetail(id) })
  })
  m.el.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => confirmDialog('Supprimer cette marque ?',
    async () => { await api.delete('/agent/marques/' + b.dataset.dm); toast('Supprimé'); m.close(); agentRestaurantDetail(id) }))
}

// --- Imports agent ---
PAGES['a-imports'] = async (c) => loadImportsPage(c, '/agent/imports')

// --- Mes commissions ---
PAGES['a-commissions'] = async (c) => {
  const now = new Date()
  let annee = now.getFullYear(), mois = now.getMonth() + 1
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Mes commissions</h1><div class="subtitle">Détail mois par mois</div></div>
    </div>
    <div class="card mb-3">
      <div class="form-grid">
        <div class="form-group"><label>Année</label><input id="annee" type="number" value="${annee}" min="2024" max="2030"/></div>
        <div class="form-group"><label>Mois</label>
          <select id="mois">${monthsFR.map((m, i) => `<option value="${i+1}" ${i+1===mois?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="display:flex;align-items:end"><button class="btn btn-primary" id="btnLoad"><i class="fas fa-calculator"></i> Calculer</button></div>
      </div>
    </div>
    <div id="result"></div>`
  const load = async () => {
    annee = parseInt(c.querySelector('#annee').value); mois = parseInt(c.querySelector('#mois').value)
    const { data } = await api.get(`/agent/commissions?annee=${annee}&mois=${mois}`)
    const d = data.detail
    c.querySelector('#result').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card primary"><div class="stat-label">Mes commissions</div><div class="stat-value">${fmtEUR(d.total)}</div><div class="stat-extra">${monthsFR[mois-1]} ${annee}</div></div>
        <div class="stat-card gold"><div class="stat-label">Portefeuille (100%)</div><div class="stat-value">${fmtEUR(d.commission_portefeuille)}</div><div class="stat-extra">${d.nb_commandes_portefeuille} cmds</div></div>
        <div class="stat-card accent"><div class="stat-label">Standard</div><div class="stat-value">${fmtEUR(d.commission_propre)}</div><div class="stat-extra">${d.nb_commandes_propres} cmds</div></div>
        <div class="stat-card info"><div class="stat-label">Sur sous-agents</div><div class="stat-value">${fmtEUR(d.commission_n1 + d.commission_n2)}</div><div class="stat-extra">${d.nb_commandes_n1 + d.nb_commandes_n2} cmds</div></div>
      </div>
      <div class="card mb-3">
        <div class="card-title"><i class="fas fa-store"></i> Mes restaurants ce mois-ci</div>
        ${data.restaurants.length ? `
        <table class="data-table">
          <thead><tr><th>Restaurant</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Facturation DropEat</th></tr></thead>
          <tbody>${data.restaurants.map(r => `<tr>
            <td>${escapeHtml(r.restaurant_nom)}</td>
            <td class="text-right">${fmtNum(r.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(r.ca)}</td>
            <td class="text-right">${fmtEUR(r.facturation)}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="text-muted">Aucune commande</p>'}
      </div>
      ${data.sous_agents.length ? `
      <div class="card">
        <div class="card-title"><i class="fas fa-people-group"></i> Performance sous-agents (génération de commission pour vous)</div>
        <table class="data-table">
          <thead><tr><th>Sous-agent</th><th>Niveau</th><th class="text-right">Leur total</th></tr></thead>
          <tbody>${data.sous_agents.map(a => `<tr>
            <td>${escapeHtml(a.prenom + ' ' + a.nom)}</td>
            <td>${niveauPill(a.niveau)}</td>
            <td class="text-right">${fmtEUR(a.total)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : ''}`
  }
  c.querySelector('#btnLoad').onclick = load
  await load()
}

// --- Historique paiements agent ---
PAGES['a-historique'] = async (c) => {
  const { data } = await api.get('/agent/commissions/historique')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Historique des paiements</h1><div class="subtitle">Vos paiements passés</div></div>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Période</th><th class="text-right">Montant</th><th>Statut</th><th>Date</th><th>Méthode</th><th>Référence</th></tr></thead>
      <tbody>${data.paiements.length ? data.paiements.map(p => `<tr>
        <td>${monthsFR[p.periode_mois-1]} ${p.periode_annee}</td>
        <td class="text-right"><strong>${fmtEUR(p.montant)}</strong></td>
        <td>${p.statut === 'paye' ? '<span class="badge badge-primary">Payé</span>' : p.statut === 'en_attente' ? '<span class="badge badge-accent">En attente</span>' : '<span class="badge badge-danger">Annulé</span>'}</td>
        <td>${fmtDate(p.date_paiement)}</td>
        <td>${escapeHtml(p.methode || '-')}</td>
        <td>${escapeHtml(p.reference || '-')}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="text-center text-muted">Aucun paiement enregistré</td></tr>'}</tbody>
    </table></div>`
}

// ============================================================
// === DEMANDES DE PAIEMENT (agent) ===========================
// ============================================================
PAGES['a-demandes-paiement'] = async (c) => {
  const [cum, mine] = await Promise.all([
    api.get('/demandes-paiement/cumul'),
    api.get('/demandes-paiement/mine')
  ])
  const cumul = cum.data.cumul || {}
  const demandes = mine.data.demandes || []

  const eligible = !!cumul.eligible
  const seuilMin = cumul.seuil_min || 20

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-hand-holding-dollar"></i> Demander un paiement</h1>
        <div class="subtitle">Récupérez vos commissions cumulées dès <strong>${fmtEUR(seuilMin)}</strong> minimum</div>
      </div>
    </div>

    <!-- Card cumul disponible -->
    <div class="card mb-3" style="background:linear-gradient(135deg,${eligible ? '#ecfdf5 0%,#fefce8' : '#f8fafc 0%,#f1f5f9'} 100%);border-left:4px solid ${eligible ? '#06A05A' : '#94a3b8'}">
      <div style="display:grid;grid-template-columns:1fr auto;gap:1.2rem;align-items:center">
        <div>
          <div style="font-size:.8rem;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Cumul disponible</div>
          <div style="font-size:2.6rem;font-weight:700;color:${eligible ? '#06A05A' : '#64748b'};line-height:1">${fmtEUR(cumul.total_disponible || 0)}</div>
          <div style="margin-top:.6rem;font-size:.88rem;color:#475569">
            ${cumul.nb_periodes || 0} période(s) de commissions non encore demandée(s).
            ${eligible
              ? '<br><strong style="color:#06A05A"><i class="fas fa-check-circle"></i> Vous pouvez demander un paiement</strong>'
              : `<br><span style="color:#dc2626"><i class="fas fa-info-circle"></i> Seuil minimum non atteint (${fmtEUR(seuilMin)})</span>`
            }
          </div>
        </div>
        <button id="btnDemander" class="btn btn-primary btn-lg" ${eligible ? '' : 'disabled'}>
          <i class="fas fa-paper-plane"></i> Demander le paiement
        </button>
      </div>

      <!-- Breakdown -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-top:1rem">
        <div style="background:white;border-radius:6px;padding:.6rem;border:1px solid #e2e8f0">
          <div style="font-size:.72rem;color:#64748b;text-transform:uppercase">Commissions propres</div>
          <div style="font-size:1.1rem;font-weight:600">${fmtEUR(cumul.total_propre || 0)}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:.6rem;border:1px solid #fde68a">
          <div style="font-size:.72rem;color:#b45309;text-transform:uppercase">Portefeuille 100%</div>
          <div style="font-size:1.1rem;font-weight:600">${fmtEUR(cumul.total_portefeuille || 0)}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:.6rem;border:1px solid #c7d2fe">
          <div style="font-size:.72rem;color:#4338ca;text-transform:uppercase">N+1 (filleuls)</div>
          <div style="font-size:1.1rem;font-weight:600">${fmtEUR(cumul.total_n1 || 0)}</div>
        </div>
        <div style="background:white;border-radius:6px;padding:.6rem;border:1px solid #fbcfe8">
          <div style="font-size:.72rem;color:#9d174d;text-transform:uppercase">N+2 (sous-filleuls)</div>
          <div style="font-size:1.1rem;font-weight:600">${fmtEUR(cumul.total_n2 || 0)}</div>
        </div>
      </div>
    </div>

    <!-- Détail périodes incluses -->
    ${(cumul.commissions || []).length > 0 ? `
    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-list-ul"></i> Périodes incluses dans le prochain paiement (${cumul.commissions.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Période</th>
          <th class="text-right">Propre</th>
          <th class="text-right">Portefeuille</th>
          <th class="text-right">N+1</th>
          <th class="text-right">N+2</th>
          <th class="text-right"><strong>Total</strong></th>
        </tr></thead>
        <tbody>${cumul.commissions.map(cc => `<tr>
          <td><strong>${monthsFR[cc.periode_mois-1]} ${cc.periode_annee}</strong></td>
          <td class="text-right">${fmtEUR(cc.commission_propre || 0)}</td>
          <td class="text-right" style="color:#b45309">${fmtEUR(cc.commission_portefeuille || 0)}</td>
          <td class="text-right" style="color:#4338ca">${fmtEUR(cc.commission_n1 || 0)}</td>
          <td class="text-right" style="color:#9d174d">${fmtEUR(cc.commission_n2 || 0)}</td>
          <td class="text-right"><strong>${fmtEUR(cc.total || 0)}</strong></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    ` : ''}

    <!-- Historique des demandes -->
    <div class="card">
      <div class="card-title"><i class="fas fa-history"></i> Historique de mes demandes (${demandes.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Date demande</th>
          <th class="text-right">Montant</th>
          <th>Statut</th>
          <th>Traitée le</th>
          <th>Méthode</th>
          <th>Référence</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${demandes.length ? demandes.map(d => `<tr>
          <td>${fmtDateTime(d.date_demande)}</td>
          <td class="text-right"><strong>${fmtEUR(d.montant_demande)}</strong></td>
          <td>${demandeStatutBadge(d.statut)}</td>
          <td>${d.date_traitement ? fmtDateTime(d.date_traitement) : '<span class="text-muted">—</span>'}</td>
          <td>${escapeHtml(d.methode_paiement || '-')}</td>
          <td>${escapeHtml(d.reference_paiement || '-')}</td>
          <td class="text-right">
            ${d.statut === 'en_attente' ? `<button class="btn btn-sm btn-danger" data-cancel="${d.id}" title="Annuler"><i class="fas fa-times"></i></button>` : ''}
            ${d.motif_rejet ? `<button class="btn btn-sm btn-secondary" data-motif="${escapeHtml(d.motif_rejet)}" title="Voir motif"><i class="fas fa-info-circle"></i></button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune demande pour le moment</td></tr>'}</tbody>
      </table></div>
    </div>
  `

  const btn = document.getElementById('btnDemander')
  if (btn && eligible) {
    btn.onclick = async () => {
      const m = modal('<i class="fas fa-paper-plane"></i> Confirmer ma demande de paiement', `
        <p>Vous demandez le paiement de <strong style="font-size:1.2rem;color:#06A05A">${fmtEUR(cumul.total_disponible)}</strong> correspondant à ${cumul.nb_periodes} période(s) de commissions.</p>
        <div style="background:#fef3c7;padding:.7rem;border-radius:6px;font-size:.85rem;margin:.6rem 0">
          <i class="fas fa-info-circle" style="color:#b45309"></i>
          Une fois validée par DropEat, vous recevrez le paiement par virement sur votre IBAN. Toutes les commissions incluses seront marquées "payées" et ne pourront plus être redemandées.
        </div>
        <div class="form-group">
          <label>Notes (optionnel)</label>
          <textarea id="dpNotes" rows="2" placeholder="Ex: paiement avant le 30/06, RIB modifié, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-close>Annuler</button>
          <button type="button" class="btn btn-primary" id="dpConfirm"><i class="fas fa-check"></i> Confirmer la demande</button>
        </div>
      `)
      m.el.querySelector('[data-close]').onclick = () => m.close()
      m.el.querySelector('#dpConfirm').onclick = async () => {
        const notes = m.el.querySelector('#dpNotes').value.trim()
        try {
          const { data } = await api.post('/demandes-paiement', { notes })
          toast(`Demande #${data.demande_id} créée pour ${fmtEUR(data.montant)}`, 'success')
          m.close()
          navigate('a-demandes-paiement')
        } catch (err) {
          toast(err.response?.data?.error || 'Erreur création demande', 'error')
        }
      }
    }
  }

  c.querySelectorAll('[data-cancel]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Annuler cette demande de paiement ? Les commissions redeviendront disponibles.')) return
      try {
        await api.delete('/demandes-paiement/' + b.dataset.cancel)
        toast('Demande annulée')
        navigate('a-demandes-paiement')
      } catch (err) {
        toast(err.response?.data?.error || 'Erreur', 'error')
      }
    }
  })
  c.querySelectorAll('[data-motif]').forEach(b => {
    b.onclick = () => alert('Motif de rejet :\n\n' + b.dataset.motif)
  })
}

function demandeStatutBadge(s) {
  const map = {
    en_attente: '<span class="badge badge-accent">En attente</span>',
    validee: '<span class="badge badge-info">Validée</span>',
    payee: '<span class="badge" style="background:#06A05A;color:white">Payée ✓</span>',
    rejetee: '<span class="badge badge-danger">Rejetée</span>',
    annulee: '<span class="badge" style="background:#9ca3af;color:white">Annulée</span>'
  }
  return map[s] || s
}

// ============================================================
// === DEMANDES DE PAIEMENT (admin) ===========================
// ============================================================
PAGES['admin-demandes-paiement'] = async (c) => {
  const statutFilter = c.dataset?.statutFilter || ''
  const url = '/demandes-paiement/admin/all' + (statutFilter ? '?statut=' + statutFilter : '')
  const { data } = await api.get(url)
  const demandes = data.demandes || []
  const stats = data.stats || {}

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-hand-holding-dollar"></i> Demandes de paiement</h1>
        <div class="subtitle">Demandes des agents — validation et paiement</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <select id="filtStatut" class="form-control" style="width:auto">
          <option value="">Tous statuts</option>
          <option value="en_attente" ${statutFilter==='en_attente'?'selected':''}>En attente</option>
          <option value="payee" ${statutFilter==='payee'?'selected':''}>Payées</option>
          <option value="rejetee" ${statutFilter==='rejetee'?'selected':''}>Rejetées</option>
          <option value="annulee" ${statutFilter==='annulee'?'selected':''}>Annulées</option>
        </select>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-label">En attente</div><div class="stat-value">${stats.nb_en_attente || 0}</div><div class="stat-extra">${fmtEUR(stats.montant_en_attente || 0)}</div></div>
      <div class="stat-card primary"><div class="stat-label">Payées</div><div class="stat-value">${stats.nb_payees || 0}</div><div class="stat-extra">${fmtEUR(stats.montant_paye || 0)}</div></div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> ${demandes.length} demande(s)</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Date</th>
          <th>Agent</th>
          <th>Niveau</th>
          <th class="text-right">Montant</th>
          <th class="text-right">Propre</th>
          <th class="text-right">Portefeuille</th>
          <th class="text-right">N+1</th>
          <th class="text-right">N+2</th>
          <th>Statut</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${demandes.length ? demandes.map(d => `<tr>
          <td><small>${fmtDateTime(d.date_demande)}</small></td>
          <td>
            <strong>${escapeHtml(d.agent_prenom + ' ' + d.agent_nom)}</strong>
            <br><small class="text-muted">${escapeHtml(d.agent_email)}</small>
          </td>
          <td>${niveauPill(d.agent_niveau)}</td>
          <td class="text-right"><strong>${fmtEUR(d.montant_demande)}</strong></td>
          <td class="text-right">${fmtEUR(d.montant_propre || 0)}</td>
          <td class="text-right" style="color:#b45309">${fmtEUR(d.montant_portefeuille || 0)}</td>
          <td class="text-right" style="color:#4338ca">${fmtEUR(d.montant_n1 || 0)}</td>
          <td class="text-right" style="color:#9d174d">${fmtEUR(d.montant_n2 || 0)}</td>
          <td>${demandeStatutBadge(d.statut)}</td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-view="${d.id}" title="Voir détail"><i class="fas fa-eye"></i></button>
            ${d.statut === 'en_attente' ? `
              <button class="btn btn-sm btn-primary" data-valider="${d.id}" title="Valider et payer"><i class="fas fa-check"></i></button>
              <button class="btn btn-sm btn-danger" data-rejeter="${d.id}" title="Rejeter"><i class="fas fa-times"></i></button>
            ` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="10" class="text-center text-muted">Aucune demande</td></tr>'}</tbody>
      </table></div>
    </div>
  `

  document.getElementById('filtStatut').onchange = (e) => {
    c.dataset.statutFilter = e.target.value
    PAGES['admin-demandes-paiement'](c)
  }

  c.querySelectorAll('[data-view]').forEach(b => {
    b.onclick = () => adminDemandePaiementDetailModal(b.dataset.view)
  })
  c.querySelectorAll('[data-valider]').forEach(b => {
    b.onclick = () => adminValiderDemandeModal(b.dataset.valider)
  })
  c.querySelectorAll('[data-rejeter]').forEach(b => {
    b.onclick = () => adminRejeterDemandeModal(b.dataset.rejeter)
  })
}

async function adminDemandePaiementDetailModal(id) {
  const { data } = await api.get('/demandes-paiement/admin/' + id)
  const d = data.demande
  const commissions = data.commissions || []
  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div>
        <strong>Agent :</strong> ${escapeHtml(d.agent_prenom + ' ' + d.agent_nom)}<br>
        <small>${escapeHtml(d.agent_email)} · ${niveauLabel(d.agent_niveau)}</small><br>
        <small><strong>IBAN :</strong> ${escapeHtml(d.agent_iban || '— non renseigné —')}</small>
      </div>
      <div style="text-align:right">
        <div style="font-size:2rem;font-weight:700;color:#06A05A">${fmtEUR(d.montant_demande)}</div>
        ${demandeStatutBadge(d.statut)}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin-bottom:1rem">
      <div style="background:#f8fafc;padding:.5rem;border-radius:6px"><small>Propre</small><br><strong>${fmtEUR(d.montant_propre || 0)}</strong></div>
      <div style="background:#fef3c7;padding:.5rem;border-radius:6px"><small>Portefeuille</small><br><strong>${fmtEUR(d.montant_portefeuille || 0)}</strong></div>
      <div style="background:#e0e7ff;padding:.5rem;border-radius:6px"><small>N+1</small><br><strong>${fmtEUR(d.montant_n1 || 0)}</strong></div>
      <div style="background:#fce7f3;padding:.5rem;border-radius:6px"><small>N+2</small><br><strong>${fmtEUR(d.montant_n2 || 0)}</strong></div>
    </div>
    ${d.notes_agent ? `<div style="background:#f1f5f9;padding:.6rem;border-radius:6px;margin-bottom:1rem"><strong>Notes agent :</strong> ${escapeHtml(d.notes_agent)}</div>` : ''}
    ${d.notes_admin ? `<div style="background:#ecfeff;padding:.6rem;border-radius:6px;margin-bottom:1rem"><strong>Notes admin :</strong> ${escapeHtml(d.notes_admin)}</div>` : ''}
    ${d.motif_rejet ? `<div style="background:#fee2e2;padding:.6rem;border-radius:6px;margin-bottom:1rem"><strong>Motif rejet :</strong> ${escapeHtml(d.motif_rejet)}</div>` : ''}
    <h4 style="margin:1rem 0 .5rem">Commissions incluses (${commissions.length})</h4>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Période</th><th class="text-right">Propre</th><th class="text-right">Portef.</th><th class="text-right">N+1</th><th class="text-right">N+2</th><th class="text-right">Total</th></tr></thead>
      <tbody>${commissions.map(cc => `<tr>
        <td>${monthsFR[cc.periode_mois-1]} ${cc.periode_annee}</td>
        <td class="text-right">${fmtEUR(cc.commission_propre || 0)}</td>
        <td class="text-right">${fmtEUR(cc.commission_portefeuille || 0)}</td>
        <td class="text-right">${fmtEUR(cc.commission_n1 || 0)}</td>
        <td class="text-right">${fmtEUR(cc.commission_n2 || 0)}</td>
        <td class="text-right"><strong>${fmtEUR(cc.total || 0)}</strong></td>
      </tr>`).join('')}</tbody>
    </table></div>
  `
  const m = modal('<i class="fas fa-file-invoice"></i> Demande #' + d.id, html + `
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
}

function adminValiderDemandeModal(id) {
  const m = modal('<i class="fas fa-check"></i> Valider la demande #' + id, `
    <p>Confirmez la validation : un paiement sera créé, les commissions seront marquées "payées" et le cumul de l'agent repartira à 0.</p>
    <div class="form-grid">
      <div class="form-group"><label>Méthode</label>
        <select id="vmeth"><option value="virement">Virement</option><option value="especes">Espèces</option><option value="autre">Autre</option></select>
      </div>
      <div class="form-group"><label>Date paiement</label><input id="vdate" type="date" value="${new Date().toISOString().substring(0,10)}" /></div>
      <div class="form-group"><label>Référence (virement)</label><input id="vref" placeholder="Ex: VIR-2026-0042" /></div>
      <div class="form-group"><label>Notes admin</label><input id="vnotes" /></div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="vok"><i class="fas fa-check"></i> Valider & marquer payée</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#vok').onclick = async () => {
    try {
      await api.post('/demandes-paiement/admin/' + id + '/valider', {
        methode: m.el.querySelector('#vmeth').value,
        date_paiement: m.el.querySelector('#vdate').value,
        reference: m.el.querySelector('#vref').value.trim() || null,
        notes: m.el.querySelector('#vnotes').value.trim() || null
      })
      toast('Demande validée et payée')
      m.close()
      navigate('admin-demandes-paiement')
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur validation', 'error')
    }
  }
}

function adminRejeterDemandeModal(id) {
  const m = modal('<i class="fas fa-times"></i> Rejeter la demande #' + id, `
    <p>Le rejet libérera les commissions liées (elles redeviendront "disponibles" pour une future demande).</p>
    <div class="form-group">
      <label>Motif de rejet <span class="req">*</span></label>
      <textarea id="rmotif" rows="3" required placeholder="Ex: IBAN manquant dans le profil, période incomplète, etc."></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-danger" id="rok"><i class="fas fa-times"></i> Rejeter</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#rok').onclick = async () => {
    const motif = m.el.querySelector('#rmotif').value.trim()
    if (!motif) { toast('Motif obligatoire', 'error'); return }
    try {
      await api.post('/demandes-paiement/admin/' + id + '/rejeter', { motif })
      toast('Demande rejetée — commissions libérées')
      m.close()
      navigate('admin-demandes-paiement')
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }
}

// ============================================================
// === CHALLENGES (admin + agent) =============================
// ============================================================
function challengeStatutBadge(s) {
  const map = {
    en_cours: { bg: '#3b82f6', label: 'EN COURS' },
    reussi: { bg: '#10b981', label: 'RÉUSSI' },
    recompense_attribuee: { bg: '#059669', label: 'RÉCOMPENSÉ' },
    echoue: { bg: '#ef4444', label: 'ÉCHOUÉ' },
    annule: { bg: '#9ca3af', label: 'ANNULÉ' }
  }
  const m = map[s] || { bg: '#6b7280', label: (s || '').toUpperCase() }
  return `<span style="background:${m.bg};color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem;font-weight:600">${m.label}</span>`
}
function challengeTypeObjectifLabel(t) {
  return ({ restaurants: 'Restaurants', marques: 'Marques', restaurants_ou_marques: 'Restos + Marques' })[t] || t
}
function challengeTypeRecompenseLabel(t) {
  return ({
    portefeuille_restaurants: 'Restaurants en portefeuille 100%',
    portefeuille_marques: 'Marques en portefeuille 100%',
    bonus_montant: 'Bonus financier (€)',
    autre: 'Autre'
  })[t] || t
}

// --- ADMIN : liste + CRUD ---
PAGES['admin-challenges'] = async (c) => {
  const { data } = await api.get('/challenges/admin')
  const challenges = data.challenges || []
  const today = new Date().toISOString().slice(0, 10)

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-flag-checkered"></i> Challenges commerciaux</h1>
        <div class="subtitle">Défis temporaires avec récompense (ex: 30 restos → 15 en portefeuille 100%)</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="syncAll" title="Recalculer toutes les progressions"><i class="fas fa-sync"></i> Synchroniser</button>
        <button class="btn btn-primary" id="newChal"><i class="fas fa-plus"></i> Nouveau challenge</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> ${challenges.length} challenge(s)</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Code</th><th>Nom</th><th>Période</th><th>Objectif</th>
          <th class="text-right">Participants</th>
          <th class="text-right">Réussis</th>
          <th class="text-right">Récompensés</th>
          <th>Suspend 5/5</th>
          <th>Statut</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${challenges.length ? challenges.map(ch => {
          const enPeriode = ch.date_debut <= today && today <= ch.date_fin
          const aVenir = today < ch.date_debut
          const termine = today > ch.date_fin
          const statut = !ch.actif ? '<span style="background:#9ca3af;color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem">ARCHIVÉ</span>'
            : aVenir ? '<span style="background:#6b7280;color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem">À VENIR</span>'
            : enPeriode ? '<span style="background:#10b981;color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem">ACTIF</span>'
            : '<span style="background:#f59e0b;color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem">TERMINÉ</span>'
          return `<tr>
            <td><strong style="font-family:monospace">${escapeHtml(ch.code)}</strong></td>
            <td>
              <strong>${escapeHtml(ch.nom)}</strong>
              ${ch.description ? `<br><small class="text-muted">${escapeHtml(ch.description.substring(0, 80))}${ch.description.length > 80 ? '…' : ''}</small>` : ''}
            </td>
            <td><small>${fmtDate(ch.date_debut)}<br>→ ${fmtDate(ch.date_fin)}</small></td>
            <td>
              <strong>${ch.objectif_quantite}</strong> ${challengeTypeObjectifLabel(ch.type_objectif)}
              <br><small class="text-muted">→ ${ch.recompense_quantite || ch.recompense_montant + '€'} ${challengeTypeRecompenseLabel(ch.type_recompense)}</small>
            </td>
            <td class="text-right">${ch.nb_participants || 0}</td>
            <td class="text-right" style="color:#10b981"><strong>${ch.nb_reussis || 0}</strong></td>
            <td class="text-right" style="color:#059669"><strong>${ch.nb_recompenses || 0}</strong></td>
            <td>${ch.suspend_tranche_standard ? '<i class="fas fa-check" style="color:#10b981"></i>' : '—'}</td>
            <td>${statut}</td>
            <td class="text-right" style="white-space:nowrap">
              <button class="btn btn-sm btn-secondary" data-view="${ch.id}" title="Détail"><i class="fas fa-eye"></i></button>
              <button class="btn btn-sm btn-primary" data-edit="${ch.id}" title="Modifier"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del="${ch.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`
        }).join('') : '<tr><td colspan="10" class="text-center text-muted">Aucun challenge — cliquez sur "Nouveau challenge"</td></tr>'}</tbody>
      </table></div>
    </div>
  `
  document.getElementById('newChal').onclick = () => adminChallengeFormModal()
  document.getElementById('syncAll').onclick = async () => {
    try {
      const { data } = await api.post('/challenges/admin/synchroniser')
      toast(`${data.nb_synchronises} participation(s) recalculée(s)`)
      navigate('admin-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => adminChallengeDetailModal(b.dataset.view))
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => adminChallengeFormModal(b.dataset.edit))
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer définitivement ce challenge ? Toutes les participations seront perdues.')) return
    try {
      await api.delete('/challenges/admin/' + b.dataset.del)
      toast('Challenge supprimé')
      navigate('admin-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

async function adminChallengeFormModal(id) {
  let ch = {
    code: '', nom: '', description: '',
    date_debut: '', date_fin: '',
    type_objectif: 'restaurants', objectif_quantite: 30,
    type_recompense: 'portefeuille_restaurants', recompense_quantite: 15,
    recompense_montant: null, recompense_description: '',
    suspend_tranche_standard: 1, cible: 'tous',
    actif: 1, notes_internes: ''
  }
  if (id) {
    const { data } = await api.get('/challenges/admin/' + id)
    ch = data.challenge
  }
  // Pour cible="selection" : charger la liste des agents
  let agentsHtml = ''
  if (!id) {
    try {
      const { data } = await api.get('/admin/users')
      const agents = (data.users || []).filter(u => u.role === 'agent' && u.actif)
      agentsHtml = `<div class="form-group" id="grpSel" style="display:none">
        <label>Participants (sélection)</label>
        <select id="chSel" multiple size="6" style="width:100%">
          ${agents.map(a => `<option value="${a.id}">${escapeHtml(a.prenom + ' ' + a.nom)} — ${escapeHtml(a.email)}</option>`).join('')}
        </select>
        <small class="text-muted">Maintenez Ctrl/Cmd pour sélectionner plusieurs agents</small>
      </div>`
    } catch {}
  }

  const m = modal((id ? '<i class="fas fa-pen"></i> Modifier' : '<i class="fas fa-plus"></i> Nouveau') + ' challenge', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
      <div class="form-group">
        <label>Code <span class="req">*</span></label>
        <input id="chCode" required placeholder="Ex: CH-2026-30R-SEBASTIAN" value="${escapeHtml(ch.code)}" ${id?'readonly':''}>
        <small class="text-muted">Identifiant unique, non modifiable après création</small>
      </div>
      <div class="form-group">
        <label>Nom <span class="req">*</span></label>
        <input id="chNom" required placeholder="Ex: Challenge été 2026 — 30 restos = 15 portefeuille" value="${escapeHtml(ch.nom)}">
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="chDesc" rows="2" placeholder="Détail des règles, conditions, motivations…">${escapeHtml(ch.description || '')}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
      <div class="form-group">
        <label>Date début <span class="req">*</span></label>
        <input type="date" id="chDeb" required value="${ch.date_debut || ''}">
      </div>
      <div class="form-group">
        <label>Date fin <span class="req">*</span></label>
        <input type="date" id="chFin" required value="${ch.date_fin || ''}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
      <div class="form-group">
        <label>Type d'objectif <span class="req">*</span></label>
        <select id="chTO">
          <option value="restaurants" ${ch.type_objectif==='restaurants'?'selected':''}>Restaurants apportés</option>
          <option value="marques" ${ch.type_objectif==='marques'?'selected':''}>Marques créées</option>
          <option value="restaurants_ou_marques" ${ch.type_objectif==='restaurants_ou_marques'?'selected':''}>Restaurants + Marques</option>
        </select>
      </div>
      <div class="form-group">
        <label>Quantité objectif <span class="req">*</span></label>
        <input type="number" id="chOQ" min="1" required value="${ch.objectif_quantite}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
      <div class="form-group">
        <label>Type de récompense <span class="req">*</span></label>
        <select id="chTR">
          <option value="portefeuille_restaurants" ${ch.type_recompense==='portefeuille_restaurants'?'selected':''}>Restaurants en portefeuille 100%</option>
          <option value="portefeuille_marques" ${ch.type_recompense==='portefeuille_marques'?'selected':''}>Marques en portefeuille 100%</option>
          <option value="bonus_montant" ${ch.type_recompense==='bonus_montant'?'selected':''}>Bonus financier (€)</option>
          <option value="autre" ${ch.type_recompense==='autre'?'selected':''}>Autre (texte libre)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Quantité / Montant</label>
        <input type="number" id="chRQ" min="0" step="0.01" value="${ch.recompense_quantite || ch.recompense_montant || 15}">
        <small class="text-muted">Nombre d'éléments à attribuer OU montant en €</small>
      </div>
    </div>
    <div class="form-group">
      <label>Description récompense (si "Autre")</label>
      <input id="chRD" placeholder="Ex: Voyage, formation, équipement…" value="${escapeHtml(ch.recompense_description || '')}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
      <div class="form-group">
        <label>
          <input type="checkbox" id="chSus" ${ch.suspend_tranche_standard?'checked':''}>
          Suspendre la règle 5/5 pour les participants
        </label>
        <small class="text-muted">Pendant la période du challenge, les participants ne déclenchent pas la règle standard de la 5e marque/resto</small>
      </div>
      <div class="form-group">
        <label>Cible <span class="req">*</span></label>
        <select id="chCible">
          <option value="tous" ${ch.cible==='tous'?'selected':''}>Tous les agents actifs (auto-inscription)</option>
          <option value="selection" ${ch.cible==='selection'?'selected':''}>Sélection manuelle</option>
        </select>
      </div>
    </div>
    ${agentsHtml}
    <div class="form-group">
      <label>Notes internes (superadmin)</label>
      <textarea id="chNot" rows="2">${escapeHtml(ch.notes_internes || '')}</textarea>
    </div>
    ${id ? `<div class="form-group">
      <label><input type="checkbox" id="chAct" ${ch.actif?'checked':''}> Actif (visible)</label>
    </div>` : ''}
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="chOk"><i class="fas fa-check"></i> ${id ? 'Mettre à jour' : 'Créer'}</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  const cibleSel = m.el.querySelector('#chCible')
  const grpSel = m.el.querySelector('#grpSel')
  if (cibleSel && grpSel) {
    const upd = () => grpSel.style.display = cibleSel.value === 'selection' ? '' : 'none'
    cibleSel.onchange = upd; upd()
  }
  m.el.querySelector('#chOk').onclick = async () => {
    const typeRecompense = m.el.querySelector('#chTR').value
    const recQty = parseFloat(m.el.querySelector('#chRQ').value) || 0
    const payload = {
      code: m.el.querySelector('#chCode').value.trim(),
      nom: m.el.querySelector('#chNom').value.trim(),
      description: m.el.querySelector('#chDesc').value.trim() || null,
      date_debut: m.el.querySelector('#chDeb').value,
      date_fin: m.el.querySelector('#chFin').value,
      type_objectif: m.el.querySelector('#chTO').value,
      objectif_quantite: parseInt(m.el.querySelector('#chOQ').value),
      type_recompense: typeRecompense,
      recompense_quantite: typeRecompense === 'bonus_montant' ? null : Math.floor(recQty),
      recompense_montant: typeRecompense === 'bonus_montant' ? recQty : null,
      recompense_description: m.el.querySelector('#chRD').value.trim() || null,
      suspend_tranche_standard: m.el.querySelector('#chSus').checked ? 1 : 0,
      cible: m.el.querySelector('#chCible').value,
      notes_internes: m.el.querySelector('#chNot').value.trim() || null
    }
    if (id) payload.actif = m.el.querySelector('#chAct').checked ? 1 : 0
    if (!id && payload.cible === 'selection') {
      const sel = m.el.querySelector('#chSel')
      payload.participants_ids = sel ? Array.from(sel.selectedOptions).map(o => parseInt(o.value)) : []
    }
    try {
      if (id) {
        await api.put('/challenges/admin/' + id, payload)
        toast('Challenge mis à jour')
      } else {
        const { data } = await api.post('/challenges/admin', payload)
        toast(`Challenge créé — ${data.nb_inscrits} agent(s) inscrits`)
      }
      m.close()
      navigate('admin-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

async function adminChallengeDetailModal(id) {
  const { data } = await api.get('/challenges/admin/' + id)
  const ch = data.challenge
  const parts = data.participations || []
  const m = modal('<i class="fas fa-flag-checkered"></i> ' + escapeHtml(ch.nom) + ' — <code>' + escapeHtml(ch.code) + '</code>', `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.8rem;margin-bottom:1rem">
      <div class="stat-card primary"><div class="stat-label">Période</div><div class="stat-value" style="font-size:.95rem">${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}</div></div>
      <div class="stat-card accent"><div class="stat-label">Objectif</div><div class="stat-value">${ch.objectif_quantite}</div><div class="stat-extra">${challengeTypeObjectifLabel(ch.type_objectif)}</div></div>
      <div class="stat-card success"><div class="stat-label">Récompense</div><div class="stat-value">${ch.recompense_quantite || ch.recompense_montant + '€'}</div><div class="stat-extra">${challengeTypeRecompenseLabel(ch.type_recompense)}</div></div>
    </div>
    ${ch.description ? `<div class="card" style="background:#f9fafb;margin-bottom:.8rem"><small>${escapeHtml(ch.description)}</small></div>` : ''}
    ${ch.suspend_tranche_standard ? `<div class="card" style="background:#fef3c7;border-left:3px solid #f59e0b;margin-bottom:.8rem"><small><i class="fas fa-exclamation-triangle"></i> <strong>Règle 5/5 suspendue</strong> pour les participants pendant la période.</small></div>` : ''}
    <h3 style="margin:.6rem 0 .4rem">Participants (${parts.length})</h3>
    <div class="table-wrap" style="max-height:400px;overflow:auto"><table class="data-table">
      <thead><tr>
        <th>Agent</th>
        <th class="text-right">Progression</th>
        <th>Statut</th>
        <th>Réussi le</th>
        <th class="text-right">Actions</th>
      </tr></thead>
      <tbody>${parts.length ? parts.map(p => {
        const pct = Math.min(100, Math.round((p.progression_actuelle / ch.objectif_quantite) * 100))
        const color = pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#3b82f6'
        return `<tr>
          <td>
            <strong>${escapeHtml((p.prenom || '') + ' ' + (p.nom || ''))}</strong>
            <br><small class="text-muted">${escapeHtml(p.email || '')}</small>
          </td>
          <td class="text-right">
            <strong>${p.progression_actuelle} / ${ch.objectif_quantite}</strong>
            <div style="background:#e5e7eb;border-radius:99px;height:6px;margin-top:.3rem;overflow:hidden">
              <div style="background:${color};height:100%;width:${pct}%"></div>
            </div>
          </td>
          <td>${challengeStatutBadge(p.statut)}</td>
          <td><small>${p.date_reussite ? fmtDateTime(p.date_reussite) : '—'}</small></td>
          <td class="text-right" style="white-space:nowrap">
            ${p.statut === 'reussi' ? `<button class="btn btn-sm btn-success" data-rec="${p.id}" title="Attribuer la récompense"><i class="fas fa-gift"></i> Récompenser</button>` : ''}
            ${p.statut === 'recompense_attribuee' ? '<span style="color:#059669"><i class="fas fa-check-double"></i></span>' : ''}
            <button class="btn btn-sm btn-danger" data-del-p="${p.id}" title="Retirer"><i class="fas fa-times"></i></button>
          </td>
        </tr>`
      }).join('') : '<tr><td colspan="5" class="text-center text-muted">Aucun participant</td></tr>'}</tbody>
    </table></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelectorAll('[data-rec]').forEach(b => b.onclick = async () => {
    const notes = prompt('Notes facultatives (ex: "15 premiers restos auto-attribués") :') || ''
    if (notes === null) return
    try {
      const { data } = await api.post('/challenges/admin/participations/' + b.dataset.rec + '/recompenser', { notes })
      toast(`Récompense attribuée — ${data.nb_attribue} élément(s) marqué(s) en portefeuille`)
      m.close()
      adminChallengeDetailModal(id)
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
  m.el.querySelectorAll('[data-del-p]').forEach(b => b.onclick = async () => {
    if (!confirm('Retirer ce participant ?')) return
    try {
      await api.delete('/challenges/admin/' + id + '/participations/' + b.dataset.delP)
      toast('Participant retiré')
      m.close()
      adminChallengeDetailModal(id)
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

// --- AGENT : mes challenges ---
PAGES['a-challenges'] = async (c) => {
  const { data } = await api.get('/challenges/mine')
  const list = data.challenges || []

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-flag-checkered"></i> Mes challenges</h1>
        <div class="subtitle">Défis en cours — apportez des restaurants/marques pour débloquer des récompenses</div>
      </div>
    </div>

    ${list.length === 0 ? `
      <div class="card" style="text-align:center;padding:2.5rem">
        <i class="fas fa-flag-checkered" style="font-size:3rem;color:#cbd5e1;margin-bottom:1rem"></i>
        <h3>Aucun challenge en cours</h3>
        <p class="text-muted">Le superadmin n'a pas encore lancé de challenge auquel vous participez.</p>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:1rem">
        ${list.map(ch => {
          const p = ch.participation
          const prog = p ? p.progression_actuelle : 0
          const pct = Math.min(100, Math.round((prog / ch.objectif_quantite) * 100))
          const reste = Math.max(0, ch.objectif_quantite - prog)
          const today = new Date().toISOString().slice(0,10)
          const aVenir = today < ch.date_debut
          const enCours = today >= ch.date_debut && today <= ch.date_fin
          const finJ = Math.ceil((new Date(ch.date_fin) - new Date()) / (1000*60*60*24))
          const couleur = pct >= 100 ? '#10b981' : pct >= 66 ? '#3b82f6' : pct >= 33 ? '#f59e0b' : '#6b7280'
          return `<div class="card" style="border-left:4px solid ${couleur}">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:.5rem">
              <div>
                <div style="font-family:monospace;font-size:.75rem;color:#6b7280">${escapeHtml(ch.code)}</div>
                <h3 style="margin:.3rem 0">${escapeHtml(ch.nom)}</h3>
              </div>
              ${p ? challengeStatutBadge(p.statut) : '<span style="background:#9ca3af;color:#fff;padding:.18rem .5rem;border-radius:4px;font-size:.7rem">NON INSCRIT</span>'}
            </div>
            ${ch.description ? `<p style="color:#6b7280;font-size:.85rem;margin:.5rem 0">${escapeHtml(ch.description)}</p>` : ''}
            <div style="background:#f9fafb;border-radius:6px;padding:.7rem;margin:.8rem 0">
              <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
                <strong>Progression</strong>
                <strong style="color:${couleur}">${prog} / ${ch.objectif_quantite}</strong>
              </div>
              <div style="background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden">
                <div style="background:${couleur};height:100%;width:${pct}%;transition:width .3s"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:.4rem;font-size:.78rem;color:#6b7280">
                <span>${pct}%</span>
                <span>${reste > 0 ? `Reste ${reste} à apporter` : 'Objectif atteint ✓'}</span>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.82rem">
              <div><i class="fas fa-calendar-alt"></i> <strong>Période</strong><br>${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}</div>
              <div>
                <i class="fas fa-bullseye"></i> <strong>Objectif</strong><br>
                ${ch.objectif_quantite} ${challengeTypeObjectifLabel(ch.type_objectif).toLowerCase()}
              </div>
              <div><i class="fas fa-gift"></i> <strong>Récompense</strong><br>${ch.recompense_quantite ? ch.recompense_quantite + ' ' : ''}${ch.recompense_montant ? fmtEUR(ch.recompense_montant) + ' ' : ''}${challengeTypeRecompenseLabel(ch.type_recompense)}</div>
              <div>
                <i class="fas fa-clock"></i> <strong>Statut période</strong><br>
                ${aVenir ? '<span style="color:#6b7280">Démarre dans ' + Math.ceil((new Date(ch.date_debut) - new Date()) / (1000*60*60*24)) + ' j</span>'
                  : enCours ? `<span style="color:#10b981"><strong>${finJ} j restant${finJ>1?'s':''}</strong></span>`
                  : '<span style="color:#ef4444">Terminé</span>'}
              </div>
            </div>
            ${ch.suspend_tranche_standard ? `<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:.5rem .7rem;margin-top:.6rem;font-size:.78rem;border-radius:4px">
              <i class="fas fa-info-circle"></i> Pendant ce challenge, la règle standard 5/5 (5e marque/resto = portefeuille) est <strong>suspendue</strong>.
            </div>` : ''}
            ${p && p.statut === 'reussi' ? `<div style="background:#d1fae5;border:1px solid #10b981;padding:.6rem;margin-top:.6rem;border-radius:6px;text-align:center">
              <i class="fas fa-trophy" style="color:#059669"></i> <strong>Objectif atteint le ${fmtDateTime(p.date_reussite)}</strong> — en attente d'attribution par le superadmin.
            </div>` : ''}
            ${p && p.statut === 'recompense_attribuee' ? `<div style="background:#d1fae5;border:1px solid #10b981;padding:.6rem;margin-top:.6rem;border-radius:6px;text-align:center">
              <i class="fas fa-check-double" style="color:#059669"></i> <strong>Récompense attribuée</strong> ${p.recompense_notes ? '— ' + escapeHtml(p.recompense_notes) : ''}
            </div>` : ''}
            <div style="margin-top:.8rem;display:flex;gap:.4rem">
              <button class="btn btn-sm btn-secondary" data-detail="${ch.id}"><i class="fas fa-eye"></i> Détail</button>
              ${!p && ch.cible === 'tous' ? `<button class="btn btn-sm btn-primary" data-inscrire="${ch.id}"><i class="fas fa-flag"></i> Participer</button>` : ''}
              ${p ? `<button class="btn btn-sm btn-secondary" data-sync="${ch.id}"><i class="fas fa-sync"></i> Recalculer</button>` : ''}
            </div>
          </div>`
        }).join('')}
      </div>
    `}
  `

  c.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => agentChallengeDetailModal(b.dataset.detail))
  c.querySelectorAll('[data-inscrire]').forEach(b => b.onclick = async () => {
    try {
      await api.post('/challenges/' + b.dataset.inscrire + '/participer')
      toast('Inscription confirmée')
      navigate('a-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
  c.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => {
    try {
      const { data } = await api.post('/challenges/' + b.dataset.sync + '/synchroniser')
      toast(`Progression recalculée : ${data.progression}${data.objectif_atteint ? ' — Objectif atteint !' : ''}`)
      navigate('a-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

async function agentChallengeDetailModal(id) {
  const { data } = await api.get('/challenges/mine/' + id)
  const ch = data.challenge
  const p = data.participation
  const restos = data.restos || []
  const marques = data.marques || []
  const pct = p ? Math.min(100, Math.round((p.progression_actuelle / ch.objectif_quantite) * 100)) : 0

  const m = modal('<i class="fas fa-flag-checkered"></i> ' + escapeHtml(ch.nom), `
    <div class="card" style="background:#f9fafb;margin-bottom:.8rem">
      <div style="font-family:monospace;font-size:.78rem;color:#6b7280">${escapeHtml(ch.code)}</div>
      ${ch.description ? `<p style="margin:.4rem 0 0">${escapeHtml(ch.description)}</p>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem;margin-bottom:1rem">
      <div class="stat-card primary"><div class="stat-label">Période</div><div style="font-size:.85rem;margin-top:.3rem"><strong>${fmtDate(ch.date_debut)}</strong><br>→ ${fmtDate(ch.date_fin)}</div></div>
      <div class="stat-card accent"><div class="stat-label">Objectif</div><div class="stat-value">${ch.objectif_quantite}</div><div class="stat-extra">${challengeTypeObjectifLabel(ch.type_objectif)}</div></div>
      <div class="stat-card success"><div class="stat-label">Récompense</div><div class="stat-value">${ch.recompense_quantite || (ch.recompense_montant ? fmtEUR(ch.recompense_montant) : '—')}</div><div class="stat-extra">${challengeTypeRecompenseLabel(ch.type_recompense)}</div></div>
    </div>
    ${p ? `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:.4rem">
        <strong>Ma progression</strong>
        <strong>${p.progression_actuelle} / ${ch.objectif_quantite} (${pct}%)</strong>
      </div>
      <div style="background:#e5e7eb;border-radius:99px;height:12px;overflow:hidden">
        <div style="background:${pct>=100?'#10b981':'#3b82f6'};height:100%;width:${pct}%"></div>
      </div>
      <div style="margin-top:.6rem">${challengeStatutBadge(p.statut)}</div>
    </div>` : ''}
    ${restos.length ? `<h3 style="margin:.6rem 0 .4rem">Restaurants comptabilisés (${restos.length})</h3>
      <div class="table-wrap" style="max-height:200px;overflow:auto;margin-bottom:.8rem"><table class="data-table">
        <thead><tr><th>Nom</th><th>Ville</th><th>Signature</th><th>Portefeuille ?</th></tr></thead>
        <tbody>${restos.map(r => `<tr>
          <td><strong>${escapeHtml(r.nom)}</strong></td>
          <td>${escapeHtml(r.ville || '')}</td>
          <td><small>${fmtDate(r.date_signature)}</small></td>
          <td>${r.is_portefeuille_proprietaire ? '<i class="fas fa-star" style="color:#f59e0b"></i>' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    ${marques.length ? `<h3 style="margin:.6rem 0 .4rem">Marques comptabilisées (${marques.length})</h3>
      <div class="table-wrap" style="max-height:200px;overflow:auto;margin-bottom:.8rem"><table class="data-table">
        <thead><tr><th>Marque</th><th>Restaurant</th><th>Création</th><th>Portefeuille ?</th></tr></thead>
        <tbody>${marques.map(mq => `<tr>
          <td><strong>${escapeHtml(mq.nom)}</strong></td>
          <td>${escapeHtml(mq.restaurant_nom || '')}</td>
          <td><small>${fmtDate(mq.created_at)}</small></td>
          <td>${mq.is_portefeuille_proprietaire ? '<i class="fas fa-star" style="color:#f59e0b"></i>' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : ''}
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
}

// --- Sous-agents ---
PAGES['a-sous-agents'] = async (c) => {
  const [sa, inv] = await Promise.all([
    api.get('/agent/sous-agents'),
    api.get('/register/invitations').catch(() => ({ data: { invitations: [] } }))
  ])
  const data = sa.data
  const invitations = inv.data.invitations || []

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-people-group"></i> Mes sous-agents</h1><div class="subtitle">${data.sous_agents.length} personne(s) dans votre branche</div></div>
      <div>
        <button class="btn btn-secondary" id="btnInvite"><i class="fas fa-envelope"></i> Inviter par lien</button>
        <button class="btn btn-primary" id="btnAddSA"><i class="fas fa-user-plus"></i> Créer un sous-agent</button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-users"></i> Mes sous-agents directs et indirects</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Niveau</th><th>Rattaché à</th><th class="text-right">Restos</th><th class="text-right">Sous-agents</th><th>Statut</th><th>Dernière connexion</th></tr></thead>
        <tbody>${data.sous_agents.length ? data.sous_agents.map(u => `<tr>
          <td><strong>${escapeHtml(u.prenom + ' ' + u.nom)}</strong></td>
          <td>${escapeHtml(u.email)}</td>
          <td>${niveauPill(u.niveau)}</td>
          <td>${u.parent_nom ? escapeHtml(u.parent_prenom + ' ' + u.parent_nom) : '<span class="text-muted">—</span>'}</td>
          <td class="text-right">${u.nb_restaurants}</td>
          <td class="text-right">${u.nb_sous_agents}</td>
          <td>${u.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
          <td>${fmtDateTime(u.derniere_connexion)}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucun sous-agent pour le moment. Cliquez sur « Créer un sous-agent ».</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-envelope"></i> Mes invitations (${invitations.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Code</th><th>Email pré-rempli</th><th>Niveau</th><th>Statut</th><th>Expire</th><th>Lien</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${invitations.length ? invitations.map(i => `<tr>
          <td><code style="font-size:.7rem">${escapeHtml((i.code || '').substring(0, 12))}…</code></td>
          <td>${escapeHtml(i.email_pre_rempli || '—')}</td>
          <td>${niveauLabel(i.niveau_cible)}</td>
          <td>${i.statut === 'utilisee' ? '<span class="badge badge-primary">Utilisée</span>' : i.statut === 'expiree' ? '<span class="badge badge-danger">Expirée</span>' : '<span class="badge badge-info">Active</span>'}</td>
          <td>${fmtDate(i.expire_at)}</td>
          <td><button class="btn btn-sm btn-secondary" data-copy="${escapeHtml(i.invitation_url)}"><i class="fas fa-copy"></i> Copier</button></td>
          <td class="text-right">${i.statut === 'active' ? `<button class="btn btn-sm btn-danger" data-rev="${i.id}"><i class="fas fa-times"></i></button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune invitation</td></tr>'}</tbody>
      </table></div>
    </div>
  `

  document.getElementById('btnAddSA').onclick = () => {
    const m = modal('Créer un sous-agent', `
      <p class="text-muted" style="margin-bottom:.6rem">Le nouveau compte sera rattaché à vous au niveau N+1.</p>
      <form id="saForm">
        <div class="form-grid">
          <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="sprenom" required /></div>
          <div class="form-group"><label>Nom <span class="req">*</span></label><input id="snom" required /></div>
          <div class="form-group"><label>Email <span class="req">*</span></label><input id="semail" type="email" required /></div>
          <div class="form-group"><label>Téléphone</label><input id="stel" /></div>
          <div class="form-group" style="grid-column:1/-1"><label>IBAN</label><input id="siban" placeholder="FR76..." /></div>
          <div class="form-group" style="grid-column:1/-1"><label>Mot de passe initial <span class="req">*</span></label><input id="spwd" type="password" required minlength="6" /><small class="text-muted">Communiquez-le par un canal sûr.</small></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-close>Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i> Créer</button>
        </div>
      </form>
    `)
    m.el.querySelector('[data-close]').onclick = () => m.close()
    m.el.querySelector('#saForm').onsubmit = async e => {
      e.preventDefault()
      try {
        await api.post('/mlm/sous-agent', {
          prenom: document.getElementById('sprenom').value.trim(),
          nom: document.getElementById('snom').value.trim(),
          email: document.getElementById('semail').value.trim(),
          telephone: document.getElementById('stel').value.trim() || null,
          iban: document.getElementById('siban').value.trim() || null,
          password: document.getElementById('spwd').value
        })
        toast('Sous-agent créé')
        m.close(); navigate('a-sous-agents')
      } catch (err) {
        toast(err.response?.data?.error || 'Erreur', 'error')
      }
    }
  }

  document.getElementById('btnInvite').onclick = () => {
    const m = modal('Créer un lien d\'invitation', `
      <p class="text-muted">Le destinataire crée son mot de passe lui-même via le lien.</p>
      <form id="invForm">
        <div class="form-group"><label>Email du destinataire (optionnel)</label><input id="iemail" type="email" placeholder="laisser vide pour un lien générique" /></div>
        <div class="form-group"><label>Durée de validité (jours)</label><input id="idays" type="number" value="30" min="1" max="180" /></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" data-close>Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Générer</button>
        </div>
      </form>
    `)
    m.el.querySelector('[data-close]').onclick = () => m.close()
    m.el.querySelector('#invForm').onsubmit = async e => {
      e.preventDefault()
      try {
        const r = await api.post('/register/invitations', {
          email_pre_rempli: document.getElementById('iemail').value.trim() || null,
          duree_jours: parseInt(document.getElementById('idays').value) || 30
        })
        m.close()
        const m2 = modal('Lien d\'invitation', `
          <p>Partagez ce lien avec votre futur sous-agent :</p>
          <div style="display:flex;gap:.5rem;margin:.5rem 0">
            <input id="invUrl" value="${escapeHtml(r.data.invitation_url)}" readonly style="flex:1;font-family:monospace;font-size:.8rem" />
            <button class="btn btn-primary" id="cpBtn"><i class="fas fa-copy"></i></button>
          </div>
          <div class="text-muted">Niveau cible : ${niveauLabel(r.data.niveau_cible)} · Expire le ${fmtDate(r.data.expire_at)}</div>
        `)
        m2.el.querySelector('#cpBtn').onclick = () => {
          navigator.clipboard.writeText(r.data.invitation_url).then(() => toast('Lien copié'))
        }
        navigate('a-sous-agents')
      } catch (err) {
        toast(err.response?.data?.error || 'Erreur', 'error')
      }
    }
  }

  c.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Lien copié'))
  })
  c.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => confirmDialog(
    'Révoquer cette invitation ?',
    async () => {
      await api.delete('/register/invitations/' + b.dataset.rev)
      toast('Invitation révoquée'); navigate('a-sous-agents')
    }
  ))
}

// --- Vue MLM (arbre + CA filleuls/sous-filleuls) — accessible admin & agent ---
async function renderMlmPage(c) {
  const now = new Date()
  const annee = now.getFullYear()
  const mois = now.getMonth() + 1
  const { data } = await api.get('/mlm/tree?annee=' + annee + '&mois=' + mois)

  const renderNode = (node, depth = 0) => {
    const own = node.ca_total || 0
    const own_p = node.ca_periode || 0
    const fill = node.ca_filleuls || 0
    const sf = node.ca_sous_filleuls || 0
    const tot = node.ca_branche_total || 0
    return `
      <div class="mlm-node" style="margin-left:${depth * 28}px">
        <div class="mlm-card">
          <div class="mlm-card-head">
            ${niveauPill(node.niveau)}
            <strong>${escapeHtml(node.prenom + ' ' + node.nom)}</strong>
            <span class="text-muted">${escapeHtml(node.email)}</span>
            ${!node.actif ? '<span class="badge badge-danger">Inactif</span>' : ''}
            <span class="mlm-tag"><i class="fas fa-store"></i> ${node.nb_restaurants || 0}</span>
            <span class="mlm-tag"><i class="fas fa-tags"></i> ${node.nb_marques || 0}</span>
            <span class="mlm-tag"><i class="fas fa-users"></i> ${node.nb_descendants || 0} desc.</span>
          </div>
          <div class="mlm-card-body">
            <div class="mlm-stat"><div class="mlm-stat-label">CA propre</div><div class="mlm-stat-val">${fmtEUR(own)}</div></div>
            <div class="mlm-stat"><div class="mlm-stat-label">CA filleuls (N+1)</div><div class="mlm-stat-val">${fmtEUR(fill)}</div></div>
            <div class="mlm-stat"><div class="mlm-stat-label">CA sous-filleuls (N+2)</div><div class="mlm-stat-val">${fmtEUR(sf)}</div></div>
            <div class="mlm-stat mlm-stat-total"><div class="mlm-stat-label">CA branche totale</div><div class="mlm-stat-val">${fmtEUR(tot)}</div></div>
            <div class="mlm-stat"><div class="mlm-stat-label">Sur ${monthsFR[mois-1]}</div><div class="mlm-stat-val">${fmtEUR(own_p)}</div></div>
          </div>
        </div>
        ${node.children && node.children.length ? `<div class="mlm-children">${node.children.map(ch => renderNode(ch, depth + 1)).join('')}</div>` : ''}
      </div>`
  }

  const trees = data.mode === 'superadmin' ? data.trees : (data.tree ? [data.tree] : [])

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1><i class="fas fa-sitemap"></i> Mon arborescence MLM</h1>
        <div class="subtitle">${data.mode === 'superadmin' ? 'Vue globale superadmin — toutes les pyramides' : 'Vous voyez vos filleuls (N+1) et sous-filleuls (N+2) avec leur CA'}</div>
      </div>
    </div>
    ${trees.length ? trees.map(t => renderNode(t, 0)).join('') : '<div class="card"><p class="text-muted">Aucun filleul pour le moment. Invitez vos premiers sous-agents !</p></div>'}
  `
}
PAGES['a-mlm'] = renderMlmPage
PAGES['mlm'] = renderMlmPage

// --- Tutoriel agent ---
PAGES['a-tutoriel'] = async (c) => {
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Tutoriel — Comment utiliser DropEat™</h1><div class="subtitle">Guide pratique pour les agents commerciaux</div></div>
    </div>
    <div class="card mb-4" style="background:linear-gradient(135deg,#06A05A,#05804B);color:white">
      <h2 style="margin:0 0 .5rem"><i class="fas fa-rocket"></i> Bienvenue !</h2>
      <p style="margin:0;opacity:.95">DropEat™ vous permet de suivre vos restaurants, vos commissions et votre réseau MLM en temps réel. Voici comment exploiter votre espace.</p>
    </div>
    <div class="tutorial-grid">
      <div class="tutorial-step">
        <div class="step-num">1</div>
        <h3><i class="fas fa-store"></i> Ajoutez vos restaurants</h3>
        <p>Dans <strong>Mes restaurants</strong>, cliquez sur « Ajouter un restaurant ». Renseignez le nom du snack, l'adresse, et indiquez si une <strong>tablette SR Shop</strong> est fournie (cela ajoute 0.05 € de facturation par commande).</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">2</div>
        <h3><i class="fas fa-tags"></i> Créez les marques virtuelles</h3>
        <p>Cliquez sur 👁 (Voir) sur un restaurant pour ajouter ses <strong>marques virtuelles Uber Eats</strong>. Vous pouvez en créer autant que vous voulez (4, 5, 6+). Chaque restaurant peut multiplier ses revenus avec plusieurs marques.</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">3</div>
        <h3><i class="fas fa-crown" style="color:var(--gold)"></i> Portefeuille Propriétaire</h3>
        <p>Tous les <strong>5 restaurants</strong> que vous apportez, le 5e (puis 10e, 15e…) vous appartient à <strong>100 %</strong> : vous touchez l'intégralité de la commission DropEat (au lieu d'une fraction). Suivez votre progression sur le tableau de bord !</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">4</div>
        <h3><i class="fas fa-file-csv"></i> Importez vos CSV</h3>
        <p>Allez dans <strong>Imports CSV</strong>, sélectionnez la marque concernée et glissez-déposez le fichier exporté depuis Uber Eats Merchant. Les colonnes sont détectées automatiquement (FR / EN). Les doublons sont ignorés.</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">5</div>
        <h3><i class="fas fa-coins"></i> Suivez vos commissions</h3>
        <p>Dans <strong>Mes commissions</strong>, sélectionnez le mois pour voir : votre commission standard, votre commission Portefeuille (100 %), vos gains sur les ventes de vos sous-agents (N1) et sous-sous-agents (N2).</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">6</div>
        <h3><i class="fas fa-people-group"></i> Animez votre réseau MLM</h3>
        <p>Plus vos sous-agents recrutent et vendent, plus vous gagnez. Gains par commande sur leurs ventes : N1 = 0,10 € à 0,35 € · N2 = 0,05 € à 0,18 € selon le palier de la commande.</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">7</div>
        <h3><i class="fas fa-money-check-dollar"></i> Recevez vos paiements</h3>
        <p>Chaque mois, l'administrateur clôture la période et déclenche les virements. Retrouvez l'historique dans <strong>Historique paiements</strong>, avec date, montant, méthode et référence.</p>
      </div>
      <div class="tutorial-step">
        <div class="step-num">8</div>
        <h3><i class="fas fa-graduation-cap"></i> Astuces</h3>
        <p>• Importez vos CSV chaque semaine pour un suivi en temps réel<br>• Visez 5 restos pour débloquer un Portefeuille<br>• Multipliez les marques par restaurant (5+ recommandé)<br>• Encouragez vos sous-agents : leurs ventes = vos commissions</p>
      </div>
    </div>`
}

// --- Paliers (lecture agent) ---
PAGES['a-paliers'] = async (c) => {
  const { data } = await api.get('/agent/paliers')
  const TYPES_AGENT = [
    { key: 'agent_standard', label: 'Vos commissions standards (clients hors Portefeuille)', icon: 'fa-user-tie' },
    { key: 'agent_portefeuille', label: 'Vos commissions Portefeuille Propriétaire (5e client) — 100% pour vous', icon: 'fa-crown' },
    { key: 'sous_agent_n1', label: 'Vos commissions sur ventes de vos sous-agents N1', icon: 'fa-user-plus' },
    { key: 'sous_agent_n2', label: 'Vos commissions sur ventes de vos sous-sous-agents N2', icon: 'fa-users' },
    { key: 'facturation_restaurant', label: 'Facturation DropEat → restaurant (sans tablette)', icon: 'fa-file-invoice' },
    { key: 'facturation_restaurant_tablette', label: 'Facturation DropEat → restaurant (avec tablette SR Shop)', icon: 'fa-tablet-screen-button' }
  ]
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Grille des paliers</h1><div class="subtitle">Combien vous gagnez par tranche de commande</div></div>
    </div>
    ${TYPES_AGENT.map(t => {
      const list = (data.paliers[t.key] || []).sort((a, b) => a.seuil_min - b.seuil_min)
      return `<div class="card mb-3">
        <div class="card-title"><i class="fas ${t.icon}"></i> ${t.label}</div>
        <table class="data-table">
          <thead><tr><th>Tranche de commande</th><th class="text-right">Montant par commande</th></tr></thead>
          <tbody>${list.map(p => `<tr>
            <td>${fmtEUR(p.seuil_min)} ${p.seuil_max ? '— ' + fmtEUR(p.seuil_max) : 'et plus'}</td>
            <td class="text-right"><strong>${fmtEUR(p.montant_par_commande)}</strong></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`
    }).join('')}`
}

// ============================================================
// === HISTORIQUE COMMISSIONS (mensuel / hebdomadaire) =========
// ============================================================
PAGES['a-historique-comm'] = async (c) => {
  let currentType = 'monthly'
  const loadAndRender = async () => {
    const { data } = await api.get('/agent/commissions/history?type=' + currentType)
    const history = data.history || []
    const max = Math.max(1, ...history.map(h => h.total))
    const totalSum = history.reduce((s, h) => s + h.total, 0)
    const avg = history.length ? totalSum / history.length : 0
    const totalPropre = history.reduce((s, h) => s + h.comm_propre, 0)
    const totalPort = history.reduce((s, h) => s + h.comm_portefeuille, 0)
    const totalN1 = history.reduce((s, h) => s + h.comm_n1, 0)
    const totalN2 = history.reduce((s, h) => s + h.comm_n2, 0)

    document.getElementById('histo-content').innerHTML = `
      <div class="stats-grid mb-3">
        <div class="stat-card primary"><div class="stat-label">Total période</div><div class="stat-value">${fmtEUR(totalSum)}</div><div class="stat-extra">${history.length} ${currentType === 'monthly' ? 'mois' : 'semaines'}</div></div>
        <div class="stat-card accent"><div class="stat-label">Moyenne</div><div class="stat-value">${fmtEUR(avg)}</div><div class="stat-extra">par ${currentType === 'monthly' ? 'mois' : 'semaine'}</div></div>
        <div class="stat-card gold"><div class="stat-label">Pic max</div><div class="stat-value">${fmtEUR(max)}</div></div>
        <div class="stat-card info"><div class="stat-label">Réseau (N+1 + N+2)</div><div class="stat-value">${fmtEUR(totalN1 + totalN2)}</div><div class="stat-extra">${((totalN1 + totalN2) / (totalSum || 1) * 100).toFixed(1)}% du total</div></div>
      </div>
      ${history.length ? `
      <div class="card mb-3">
        <div class="card-title"><i class="fas fa-chart-column"></i> Évolution ${currentType === 'monthly' ? 'mensuelle' : 'hebdomadaire'} — détail par catégorie</div>
        <div style="display:flex;align-items:end;gap:.5rem;height:220px;padding:1rem 0;border-bottom:2px solid #e5e7eb;overflow-x:auto">
          ${history.map(h => {
            const periode = currentType === 'monthly'
              ? (() => { const [y, mo] = h.periode.split('-'); return monthsFR[parseInt(mo)-1]?.substring(0,3) + ' ' + y.substring(2) })()
              : h.periode.replace(/^\d{4}-W/, 'S')
            const hP = (h.comm_propre / max) * 100
            const hPo = (h.comm_portefeuille / max) * 100
            const hN1 = (h.comm_n1 / max) * 100
            const hN2 = (h.comm_n2 / max) * 100
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:.2rem;min-width:60px" title="${periode} : ${fmtEUR(h.total)}">
              <div style="font-size:.7rem;font-weight:600;color:#374151">${fmtEUR(h.total).replace(' €','')}</div>
              <div style="width:40px;height:180px;display:flex;flex-direction:column-reverse;border-radius:4px;overflow:hidden;background:#f3f4f6">
                <div style="height:${hP}%;background:#06A05A" title="Propre"></div>
                <div style="height:${hPo}%;background:#FFB800" title="Portefeuille"></div>
                <div style="height:${hN1}%;background:#3b82f6" title="N+1"></div>
                <div style="height:${hN2}%;background:#a78bfa" title="N+2"></div>
              </div>
              <div style="font-size:.7rem;color:#6b7280">${periode}</div>
            </div>`
          }).join('')}
        </div>
        <div style="display:flex;gap:1rem;margin-top:1rem;font-size:.8rem;flex-wrap:wrap">
          <span><span style="display:inline-block;width:12px;height:12px;background:#06A05A;border-radius:2px"></span> Propre (${fmtEUR(totalPropre)})</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:#FFB800;border-radius:2px"></span> Portefeuille (${fmtEUR(totalPort)})</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:2px"></span> N+1 (${fmtEUR(totalN1)})</span>
          <span><span style="display:inline-block;width:12px;height:12px;background:#a78bfa;border-radius:2px"></span> N+2 (${fmtEUR(totalN2)})</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fas fa-table"></i> Tableau détaillé</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Période</th><th class="text-right">Cmds</th><th class="text-right">Propre</th><th class="text-right">Portefeuille</th><th class="text-right">N+1</th><th class="text-right">N+2</th><th class="text-right">Total</th></tr></thead>
          <tbody>${history.slice().reverse().map(h => `<tr>
            <td><strong>${escapeHtml(h.periode)}</strong></td>
            <td class="text-right">${fmtNum(h.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(h.comm_propre)}</td>
            <td class="text-right">${fmtEUR(h.comm_portefeuille)}</td>
            <td class="text-right">${fmtEUR(h.comm_n1)}</td>
            <td class="text-right">${fmtEUR(h.comm_n2)}</td>
            <td class="text-right"><strong style="color:#06A05A">${fmtEUR(h.total)}</strong></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      ` : '<div class="card"><p class="text-muted">Aucune donnée pour cette période.</p></div>'}
    `
  }
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-chart-line"></i> Historique de mes commissions</h1>
        <div class="subtitle">Visualisez votre évolution mensuelle ou hebdomadaire</div></div>
      <div style="display:flex;gap:.4rem">
        <button class="btn btn-primary" id="btnMonthly"><i class="fas fa-calendar"></i> Mensuel</button>
        <button class="btn btn-secondary" id="btnWeekly"><i class="fas fa-calendar-week"></i> Hebdomadaire</button>
      </div>
    </div>
    <div id="histo-content"><div class="loading-screen" style="min-height:200px"><div class="spinner"></div></div></div>
  `
  c.querySelector('#btnMonthly').onclick = () => {
    currentType = 'monthly'
    c.querySelector('#btnMonthly').className = 'btn btn-primary'
    c.querySelector('#btnWeekly').className = 'btn btn-secondary'
    loadAndRender()
  }
  c.querySelector('#btnWeekly').onclick = () => {
    currentType = 'weekly'
    c.querySelector('#btnWeekly').className = 'btn btn-primary'
    c.querySelector('#btnMonthly').className = 'btn btn-secondary'
    loadAndRender()
  }
  await loadAndRender()
}

// ============================================================
// === COMMISSIONS DES SOUS-AGENTS (visu commerciale) =========
// ============================================================
PAGES['a-sous-agents-comm'] = async (c) => {
  const now = new Date()
  let annee = now.getFullYear(), mois = now.getMonth() + 1
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-chart-pie"></i> Commissions de mes sous-agents</h1>
        <div class="subtitle">Vue d'ensemble des performances de votre réseau (N+1 + N+2)</div></div>
    </div>
    <div class="card mb-3">
      <div class="form-grid">
        <div class="form-group"><label>Année</label><input id="sacAnnee" type="number" value="${annee}" min="2024" max="2030"/></div>
        <div class="form-group"><label>Mois</label>
          <select id="sacMois">${monthsFR.map((m, i) => `<option value="${i+1}" ${i+1===mois?'selected':''}>${m}</option>`).join('')}</select>
        </div>
        <div class="form-group" style="display:flex;align-items:end"><button class="btn btn-primary" id="sacLoad"><i class="fas fa-sync"></i> Charger</button></div>
      </div>
    </div>
    <div id="sac-content"></div>`

  const load = async () => {
    annee = parseInt(c.querySelector('#sacAnnee').value)
    mois = parseInt(c.querySelector('#sacMois').value)
    const { data } = await api.get(`/agent/sous-agents/commissions?annee=${annee}&mois=${mois}`)
    const ag = data.sous_agents || []
    const totalAgents = ag.length
    const totalCa = ag.reduce((s, a) => s + (a.ca_periode || 0), 0)
    const totalComm = ag.reduce((s, a) => s + (a.commissions_propres || 0), 0)
    const myLevel = CURRENT_USER.niveau || 0
    const n1 = ag.filter(a => a.niveau === myLevel + 1)
    const n2 = ag.filter(a => a.niveau === myLevel + 2)
    c.querySelector('#sac-content').innerHTML = `
      <div class="stats-grid mb-3">
        <div class="stat-card primary"><div class="stat-label">Sous-agents actifs</div><div class="stat-value">${totalAgents}</div><div class="stat-extra">${n1.length} N+1 · ${n2.length} N+2</div></div>
        <div class="stat-card accent"><div class="stat-label">CA généré</div><div class="stat-value">${fmtEUR(totalCa)}</div><div class="stat-extra">${monthsFR[mois-1]} ${annee}</div></div>
        <div class="stat-card gold"><div class="stat-label">Commissions générées</div><div class="stat-value">${fmtEUR(totalComm)}</div><div class="stat-extra">par mes sous-agents</div></div>
      </div>
      ${n1.length ? `
      <div class="card mb-3">
        <div class="card-title"><i class="fas fa-user-plus"></i> Mes filleuls directs (N+1) — ${n1.length}</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Filleul</th><th class="text-right">Restos</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Leurs commissions</th></tr></thead>
          <tbody>${n1.map(a => `<tr>
            <td><strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong></td>
            <td class="text-right">${a.nb_restos}</td>
            <td class="text-right">${fmtNum(a.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(a.ca_periode)}</td>
            <td class="text-right"><strong>${fmtEUR(a.commissions_propres)}</strong></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}
      ${n2.length ? `
      <div class="card">
        <div class="card-title"><i class="fas fa-users"></i> Mes sous-filleuls (N+2) — ${n2.length}</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Sous-filleul</th><th>Via</th><th class="text-right">Restos</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Leurs commissions</th></tr></thead>
          <tbody>${n2.map(a => `<tr>
            <td><strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong></td>
            <td>${escapeHtml((a.parent_prenom || '') + ' ' + (a.parent_nom || ''))}</td>
            <td class="text-right">${a.nb_restos}</td>
            <td class="text-right">${fmtNum(a.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(a.ca_periode)}</td>
            <td class="text-right"><strong>${fmtEUR(a.commissions_propres)}</strong></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}
      ${!ag.length ? `<div class="card"><p class="text-muted">Vous n'avez pas encore de sous-agent. Créez votre premier filleul depuis le tableau de bord !</p></div>` : ''}
    `
  }
  c.querySelector('#sacLoad').onclick = load
  await load()
}

// ============================================================
// === PROFIL SOCIÉTÉ (agent FR + super-admin UK) =============
// ============================================================
function renderProfilSocieteForm(c, profil, isUk, savedFn) {
  const p = profil || {}
  c.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="fas fa-building"></i> ${isUk ? 'Société (UK Limited Company)' : 'Coordonnées société (France)'}</div>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:1rem">
        ${isUk
          ? 'Renseignez les informations de votre société UK Ltd. Elles apparaîtront automatiquement sur toutes les factures émises.'
          : 'Renseignez vos coordonnées légales. Elles apparaîtront sur toutes vos factures de commissions. Conformes loi française 2026.'}
      </p>
      <form id="profilForm">
        <div class="form-grid">
          <div class="form-group"><label>Type société <span class="req">*</span></label>
            <select id="type_societe">
              ${isUk ? `
                <option value="ltd" ${p.type_societe==='ltd'?'selected':''}>Limited Company (LTD)</option>
                <option value="individual_uk" ${p.type_societe==='individual_uk'?'selected':''}>Sole trader (Individual)</option>
              ` : `
                <option value="auto_entrepreneur" ${p.type_societe==='auto_entrepreneur'?'selected':''}>Auto-entrepreneur (Micro-entreprise)</option>
                <option value="eurl" ${p.type_societe==='eurl'?'selected':''}>EURL</option>
                <option value="sarl" ${p.type_societe==='sarl'?'selected':''}>SARL</option>
                <option value="sasu" ${p.type_societe==='sasu'?'selected':''}>SASU</option>
                <option value="sas" ${p.type_societe==='sas'?'selected':''}>SAS</option>
              `}
            </select>
          </div>
          <div class="form-group"><label>Raison sociale <span class="req">*</span></label>
            <input id="raison_sociale" value="${escapeHtml(p.raison_sociale || '')}" required /></div>
          <div class="form-group"><label>Nom commercial</label>
            <input id="nom_commercial" value="${escapeHtml(p.nom_commercial || '')}" /></div>
          <div class="form-group"><label>Forme juridique</label>
            <input id="forme_juridique" value="${escapeHtml(p.forme_juridique || '')}" /></div>
          ${isUk ? `
            <div class="form-group"><label>Company number (Companies House)</label>
              <input id="company_number" value="${escapeHtml(p.company_number || '')}" placeholder="ex: 12345678" /></div>
            <div class="form-group"><label>VAT registration number (UK)</label>
              <input id="vat_uk" value="${escapeHtml(p.vat_uk || '')}" placeholder="ex: GB123456789" /></div>
          ` : `
            <div class="form-group"><label>SIRET</label>
              <input id="siret" value="${escapeHtml(p.siret || '')}" placeholder="14 chiffres" maxlength="14" /></div>
            <div class="form-group"><label>SIREN</label>
              <input id="siren" value="${escapeHtml(p.siren || '')}" placeholder="9 chiffres" maxlength="9" /></div>
            <div class="form-group"><label>N° TVA intracommunautaire</label>
              <input id="numero_tva" value="${escapeHtml(p.numero_tva || '')}" placeholder="ex: FR12345678901" /></div>
            <div class="form-group"><label>RCS</label>
              <input id="rcs" value="${escapeHtml(p.rcs || '')}" placeholder="ex: RCS Paris 123 456 789" /></div>
            <div class="form-group"><label>Code APE/NAF</label>
              <input id="ape_naf" value="${escapeHtml(p.ape_naf || '')}" placeholder="ex: 7022Z" /></div>
          `}
          <div class="form-group"><label>Capital social</label>
            <input id="capital" type="number" step="0.01" value="${p.capital || ''}" placeholder="0.00" /></div>
          <div class="form-group" style="grid-column:1/-1"><label>Adresse <span class="req">*</span></label>
            <input id="adresse_rue" value="${escapeHtml(p.adresse_rue || '')}" required /></div>
          <div class="form-group" style="grid-column:1/-1"><label>Complément d'adresse</label>
            <input id="adresse_complement" value="${escapeHtml(p.adresse_complement || '')}" /></div>
          <div class="form-group"><label>Code postal</label>
            <input id="code_postal" value="${escapeHtml(p.code_postal || '')}" /></div>
          <div class="form-group"><label>Ville</label>
            <input id="ville" value="${escapeHtml(p.ville || '')}" /></div>
          <div class="form-group"><label>Pays</label>
            <input id="pays" value="${escapeHtml(p.pays || (isUk ? 'United Kingdom' : 'France'))}" /></div>
          <div class="form-group"><label>Téléphone</label>
            <input id="telephone" value="${escapeHtml(p.telephone || '')}" /></div>
          <div class="form-group" style="grid-column:1/-1"><label>Email facturation</label>
            <input id="email_facturation" type="email" value="${escapeHtml(p.email_facturation || '')}" /></div>
          <div class="form-group" style="grid-column:1/-1"><label>IBAN <span class="req">*</span></label>
            <input id="iban" value="${escapeHtml(p.iban || '')}" placeholder="${isUk ? 'GB29 NWBK 6016 1331 9268 19' : 'FR76 ...'}" required /></div>
          <div class="form-group"><label>BIC/SWIFT</label>
            <input id="bic" value="${escapeHtml(p.bic || '')}" /></div>
          <div class="form-group"><label>Nom banque</label>
            <input id="banque_nom" value="${escapeHtml(p.banque_nom || '')}" /></div>
          <div class="form-group"><label>Régime TVA <span class="req">*</span></label>
            <select id="regime_tva">
              ${isUk ? `
                <option value="uk_not_vat_registered" ${p.regime_tva==='uk_not_vat_registered'?'selected':''}>Not VAT registered</option>
                <option value="uk_vat_registered" ${p.regime_tva==='uk_vat_registered'?'selected':''}>VAT registered (20%)</option>
              ` : `
                <option value="franchise_base" ${p.regime_tva==='franchise_base'?'selected':''}>Franchise en base (TVA non applicable, art. 293B CGI)</option>
                <option value="reel_normal" ${p.regime_tva==='reel_normal'?'selected':''}>Réel normal (TVA 20%)</option>
                <option value="reel_simplifie" ${p.regime_tva==='reel_simplifie'?'selected':''}>Réel simplifié</option>
              `}
            </select>
          </div>
          <div class="form-group"><label>Taux TVA (%)</label>
            <input id="taux_tva" type="number" step="0.1" value="${p.taux_tva || 0}" /></div>
          <div class="form-group"><label>Date création entreprise</label>
            <input id="date_creation_entreprise" type="date" value="${p.date_creation_entreprise || ''}" /></div>
          <div class="form-group"><label>N° assurance pro</label>
            <input id="numero_assurance_pro" value="${escapeHtml(p.numero_assurance_pro || '')}" /></div>
          <div class="form-group" style="grid-column:1/-1"><label>Mentions légales supplémentaires (optionnel)</label>
            <textarea id="mentions_legales_extra" rows="3">${escapeHtml(p.mentions_legales_extra || '')}</textarea></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `
  c.querySelector('#profilForm').onsubmit = async e => {
    e.preventDefault()
    const fields = [
      'type_societe','raison_sociale','nom_commercial','forme_juridique','capital',
      'siret','siren','numero_tva','rcs','ape_naf','company_number','vat_uk',
      'adresse_rue','adresse_complement','code_postal','ville','pays','telephone','email_facturation',
      'iban','bic','banque_nom','regime_tva','taux_tva',
      'mentions_legales_extra','date_creation_entreprise','numero_assurance_pro'
    ]
    const body = {}
    for (const f of fields) {
      const el = c.querySelector('#' + f)
      if (el) {
        const v = el.value
        body[f] = (f === 'capital' || f === 'taux_tva') ? (v ? parseFloat(v) : null) : v
      }
    }
    try {
      await api.put('/societes/me', body)
      toast('Profil société enregistré')
      savedFn && savedFn()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

PAGES['a-profil-societe'] = async (c) => {
  const { data } = await api.get('/societes/me')
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-building"></i> Ma société</h1>
        <div class="subtitle">Coordonnées légales utilisées sur vos factures (conformes loi française 2026)</div></div>
    </div>
    <div id="profil-form-container"></div>
  `
  const cont = c.querySelector('#profil-form-container')
  renderProfilSocieteForm(cont, data.profil, false, () => navigate('a-profil-societe'))
}

PAGES['admin-profil-societe'] = async (c) => {
  const { data } = await api.get('/societes/me')
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-building"></i> DROPEAT LTD — Coordonnées société</h1>
        <div class="subtitle">Ces informations alimentent automatiquement toutes les factures émises (agents et restaurants). Conformes loi UK 2026.</div></div>
    </div>
    <div id="profil-form-container"></div>
  `
  const cont = c.querySelector('#profil-form-container')
  renderProfilSocieteForm(cont, data.profil, true, () => navigate('admin-profil-societe'))
}

// ============================================================
// === FACTURES — utilitaires et visualiseur ==================
// ============================================================
function factureStatutBadge(s) {
  const map = {
    brouillon: '<span class="badge" style="background:#6b7280;color:white">Brouillon</span>',
    envoyee: '<span class="badge badge-info">Envoyée</span>',
    validee: '<span class="badge badge-primary">Validée</span>',
    refusee: '<span class="badge badge-danger">Refusée</span>',
    payee: '<span class="badge" style="background:#06A05A;color:white">Payée ✓</span>',
    annulee: '<span class="badge" style="background:#9ca3af;color:white">Annulée</span>'
  }
  return map[s] || s
}

function printInvoice(el) {
  const w = window.open('', '_blank')
  w.document.write(`<!DOCTYPE html><html><head><title>Facture</title>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="/static/style.css" rel="stylesheet">
    <style>body { font-family: -apple-system, sans-serif; padding: 20px; }
    @media print { body { padding: 0 } }
    </style>
  </head><body>${el.outerHTML}<script>setTimeout(() => window.print(), 500);<\/script></body></html>`)
  w.document.close()
}

async function factureViewerModal(id) {
  const { data } = await api.get('/factures/' + id)
  const f = data.facture
  const e = f.emetteur || {}
  const d = f.dest || {}
  const lignes = data.lignes || []
  const mentions = f.mentions || []
  const devise = f.devise || 'EUR'
  const sym = devise === 'GBP' ? '£' : '€'
  const isUK = devise === 'GBP'
  const html = `
    <div id="factureToPrint" class="invoice-pdf">
      <div class="invoice-header">
        <div class="invoice-emetteur">
          <strong style="font-size:1.1rem">${escapeHtml(e.raison_sociale || '')}</strong>
          ${e.nom_commercial ? `<div class="text-muted">${escapeHtml(e.nom_commercial)}</div>` : ''}
          ${e.forme_juridique ? `<div>${escapeHtml(e.forme_juridique)}${e.capital ? ' au capital de ' + e.capital + ' ' + sym : ''}</div>` : ''}
          ${e.adresse_rue ? `<div>${escapeHtml(e.adresse_rue)}</div>` : ''}
          ${e.code_postal || e.ville ? `<div>${escapeHtml(e.code_postal || '')} ${escapeHtml(e.ville || '')}</div>` : ''}
          ${e.pays ? `<div>${escapeHtml(e.pays)}</div>` : ''}
          ${e.telephone ? `<div>Tél : ${escapeHtml(e.telephone)}</div>` : ''}
          ${e.email_facturation ? `<div>Email : ${escapeHtml(e.email_facturation)}</div>` : ''}
          ${isUK
            ? `${e.company_number ? `<div>Company No: ${escapeHtml(e.company_number)}</div>` : ''}${e.vat_uk ? `<div>VAT: ${escapeHtml(e.vat_uk)}</div>` : ''}`
            : `${e.siret ? `<div>SIRET : ${escapeHtml(e.siret)}</div>` : ''}${e.numero_tva ? `<div>TVA : ${escapeHtml(e.numero_tva)}</div>` : ''}${e.rcs ? `<div>${escapeHtml(e.rcs)}</div>` : ''}`
          }
        </div>
        <div class="invoice-title">
          <h1 style="margin:0">FACTURE</h1>
          <div style="font-size:1.1rem;font-family:monospace"><strong>${escapeHtml(f.numero)}</strong></div>
          <div style="margin-top:.5rem">${factureStatutBadge(f.statut)}</div>
        </div>
      </div>
      <div class="invoice-dest">
        <div class="invoice-block">
          <strong>FACTURÉ À</strong>
          <div style="font-size:1.05rem;margin-top:.3rem"><strong>${escapeHtml(d.raison_sociale || d.nom_commercial || '')}</strong></div>
          ${d.nom_commercial && d.nom_commercial !== d.raison_sociale ? `<div class="text-muted">${escapeHtml(d.nom_commercial)}</div>` : ''}
          ${d.adresse_rue ? `<div>${escapeHtml(d.adresse_rue)}</div>` : ''}
          ${d.code_postal || d.ville ? `<div>${escapeHtml(d.code_postal || '')} ${escapeHtml(d.ville || '')}</div>` : ''}
          ${d.pays ? `<div>${escapeHtml(d.pays)}</div>` : ''}
          ${d.siret ? `<div>SIRET : ${escapeHtml(d.siret)}</div>` : ''}
          ${d.company_number ? `<div>Company No: ${escapeHtml(d.company_number)}</div>` : ''}
        </div>
        <div class="invoice-block invoice-meta">
          <div><strong>Date d'émission :</strong> ${fmtDate(f.date_emission)}</div>
          <div><strong>Date d'échéance :</strong> ${fmtDate(f.date_echeance)}</div>
          <div><strong>Période :</strong> ${monthsFR[f.periode_mois-1]} ${f.periode_annee}</div>
          <div><strong>Type :</strong> ${
            f.type === 'agent_to_dropeat' ? 'Commissions agent commercial'
            : f.type === 'agent_to_resto' ? 'Facturation directe — Portefeuille Propriétaire 100%'
            : 'Service DropEat → Restaurant'
          }</div>
        </div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Libellé</th><th class="text-right">Qté</th><th class="text-right">P.U.</th><th class="text-right">Montant HT</th></tr></thead>
        <tbody>${(function() {
          // Regrouper visuellement par marque (clé marque_id), avec lignes "sans marque" (MLM) en dernier
          const groupes = new Map()
          for (const l of lignes) {
            const key = l.marque_id ? `m_${l.marque_id}` : '_no_marque'
            if (!groupes.has(key)) groupes.set(key, { marque_id: l.marque_id || null, lignes: [], total: 0 })
            const g = groupes.get(key)
            g.lignes.push(l)
            g.total += parseFloat(l.montant_ht || 0)
          }
          // Si une seule marque (ou aucune), rendre tel quel sans en-têtes de groupe
          if (groupes.size <= 1) {
            return lignes.map(l => `<tr>
              <td>${l.ordre}</td>
              <td><strong>${escapeHtml(l.libelle)}</strong>${l.description ? `<br><small class="text-muted">${escapeHtml(l.description)}</small>` : ''}</td>
              <td class="text-right">${fmtNum(l.quantite)}</td>
              <td class="text-right">${fmtEUR(l.prix_unitaire).replace(' €', ' ' + sym)}</td>
              <td class="text-right">${fmtEUR(l.montant_ht).replace(' €', ' ' + sym)}</td>
            </tr>`).join('')
          }
          // Sinon, afficher des entêtes de groupe par marque
          const groupesArr = Array.from(groupes.values())
          // Trier : marques nommées d'abord, puis MLM/sans marque
          groupesArr.sort((a, b) => {
            if (a.marque_id === null) return 1
            if (b.marque_id === null) return -1
            return 0
          })
          return groupesArr.map(g => {
            // Déduire un libellé de groupe à partir des libellés des lignes (formats type "Catégorie — Marque" ou "Catégorie — Marque (resto)")
            let label = 'MLM (N+1 / N+2)'
            if (g.marque_id) {
              const sample = g.lignes[0]?.libelle || ''
              const parts = sample.split('—')
              label = parts.length > 1 ? parts.slice(1).join('—').trim() : `Marque #${g.marque_id}`
            }
            const headerColor = g.marque_id ? '#eff6ff' : '#f5f3ff'
            const headerTxt = g.marque_id ? '#1d4ed8' : '#9333ea'
            const icon = g.marque_id ? 'fa-tag' : 'fa-sitemap'
            return `
              <tr style="background:${headerColor};color:${headerTxt}">
                <td colspan="5" style="padding:.45rem .6rem;font-weight:bold;font-size:.9rem">
                  <i class="fas ${icon}"></i> ${escapeHtml(label)}
                  <span style="float:right;font-family:monospace">Sous-total : ${fmtEUR(g.total).replace(' €', ' ' + sym)}</span>
                </td>
              </tr>
              ${g.lignes.map(l => `<tr>
                <td>${l.ordre}</td>
                <td>${escapeHtml(l.libelle)}${l.description ? `<br><small class="text-muted">${escapeHtml(l.description)}</small>` : ''}</td>
                <td class="text-right">${fmtNum(l.quantite)}</td>
                <td class="text-right">${fmtEUR(l.prix_unitaire).replace(' €', ' ' + sym)}</td>
                <td class="text-right">${fmtEUR(l.montant_ht).replace(' €', ' ' + sym)}</td>
              </tr>`).join('')}
            `
          }).join('')
        })()}</tbody>
      </table>
      <div class="invoice-totals">
        <div class="invoice-totals-row"><span>Total HT</span><span>${fmtEUR(f.montant_ht).replace(' €', ' ' + sym)}</span></div>
        <div class="invoice-totals-row"><span>TVA (${f.taux_tva}%)</span><span>${fmtEUR(f.montant_tva).replace(' €', ' ' + sym)}</span></div>
        <div class="invoice-totals-row invoice-totals-ttc"><span>Total TTC</span><span>${fmtEUR(f.montant_ttc).replace(' €', ' ' + sym)}</span></div>
      </div>
      ${e.iban ? `<div class="invoice-payment">
        <strong>Modalités de paiement :</strong> Virement bancaire à 30 jours<br>
        <strong>IBAN :</strong> ${escapeHtml(e.iban)} ${e.bic ? '<strong>BIC :</strong> ' + escapeHtml(e.bic) : ''}<br>
        ${e.banque_nom ? '<strong>Banque :</strong> ' + escapeHtml(e.banque_nom) : ''}
      </div>` : ''}
      <div class="invoice-mentions">
        <strong>Mentions légales :</strong>
        <ul>${mentions.map(mt => `<li>${escapeHtml(mt)}</li>`).join('')}</ul>
      </div>
      ${f.motif_refus ? `<div class="invoice-refusal"><strong>Motif de refus :</strong> ${escapeHtml(f.motif_refus)}</div>` : ''}
    </div>
  `
  // Récupère l'historique d'envois email
  let envoisHTML = ''
  try {
    const { data: envoisData } = await api.get('/factures/' + id + '/envois')
    const envois = envoisData.envois || []
    if (envois.length) {
      const evtBadge = {
        creee: '<span class="badge" style="background:#dbeafe;color:#1e40af">Créée</span>',
        envoyee: '<span class="badge" style="background:#fed7aa;color:#9a3412">Envoyée</span>',
        validee: '<span class="badge" style="background:#d1fae5;color:#065f46">Validée</span>',
        refusee: '<span class="badge badge-danger">Refusée</span>',
        payee: '<span class="badge badge-primary">Payée</span>',
        rappel: '<span class="badge" style="background:#fef3c7;color:#92400e">Rappel</span>',
        manuel: '<span class="badge badge-secondary">Manuel</span>'
      }
      const statutBadge = (s) => s === 'sent'
        ? '<span style="color:var(--success)"><i class="fas fa-check-circle"></i> envoyé</span>'
        : s === 'failed'
          ? '<span style="color:var(--danger)"><i class="fas fa-times-circle"></i> échec</span>'
          : '<span class="text-muted">' + escapeHtml(s) + '</span>'
      envoisHTML = `
        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)">
          <div style="font-weight:bold;margin-bottom:.5rem"><i class="fas fa-envelope"></i> Historique des envois email (${envois.length})</div>
          <div class="table-wrap" style="max-height:240px;overflow-y:auto">
            <table class="data-table" style="font-size:.85rem">
              <thead><tr><th>Date</th><th>Évt</th><th>Destinataire</th><th>Statut</th><th>Émis par</th></tr></thead>
              <tbody>${envois.map(e => `
                <tr>
                  <td>${fmtDateTime(e.envoye_at)}</td>
                  <td>${evtBadge[e.evenement] || escapeHtml(e.evenement)}</td>
                  <td>${escapeHtml(e.destinataire_email)}${e.destinataire_nom ? '<br><small class="text-muted">' + escapeHtml(e.destinataire_nom) + '</small>' : ''}</td>
                  <td>${statutBadge(e.statut)}${e.error_message ? '<br><small class="text-muted">' + escapeHtml(e.error_message) + '</small>' : ''}</td>
                  <td>${e.envoye_par_prenom ? escapeHtml(e.envoye_par_prenom + ' ' + (e.envoye_par_nom || '')) : '<span class="text-muted">système</span>'}</td>
                </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>`
    }
  } catch (e) { /* silent */ }

  const m = modal(`<i class="fas fa-file-invoice"></i> Facture ${escapeHtml(f.numero)}`, html + envoisHTML + `
    <div class="form-actions" style="margin-top:1rem;flex-wrap:wrap">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
      <button type="button" class="btn btn-primary" id="printBtn"><i class="fas fa-print"></i> Imprimer / PDF</button>
      <button type="button" class="btn btn-secondary" id="pdfBtn" title="Ouvrir le PDF dans un nouvel onglet"><i class="fas fa-file-pdf"></i> PDF (nouvel onglet)</button>
      ${(CURRENT_USER.role === 'superadmin' || f.emetteur_user_id === CURRENT_USER.id) ? `
        <button type="button" class="btn btn-secondary" id="emailBtn" title="Envoyer la facture par email"><i class="fas fa-paper-plane"></i> Envoyer par email</button>
      ` : ''}
      ${CURRENT_USER.role === 'superadmin' && f.statut === 'envoyee' ? `
        <button type="button" class="btn btn-danger" id="refusBtn"><i class="fas fa-times"></i> Refuser</button>
        <button type="button" class="btn btn-primary" id="validBtn"><i class="fas fa-check"></i> Valider</button>
      ` : ''}
      ${CURRENT_USER.role === 'superadmin' && f.statut === 'validee' ? `
        <button type="button" class="btn btn-primary" id="payBtn"><i class="fas fa-money-bill-wave"></i> Marquer payée</button>
      ` : ''}
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#printBtn').onclick = () => printInvoice(m.el.querySelector('#factureToPrint'))
  const pdfBtn = m.el.querySelector('#pdfBtn')
  if (pdfBtn) pdfBtn.onclick = () => window.open('/api/factures/' + id + '/pdf', '_blank')
  const emailBtn = m.el.querySelector('#emailBtn')
  if (emailBtn) emailBtn.onclick = async () => {
    const defaultEmail = (f.dest_email || f.dest || {}).email_facturation || f.dest_user_email || ''
    const dest = prompt('Adresse email destinataire (laisser vide pour utiliser celle de la facture) :', defaultEmail)
    if (dest === null) return
    try {
      const r = await api.post('/factures/' + id + '/email', {
        evenement: 'manuel',
        destinataire_email: dest || undefined
      })
      toast('Email envoyé')
      m.close()
      // Réouvre la modale pour rafraîchir l'historique
      setTimeout(() => factureViewerModal(id), 200)
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur envoi', 'error')
    }
  }
  const vb = m.el.querySelector('#validBtn')
  if (vb) vb.onclick = async () => {
    try { await api.post('/factures/' + id + '/valider'); toast('Facture validée'); m.close(); navigate(CURRENT_USER.role === 'superadmin' ? 'admin-factures' : 'a-factures') }
    catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
  const rb = m.el.querySelector('#refusBtn')
  if (rb) rb.onclick = () => {
    const motif = prompt('Motif du refus :')
    if (!motif) return
    api.post('/factures/' + id + '/refuser', { motif })
      .then(() => { toast('Facture refusée'); m.close(); navigate('admin-factures') })
      .catch(err => toast(err.response?.data?.error || 'Erreur', 'error'))
  }
  const pb = m.el.querySelector('#payBtn')
  if (pb) pb.onclick = () => {
    const ref = prompt('Référence de paiement (n° de virement) :')
    api.post('/factures/' + id + '/payer', { reference_paiement: ref || null })
      .then(() => { toast('Facture payée'); m.close(); navigate('admin-factures') })
      .catch(err => toast(err.response?.data?.error || 'Erreur', 'error'))
  }
}

// ============================================================
// === FACTURES AGENT (création + liste) ======================
// ============================================================
PAGES['a-factures'] = async (c) => {
  const [aDr, aRe] = await Promise.all([
    api.get('/factures?type=agent_to_dropeat'),
    api.get('/factures?type=agent_to_resto').catch(() => ({ data: { factures: [] } }))
  ])
  const allDr = aDr.data.factures || []
  // Séparer factures standard vs MLM (par préfixe numéro AGT-MLM-)
  const facturesDr = allDr.filter(f => !String(f.numero || '').startsWith('AGT-MLM-'))
  const facturesMlm = allDr.filter(f => String(f.numero || '').startsWith('AGT-MLM-'))
  const facturesRe = aRe.data.factures || []

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-file-invoice-dollar"></i> Mes factures</h1>
        <div class="subtitle">Vos commissions DropEat (standard + MLM séparé) + vos facturations directes (portefeuille 100%)</div></div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="newFacture"><i class="fas fa-plus"></i> Facture commissions standard</button>
        <button class="btn" style="background:#9333ea;color:#fff" id="newFactureMlm"><i class="fas fa-sitemap"></i> Facture MLM (N+1 / N+2)</button>
        <button class="btn btn-warning" id="newFactureResto"><i class="fas fa-star"></i> Facture portefeuille (→ restaurant)</button>
      </div>
    </div>

    <div class="card" style="background:#eff6ff;border-left:3px solid #1d4ed8;margin-bottom:1rem">
      <div style="display:flex;align-items:start;gap:.6rem;font-size:.88rem">
        <i class="fas fa-circle-info" style="color:#1d4ed8;font-size:1.1rem;margin-top:.15rem"></i>
        <div>
          <strong>Trois types de facturation :</strong><br>
          <span style="color:#475569"><strong>1. Commissions standard (→ DropEat)</strong> — vos commissions propres sur vos marques <em>hors portefeuille</em>. Préfixe <code>AGT-YYYY-MM-NNNN</code>.</span><br>
          <span style="color:#475569"><strong>2. Commissions MLM (→ DropEat)</strong> — vos commissions N+1 (filleuls directs) + N+2 (sous-filleuls), <strong>facturées à part</strong>. Préfixe <code>AGT-MLM-YYYY-MM-NNNN</code>.</span><br>
          <span style="color:#475569"><strong>3. Portefeuille 100% (→ restaurant)</strong> — sur la 5e marque/resto en portefeuille propriétaire, vous facturez <strong>directement</strong> le restaurant. DropEat ne touche rien.</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-title"><i class="fas fa-building"></i> Factures de commissions standard (→ DropEat) — ${facturesDr.length}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Numéro</th><th>Période</th><th>Émission</th><th>Échéance</th><th class="text-right">HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${facturesDr.length ? facturesDr.map(f => `<tr>
          <td><strong style="font-family:monospace">${escapeHtml(f.numero)}</strong></td>
          <td>${monthsFR[f.periode_mois-1]} ${f.periode_annee}</td>
          <td>${fmtDate(f.date_emission)}</td>
          <td>${fmtDate(f.date_echeance)}</td>
          <td class="text-right">${fmtEUR(f.montant_ht)}</td>
          <td class="text-right"><strong>${fmtEUR(f.montant_ttc)}</strong></td>
          <td>${factureStatutBadge(f.statut)}</td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-view="${f.id}" title="Voir / PDF"><i class="fas fa-eye"></i></button>
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-primary" data-send="${f.id}" title="Envoyer pour validation"><i class="fas fa-paper-plane"></i></button>` : ''}
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-danger" data-del="${f.id}" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucune facture standard. Cliquez sur « Facture commissions standard ».</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="card" style="margin-bottom:1rem;border-left:3px solid #9333ea">
      <div class="card-title"><i class="fas fa-sitemap" style="color:#9333ea"></i> Factures commissions MLM (N+1 / N+2 → DropEat) — ${facturesMlm.length}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Numéro</th><th>Période</th><th>Émission</th><th>Échéance</th><th class="text-right">HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${facturesMlm.length ? facturesMlm.map(f => `<tr>
          <td><strong style="font-family:monospace;color:#9333ea">${escapeHtml(f.numero)}</strong></td>
          <td>${monthsFR[f.periode_mois-1]} ${f.periode_annee}</td>
          <td>${fmtDate(f.date_emission)}</td>
          <td>${fmtDate(f.date_echeance)}</td>
          <td class="text-right">${fmtEUR(f.montant_ht)}</td>
          <td class="text-right"><strong>${fmtEUR(f.montant_ttc)}</strong></td>
          <td>${factureStatutBadge(f.statut)}</td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-view="${f.id}" title="Voir / PDF"><i class="fas fa-eye"></i></button>
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-primary" data-send="${f.id}" title="Envoyer pour validation"><i class="fas fa-paper-plane"></i></button>` : ''}
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-danger" data-del="${f.id}" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucune facture MLM. Si vous avez des filleuls actifs, cliquez sur « Facture MLM ».</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="card" style="border-left:3px solid #ea8a00">
      <div class="card-title"><i class="fas fa-star" style="color:#ea8a00"></i> Factures directes portefeuille 100% (→ restaurant) — ${facturesRe.length}</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Numéro</th><th>Restaurant</th><th>Période</th><th>Émission</th><th>Échéance</th><th class="text-right">HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${facturesRe.length ? facturesRe.map(f => {
          let destNom = '—'
          try {
            const ds = typeof f.dest_snapshot === 'string' ? JSON.parse(f.dest_snapshot) : f.dest_snapshot
            destNom = ds?.nom_commercial || ds?.raison_sociale || '—'
          } catch {}
          return `<tr>
          <td><strong style="font-family:monospace">${escapeHtml(f.numero)}</strong></td>
          <td>${escapeHtml(destNom)}</td>
          <td>${monthsFR[f.periode_mois-1]} ${f.periode_annee}</td>
          <td>${fmtDate(f.date_emission)}</td>
          <td>${fmtDate(f.date_echeance)}</td>
          <td class="text-right">${fmtEUR(f.montant_ht)}</td>
          <td class="text-right"><strong>${fmtEUR(f.montant_ttc)}</strong></td>
          <td>${factureStatutBadge(f.statut)}</td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-view="${f.id}" title="Voir / PDF"><i class="fas fa-eye"></i></button>
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-primary" data-send="${f.id}" title="Envoyer au restaurant"><i class="fas fa-paper-plane"></i></button>` : ''}
            ${f.statut === 'brouillon' ? `<button class="btn btn-sm btn-danger" data-del="${f.id}" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
          </td>
        </tr>`}).join('') : '<tr><td colspan="9" class="text-center text-muted">Aucune facture directe. Si vous avez des marques/restaurants en portefeuille avec des ventes, cliquez sur « Facture portefeuille ».</td></tr>'}</tbody>
      </table></div>
    </div>
  `
  c.querySelector('#newFacture').onclick = () => factureCreateAgentModal(() => navigate('a-factures'))
  c.querySelector('#newFactureMlm').onclick = () => factureCreateAgentMLMModal(() => navigate('a-factures'))
  c.querySelector('#newFactureResto').onclick = () => factureCreateAgentRestoModal(() => navigate('a-factures'))
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => factureViewerModal(b.dataset.view))
  c.querySelectorAll('[data-send]').forEach(b => b.onclick = () => confirmDialog(
    'Envoyer cette facture ? Vous ne pourrez plus la modifier.',
    async () => {
      try { await api.post('/factures/' + b.dataset.send + '/envoyer'); toast('Facture envoyée'); navigate('a-factures') }
      catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  ))
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer cette facture brouillon ?',
    async () => {
      try { await api.delete('/factures/' + b.dataset.del); toast('Facture supprimée'); navigate('a-factures') }
      catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
    }
  ))
}

// ============================================================
// Modal de création d'une facture AGENT → RESTAURANT (portefeuille 100%)
// ============================================================
// === HELPER : sélecteur de période flexible (jour / semaine / mois / custom) ===
// Retourne un objet { html, attach(root), getPeriode() } qui injecte des champs
// dans le formulaire et expose getPeriode() pour récupérer { annee, mois }
// OU { date_debut, date_fin } selon le mode choisi par l'utilisateur.
function periodeSelector(prefix) {
  const now = new Date()
  const annee = now.getFullYear()
  const moisCur = now.getMonth() + 1
  const today = now.toISOString().substring(0, 10)
  // Lundi de la semaine courante
  const dow = (now.getDay() + 6) % 7 // 0 = lundi
  const monday = new Date(now); monday.setDate(now.getDate() - dow)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const mondayStr = monday.toISOString().substring(0, 10)
  const sundayStr = sunday.toISOString().substring(0, 10)
  // 1er & dernier jour du mois courant
  const firstM = new Date(annee, moisCur - 1, 1).toISOString().substring(0, 10)
  const lastM = new Date(annee, moisCur, 0).toISOString().substring(0, 10)

  const html = `
    <div class="form-grid" style="margin-bottom:.4rem">
      <div class="form-group" style="grid-column:1/-1">
        <label>Type de période</label>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;font-size:.85rem">
          <label style="display:flex;align-items:center;gap:.25rem;cursor:pointer"><input type="radio" name="${prefix}_type" value="mois" checked> Mois entier</label>
          <label style="display:flex;align-items:center;gap:.25rem;cursor:pointer"><input type="radio" name="${prefix}_type" value="jour"> Un seul jour</label>
          <label style="display:flex;align-items:center;gap:.25rem;cursor:pointer"><input type="radio" name="${prefix}_type" value="semaine"> Semaine (Lun→Dim)</label>
          <label style="display:flex;align-items:center;gap:.25rem;cursor:pointer"><input type="radio" name="${prefix}_type" value="custom"> Plage personnalisée</label>
        </div>
      </div>
    </div>
    <div class="form-grid" id="${prefix}_mois_block">
      <div class="form-group"><label>Année</label><input id="${prefix}_annee" type="number" value="${annee}" min="2024" max="2030"/></div>
      <div class="form-group"><label>Mois</label>
        <select id="${prefix}_mois">${monthsFR.map((mo, i) => `<option value="${i+1}" ${i+1===moisCur?'selected':''}>${mo}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-grid" id="${prefix}_jour_block" style="display:none">
      <div class="form-group" style="grid-column:1/-1"><label>Jour</label><input id="${prefix}_jour" type="date" value="${today}"/></div>
    </div>
    <div class="form-grid" id="${prefix}_semaine_block" style="display:none">
      <div class="form-group" style="grid-column:1/-1"><label>Lundi de la semaine</label>
        <input id="${prefix}_semaine" type="date" value="${mondayStr}"/>
        <small class="text-muted">La semaine couvre 7 jours (Lundi → Dimanche).</small>
      </div>
    </div>
    <div class="form-grid" id="${prefix}_custom_block" style="display:none">
      <div class="form-group"><label>Du</label><input id="${prefix}_debut" type="date" value="${firstM}"/></div>
      <div class="form-group"><label>Au</label><input id="${prefix}_fin" type="date" value="${lastM}"/></div>
    </div>
  `

  function attach(root, onChange) {
    const blocks = ['mois', 'jour', 'semaine', 'custom']
    function showBlock(type) {
      blocks.forEach(b => {
        const el = root.querySelector(`#${prefix}_${b}_block`)
        if (el) el.style.display = b === type ? '' : 'none'
      })
    }
    root.querySelectorAll(`input[name="${prefix}_type"]`).forEach(r => {
      r.onchange = () => { showBlock(r.value); onChange && onChange(getPeriode(root)) }
    })
    // Réagir aux changements de valeur
    ;[`${prefix}_annee`, `${prefix}_mois`, `${prefix}_jour`, `${prefix}_semaine`, `${prefix}_debut`, `${prefix}_fin`].forEach(id => {
      const el = root.querySelector('#' + id)
      if (el) el.onchange = () => onChange && onChange(getPeriode(root))
    })
  }

  function getPeriode(root) {
    const type = root.querySelector(`input[name="${prefix}_type"]:checked`)?.value || 'mois'
    if (type === 'mois') {
      return {
        type: 'mois',
        annee: parseInt(root.querySelector('#' + prefix + '_annee').value),
        mois: parseInt(root.querySelector('#' + prefix + '_mois').value)
      }
    }
    if (type === 'jour') {
      const d = root.querySelector('#' + prefix + '_jour').value
      return { type: 'jour', date_debut: d, date_fin: d }
    }
    if (type === 'semaine') {
      const lun = root.querySelector('#' + prefix + '_semaine').value
      const dim = new Date(lun); dim.setDate(dim.getDate() + 6)
      return { type: 'semaine', date_debut: lun, date_fin: dim.toISOString().substring(0, 10) }
    }
    // custom
    return {
      type: 'custom',
      date_debut: root.querySelector('#' + prefix + '_debut').value,
      date_fin: root.querySelector('#' + prefix + '_fin').value
    }
  }

  // Construit les query params pour les endpoints GET (?annee=&mois= OU ?date_debut=&date_fin=)
  function toQueryString(p) {
    if (p.type === 'mois') return `annee=${p.annee}&mois=${p.mois}`
    return `date_debut=${p.date_debut}&date_fin=${p.date_fin}`
  }
  function periodeLabel(p) {
    if (p.type === 'mois') return `${monthsFR[p.mois-1]} ${p.annee}`
    if (p.type === 'jour') return p.date_debut
    if (p.type === 'semaine') return `Semaine ${p.date_debut} → ${p.date_fin}`
    return `${p.date_debut} → ${p.date_fin}`
  }

  return { html, attach, getPeriode, toQueryString, periodeLabel }
}

function factureCreateAgentRestoModal(onSuccess) {
  const ps = periodeSelector('fr')
  let picker = null
  let currentRestoNom = ''
  const m = modal('<i class="fas fa-star" style="color:#ea8a00"></i> Facture directe portefeuille (→ restaurant)', `
    <div style="background:#fffbeb;border-left:3px solid #ea8a00;padding:.7rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem">
      <strong>Règle d'or :</strong> sur la 5e marque ou le 5e restaurant en <strong>portefeuille propriétaire</strong>,
      vous facturez <strong>directement le restaurant à 100%</strong>. DropEat ne touche rien, aucune commission N+1/N+2.
    </div>

    <!-- ÉTAPE 1 : Période + Restaurant -->
    <div style="margin-bottom:.8rem">
      <strong style="font-size:.9rem">1. Période & restaurant</strong>
      ${ps.html}
      <div class="form-grid" style="margin-top:.4rem">
        <div class="form-group" style="grid-column:1/-1">
          <label>Restaurant éligible <span class="req">*</span></label>
          <select id="frResto" required>
            <option value="">— Chargement —</option>
          </select>
          <small class="text-muted">Seuls les restaurants ayant au moins une marque/resto en portefeuille avec ventes sur la période sont listés.</small>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.5rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-secondary btn-sm" id="frLoadRestos"><i class="fas fa-sync"></i> Recharger</button>
        <button type="button" class="btn btn-primary btn-sm" id="frLoadMarques"><i class="fas fa-tags"></i> Charger les marques</button>
        <div style="margin-left:auto;font-size:.8rem" class="text-muted">Période : <strong id="frLabel"></strong></div>
      </div>
    </div>

    <!-- ÉTAPE 2 : Marques + mode -->
    <div id="frStep2" style="display:none;margin-bottom:.8rem">
      <strong style="font-size:.9rem">2. Marques portefeuille à facturer</strong>
      <div id="frMarquesBox"></div>
      <div class="card" style="background:#fef9c3;margin-top:.6rem;padding:.6rem">
        <strong style="font-size:.85rem">Mode de facturation :</strong>
        <div style="display:flex;flex-direction:column;gap:.3rem;margin-top:.3rem;font-size:.85rem">
          <label style="cursor:pointer"><input type="radio" name="frMode" value="groupee" checked> <strong>1 facture groupée</strong> — toutes les marques portefeuille (recommandé)</label>
          <label style="cursor:pointer"><input type="radio" name="frMode" value="split"> <strong>N factures séparées</strong> — 1 facture par marque</label>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.6rem">
        <button type="button" class="btn btn-info btn-sm" id="frPreviewBtn"><i class="fas fa-eye"></i> Aperçu</button>
      </div>
    </div>

    <!-- ÉTAPE 3 : Aperçu + création -->
    <div id="frStep3" style="display:none">
      <strong style="font-size:.9rem">3. Aperçu & validation</strong>
      <div id="frPreview" style="margin:.5rem 0;padding:1rem;background:#f9fafb;border-radius:6px"></div>
      <div class="form-group"><label>Notes internes (optionnel)</label><textarea id="frNotes" rows="2"></textarea></div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="frCreate" disabled><i class="fas fa-file-invoice"></i> Créer la/les facture(s)</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()

  function updateLabel() {
    const p = ps.getPeriode(m.el)
    m.el.querySelector('#frLabel').textContent = ps.periodeLabel(p)
  }
  function resetSteps() {
    m.el.querySelector('#frStep2').style.display = 'none'
    m.el.querySelector('#frStep3').style.display = 'none'
    m.el.querySelector('#frCreate').disabled = true
    picker = null
  }
  ps.attach(m.el, () => { updateLabel(); resetSteps(); loadRestos() })
  updateLabel()

  async function loadRestos() {
    const p = ps.getPeriode(m.el)
    try {
      const { data } = await api.get(`/factures/agent-resto/restos-eligibles?${ps.toQueryString(p)}`)
      const sel = m.el.querySelector('#frResto')
      sel.innerHTML = '<option value="">— Choisir —</option>' + (data.restos || []).map(r =>
        `<option value="${r.restaurant_id}" data-nom="${escapeHtml(r.restaurant_nom)}">${escapeHtml(r.restaurant_nom)} — ${r.nb_commandes} cmd · CA ${fmtEUR(r.ca)} · à facturer ${fmtEUR(r.montant_facturable)}${r.resto_pf ? ' [Resto P]' : ''}${r.nb_marques_pf ? ` [${r.nb_marques_pf} marque(s) P]` : ''}</option>`
      ).join('')
      if (!data.restos?.length) {
        toast('Aucun restaurant éligible sur cette période (pas de marque/resto en portefeuille avec ventes)', 'info', 4500)
      } else {
        toast(`${data.restos.length} restaurant(s) éligible(s)`)
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
  m.el.querySelector('#frLoadRestos').onclick = loadRestos
  m.el.querySelector('#frResto').onchange = resetSteps
  loadRestos()

  m.el.querySelector('#frLoadMarques').onclick = async () => {
    const rid = parseInt(m.el.querySelector('#frResto').value)
    if (!rid) return toast('Sélectionnez un restaurant', 'error')
    const opt = m.el.querySelector('#frResto').selectedOptions[0]
    currentRestoNom = opt?.dataset?.nom || ''
    const p = ps.getPeriode(m.el)
    try {
      const q = ps.toQueryString(p)
      const { data } = await api.get(`/factures/agent-resto/marques-portefeuille?restaurant_id=${rid}&${q}`)
      const marques = data.marques || []
      picker = marquesPicker({
        uid: 'fr', mode: 'agent_resto', marques,
        onChange: () => {}
      })
      const box = m.el.querySelector('#frMarquesBox')
      box.innerHTML = picker.html
      picker.attach(box)
      m.el.querySelector('#frStep2').style.display = 'block'
      m.el.querySelector('#frStep3').style.display = 'none'
      m.el.querySelector('#frCreate').disabled = true
      if (!marques.length) {
        toast('Aucune marque portefeuille à facturer pour ce restaurant.', 'info', 4500)
      } else {
        toast(`${marques.length} marque(s) portefeuille trouvée(s)`)
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  m.el.querySelector('#frPreviewBtn').onclick = async () => {
    if (!picker) return toast('Cliquez d\'abord sur « Charger les marques »', 'error')
    const box = m.el.querySelector('#frMarquesBox')
    const ids = picker.getSelected(box)
    const rid = parseInt(m.el.querySelector('#frResto').value)
    if (!rid) return toast('Sélectionnez un restaurant', 'error')
    const p = ps.getPeriode(m.el)
    const mode = m.el.querySelector('input[name="frMode"]:checked').value
    const splitByMarque = mode === 'split'
    try {
      const body = {
        restaurant_id: rid,
        marques_ids: ids,
        split_by_marque: splitByMarque,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent-resto/preview', body)
      const previewBox = m.el.querySelector('#frPreview')
      if (!data.lignes.length) {
        previewBox.innerHTML = '<div class="text-muted">Aucun encaissement portefeuille à facturer avec ces filtres.</div>'
        m.el.querySelector('#frCreate').disabled = true
      } else if (splitByMarque && data.groupes) {
        previewBox.innerHTML = `
          <strong><i class="fas fa-layer-group" style="color:#ea8a00"></i> Mode séparé — ${data.groupes.length} facture(s) à créer — Total HT : ${fmtEUR(data.total)}</strong>
          <div class="text-muted" style="font-size:.78rem;margin:.3rem 0">Restaurant : <strong>${escapeHtml(data.restaurant.nom)}</strong></div>
          <table class="data-table" style="font-size:.8rem">
            <thead><tr><th>Facture</th><th class="text-right">Lignes</th><th class="text-right">HT</th></tr></thead>
            <tbody>${data.groupes.map(g => `<tr>
              <td><strong>${escapeHtml(g.libelle)}</strong></td>
              <td class="text-right">${g.lignes.length}</td>
              <td class="text-right"><strong>${fmtEUR(g.total_ht)}</strong></td>
            </tr>`).join('')}</tbody>
          </table>`
        m.el.querySelector('#frCreate').disabled = false
      } else {
        previewBox.innerHTML = `
          <strong><i class="fas fa-star" style="color:#ea8a00"></i> Facture groupée — ${data.lignes.length} ligne(s) — Total HT : ${fmtEUR(data.total)}</strong>
          <div class="text-muted" style="font-size:.78rem;margin:.3rem 0">Restaurant : <strong>${escapeHtml(data.restaurant.nom)}</strong></div>
          <table class="data-table" style="font-size:.8rem">
            <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">HT</th></tr></thead>
            <tbody>${data.lignes.map(l => `<tr>
              <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
              <td class="text-right">${fmtNum(l.quantite)}</td>
              <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
            </tr>`).join('')}</tbody>
          </table>`
        m.el.querySelector('#frCreate').disabled = false
      }
      m.el.querySelector('#frStep3').style.display = 'block'
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  m.el.querySelector('#frCreate').onclick = async () => {
    if (!picker) return toast('Chargez les marques puis générez l\'aperçu', 'error')
    const box = m.el.querySelector('#frMarquesBox')
    const ids = picker.getSelected(box)
    const rid = parseInt(m.el.querySelector('#frResto').value)
    if (!rid) return toast('Sélectionnez un restaurant', 'error')
    const p = ps.getPeriode(m.el)
    const mode = m.el.querySelector('input[name="frMode"]:checked').value
    const splitByMarque = mode === 'split'
    const notes = m.el.querySelector('#frNotes').value
    try {
      const body = {
        restaurant_id: rid,
        marques_ids: ids,
        split_by_marque: splitByMarque,
        notes,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent-resto/create', body)
      if (data.mode === 'split_by_marque') {
        toast(`${data.nb_factures} facture(s) créée(s) — Total HT : ${fmtEUR(data.total_ht)}`)
      } else {
        toast('Facture créée : ' + data.numero)
      }
      m.close()
      onSuccess && onSuccess()
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// Modal AGENT → DROPEAT — Facture de commissions standard (par marque)
// scope='standard' implicite (pas de MLM ici, MLM = modal séparé)
// ============================================================
function factureCreateAgentModal(onSuccess) {
  const ps = periodeSelector('fc')
  let picker = null // composant marquesPicker (chargé après période)
  const m = modal('<i class="fas fa-file-invoice"></i> Facture commissions standard (→ DropEat)', `
    <div style="background:#eff6ff;border-left:3px solid #1d4ed8;padding:.7rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem">
      <strong><i class="fas fa-circle-info"></i> Commissions propres uniquement</strong> sur les marques que vous gérez (hors portefeuille propriétaire).<br>
      <span class="text-muted">Les commissions <strong>MLM (N+1 / N+2)</strong> font l'objet d'une facture séparée — utilisez « Facture MLM » sur la page principale.</span>
    </div>

    <!-- ÉTAPE 1 : Période -->
    <div style="margin-bottom:.8rem">
      <strong style="font-size:.9rem">1. Choisir la période</strong>
      ${ps.html}
      <div style="display:flex;gap:.5rem;margin-top:.5rem;align-items:center">
        <button type="button" class="btn btn-secondary btn-sm" id="fcLoadMarques"><i class="fas fa-sync"></i> Charger mes marques</button>
        <div style="margin-left:auto;font-size:.8rem" class="text-muted">Période : <strong id="fcLabel"></strong></div>
      </div>
    </div>

    <!-- ÉTAPE 2 : Marques + mode -->
    <div id="fcStep2" style="display:none;margin-bottom:.8rem">
      <strong style="font-size:.9rem">2. Sélectionner les marques à facturer</strong>
      <div id="fcMarquesBox"></div>
      <div class="card" style="background:#fef9c3;margin-top:.6rem;padding:.6rem">
        <strong style="font-size:.85rem">Mode de facturation :</strong>
        <div style="display:flex;flex-direction:column;gap:.3rem;margin-top:.3rem;font-size:.85rem">
          <label style="cursor:pointer"><input type="radio" name="fcMode" value="groupee" checked> <strong>1 facture groupée</strong> — toutes les marques sur une seule facture (recommandé)</label>
          <label style="cursor:pointer"><input type="radio" name="fcMode" value="split"> <strong>N factures séparées</strong> — 1 facture par marque (numérotation indépendante)</label>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;margin-top:.6rem">
        <button type="button" class="btn btn-info btn-sm" id="fcPreviewBtn"><i class="fas fa-eye"></i> Aperçu</button>
      </div>
    </div>

    <!-- ÉTAPE 3 : Aperçu + création -->
    <div id="fcStep3" style="display:none">
      <strong style="font-size:.9rem">3. Aperçu & validation</strong>
      <div id="fcPreview" style="margin:.5rem 0;padding:1rem;background:#f9fafb;border-radius:6px"></div>
      <div class="form-group"><label>Notes internes (optionnel)</label><textarea id="fcNotes" rows="2"></textarea></div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="fcCreate" disabled><i class="fas fa-file-invoice"></i> Créer la/les facture(s)</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()

  function updateLabel() {
    const p = ps.getPeriode(m.el)
    m.el.querySelector('#fcLabel').textContent = ps.periodeLabel(p)
  }
  function resetSteps() {
    m.el.querySelector('#fcStep2').style.display = 'none'
    m.el.querySelector('#fcStep3').style.display = 'none'
    m.el.querySelector('#fcCreate').disabled = true
    picker = null
  }
  ps.attach(m.el, () => { updateLabel(); resetSteps() })
  updateLabel()

  async function loadMarques() {
    const p = ps.getPeriode(m.el)
    try {
      const q = ps.toQueryString(p)
      const { data } = await api.get('/factures/agent/marques-facturables-self?' + q)
      const marques = data.marques || []
      picker = marquesPicker({
        uid: 'fc', mode: 'agent_dropeat', marques,
        onChange: () => { /* le total est calculé par le picker lui-même */ }
      })
      const box = m.el.querySelector('#fcMarquesBox')
      box.innerHTML = picker.html
      picker.attach(box)
      m.el.querySelector('#fcStep2').style.display = 'block'
      m.el.querySelector('#fcStep3').style.display = 'none'
      m.el.querySelector('#fcCreate').disabled = true
      if (!marques.length) {
        toast('Aucune marque facturable sur cette période (hors portefeuille).', 'info', 4500)
      } else {
        const eligibles = marques.filter(x => x.eligible_dropeat).length
        toast(`${marques.length} marque(s) trouvée(s), ${eligibles} éligible(s) DropEat`)
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
  m.el.querySelector('#fcLoadMarques').onclick = loadMarques

  m.el.querySelector('#fcPreviewBtn').onclick = async () => {
    if (!picker) return toast('Cliquez d\'abord sur « Charger mes marques »', 'error')
    const box = m.el.querySelector('#fcMarquesBox')
    const ids = picker.getSelected(box)
    if (!ids.length) return toast('Cochez au moins une marque', 'error')
    const p = ps.getPeriode(m.el)
    const mode = m.el.querySelector('input[name="fcMode"]:checked').value
    const splitByMarque = mode === 'split'
    try {
      const body = {
        marques_ids: ids,
        scope: 'standard',
        split_by_marque: splitByMarque,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent/preview', body)
      const previewBox = m.el.querySelector('#fcPreview')
      if (!data.lignes.length) {
        previewBox.innerHTML = '<div class="text-muted">Aucune commission à facturer avec ces filtres.</div>'
        m.el.querySelector('#fcCreate').disabled = true
      } else if (splitByMarque && data.groupes) {
        previewBox.innerHTML = `
          <strong><i class="fas fa-layer-group"></i> Mode séparé — ${data.groupes.length} facture(s) à créer — Total HT : ${fmtEUR(data.total)}</strong>
          <table class="data-table" style="font-size:.8rem;margin-top:.4rem">
            <thead><tr><th>Facture</th><th class="text-right">Lignes</th><th class="text-right">HT</th></tr></thead>
            <tbody>${data.groupes.map(g => `<tr>
              <td><strong>${escapeHtml(g.libelle)}</strong></td>
              <td class="text-right">${g.lignes.length}</td>
              <td class="text-right"><strong>${fmtEUR(g.total_ht)}</strong></td>
            </tr>`).join('')}</tbody>
          </table>`
        m.el.querySelector('#fcCreate').disabled = false
      } else {
        previewBox.innerHTML = `
          <strong>Facture groupée — ${data.lignes.length} ligne(s) — Total HT : ${fmtEUR(data.total)}</strong>
          <table class="data-table" style="font-size:.8rem;margin-top:.4rem">
            <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">HT</th></tr></thead>
            <tbody>${data.lignes.map(l => `<tr>
              <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
              <td class="text-right">${fmtNum(l.quantite)}</td>
              <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
            </tr>`).join('')}</tbody>
          </table>`
        m.el.querySelector('#fcCreate').disabled = false
      }
      m.el.querySelector('#fcStep3').style.display = 'block'
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  m.el.querySelector('#fcCreate').onclick = async () => {
    if (!picker) return toast('Sélectionnez les marques puis cliquez sur « Aperçu »', 'error')
    const box = m.el.querySelector('#fcMarquesBox')
    const ids = picker.getSelected(box)
    if (!ids.length) return toast('Cochez au moins une marque', 'error')
    const p = ps.getPeriode(m.el)
    const mode = m.el.querySelector('input[name="fcMode"]:checked').value
    const splitByMarque = mode === 'split'
    const notes = m.el.querySelector('#fcNotes').value
    try {
      const body = {
        marques_ids: ids,
        scope: 'standard',
        split_by_marque: splitByMarque,
        notes,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent/create', body)
      if (data.mode === 'split_by_marque') {
        toast(`${data.nb_factures} facture(s) créée(s) — Total HT : ${fmtEUR(data.total_ht)}`)
        m.close()
        onSuccess && onSuccess()
      } else {
        toast('Facture créée : ' + data.numero)
        m.close()
        onSuccess && onSuccess()
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// Modal AGENT → DROPEAT — Facture MLM (commissions N+1 / N+2)
// scope='mlm' — facture séparée, pas de picker (commissions globales par filleul)
// Préfixe AGT-MLM-YYYY-MM-NNNN
// ============================================================
function factureCreateAgentMLMModal(onSuccess) {
  const ps = periodeSelector('fm')
  const m = modal('<i class="fas fa-sitemap" style="color:#9333ea"></i> Facture commissions MLM (N+1 / N+2 → DropEat)', `
    <div style="background:#f5f3ff;border-left:3px solid #9333ea;padding:.7rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem">
      <strong><i class="fas fa-circle-info"></i> Commissions MLM uniquement</strong> — sur les ventes de vos filleuls directs (N+1) et de leurs filleuls (N+2).<br>
      <span class="text-muted">Cette facture est <strong>séparée</strong> de vos commissions propres (numérotation <code>AGT-MLM-YYYY-MM-NNNN</code>) pour traçabilité réglementaire.</span>
    </div>
    ${ps.html}
    <div style="display:flex;gap:.5rem;margin:.6rem 0;align-items:center">
      <button type="button" class="btn btn-info btn-sm" id="fmPreviewBtn"><i class="fas fa-eye"></i> Aperçu</button>
      <div style="margin-left:auto;font-size:.8rem" class="text-muted">Période : <strong id="fmLabel"></strong></div>
    </div>
    <div id="fmPreview" style="margin:1rem 0;padding:1rem;background:#f9fafb;border-radius:6px;display:none"></div>
    <div class="form-group"><label>Notes internes (optionnel)</label><textarea id="fmNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-primary" id="fmCreate"><i class="fas fa-file-invoice"></i> Créer la facture MLM</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()

  function updateLabel() {
    const p = ps.getPeriode(m.el)
    m.el.querySelector('#fmLabel').textContent = ps.periodeLabel(p)
  }
  ps.attach(m.el, updateLabel)
  updateLabel()

  m.el.querySelector('#fmPreviewBtn').onclick = async () => {
    const p = ps.getPeriode(m.el)
    try {
      const body = {
        scope: 'mlm',
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent/preview', body)
      const box = m.el.querySelector('#fmPreview')
      box.style.display = 'block'
      if (!data.lignes.length) {
        box.innerHTML = '<div class="text-muted">Aucune commission MLM (N+1/N+2) à facturer pour cette période.</div>'
        return
      }
      box.innerHTML = `
        <strong><i class="fas fa-sitemap" style="color:#9333ea"></i> Aperçu MLM — ${data.lignes.length} ligne(s) — Total HT : ${fmtEUR(data.total)}</strong>
        <div class="text-muted" style="font-size:.78rem;margin:.3rem 0 .5rem 0">Période : ${escapeHtml(data.periode.label || ps.periodeLabel(p))}</div>
        <table class="data-table" style="font-size:.8rem">
          <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">HT</th></tr></thead>
          <tbody>${data.lignes.map(l => `<tr>
            <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
            <td class="text-right">${fmtNum(l.quantite)}</td>
            <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
          </tr>`).join('')}</tbody>
        </table>`
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  m.el.querySelector('#fmCreate').onclick = async () => {
    const p = ps.getPeriode(m.el)
    const notes = m.el.querySelector('#fmNotes').value
    try {
      const body = {
        scope: 'mlm',
        notes,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/agent/create', body)
      toast('Facture MLM créée : ' + data.numero)
      m.close()
      onSuccess && onSuccess()
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// === ADMIN FACTURES =========================================
// ============================================================
PAGES['admin-factures'] = async (c) => {
  const [ag, dr] = await Promise.all([
    api.get('/factures?type=agent_to_dropeat'),
    api.get('/factures?type=dropeat_to_resto')
  ])
  const fAg = ag.data.factures || []
  const fDr = dr.data.factures || []
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-file-invoice-dollar"></i> Factures</h1>
        <div class="subtitle">Reçues des agents (${fAg.length}) · Émises aux restaurants (${fDr.length})</div></div>
    </div>
    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-inbox"></i> Factures reçues des agents commerciaux (${fAg.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>N°</th><th>Émetteur</th><th>Période</th><th>Émission</th><th class="text-right">HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${fAg.length ? fAg.map(f => `<tr>
          <td><strong style="font-family:monospace">${escapeHtml(f.numero)}</strong></td>
          <td>${escapeHtml(f.emetteur_prenom + ' ' + f.emetteur_nom)}</td>
          <td>${monthsFR[f.periode_mois-1]} ${f.periode_annee}</td>
          <td>${fmtDate(f.date_emission)}</td>
          <td class="text-right">${fmtEUR(f.montant_ht)}</td>
          <td class="text-right"><strong>${fmtEUR(f.montant_ttc)}</strong></td>
          <td>${factureStatutBadge(f.statut)}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-view="${f.id}"><i class="fas fa-eye"></i> Voir</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucune facture reçue</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-paper-plane"></i> Factures émises aux restaurants (${fDr.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>N°</th><th>Restaurant</th><th>Période</th><th>Émission</th><th class="text-right">HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${fDr.length ? fDr.map(f => `<tr>
          <td><strong style="font-family:monospace">${escapeHtml(f.numero)}</strong></td>
          <td>${escapeHtml(f.dest_restaurant_nom || '—')}</td>
          <td>${monthsFR[f.periode_mois-1]} ${f.periode_annee}</td>
          <td>${fmtDate(f.date_emission)}</td>
          <td class="text-right">${fmtEUR(f.montant_ht)}</td>
          <td class="text-right"><strong>${fmtEUR(f.montant_ttc)}</strong></td>
          <td>${factureStatutBadge(f.statut)}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-view="${f.id}"><i class="fas fa-eye"></i> Voir</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucune facture émise</td></tr>'}</tbody>
      </table></div>
    </div>
  `
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => factureViewerModal(b.dataset.view))
}

// ============================================================
// COMPOSANT PARTAGÉ : Picker de marques avec montants
// ============================================================
// Affiche un tableau interactif de marques avec cases à cocher.
// Les marques non éligibles (portefeuille) sont grisées mais cliquables
// pour consultation (pas pour sélection finale).
//
// Options :
//   - mode : 'dropeat_resto' (vue DropEat→Resto) | 'agent_dropeat' (vue agent→DropEat)
//            | 'agent_resto' (vue agent→Resto portefeuille)
//   - marques : array depuis l'API
//   - getRowMontant : fn(marque) => montant à afficher (différent selon mode)
//   - onChange(selectedIds[], totalEstime) : callback
//
// Méthodes exposées :
//   - render(container) : injecte le HTML
//   - getSelected() : retourne marques_ids[] cochées
//   - getTotal() : retourne le total HT des marques cochées
// ============================================================
function marquesPicker(opts) {
  const mode = opts.mode || 'dropeat_resto'
  const marques = opts.marques || []
  const onChange = opts.onChange || (() => {})

  // Détecte le champ montant selon le mode
  function getMontant(m) {
    if (mode === 'agent_dropeat') return m.commission_agent_estimee || 0
    if (mode === 'agent_resto') return m.facturation_estimee || 0
    return m.facturation_estimee || 0 // dropeat_resto
  }
  function getMontantLabel() {
    if (mode === 'agent_dropeat') return 'Commission HT'
    if (mode === 'agent_resto') return 'Facturable 100% HT'
    return 'Facturation HT'
  }
  function isEligible(m) {
    if (mode === 'agent_resto') return m.eligible !== false // portefeuille = éligible ici
    return m.eligible_dropeat === true
  }
  function badgeMarque(m) {
    if (mode === 'agent_resto') {
      // En mode portefeuille, on n'affiche pas de badge négatif (toutes les marques sont portefeuille)
      if (m.is_portefeuille && m.resto_is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Resto + Marque P</span>'
      if (m.is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Marque P</span>'
      if (m.resto_is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Resto P</span>'
      return ''
    }
    // Modes DropEat
    if (m.is_portefeuille && m.resto_is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Resto + Marque P (100% agent)</span>'
    if (m.is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Portefeuille 100% agent</span>'
    if (m.resto_is_portefeuille) return '<span class="badge" style="background:#fde68a;color:#92400e;font-size:.65rem">Resto Portefeuille</span>'
    return ''
  }

  const html = `
    <div class="card" style="background:#f9fafb;margin-top:.5rem">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <span><i class="fas fa-tags"></i> Marques disponibles — ${marques.length}</span>
        <div style="display:flex;gap:.4rem;font-size:.8rem">
          <button type="button" class="btn btn-sm btn-secondary" data-mp-all-eligible><i class="fas fa-check-double"></i> Tout cocher (éligibles)</button>
          <button type="button" class="btn btn-sm btn-secondary" data-mp-none><i class="fas fa-times"></i> Tout décocher</button>
        </div>
      </div>
      ${marques.length === 0 ? '<div class="text-muted" style="padding:1rem;text-align:center">Aucune marque pour ce restaurant sur cette période.</div>' : `
      <div class="table-wrap">
        <table class="data-table" style="font-size:.85rem">
          <thead><tr>
            <th style="width:32px"><input type="checkbox" data-mp-master title="Tout cocher / décocher (éligibles uniquement)"/></th>
            <th>Marque</th>
            <th>Plateforme</th>
            <th>Statut</th>
            <th class="text-right">Cmds</th>
            <th class="text-right">CA brut</th>
            <th class="text-right">${getMontantLabel()}</th>
          </tr></thead>
          <tbody>
            ${marques.map(m => {
              const elig = isEligible(m)
              const montant = getMontant(m)
              const badge = badgeMarque(m)
              return `<tr class="mp-row" data-mp-mid="${m.marque_id}" data-mp-elig="${elig ? 1 : 0}" data-mp-montant="${montant}" style="${!elig ? 'background:#f3f4f6;color:#6b7280' : ''}">
                <td>${elig
                  ? `<input type="checkbox" class="mp-cb" value="${m.marque_id}" data-montant="${montant}"/>`
                  : `<span title="Non éligible — vérification uniquement"><i class="fas fa-lock" style="color:#9ca3af"></i></span>`
                }</td>
                <td><strong>${escapeHtml(m.marque_nom)}</strong>${m.restaurant_nom ? `<br><small class="text-muted">${escapeHtml(m.restaurant_nom)}</small>` : ''}</td>
                <td><span style="font-size:.75rem;text-transform:capitalize">${escapeHtml((m.plateforme || '').replace('_', ' '))}</span></td>
                <td>${badge || '<span class="badge badge-primary" style="font-size:.65rem">Éligible</span>'}</td>
                <td class="text-right">${m.nb_commandes || 0}</td>
                <td class="text-right">${fmtEUR(m.ca_brut || 0)}</td>
                <td class="text-right"><strong>${fmtEUR(montant)}</strong></td>
              </tr>`
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#eff6ff;font-weight:bold">
              <td colspan="6" class="text-right">Total marques cochées :</td>
              <td class="text-right"><strong id="mp-total-${opts.uid || 'def'}" style="color:#1d4ed8">${fmtEUR(0)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      `}
    </div>
  `

  function attach(root) {
    const cbs = () => Array.from(root.querySelectorAll('.mp-cb'))
    const totalEl = root.querySelector(`#mp-total-${opts.uid || 'def'}`)

    function recompute() {
      const ids = cbs().filter(cb => cb.checked).map(cb => parseInt(cb.value))
      let total = 0
      cbs().forEach(cb => {
        if (cb.checked) total += parseFloat(cb.dataset.montant || 0)
      })
      if (totalEl) totalEl.textContent = fmtEUR(total)
      // Master checkbox state
      const master = root.querySelector('[data-mp-master]')
      if (master) {
        const checked = cbs().filter(cb => cb.checked).length
        const totalCb = cbs().length
        master.checked = checked === totalCb && totalCb > 0
        master.indeterminate = checked > 0 && checked < totalCb
      }
      onChange(ids, total)
    }

    cbs().forEach(cb => cb.onchange = recompute)
    const master = root.querySelector('[data-mp-master]')
    if (master) master.onchange = () => {
      cbs().forEach(cb => cb.checked = master.checked)
      recompute()
    }
    const btnAll = root.querySelector('[data-mp-all-eligible]')
    if (btnAll) btnAll.onclick = () => { cbs().forEach(cb => cb.checked = true); recompute() }
    const btnNone = root.querySelector('[data-mp-none]')
    if (btnNone) btnNone.onclick = () => { cbs().forEach(cb => cb.checked = false); recompute() }

    // Clic sur une ligne grisée (non éligible) → toast info
    root.querySelectorAll('.mp-row[data-mp-elig="0"]').forEach(row => {
      row.onclick = (ev) => {
        if (ev.target.tagName === 'INPUT') return
        const isPf = row.querySelector('td:nth-child(4)')?.textContent || ''
        toast(`Marque en portefeuille (${isPf.trim()}) — non facturable par DropEat. Facturée à 100% par l'agent directement au restaurant.`, 'info', 4500)
      }
      row.style.cursor = 'pointer'
    })

    recompute()
  }

  function getSelected(root) {
    return Array.from(root.querySelectorAll('.mp-cb:checked')).map(cb => parseInt(cb.value))
  }
  function getTotal(root) {
    return Array.from(root.querySelectorAll('.mp-cb:checked'))
      .reduce((s, cb) => s + parseFloat(cb.dataset.montant || 0), 0)
  }

  return { html, attach, getSelected, getTotal }
}

// ============================================================
// PAGE ADMIN : Facturer un restaurant — Assistant 3 étapes
// ============================================================
PAGES['admin-factures-resto'] = async (c) => {
  const { data } = await api.get('/admin/restaurants').catch(() => ({ data: { restaurants: [] } }))
  const restos = data.restaurants || []
  const ps = periodeSelector('fdr')
  // Pré-sélection éventuelle depuis le bouton « Facturer » de la liste restos
  let preselectRestoId = null
  try {
    const p = sessionStorage.getItem('billing_preselect_resto')
    if (p) { preselectRestoId = parseInt(p); sessionStorage.removeItem('billing_preselect_resto') }
  } catch {}

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-file-export"></i> Facturer un restaurant</h1>
        <div class="subtitle">Assistant guidé : Restaurant → Marques à facturer → Aperçu & émission</div></div>
    </div>

    <!-- ÉTAPE 1 : Restaurant + Période -->
    <div class="card" id="fdrStep1">
      <div class="card-title" style="display:flex;align-items:center;gap:.5rem">
        <span style="background:#1d4ed8;color:#fff;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem">1</span>
        <span><i class="fas fa-store"></i> Sélection restaurant + période</span>
      </div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Restaurant <span class="req">*</span></label>
          <select id="fdrResto">
            <option value="">— Choisir un restaurant —</option>
            ${restos.map(r => `<option value="${r.id}" ${preselectRestoId === r.id ? 'selected' : ''}>${escapeHtml(r.nom)} — ${escapeHtml(r.ville || '')}</option>`).join('')}
          </select>
        </div>
      </div>
      ${ps.html}
      <div style="display:flex;gap:.5rem;margin:.6rem 0;align-items:center">
        <div style="margin-left:auto;font-size:.85rem" class="text-muted">Période : <strong id="fdrLabel"></strong></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="fdrLoadMarques"><i class="fas fa-arrow-right"></i> Étape 2 : Charger les marques</button>
      </div>
    </div>

    <!-- ÉTAPE 2 : Sélection marques -->
    <div class="card" id="fdrStep2" style="display:none">
      <div class="card-title" style="display:flex;align-items:center;gap:.5rem">
        <span style="background:#1d4ed8;color:#fff;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem">2</span>
        <span><i class="fas fa-tags"></i> Sélection des marques à facturer</span>
      </div>
      <div id="fdrRestoInfo" class="text-muted" style="font-size:.85rem;margin-bottom:.5rem"></div>
      <div style="background:#eff6ff;border-left:3px solid #1d4ed8;padding:.6rem .8rem;border-radius:6px;margin-bottom:.7rem;font-size:.82rem">
        <i class="fas fa-circle-info"></i> Cochez les marques à inclure dans la facture. Les marques <strong>en portefeuille propriétaire</strong> (grisées 🔒) ne sont <strong>pas facturables par DropEat</strong> — elles sont facturées à 100% par l'agent directement au restaurant. Cliquez dessus pour vérification.
      </div>
      <div id="fdrMarquesPicker"></div>

      <div class="form-grid" style="margin-top:1rem">
        <div class="form-group" style="grid-column:1/-1">
          <label>Mode de facturation</label>
          <div style="display:flex;flex-direction:column;gap:.4rem;font-size:.88rem">
            <label style="display:flex;align-items:flex-start;gap:.4rem;cursor:pointer">
              <input type="radio" name="fdrMode" value="groupee" checked style="margin-top:.2rem"/>
              <div><strong>1 seule facture groupée</strong> <span class="text-muted">— toutes les marques cochées sur une même facture (1 ligne par marque)</span></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:.4rem;cursor:pointer">
              <input type="radio" name="fdrMode" value="split" style="margin-top:.2rem"/>
              <div><strong>1 facture par marque</strong> <span class="text-muted">— autant de factures que de marques cochées (meilleure isolation comptable)</span></div>
            </label>
          </div>
        </div>
      </div>
      <div class="form-actions" style="justify-content:space-between">
        <button class="btn btn-secondary" id="fdrBackTo1"><i class="fas fa-arrow-left"></i> Retour</button>
        <button class="btn btn-primary" id="fdrGoStep3"><i class="fas fa-eye"></i> Étape 3 : Aperçu</button>
      </div>
    </div>

    <!-- ÉTAPE 3 : Aperçu + Création -->
    <div class="card" id="fdrStep3" style="display:none">
      <div class="card-title" style="display:flex;align-items:center;gap:.5rem">
        <span style="background:#059669;color:#fff;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem">3</span>
        <span><i class="fas fa-check-circle"></i> Aperçu & émission</span>
      </div>
      <div id="fdrPreview"></div>
      <div class="form-grid" style="margin-top:.6rem">
        <div class="form-group" style="grid-column:1/-1">
          <label>Notes internes (optionnel — non visibles sur la facture)</label>
          <textarea id="fdrNotes" rows="2" placeholder="Ex: facture mensuelle régulière"></textarea>
        </div>
      </div>
      <div class="form-actions" style="justify-content:space-between">
        <button class="btn btn-secondary" id="fdrBackTo2"><i class="fas fa-arrow-left"></i> Retour</button>
        <button class="btn btn-primary" id="fdrCreate"><i class="fas fa-file-invoice"></i> <span id="fdrCreateLabel">Générer la facture</span></button>
      </div>
    </div>
  `

  function updateLabel() {
    const p = ps.getPeriode(c)
    c.querySelector('#fdrLabel').textContent = ps.periodeLabel(p)
  }
  ps.attach(c, updateLabel)
  updateLabel()

  let currentPicker = null
  let currentMarquesData = null
  let currentResto = null

  // ===== Étape 1 → 2 =====
  c.querySelector('#fdrLoadMarques').onclick = async () => {
    const restaurant_id = parseInt(c.querySelector('#fdrResto').value)
    if (!restaurant_id) return toast('Sélectionnez un restaurant', 'error')
    const p = ps.getPeriode(c)
    try {
      const qs = ps.toQueryString(p) + '&restaurant_id=' + restaurant_id
      const { data } = await api.get('/factures/resto/marques-facturables?' + qs)
      currentMarquesData = data
      currentResto = data.restaurant

      const eligibles = data.marques.filter(m => m.eligible_dropeat).length
      c.querySelector('#fdrRestoInfo').innerHTML = `
        <strong>${escapeHtml(data.restaurant.nom)}</strong>${data.restaurant.ville ? ' — ' + escapeHtml(data.restaurant.ville) : ''}
        ${data.restaurant.agent_prenom ? ` · Agent : ${escapeHtml(data.restaurant.agent_prenom + ' ' + data.restaurant.agent_nom)}` : ''}
        · Période : <strong>${escapeHtml(ps.periodeLabel(p))}</strong>
        · <strong>${data.marques.length}</strong> marque(s) totale, <strong style="color:#1d4ed8">${eligibles}</strong> éligible(s) facturation DropEat
      `

      const picker = marquesPicker({
        uid: 'fdr',
        mode: 'dropeat_resto',
        marques: data.marques,
        onChange: (ids, total) => {
          c.querySelector('#fdrGoStep3').disabled = ids.length === 0
        }
      })
      const pickerEl = c.querySelector('#fdrMarquesPicker')
      pickerEl.innerHTML = picker.html
      picker.attach(pickerEl)
      currentPicker = picker

      c.querySelector('#fdrStep1').style.display = 'none'
      c.querySelector('#fdrStep2').style.display = ''
      c.querySelector('#fdrStep3').style.display = 'none'
      c.querySelector('#fdrGoStep3').disabled = true

      if (eligibles === 0) {
        toast('Aucune marque éligible à facturation DropEat sur cette période', 'error', 5000)
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  // ===== Retour Étape 2 → 1 =====
  c.querySelector('#fdrBackTo1').onclick = () => {
    c.querySelector('#fdrStep1').style.display = ''
    c.querySelector('#fdrStep2').style.display = 'none'
    c.querySelector('#fdrStep3').style.display = 'none'
  }

  // ===== Étape 2 → 3 (Aperçu) =====
  c.querySelector('#fdrGoStep3').onclick = async () => {
    const pickerEl = c.querySelector('#fdrMarquesPicker')
    const ids = currentPicker.getSelected(pickerEl)
    if (!ids.length) return toast('Cochez au moins une marque', 'error')
    const split = c.querySelector('input[name="fdrMode"]:checked').value === 'split'
    const p = ps.getPeriode(c)

    try {
      const body = {
        restaurant_id: currentResto.id,
        marques_ids: ids,
        split_by_marque: split,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/resto/preview', body)
      const box = c.querySelector('#fdrPreview')
      if (split && data.groupes) {
        box.innerHTML = `
          <div style="background:#ecfdf5;border-left:3px solid #059669;padding:.6rem .8rem;border-radius:6px;margin-bottom:.6rem;font-size:.85rem">
            <i class="fas fa-info-circle"></i> Mode <strong>1 facture par marque</strong> : <strong>${data.groupes.length} facture(s)</strong> seront créées · Total cumulé HT : <strong style="color:#059669">${fmtEUR(data.total)}</strong>
          </div>
          ${data.groupes.map(g => `
            <div class="card" style="background:#fff;margin-bottom:.5rem">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
                <strong><i class="fas fa-file-invoice"></i> ${escapeHtml(g.libelle)}</strong>
                <span style="color:#059669;font-weight:bold">Total HT : ${fmtEUR(g.total_ht)}</span>
              </div>
              <table class="data-table" style="font-size:.78rem">
                <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">HT</th></tr></thead>
                <tbody>${g.lignes.map(l => `<tr>
                  <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
                  <td class="text-right">${fmtNum(l.quantite)}</td>
                  <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          `).join('')}
        `
        c.querySelector('#fdrCreateLabel').textContent = `Générer ${data.groupes.length} facture(s)`
      } else {
        box.innerHTML = data.lignes.length ? `
          <div style="background:#eff6ff;border-left:3px solid #1d4ed8;padding:.6rem .8rem;border-radius:6px;margin-bottom:.6rem;font-size:.85rem">
            <i class="fas fa-info-circle"></i> Mode <strong>facture groupée</strong> · ${data.nb_lignes} ligne(s) · Total HT : <strong style="color:#1d4ed8">${fmtEUR(data.total)}</strong>
          </div>
          <table class="data-table" style="font-size:.82rem">
            <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">P.U.</th><th class="text-right">HT</th></tr></thead>
            <tbody>${data.lignes.map(l => `<tr>
              <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
              <td class="text-right">${fmtNum(l.quantite)}</td>
              <td class="text-right">${fmtEUR(l.prix_unitaire)}</td>
              <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
            </tr>`).join('')}</tbody>
          </table>
        ` : '<div class="text-muted">Aucune ligne à facturer.</div>'
        c.querySelector('#fdrCreateLabel').textContent = 'Générer la facture'
      }

      c.querySelector('#fdrStep1').style.display = 'none'
      c.querySelector('#fdrStep2').style.display = 'none'
      c.querySelector('#fdrStep3').style.display = ''
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }

  // ===== Retour Étape 3 → 2 =====
  c.querySelector('#fdrBackTo2').onclick = () => {
    c.querySelector('#fdrStep1').style.display = 'none'
    c.querySelector('#fdrStep2').style.display = ''
    c.querySelector('#fdrStep3').style.display = 'none'
  }

  // ===== Création finale =====
  c.querySelector('#fdrCreate').onclick = async () => {
    const pickerEl = c.querySelector('#fdrMarquesPicker')
    const ids = currentPicker.getSelected(pickerEl)
    const split = c.querySelector('input[name="fdrMode"]:checked').value === 'split'
    const p = ps.getPeriode(c)
    const notes = c.querySelector('#fdrNotes').value
    try {
      const body = {
        restaurant_id: currentResto.id,
        marques_ids: ids,
        split_by_marque: split,
        notes,
        ...(p.type === 'mois' ? { annee: p.annee, mois: p.mois } : { date_debut: p.date_debut, date_fin: p.date_fin })
      }
      const { data } = await api.post('/factures/resto/create', body)
      if (data.mode === 'split_by_marque') {
        toast(`✅ ${data.nb_factures} facture(s) générée(s) — Total ${fmtEUR(data.total_ttc)} TTC`, 'success', 5000)
        navigate('admin-factures')
      } else {
        toast('Facture générée : ' + data.numero)
        factureViewerModal(data.facture_id)
      }
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// === CHALLENGES — SUPERADMIN ================================
// ============================================================
function challengeStatutBadge(s) {
  const map = {
    en_cours: { bg: '#3b82f6', label: 'En cours' },
    reussi: { bg: '#10b981', label: 'Réussi' },
    echoue: { bg: '#ef4444', label: 'Échoué' },
    recompense_attribuee: { bg: '#059669', label: 'Récompensé' },
    annule: { bg: '#9ca3af', label: 'Annulé' }
  }
  const x = map[s] || { bg: '#6b7280', label: s }
  return `<span style="background:${x.bg};color:#fff;padding:.2rem .6rem;border-radius:4px;font-size:.7rem;text-transform:uppercase">${x.label}</span>`
}

function challengePeriodeBadge(c) {
  const today = new Date().toISOString().slice(0, 10)
  if (c.date_debut > today) return `<span style="background:#fbbf24;color:#78350f;padding:.2rem .6rem;border-radius:4px;font-size:.7rem">À venir</span>`
  if (c.date_fin < today) return `<span style="background:#9ca3af;color:#fff;padding:.2rem .6rem;border-radius:4px;font-size:.7rem">Terminé</span>`
  return `<span style="background:#06A05A;color:#fff;padding:.2rem .6rem;border-radius:4px;font-size:.7rem">Actif</span>`
}

PAGES['admin-challenges'] = async (c) => {
  const { data } = await api.get('/challenges/admin')
  const challenges = data.challenges || []

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-flag-checkered"></i> Challenges commerciaux</h1>
        <div class="subtitle">Créer des défis temporaires pour booster les agents</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary" id="syncAll" title="Recalculer toutes les progressions"><i class="fas fa-sync"></i> Synchroniser</button>
        <button class="btn btn-primary" id="newChallenge"><i class="fas fa-plus"></i> Nouveau challenge</button>
      </div>
    </div>

    <div class="card" style="background:#eff6ff;border-left:3px solid #3b82f6;margin-bottom:1rem">
      <div style="display:flex;align-items:start;gap:.6rem;font-size:.88rem">
        <i class="fas fa-circle-info" style="color:#3b82f6;font-size:1.1rem;margin-top:.15rem"></i>
        <div>
          <strong>Principe :</strong> Un challenge fixe un objectif (X restaurants ou marques apportés entre 2 dates) → récompense (ex : 15 restaurants en portefeuille 100%). Pendant la période, vous pouvez <em>suspendre la règle des 5/5</em> standard pour les participants.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> ${challenges.length} challenge(s)</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Code</th><th>Nom</th><th>Période</th><th>Statut</th>
          <th class="text-right">Objectif</th><th>Récompense</th>
          <th class="text-right">Participants</th><th class="text-right">Réussis</th><th class="text-right">Récompensés</th>
          <th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${challenges.length ? challenges.map(ch => `<tr>
          <td><strong style="font-family:monospace;font-size:.8rem">${escapeHtml(ch.code)}</strong></td>
          <td>
            <strong>${escapeHtml(ch.nom)}</strong>
            ${ch.suspend_tranche_standard ? '<br><span style="background:#fef3c7;color:#92400e;padding:.1rem .4rem;border-radius:3px;font-size:.7rem">Suspend règle 5/5</span>' : ''}
          </td>
          <td><small>${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}</small></td>
          <td>${challengePeriodeBadge(ch)} ${ch.actif ? '' : '<br><small class="text-muted">Archivé</small>'}</td>
          <td class="text-right"><strong>${ch.objectif_quantite}</strong> ${ch.type_objectif === 'restaurants' ? 'restos' : ch.type_objectif === 'marques' ? 'marques' : 'restos/marques'}</td>
          <td><small>${
            ch.type_recompense === 'portefeuille_restaurants' ? (ch.recompense_quantite || 0) + ' restos en portefeuille 100%'
            : ch.type_recompense === 'portefeuille_marques' ? (ch.recompense_quantite || 0) + ' marques en portefeuille 100%'
            : ch.type_recompense === 'bonus_montant' ? fmtEUR(ch.recompense_montant || 0) + ' de bonus'
            : escapeHtml(ch.recompense_description || 'Autre')
          }</small></td>
          <td class="text-right">${ch.nb_participants || 0}</td>
          <td class="text-right" style="color:#059669"><strong>${ch.nb_reussis || 0}</strong></td>
          <td class="text-right" style="color:#10b981"><strong>${ch.nb_recompenses || 0}</strong></td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-view="${ch.id}" title="Détail"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-secondary" data-edit="${ch.id}" title="Modifier"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" data-del="${ch.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="10" class="text-center text-muted">Aucun challenge</td></tr>'}</tbody>
      </table></div>
    </div>
  `

  c.querySelector('#newChallenge').onclick = () => challengeFormModal(null, () => navigate('admin-challenges'))
  c.querySelector('#syncAll').onclick = async () => {
    try {
      const r = await api.post('/challenges/admin/synchroniser')
      toast(r.data.nb_synchronises + ' participation(s) synchronisée(s)')
      navigate('admin-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => challengeDetailModal(b.dataset.view))
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const ch = challenges.find(x => x.id == b.dataset.edit)
    challengeFormModal(ch, () => navigate('admin-challenges'))
  })
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce challenge et toutes les participations ? Action irréversible.')) return
    try {
      await api.delete('/challenges/admin/' + b.dataset.del)
      toast('Challenge supprimé')
      navigate('admin-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

async function challengeFormModal(challenge, onSuccess) {
  const isEdit = !!challenge
  // Récupérer la liste des agents pour la sélection éventuelle
  let agents = []
  try {
    const { data } = await api.get('/admin/users?role=agent')
    agents = (data.users || data || []).filter(u => u.role === 'agent')
  } catch {}

  const html = `
    <form id="chForm">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div class="form-group">
          <label>Code (unique) *</label>
          <input class="form-control" name="code" required ${isEdit ? 'readonly' : ''} value="${escapeHtml(challenge?.code || '')}" placeholder="CH-2026-05-SEBASTIAN-30R">
        </div>
        <div class="form-group">
          <label>Nom *</label>
          <input class="form-control" name="nom" required value="${escapeHtml(challenge?.nom || '')}" placeholder="Challenge été 2026">
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea class="form-control" name="description" rows="2">${escapeHtml(challenge?.description || '')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div class="form-group">
          <label>Date début *</label>
          <input class="form-control" type="date" name="date_debut" required value="${challenge?.date_debut || ''}">
        </div>
        <div class="form-group">
          <label>Date fin *</label>
          <input class="form-control" type="date" name="date_fin" required value="${challenge?.date_fin || ''}">
        </div>
      </div>

      <h4 style="margin:1rem 0 .5rem;color:#06A05A"><i class="fas fa-bullseye"></i> Objectif</h4>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:.8rem">
        <div class="form-group">
          <label>Type *</label>
          <select class="form-control" name="type_objectif" required>
            <option value="restaurants" ${challenge?.type_objectif==='restaurants'?'selected':''}>Restaurants apportés</option>
            <option value="marques" ${challenge?.type_objectif==='marques'?'selected':''}>Marques apportées</option>
            <option value="restaurants_ou_marques" ${challenge?.type_objectif==='restaurants_ou_marques'?'selected':''}>Restaurants OU marques</option>
          </select>
        </div>
        <div class="form-group">
          <label>Quantité *</label>
          <input class="form-control" type="number" name="objectif_quantite" min="1" required value="${challenge?.objectif_quantite || ''}" placeholder="30">
        </div>
      </div>

      <h4 style="margin:1rem 0 .5rem;color:#06A05A"><i class="fas fa-gift"></i> Récompense</h4>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:.8rem">
        <div class="form-group">
          <label>Type *</label>
          <select class="form-control" name="type_recompense" required>
            <option value="portefeuille_restaurants" ${challenge?.type_recompense==='portefeuille_restaurants'?'selected':''}>N restaurants en portefeuille 100%</option>
            <option value="portefeuille_marques" ${challenge?.type_recompense==='portefeuille_marques'?'selected':''}>N marques en portefeuille 100%</option>
            <option value="bonus_montant" ${challenge?.type_recompense==='bonus_montant'?'selected':''}>Bonus en €</option>
            <option value="autre" ${challenge?.type_recompense==='autre'?'selected':''}>Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Quantité (si N)</label>
          <input class="form-control" type="number" name="recompense_quantite" min="0" value="${challenge?.recompense_quantite || ''}" placeholder="15">
        </div>
        <div class="form-group">
          <label>Montant € (si bonus)</label>
          <input class="form-control" type="number" name="recompense_montant" step="0.01" min="0" value="${challenge?.recompense_montant || ''}">
        </div>
      </div>
      <div class="form-group">
        <label>Description récompense (libre)</label>
        <input class="form-control" name="recompense_description" value="${escapeHtml(challenge?.recompense_description || '')}" placeholder="Ex: 15 restaurants à choisir parmi ceux apportés">
      </div>

      <h4 style="margin:1rem 0 .5rem;color:#06A05A"><i class="fas fa-cog"></i> Règles</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div class="form-group">
          <label><input type="checkbox" name="suspend_tranche_standard" ${challenge?.suspend_tranche_standard?'checked':''}>
            Suspendre la règle 5/5 pendant le challenge
          </label>
          <small class="text-muted">Pendant la période, les participants ne déclenchent PAS la règle standard portefeuille (5e marque/restaurant)</small>
        </div>
        <div class="form-group">
          <label>Cible</label>
          <select class="form-control" name="cible">
            <option value="tous" ${(challenge?.cible||'tous')==='tous'?'selected':''}>Tous les agents</option>
            <option value="selection" ${challenge?.cible==='selection'?'selected':''}>Sélection manuelle</option>
          </select>
        </div>
      </div>

      ${!isEdit ? `
      <div class="form-group" id="selectionParticipants" style="display:none">
        <label>Participants présélectionnés (cible = sélection)</label>
        <select class="form-control" id="participantsIds" multiple size="6" style="height:auto">
          ${agents.map(a => `<option value="${a.id}">${escapeHtml(a.prenom + ' ' + a.nom)} (${escapeHtml(a.email)})</option>`).join('')}
        </select>
        <small class="text-muted">Maintenir Ctrl/Cmd pour sélection multiple</small>
      </div>
      ` : ''}

      <div class="form-group">
        <label>Notes internes (visibles uniquement par le superadmin)</label>
        <textarea class="form-control" name="notes_internes" rows="2">${escapeHtml(challenge?.notes_internes || '')}</textarea>
      </div>

      ${isEdit ? `
      <div class="form-group">
        <label><input type="checkbox" name="actif" ${challenge?.actif?'checked':''}> Challenge actif (visible et comptabilisé)</label>
      </div>
      ` : ''}

      <div class="form-actions" style="margin-top:1rem">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Enregistrer' : 'Créer le challenge'}</button>
      </div>
    </form>
  `

  const m = modal(`<i class="fas fa-flag-checkered"></i> ${isEdit ? 'Modifier le challenge' : 'Nouveau challenge'}`, html)
  m.el.querySelector('[data-close]').onclick = () => m.close()

  const cibleSel = m.el.querySelector('select[name="cible"]')
  const partBlock = m.el.querySelector('#selectionParticipants')
  function toggleParticipants() {
    if (partBlock) partBlock.style.display = cibleSel.value === 'selection' ? '' : 'none'
  }
  if (cibleSel) { cibleSel.onchange = toggleParticipants; toggleParticipants() }

  m.el.querySelector('#chForm').onsubmit = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const body = {}
    fd.forEach((v, k) => { body[k] = v })
    body.suspend_tranche_standard = !!m.el.querySelector('[name="suspend_tranche_standard"]').checked
    if (isEdit) body.actif = !!m.el.querySelector('[name="actif"]').checked
    body.objectif_quantite = parseInt(body.objectif_quantite) || 0
    if (body.recompense_quantite) body.recompense_quantite = parseInt(body.recompense_quantite)
    if (body.recompense_montant) body.recompense_montant = parseFloat(body.recompense_montant)

    if (!isEdit) {
      const partsSel = m.el.querySelector('#participantsIds')
      if (partsSel && body.cible === 'selection') {
        body.participants_ids = Array.from(partsSel.selectedOptions).map(o => parseInt(o.value))
      }
    }

    try {
      if (isEdit) {
        await api.put('/challenges/admin/' + challenge.id, body)
        toast('Challenge modifié')
      } else {
        const r = await api.post('/challenges/admin', body)
        toast(`Challenge créé — ${r.data.nb_inscrits || 0} participant(s) inscrit(s)`)
      }
      m.close()
      onSuccess && onSuccess()
    } catch (err) {
      toast(err.response?.data?.error || 'Erreur', 'error')
    }
  }
}

async function challengeDetailModal(id) {
  const { data } = await api.get('/challenges/admin/' + id)
  const ch = data.challenge
  const parts = data.participations || []

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card" style="margin:0">
        <div class="card-title"><i class="fas fa-info-circle"></i> Challenge</div>
        <div style="font-size:.9rem;line-height:1.6">
          <strong>${escapeHtml(ch.nom)}</strong>
          <div><span class="text-muted">Code :</span> <code>${escapeHtml(ch.code)}</code></div>
          <div><span class="text-muted">Période :</span> ${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}</div>
          <div><span class="text-muted">Objectif :</span> ${ch.objectif_quantite} ${ch.type_objectif}</div>
          <div><span class="text-muted">Récompense :</span> ${
            ch.type_recompense === 'portefeuille_restaurants' ? ch.recompense_quantite + ' restos en portefeuille 100%'
            : ch.type_recompense === 'portefeuille_marques' ? ch.recompense_quantite + ' marques en portefeuille 100%'
            : ch.type_recompense === 'bonus_montant' ? fmtEUR(ch.recompense_montant) + ' de bonus'
            : escapeHtml(ch.recompense_description || '')
          }</div>
          ${ch.suspend_tranche_standard ? '<div style="margin-top:.5rem;background:#fef3c7;color:#92400e;padding:.4rem .6rem;border-radius:4px;font-size:.8rem"><i class="fas fa-exclamation-triangle"></i> Règle 5/5 suspendue pendant ce challenge</div>' : ''}
          ${ch.description ? `<div style="margin-top:.5rem"><em>${escapeHtml(ch.description)}</em></div>` : ''}
        </div>
      </div>
      <div class="card" style="margin:0">
        <div class="card-title"><i class="fas fa-chart-bar"></i> Statistiques</div>
        <div style="font-size:.9rem;line-height:1.7">
          <div><span class="text-muted">Participants :</span> <strong>${parts.length}</strong></div>
          <div><span class="text-muted">Réussis :</span> <strong style="color:#10b981">${parts.filter(p => p.statut === 'reussi' || p.statut === 'recompense_attribuee').length}</strong></div>
          <div><span class="text-muted">Récompensés :</span> <strong style="color:#059669">${parts.filter(p => p.statut === 'recompense_attribuee').length}</strong></div>
          ${ch.notes_internes ? `<div style="margin-top:.5rem"><strong>Notes :</strong><br><small>${escapeHtml(ch.notes_internes)}</small></div>` : ''}
        </div>
      </div>
    </div>

    <div class="card" style="margin:0">
      <div class="card-title"><i class="fas fa-users"></i> Participants (${parts.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr>
          <th>Agent</th><th>Inscrit</th><th>Statut</th>
          <th class="text-right">Progression</th><th class="text-right">% atteint</th>
          <th>Date réussite</th><th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${parts.length ? parts.map(p => {
          const pct = ch.objectif_quantite ? Math.round((p.progression_actuelle / ch.objectif_quantite) * 100) : 0
          return `<tr>
            <td><strong>${escapeHtml(p.prenom + ' ' + p.nom)}</strong><br><small class="text-muted">${escapeHtml(p.email)}</small></td>
            <td><small>${fmtDate(p.date_participation)}</small></td>
            <td>${challengeStatutBadge(p.statut)}</td>
            <td class="text-right"><strong>${p.progression_actuelle}</strong> / ${ch.objectif_quantite}</td>
            <td class="text-right" style="color:${pct>=100?'#10b981':pct>=70?'#f59e0b':'#6b7280'}"><strong>${pct}%</strong></td>
            <td><small>${p.date_reussite ? fmtDate(p.date_reussite) : '—'}</small></td>
            <td class="text-right" style="white-space:nowrap">
              ${p.statut === 'reussi' ? `<button class="btn btn-sm btn-primary" data-recompense="${p.id}"><i class="fas fa-gift"></i> Récompenser</button>` : ''}
              <button class="btn btn-sm btn-danger" data-rmpart="${p.id}" title="Retirer"><i class="fas fa-times"></i></button>
            </td>
          </tr>`
        }).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucun participant</td></tr>'}</tbody>
      </table></div>
    </div>
  `

  const m = modal(`<i class="fas fa-flag-checkered"></i> ${escapeHtml(ch.nom)}`, html + `
    <div class="form-actions" style="margin-top:1rem">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelectorAll('[data-recompense]').forEach(b => {
    b.onclick = () => {
      const pid = b.dataset.recompense
      const part = parts.find(p => p.id == pid)
      challengeRecompenseModal(pid, ch, part, () => { m.close(); challengeDetailModal(id) })
    }
  })
  m.el.querySelectorAll('[data-rmpart]').forEach(b => b.onclick = async () => {
    if (!confirm('Retirer ce participant ?')) return
    try {
      await api.delete('/challenges/admin/' + id + '/participations/' + b.dataset.rmpart)
      toast('Participant retiré')
      m.close()
      challengeDetailModal(id)
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
}

async function challengeRecompenseModal(participationId, challenge, part, onSuccess) {
  // Récupérer les éléments comptabilisés pour permettre à l'admin de choisir
  let elements = []
  try {
    const { data } = await api.get('/challenges/mine/' + challenge.id)
    elements = data.elements || []
  } catch {}

  const isRestos = challenge.type_recompense === 'portefeuille_restaurants'
  const isMarques = challenge.type_recompense === 'portefeuille_marques'
  const quantite = challenge.recompense_quantite || 0

  const candidats = elements.filter(e => isRestos ? e.type_element === 'restaurant' : isMarques ? e.type_element === 'marque' : true)

  const html = `
    <div class="card" style="background:#ecfdf5;border-left:3px solid #10b981;margin-bottom:1rem">
      <strong><i class="fas fa-gift"></i> Récompense :</strong>
      ${isRestos ? `${quantite} restaurants en portefeuille 100%`
       : isMarques ? `${quantite} marques en portefeuille 100%`
       : challenge.type_recompense === 'bonus_montant' ? `${fmtEUR(challenge.recompense_montant)} de bonus`
       : escapeHtml(challenge.recompense_description || '')}
      <br><span class="text-muted">pour ${escapeHtml(part.prenom + ' ' + part.nom)} (${part.progression_actuelle}/${challenge.objectif_quantite} atteints)</span>
    </div>

    <form id="recompForm">
      ${(isRestos || isMarques) ? `
        <div class="form-group">
          <label>Sélectionner les ${quantite} ${isRestos ? 'restaurants' : 'marques'} à mettre en portefeuille 100% pour l'agent</label>
          <select class="form-control" id="recompIds" multiple size="${Math.min(candidats.length, 10)}" style="height:auto">
            ${candidats.map(e => `<option value="${e.element_id}">${isRestos ? 'Resto' : 'Marque'} #${e.element_id} (apporté le ${fmtDate(e.date_apport)})</option>`).join('')}
          </select>
          <small class="text-muted">Maintenir Ctrl/Cmd pour sélection multiple. Si rien sélectionné, les ${quantite} premiers apports seront automatiquement choisis.</small>
        </div>
      ` : ''}
      <div class="form-group">
        <label>Notes (visibles dans le détail de la participation)</label>
        <textarea class="form-control" name="notes" rows="2" placeholder="Ex: Bonus versé sur le compte le 01/07/2026"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> Attribuer la récompense</button>
      </div>
    </form>
  `

  const m = modal('<i class="fas fa-gift"></i> Attribuer la récompense', html)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#recompForm').onsubmit = async (e) => {
    e.preventDefault()
    const body = { notes: m.el.querySelector('[name="notes"]').value }
    const sel = m.el.querySelector('#recompIds')
    if (sel) {
      const ids = Array.from(sel.selectedOptions).map(o => parseInt(o.value))
      if (isRestos) body.restos_ids_choisis = ids
      else if (isMarques) body.marques_ids_choisies = ids
    }
    try {
      const r = await api.post('/challenges/admin/participations/' + participationId + '/recompenser', body)
      toast(`Récompense attribuée — ${r.data.nb_attribue} élément(s) ajoutés au portefeuille`)
      m.close()
      onSuccess && onSuccess()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// === CHALLENGES — AGENT =====================================
// ============================================================
PAGES['a-challenges'] = async (c) => {
  const { data } = await api.get('/challenges/mine')
  const challenges = data.challenges || []
  const today = new Date().toISOString().slice(0, 10)

  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-flag-checkered"></i> Challenges</h1>
        <div class="subtitle">Vos défis commerciaux et leur progression</div>
      </div>
    </div>

    ${challenges.length === 0 ? `
      <div class="card text-center" style="padding:3rem">
        <i class="fas fa-flag-checkered" style="font-size:3rem;color:#9ca3af;margin-bottom:1rem"></i>
        <p class="text-muted">Aucun challenge actif pour le moment.</p>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:1rem">
        ${challenges.map(ch => {
          const pct = ch.objectif_quantite ? Math.min(100, Math.round(((ch.participation?.progression_actuelle || 0) / ch.objectif_quantite) * 100)) : 0
          const reste = Math.max(0, ch.objectif_quantite - (ch.participation?.progression_actuelle || 0))
          const joursRestants = Math.max(0, Math.ceil((new Date(ch.date_fin) - new Date(today)) / (1000*60*60*24)))
          const enPeriode = ch.date_debut <= today && ch.date_fin >= today
          return `
          <div class="card" style="position:relative">
            <div style="position:absolute;top:1rem;right:1rem">${challengePeriodeBadge(ch)}</div>
            <h3 style="margin:0 0 .3rem;color:#06A05A"><i class="fas fa-flag-checkered"></i> ${escapeHtml(ch.nom)}</h3>
            <div style="font-size:.85rem;color:#6b7280;margin-bottom:.8rem">
              ${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}
              ${enPeriode ? `<strong style="color:#06A05A"> · ${joursRestants} jour${joursRestants>1?'s':''} restant${joursRestants>1?'s':''}</strong>` : ''}
            </div>
            ${ch.description ? `<p style="font-size:.88rem;color:#475569">${escapeHtml(ch.description)}</p>` : ''}

            <div style="background:#f9fafb;padding:.8rem;border-radius:6px;margin:.8rem 0">
              <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.4rem">
                <span><i class="fas fa-bullseye"></i> Objectif</span>
                <strong>${ch.objectif_quantite} ${ch.type_objectif === 'restaurants' ? 'restaurants' : ch.type_objectif === 'marques' ? 'marques' : 'restos/marques'}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.4rem">
                <span><i class="fas fa-gift"></i> Récompense</span>
                <strong style="color:#06A05A">${
                  ch.type_recompense === 'portefeuille_restaurants' ? `${ch.recompense_quantite} restos en portefeuille 100%`
                  : ch.type_recompense === 'portefeuille_marques' ? `${ch.recompense_quantite} marques en portefeuille 100%`
                  : ch.type_recompense === 'bonus_montant' ? `${fmtEUR(ch.recompense_montant)} de bonus`
                  : escapeHtml(ch.recompense_description || 'Autre')
                }</strong>
              </div>
              ${ch.suspend_tranche_standard ? `<div style="font-size:.78rem;color:#92400e;background:#fef3c7;padding:.3rem .5rem;border-radius:3px;margin-top:.5rem"><i class="fas fa-info-circle"></i> Pendant ce challenge, la règle standard 5/5 est suspendue</div>` : ''}
            </div>

            ${ch.participation ? `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.3rem">
                  <span><strong>Ma progression</strong></span>
                  <strong style="color:#06A05A">${ch.participation.progression_actuelle} / ${ch.objectif_quantite} (${pct}%)</strong>
                </div>
                <div style="background:#e5e7eb;height:14px;border-radius:7px;overflow:hidden">
                  <div style="background:linear-gradient(90deg,#10b981,#06A05A);height:100%;width:${pct}%;transition:width .3s"></div>
                </div>
                ${reste > 0 && enPeriode ? `<small class="text-muted">Encore ${reste} pour atteindre l'objectif</small>` : ''}
                <div style="margin-top:.8rem">${challengeStatutBadge(ch.participation.statut)}</div>
                ${ch.participation.statut === 'reussi' ? `<div style="margin-top:.5rem;color:#10b981;font-size:.88rem"><i class="fas fa-check-circle"></i> Objectif atteint le ${fmtDate(ch.participation.date_reussite)}. En attente de validation par le superadmin.</div>` : ''}
                ${ch.participation.statut === 'recompense_attribuee' ? `<div style="margin-top:.5rem;color:#059669;font-size:.88rem"><i class="fas fa-gift"></i> Récompense attribuée le ${fmtDate(ch.participation.recompense_attribuee_at)} !</div>` : ''}
              </div>
              <div style="margin-top:1rem;display:flex;gap:.4rem">
                <button class="btn btn-sm btn-secondary" data-sync="${ch.id}"><i class="fas fa-sync"></i> Synchroniser ma progression</button>
                <button class="btn btn-sm btn-primary" data-detail="${ch.id}"><i class="fas fa-list"></i> Voir le détail</button>
              </div>
            ` : ch.cible === 'tous' ? `
              <button class="btn btn-primary" data-join="${ch.id}"><i class="fas fa-rocket"></i> Participer</button>
            ` : `<div class="text-muted" style="font-size:.85rem"><i class="fas fa-lock"></i> Challenge sur sélection uniquement</div>`}
          </div>
          `
        }).join('')}
      </div>
    `}
  `

  c.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
    try {
      await api.post('/challenges/' + b.dataset.join + '/participer')
      toast('Inscription confirmée !')
      navigate('a-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
  c.querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => {
    try {
      const r = await api.post('/challenges/' + b.dataset.sync + '/synchroniser')
      toast(`Progression : ${r.data.progression}` + (r.data.objectif_atteint ? ' — objectif atteint !' : ''))
      navigate('a-challenges')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  })
  c.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => agentChallengeDetailModal(b.dataset.detail))
}

async function agentChallengeDetailModal(id) {
  const { data } = await api.get('/challenges/mine/' + id)
  const ch = data.challenge
  const elements = data.elements || []
  const restos = data.restos || []
  const marques = data.marques || []

  const html = `
    <div class="card" style="background:#f0fdf4;border-left:3px solid #06A05A;margin-bottom:1rem">
      <strong>${escapeHtml(ch.nom)}</strong>
      <div style="font-size:.85rem;color:#475569">${fmtDate(ch.date_debut)} → ${fmtDate(ch.date_fin)}</div>
      ${ch.description ? `<p style="font-size:.85rem;margin:.5rem 0 0">${escapeHtml(ch.description)}</p>` : ''}
    </div>

    <div class="card" style="margin:0 0 1rem">
      <div class="card-title"><i class="fas fa-chart-line"></i> Ma progression : ${data.progression} / ${ch.objectif_quantite}</div>
      <div style="background:#e5e7eb;height:18px;border-radius:9px;overflow:hidden;margin:.5rem 0">
        <div style="background:linear-gradient(90deg,#10b981,#06A05A);height:100%;width:${Math.min(100, Math.round(data.progression/ch.objectif_quantite*100))}%"></div>
      </div>
    </div>

    ${restos.length ? `
    <div class="card" style="margin:0 0 1rem">
      <div class="card-title"><i class="fas fa-store"></i> Restaurants comptabilisés (${restos.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Nom</th><th>Ville</th><th>Date signature</th><th>Portefeuille ?</th></tr></thead>
        <tbody>${restos.map(r => `<tr>
          <td><strong>${escapeHtml(r.nom)}</strong></td>
          <td>${escapeHtml(r.ville || '')}</td>
          <td><small>${fmtDate(r.date_signature)}</small></td>
          <td>${r.is_portefeuille_proprietaire ? '<span style="color:#06A05A"><i class="fas fa-star"></i> Oui</span>' : '<span class="text-muted">Non</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    ` : ''}

    ${marques.length ? `
    <div class="card" style="margin:0 0 1rem">
      <div class="card-title"><i class="fas fa-tags"></i> Marques comptabilisées (${marques.length})</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Marque</th><th>Restaurant</th><th>Date</th><th>Portefeuille ?</th></tr></thead>
        <tbody>${marques.map(m => `<tr>
          <td><strong>${escapeHtml(m.nom)}</strong></td>
          <td>${escapeHtml(m.restaurant_nom || '')}</td>
          <td><small>${fmtDate(m.created_at)}</small></td>
          <td>${m.is_portefeuille_proprietaire ? '<span style="color:#06A05A"><i class="fas fa-star"></i> Oui</span>' : '<span class="text-muted">Non</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    ` : ''}
  `

  const m = modal('<i class="fas fa-flag-checkered"></i> Détail du challenge', html + `
    <div class="form-actions"><button type="button" class="btn btn-secondary" data-close>Fermer</button></div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
}

// ===== Bootstrap =====
bootstrap()