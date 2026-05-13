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
  w.innerHTML = `
    <div class="modal">
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
  { id: 'users', label: 'Utilisateurs', icon: 'fa-users-gear' },
  { id: 'admin-agents-crud', label: 'Agents (CRUD omnipotent)', icon: 'fa-user-shield' },
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
  { id: 'paiements', label: 'Paiements', icon: 'fa-money-check-dollar' },
  { id: 'attributions', label: 'Demandes 5e marque', icon: 'fa-trophy' },
  { section: 'FACTURATION' },
  { id: 'admin-factures', label: 'Factures reçues / émises', icon: 'fa-file-invoice-dollar' },
  { id: 'admin-factures-resto', label: 'Facturer un restaurant', icon: 'fa-file-export' },
  { id: 'admin-profil-societe', label: 'DROPEAT LTD (mes coordonnées)', icon: 'fa-building' },
  { section: 'OMNIPOTENCE' },
  { id: 'omnipotence', label: 'Pouvoirs 2000%', icon: 'fa-user-shield' },
  { id: 'audit', label: 'Audit invisible', icon: 'fa-eye-slash' },
  { section: 'CONFIGURATION' },
  { id: 'paliers', label: 'Paliers', icon: 'fa-layer-group' },
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

// --- Utilisateurs ---
PAGES['users'] = async (c) => {
  const { data } = await api.get('/admin/users')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Utilisateurs</h1><div class="subtitle">Superadmins, agents commerciaux et sous-agents</div></div>
      <button class="btn btn-primary" id="btnNewUser"><i class="fas fa-plus"></i> Nouvel utilisateur</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Nom</th><th>Email</th><th>Rôle / Niveau</th><th>Parent</th>
          <th class="text-right">Restos</th><th class="text-right">Sous-agents</th>
          <th>Statut</th><th>Dernière connexion</th><th class="text-right">Actions</th>
        </tr></thead>
        <tbody>${data.users.map(u => `
          <tr>
            <td><strong>${escapeHtml(u.prenom)} ${escapeHtml(u.nom)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td>${u.role === 'superadmin' ? '<span class="niveau-pill niveau-admin">Superadmin</span>' : niveauPill(u.niveau)}</td>
            <td>${u.parent_nom ? escapeHtml(u.parent_prenom + ' ' + u.parent_nom) : '<span class="text-muted">—</span>'}</td>
            <td class="text-right">${u.nb_restaurants}</td>
            <td class="text-right">${u.nb_sous_agents}</td>
            <td>${u.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
            <td>${fmtDateTime(u.derniere_connexion)}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-secondary" data-edit="${u.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-secondary" data-pwd="${u.id}"><i class="fas fa-key"></i></button>
              <button class="btn btn-sm btn-danger" data-del="${u.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
  document.getElementById('btnNewUser').onclick = () => userModal(null, data.users)
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => userModal(parseInt(b.dataset.edit), data.users))
  c.querySelectorAll('[data-pwd]').forEach(b => b.onclick = () => resetPasswordModal(parseInt(b.dataset.pwd)))
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer définitivement cet utilisateur ? Ses restaurants seront détachés.',
    async () => { await api.delete('/admin/users/' + b.dataset.del); toast('Supprimé'); navigate('users') }
  ))
}

function userModal(id, allUsers) {
  const isEdit = !!id
  const u = isEdit ? allUsers.find(x => x.id === id) : null
  const parentOptions = ['<option value="">— Aucun (agent racine) —</option>']
    .concat(allUsers.filter(x => x.role === 'agent' && x.id !== id).map(x =>
      `<option value="${x.id}" ${u?.parent_id == x.id ? 'selected' : ''}>${escapeHtml(x.prenom + ' ' + x.nom)} (${niveauLabel(x.niveau)})</option>`
    )).join('')
  const m = modal(isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur', `
    <form id="userForm">
      <div class="form-grid">
        <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="prenom" required value="${escapeHtml(u?.prenom || '')}"/></div>
        <div class="form-group"><label>Nom <span class="req">*</span></label><input id="nom" required value="${escapeHtml(u?.nom || '')}"/></div>
        <div class="form-group"><label>Email <span class="req">*</span></label><input id="email" type="email" required value="${escapeHtml(u?.email || '')}"/></div>
        <div class="form-group"><label>Téléphone</label><input id="telephone" value="${escapeHtml(u?.telephone || '')}"/></div>
        <div class="form-group">
          <label>Rôle</label>
          <select id="role">
            <option value="agent" ${u?.role === 'agent' ? 'selected' : ''}>Agent commercial</option>
            <option value="superadmin" ${u?.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
          </select>
        </div>
        <div class="form-group" id="niveauWrap">
          <label>Niveau</label>
          <select id="niveau">
            <option value="0" ${u?.niveau === 0 ? 'selected' : ''}>0 — Agent commercial</option>
            <option value="1" ${u?.niveau === 1 ? 'selected' : ''}>1 — Sous-agent N1</option>
            <option value="2" ${u?.niveau === 2 ? 'selected' : ''}>2 — Sous-agent N2</option>
          </select>
        </div>
        <div class="form-group" id="parentWrap" style="grid-column:1/-1">
          <label>Agent parent (pour MLM)</label>
          <select id="parent_id">${parentOptions}</select>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>IBAN</label><input id="iban" value="${escapeHtml(u?.iban || '')}"/></div>
        ${!isEdit ? '<div class="form-group" style="grid-column:1/-1"><label>Mot de passe <span class="req">*</span></label><input id="password" type="password" required minlength="6" placeholder="Min 6 caractères"/></div>' : ''}
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(u?.notes || '')}</textarea></div>
        ${isEdit ? `<div class="form-group"><label>Statut</label><select id="actif"><option value="1" ${u?.actif ? 'selected' : ''}>Actif</option><option value="0" ${!u?.actif ? 'selected' : ''}>Inactif</option></select></div>` : ''}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  const toggleNiveau = () => {
    const isAdmin = m.el.querySelector('#role').value === 'superadmin'
    m.el.querySelector('#niveauWrap').style.display = isAdmin ? 'none' : ''
    m.el.querySelector('#parentWrap').style.display = isAdmin ? 'none' : ''
  }
  m.el.querySelector('#role').onchange = toggleNiveau; toggleNiveau()
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#userForm').onsubmit = async e => {
    e.preventDefault()
    const payload = {
      prenom: m.el.querySelector('#prenom').value.trim(),
      nom: m.el.querySelector('#nom').value.trim(),
      email: m.el.querySelector('#email').value.trim(),
      telephone: m.el.querySelector('#telephone').value.trim() || null,
      role: m.el.querySelector('#role').value,
      niveau: parseInt(m.el.querySelector('#niveau').value),
      parent_id: m.el.querySelector('#parent_id').value ? parseInt(m.el.querySelector('#parent_id').value) : null,
      iban: m.el.querySelector('#iban').value.trim() || null,
      notes: m.el.querySelector('#notes').value.trim() || null
    }
    if (!isEdit) payload.password = m.el.querySelector('#password').value
    if (isEdit) payload.actif = parseInt(m.el.querySelector('#actif').value)
    try {
      if (isEdit) await api.put('/admin/users/' + id, payload)
      else await api.post('/admin/users', payload)
      toast('Enregistré'); m.close(); navigate('users')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

function resetPasswordModal(id) {
  const m = modal('Réinitialiser le mot de passe', `
    <form id="pwdForm">
      <div class="form-group"><label>Nouveau mot de passe <span class="req">*</span></label>
        <input id="np" type="password" required minlength="6" placeholder="Min 6 caractères"/></div>
      <p class="text-muted" style="font-size:.85rem">L'utilisateur sera déconnecté de toutes ses sessions actives.</p>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-key"></i> Réinitialiser</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#pwdForm').onsubmit = async e => {
    e.preventDefault()
    try {
      await api.post(`/admin/users/${id}/reset-password`, { new_password: m.el.querySelector('#np').value })
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
  const [r, u] = await Promise.all([api.get('/admin/restaurants'), api.get('/admin/users')])
  const restos = r.data.restaurants
  const agents = u.data.users.filter(x => x.role === 'agent')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Restaurants</h1><div class="subtitle">${restos.length} restaurants partenaires</div></div>
      <button class="btn btn-primary" id="btnNew"><i class="fas fa-plus"></i> Nouveau restaurant</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Nom</th><th>Ville</th><th>Agent</th><th>Rang</th><th>Statut</th>
          <th class="text-right">Marques</th><th class="text-right">Cmds</th><th class="text-right">CA</th>
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
            <td class="text-right">
              <button class="btn btn-sm btn-secondary" data-detail="${r.id}"><i class="fas fa-eye"></i></button>
              <button class="btn btn-sm btn-secondary" data-edit="${r.id}"><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del="${r.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
  document.getElementById('btnNew').onclick = () => restaurantModal(null, agents)
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const x = restos.find(r => r.id === parseInt(b.dataset.edit))
    restaurantModal(x, agents)
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
        <thead><tr><th>#</th><th>Nom</th><th>Plateformes</th><th>Uber Store ID</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${marques.length ? marques.map(mq => `
          <tr>
            <td>${mq.rang_creation || '-'} ${mq.is_portefeuille_proprietaire ? '<span class="badge badge-gold" style="font-size:.6rem">P</span>' : ''}${mq.exclue_tranche ? '<span class="badge badge-slate" style="font-size:.6rem" title="Marque héritée d\'un resto attribué (décalée en tranche suivante)">H</span>' : ''}</td>
            <td><strong>${escapeHtml(mq.nom)}</strong>${mq.date_lancement ? `<div class="text-muted" style="font-size:.7rem">Lancée ${fmtDate(mq.date_lancement)}</div>` : ''}</td>
            <td>
              <span class="badge badge-slate">${escapeHtml(mq.plateforme || '—')}</span>
              <button class="btn btn-sm btn-link" data-mq-plats="${mq.id}" title="Gérer les plateformes" style="padding:.1rem .35rem"><i class="fas fa-plus-circle"></i></button>
            </td>
            <td><code>${escapeHtml(mq.uber_store_id || '-')}</code></td>
            <td class="text-right">${fmtNum(mq.nb_commandes)}</td>
            <td class="text-right">${fmtEUR(mq.ca_total)}</td>
            <td class="text-right">
              <button class="btn btn-sm btn-primary" data-mq-history="${mq.id}" title="Historique commandes"><i class="fas fa-clock-rotate-left"></i></button>
              <button class="btn btn-sm btn-secondary" data-edit-marque="${mq.id}" data-marque-data='${escapeHtml(JSON.stringify(mq))}'><i class="fas fa-pen"></i></button>
              <button class="btn btn-sm btn-danger" data-del-marque="${mq.id}"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune marque — cliquez sur « Ajouter une marque »</td></tr>'}</tbody>
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
          <thead><tr><th>Type</th><th>Fichier</th><th>Statut</th><th>Émis le</th><th>Expire le</th><th>Uploader</th><th class="text-right">Actions</th></tr></thead>
          <tbody>${docs.documents.map(d => `
            <tr>
              <td>${escapeHtml(d.type_document)}</td>
              <td><i class="fas fa-file"></i> ${escapeHtml(d.nom_fichier)}</td>
              <td>${d.statut === 'valide' ? '<span class="badge badge-primary">Validé</span>' :
                  d.statut === 'rejete' ? '<span class="badge badge-danger">Rejeté</span>' :
                  d.statut === 'expire' ? '<span class="badge badge-danger">Expiré</span>' :
                  '<span class="badge badge-warning">En attente</span>'}</td>
              <td>${fmtDate(d.date_emission)}</td>
              <td>${fmtDate(d.date_expiration)}</td>
              <td style="font-size:.8rem">${d.uploader_prenom ? escapeHtml(d.uploader_prenom + ' ' + d.uploader_nom) : '—'}</td>
              <td class="text-right">
                <button class="btn btn-sm btn-secondary" data-view-doc="${d.id}" title="Voir"><i class="fas fa-eye"></i></button>
                ${d.statut === 'en_attente' ? `<button class="btn btn-sm btn-primary" data-validate-doc="${d.id}" title="Valider"><i class="fas fa-check"></i></button>` : ''}
                ${d.statut === 'en_attente' ? `<button class="btn btn-sm btn-warning" data-reject-doc="${d.id}" title="Rejeter"><i class="fas fa-times"></i></button>` : ''}
                <button class="btn btn-sm btn-danger" data-del-doc="${d.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      ` : ''}
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
        if (data.mime_type && data.mime_type.startsWith('image/')) {
          w.document.write(`<img src="data:${data.mime_type};base64,${data.contenu_base64}" style="max-width:100%"/>`)
        } else if (data.mime_type === 'application/pdf') {
          w.document.write(`<iframe src="data:application/pdf;base64,${data.contenu_base64}" style="width:100%;height:100vh;border:0"></iframe>`)
        } else {
          // Téléchargement
          const a = document.createElement('a')
          a.href = `data:${data.mime_type || 'application/octet-stream'};base64,${data.contenu_base64}`
          a.download = data.nom_fichier
          a.click()
        }
      }
    } catch (err) { toast('Impossible d\'ouvrir le document', 'error') }
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
          <tr style="cursor:pointer" data-row="${a.id}">
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
  document.getElementById('btnEdit').onclick = () => navigate('users')
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

// --- Marques (vue globale) ---
PAGES['marques'] = async (c) => {
  const { data } = await api.get('/admin/restaurants/marques/all')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Marques virtuelles</h1><div class="subtitle">${data.marques.length} marques au total</div></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Marque</th><th>Restaurant</th><th>Agent</th><th>#</th><th>Plateforme</th><th>Uber ID</th></tr></thead>
        <tbody>${data.marques.map(m => `
          <tr>
            <td><strong>${escapeHtml(m.nom)}</strong>
              ${m.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}
            </td>
            <td>${escapeHtml(m.restaurant_nom)}${m.resto_portefeuille ? ' <span class="badge badge-gold" style="font-size:.6rem">resto P</span>' : ''}</td>
            <td>${m.agent_nom ? escapeHtml(m.agent_prenom + ' ' + m.agent_nom) : '<span class="text-muted">—</span>'}</td>
            <td>${m.rang_creation || '-'}</td>
            <td>${escapeHtml(m.plateforme)}</td>
            <td><code>${escapeHtml(m.uber_store_id || '-')}</code></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
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
    <div class="card">
      <div class="card-title"><i class="fas fa-history"></i> Historique des imports</div>
      ${imp.data.imports.length ? `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Fichier</th><th>Restaurant / Marque</th><th>Période</th>
              <th class="text-right">Lignes</th><th class="text-right">Importées</th><th class="text-right">Doublons</th>
              <th class="text-right">Montant</th><th>Par</th><th class="text-right"></th></tr></thead>
            <tbody>${imp.data.imports.map(i => `
              <tr>
                <td>${fmtDateTime(i.created_at)}</td>
                <td>${escapeHtml(i.nom_fichier || '-')}</td>
                <td>${escapeHtml(i.restaurant_nom + ' / ' + i.marque_nom)}</td>
                <td>${i.periode_debut ? fmtDate(i.periode_debut) + ' → ' + fmtDate(i.periode_fin) : '-'}</td>
                <td class="text-right">${fmtNum(i.nb_lignes)}</td>
                <td class="text-right text-success">${fmtNum(i.nb_lignes_importees)}</td>
                <td class="text-right">${fmtNum(i.nb_doublons)}</td>
                <td class="text-right">${fmtEUR(i.montant_total)}</td>
                <td>${i.uploader_nom ? escapeHtml(i.uploader_prenom + ' ' + i.uploader_nom) : '-'}</td>
                <td class="text-right"><button class="btn btn-sm btn-danger" data-del="${i.id}"><i class="fas fa-trash"></i></button></td>
              </tr>`).join('')}</tbody>
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
  const [me, com, codesR, tree, histR] = await Promise.all([
    api.get('/agent/me'),
    api.get(`/agent/commissions?annee=${annee}&mois=${mois}`),
    api.get('/agent/sous-agents/codes').catch(() => ({ data: { codes: [] } })),
    api.get(`/agent/mlm-tree?annee=${annee}&mois=${mois}`).catch(() => ({ data: { filleuls: [], total_n1: 0, total_n2: 0 } })),
    api.get('/agent/commissions/history?type=monthly').catch(() => ({ data: { history: [] } }))
  ])
  const u = me.data.user, s = me.data.stats, d = com.data.detail
  const reste = me.data.reste_avant_portefeuille
  const myRestos = s.nb_restaurants_propres
  const palier = 5
  const filledSteps = (myRestos % palier)
  const codesRecents = (codesR.data.codes || []).slice(0, 5)
  const mlmTree = tree.data
  const history = histR.data.history || []

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
      <div class="stat-card info"><div class="stat-label">Statut paiement</div><div class="stat-value" style="font-size:1.1rem">${com.data.paiement_existant ? (com.data.paiement_existant.statut === 'paye' ? '<span class="text-success"><i class="fas fa-check-circle"></i> Payé</span>' : '<span class="text-danger">En attente</span>') : '<span class="text-muted">Non traité</span>'}</div></div>
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
  const goAttr = document.getElementById('goAttribution')
  if (goAttr) goAttr.onclick = () => navigate('a-attribution')
  const goSA = document.getElementById('goSousAgents')
  if (goSA) goSA.onclick = () => navigate('a-sous-agents')
  const goMlm = document.getElementById('goMlm')
  if (goMlm) goMlm.onclick = () => navigate('a-mlm')
  const goHC = document.getElementById('goHistoComm')
  if (goHC) goHC.onclick = () => navigate('a-historique-comm')

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

// --- Mes restaurants ---
PAGES['a-restaurants'] = async (c) => {
  const [r, sa] = await Promise.all([api.get('/agent/restaurants'), api.get('/agent/sous-agents').catch(() => ({ data: { sous_agents: [] } }))])
  const allBranchAgents = [{ id: CURRENT_USER.id, prenom: CURRENT_USER.prenom, nom: CURRENT_USER.nom, niveau: CURRENT_USER.niveau }, ...sa.data.sous_agents]
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Mes restaurants</h1><div class="subtitle">${r.data.restaurants.length} restaurants dans ma branche</div></div>
      <button class="btn btn-primary" id="btnNew"><i class="fas fa-plus"></i> Ajouter un restaurant</button>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Nom</th><th>Ville</th><th>Apporté par</th><th>Rang</th><th class="text-right">Marques</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${r.data.restaurants.length ? r.data.restaurants.map(x => `
        <tr>
          <td><strong>${escapeHtml(x.nom)}</strong>
            ${x.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}
            ${x.tablette_sr_shop ? '<span class="badge badge-info"><i class="fas fa-tablet-screen-button"></i></span>' : ''}
          </td>
          <td>${escapeHtml(x.ville || '-')}</td>
          <td>${x.agent_id === CURRENT_USER.id ? '<strong>Moi</strong>' : escapeHtml((x.agent_prenom || '') + ' ' + (x.agent_nom || ''))}</td>
          <td>#${x.rang_apport || '-'}</td>
          <td class="text-right">${x.nb_marques}</td>
          <td class="text-right">${fmtNum(x.nb_commandes)}</td>
          <td class="text-right"><strong>${fmtEUR(x.ca_total)}</strong></td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-detail="${x.id}"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-secondary" data-edit="${x.id}"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" data-del="${x.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucun restaurant. Cliquez sur « Ajouter un restaurant » pour commencer.</td></tr>'}</tbody>
    </table></div>`
  document.getElementById('btnNew').onclick = () => agentRestaurantModal(null, allBranchAgents)
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => agentRestaurantModal(r.data.restaurants.find(x => x.id == b.dataset.edit), allBranchAgents))
  c.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => agentRestaurantDetail(parseInt(b.dataset.detail)))
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDialog('Supprimer ce restaurant et toutes ses données ?',
    async () => { await api.delete('/agent/restaurants/' + b.dataset.del); toast('Supprimé'); navigate('a-restaurants') }))
}

function agentRestaurantModal(r, agents) {
  const isEdit = !!r
  const opts = agents.map(a => `<option value="${a.id}" ${(r?.agent_id || CURRENT_USER.id) == a.id ? 'selected' : ''}>${a.id === CURRENT_USER.id ? 'Moi' : escapeHtml(a.prenom + ' ' + a.nom)} (${niveauLabel(a.niveau)})</option>`).join('')
  const m = modal(isEdit ? 'Modifier le restaurant' : 'Nouveau restaurant', `
    <form id="rForm">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nom <span class="req">*</span></label><input id="nom" required value="${escapeHtml(r?.nom || '')}"/></div>
        <div class="form-group"><label>Raison sociale</label><input id="raison_sociale" value="${escapeHtml(r?.raison_sociale || '')}"/></div>
        <div class="form-group"><label>SIRET</label><input id="siret" value="${escapeHtml(r?.siret || '')}"/></div>
        <div class="form-group" style="grid-column:1/-1"><label>Adresse</label><input id="adresse" value="${escapeHtml(r?.adresse || '')}"/></div>
        <div class="form-group"><label>Code postal</label><input id="code_postal" value="${escapeHtml(r?.code_postal || '')}"/></div>
        <div class="form-group"><label>Ville</label><input id="ville" value="${escapeHtml(r?.ville || '')}"/></div>
        <div class="form-group"><label>Téléphone</label><input id="telephone" value="${escapeHtml(r?.telephone || '')}"/></div>
        <div class="form-group"><label>Email</label><input id="email" type="email" value="${escapeHtml(r?.email || '')}"/></div>
        <div class="form-group"><label>Contact</label><input id="contact_nom" value="${escapeHtml(r?.contact_nom || '')}"/></div>
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
      nom: get('nom').trim(), raison_sociale: get('raison_sociale').trim() || null,
      siret: get('siret').trim() || null, adresse: get('adresse').trim() || null,
      code_postal: get('code_postal').trim() || null, ville: get('ville').trim() || null,
      telephone: get('telephone').trim() || null, email: get('email').trim() || null,
      contact_nom: get('contact_nom').trim() || null,
      agent_id: parseInt(get('agent_id')),
      date_signature: get('date_signature') || null, date_lancement: get('date_lancement') || null,
      tablette_sr_shop: parseInt(get('tablette_sr_shop')),
      notes: get('notes').trim() || null
    }
    try {
      if (isEdit) await api.put('/agent/restaurants/' + r.id, payload)
      else await api.post('/agent/restaurants', payload)
      toast('Enregistré'); m.close(); navigate('a-restaurants')
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

async function agentRestaurantDetail(id) {
  const { data } = await api.get('/agent/restaurants/' + id)
  const r = data.restaurant, marques = data.marques
  const m = modal(`${r.nom} — Marques virtuelles`, `
    <div class="form-grid mb-3">
      <div><strong>Apporté par :</strong> ${r.agent_id === CURRENT_USER.id ? 'Moi' : escapeHtml(r.agent_prenom + ' ' + r.agent_nom)}</div>
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
            <button class="btn btn-sm btn-secondary" data-em="${mq.id}" data-mqd='${escapeHtml(JSON.stringify(mq))}'><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" data-dm="${mq.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune marque</td></tr>'}</tbody>
    </table>`)
  m.el.querySelector('#btnAdd').onclick = () => agentMarqueModal(id, null, m)
  m.el.querySelectorAll('[data-em]').forEach(b => b.onclick = () => agentMarqueModal(id, JSON.parse(b.dataset.mqd.replace(/&quot;/g, '"').replace(/&amp;/g, '&')), m))
  m.el.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => confirmDialog('Supprimer cette marque ?',
    async () => { await api.delete('/agent/marques/' + b.dataset.dm); toast('Supprimé'); m.close(); agentRestaurantDetail(id) }))
}

function agentMarqueModal(restoId, mq, parentModal) {
  const isEdit = !!mq
  const m = modal(isEdit ? 'Modifier la marque' : 'Nouvelle marque virtuelle', `
    <form id="mForm">
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
        <div class="form-group" style="grid-column:1/-1"><label>Notes</label><textarea id="notes" rows="2">${escapeHtml(mq?.notes || '')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="cancelBtn">Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
      </div>
    </form>`)
  m.el.querySelector('#cancelBtn').onclick = m.close
  m.el.querySelector('#mForm').onsubmit = async e => {
    e.preventDefault()
    const get = id => m.el.querySelector('#' + id).value
    const payload = { nom: get('nom').trim(), plateforme: get('plateforme'),
      uber_store_id: get('uber_store_id').trim() || null, date_lancement: get('date_lancement') || null,
      notes: get('notes').trim() || null }
    try {
      if (isEdit) await api.put('/agent/marques/' + mq.id, payload)
      else await api.post(`/agent/restaurants/${restoId}/marques`, payload)
      toast('Enregistré'); m.close()
      if (parentModal) { parentModal.close(); agentRestaurantDetail(restoId) }
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
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
          <div><strong>Type :</strong> ${f.type === 'agent_to_dropeat' ? 'Commissions agent commercial' : 'Service DropEat → Restaurant'}</div>
        </div>
      </div>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Libellé</th><th class="text-right">Qté</th><th class="text-right">P.U.</th><th class="text-right">Montant HT</th></tr></thead>
        <tbody>${lignes.map(l => `<tr>
          <td>${l.ordre}</td>
          <td><strong>${escapeHtml(l.libelle)}</strong>${l.description ? `<br><small class="text-muted">${escapeHtml(l.description)}</small>` : ''}</td>
          <td class="text-right">${fmtNum(l.quantite)}</td>
          <td class="text-right">${fmtEUR(l.prix_unitaire).replace(' €', ' ' + sym)}</td>
          <td class="text-right">${fmtEUR(l.montant_ht).replace(' €', ' ' + sym)}</td>
        </tr>`).join('')}</tbody>
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
  const m = modal(`<i class="fas fa-file-invoice"></i> Facture ${escapeHtml(f.numero)}`, html + `
    <div class="form-actions" style="margin-top:1rem">
      <button type="button" class="btn btn-secondary" data-close>Fermer</button>
      <button type="button" class="btn btn-primary" id="printBtn"><i class="fas fa-print"></i> Imprimer / PDF</button>
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
  const { data } = await api.get('/factures?type=agent_to_dropeat')
  const factures = data.factures || []
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-file-invoice-dollar"></i> Mes factures</h1>
        <div class="subtitle">${factures.length} facture${factures.length > 1 ? 's' : ''} — vous facturez DropEat vos commissions (propres + portefeuille + N+1 + N+2)</div></div>
      <button class="btn btn-primary" id="newFacture"><i class="fas fa-plus"></i> Nouvelle facture</button>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> Historique de mes factures</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Numéro</th><th>Période</th><th>Émission</th><th>Échéance</th><th class="text-right">Montant HT</th><th class="text-right">TTC</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${factures.length ? factures.map(f => `<tr>
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
        </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucune facture pour le moment. Cliquez sur « Nouvelle facture ».</td></tr>'}</tbody>
      </table></div>
    </div>
  `
  c.querySelector('#newFacture').onclick = () => factureCreateAgentModal(() => navigate('a-factures'))
  c.querySelectorAll('[data-view]').forEach(b => b.onclick = () => factureViewerModal(b.dataset.view))
  c.querySelectorAll('[data-send]').forEach(b => b.onclick = () => confirmDialog(
    'Envoyer cette facture au super-admin pour validation ? Vous ne pourrez plus la modifier.',
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

function factureCreateAgentModal(onSuccess) {
  const now = new Date()
  const annee = now.getFullYear()
  const moisCur = now.getMonth() + 1
  const m = modal('<i class="fas fa-file-invoice"></i> Nouvelle facture de commissions', `
    <p class="text-muted" style="font-size:.85rem;margin-bottom:.6rem">
      <i class="fas fa-circle-info"></i> Cette facture inclura automatiquement vos commissions propres, portefeuille, N+1 (vos filleuls directs) et N+2 (sous-filleuls) pour la période choisie.
    </p>
    <div class="form-grid">
      <div class="form-group"><label>Année</label><input id="fcAnnee" type="number" value="${annee}" min="2024" max="2030"/></div>
      <div class="form-group"><label>Mois</label>
        <select id="fcMois">${monthsFR.map((mo, i) => `<option value="${i+1}" ${i+1===moisCur?'selected':''}>${mo}</option>`).join('')}</select>
      </div>
    </div>
    <div id="fcPreview" style="margin:1rem 0;padding:1rem;background:#f9fafb;border-radius:6px;display:none"></div>
    <div class="form-group"><label>Notes internes (optionnel)</label><textarea id="fcNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" data-close>Annuler</button>
      <button type="button" class="btn btn-info" id="fcPreviewBtn"><i class="fas fa-eye"></i> Aperçu</button>
      <button type="button" class="btn btn-primary" id="fcCreate"><i class="fas fa-file-invoice"></i> Créer brouillon</button>
    </div>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#fcPreviewBtn').onclick = async () => {
    const a = parseInt(m.el.querySelector('#fcAnnee').value)
    const mo = parseInt(m.el.querySelector('#fcMois').value)
    try {
      const { data } = await api.post('/factures/agent/preview', { annee: a, mois: mo })
      const box = m.el.querySelector('#fcPreview')
      box.style.display = 'block'
      box.innerHTML = data.lignes.length ? `
        <strong>Aperçu — ${data.lignes.length} ligne(s) — Total HT : ${fmtEUR(data.total)}</strong>
        <table class="data-table" style="font-size:.8rem;margin-top:.5rem">
          <thead><tr><th>Libellé</th><th class="text-right">Cmds</th><th class="text-right">Montant HT</th></tr></thead>
          <tbody>${data.lignes.map(l => `<tr>
            <td>${escapeHtml(l.libelle)}<br><small class="text-muted">${escapeHtml(l.description)}</small></td>
            <td class="text-right">${fmtNum(l.quantite)}</td>
            <td class="text-right"><strong>${fmtEUR(l.montant_ht)}</strong></td>
          </tr>`).join('')}</tbody>
        </table>
      ` : '<div class="text-muted">Aucune commission à facturer pour cette période.</div>'
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
  m.el.querySelector('#fcCreate').onclick = async () => {
    const a = parseInt(m.el.querySelector('#fcAnnee').value)
    const mo = parseInt(m.el.querySelector('#fcMois').value)
    const notes = m.el.querySelector('#fcNotes').value
    try {
      const { data } = await api.post('/factures/agent/create', { annee: a, mois: mo, notes })
      toast('Facture créée : ' + data.numero)
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

// === Generate invoice DropEat → Restaurant ===
PAGES['admin-factures-resto'] = async (c) => {
  const { data } = await api.get('/admin/restaurants').catch(() => ({ data: { restaurants: [] } }))
  const restos = data.restaurants || []
  const now = new Date()
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-file-export"></i> Facturer un restaurant</h1>
        <div class="subtitle">Génération automatique de la facture DropEat → Restaurant selon ses marques actives</div></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> Sélectionner restaurant + période</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Restaurant <span class="req">*</span></label>
          <select id="frResto">
            <option value="">— Choisir —</option>
            ${restos.map(r => `<option value="${r.id}">${escapeHtml(r.nom)} — ${escapeHtml(r.ville || '')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Année</label><input id="frAnnee" type="number" value="${now.getFullYear()}" min="2024" max="2030"/></div>
        <div class="form-group"><label>Mois</label>
          <select id="frMois">${monthsFR.map((mo, i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${mo}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="frCreate"><i class="fas fa-file-invoice"></i> Générer la facture</button>
      </div>
    </div>
  `
  c.querySelector('#frCreate').onclick = async () => {
    const restaurant_id = parseInt(c.querySelector('#frResto').value)
    const annee = parseInt(c.querySelector('#frAnnee').value)
    const mois = parseInt(c.querySelector('#frMois').value)
    if (!restaurant_id) return toast('Sélectionnez un restaurant', 'error')
    try {
      const { data } = await api.post('/factures/resto/create', { restaurant_id, annee, mois })
      toast('Facture générée : ' + data.numero)
      factureViewerModal(data.facture_id)
    } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
  }
}

// ============================================================
// === ADMIN CRUD AGENTS (omnipotence) ========================
// ============================================================
PAGES['admin-agents-crud'] = async (c) => {
  const { data } = await api.get('/admin/agents-crud')
  const agents = data.agents || []
  c.innerHTML = `
    <div class="page-header">
      <div><h1><i class="fas fa-user-shield"></i> Gestion des agents (Omnipotence)</h1>
        <div class="subtitle">${agents.length} agent${agents.length > 1 ? 's' : ''} — créer, modifier, assigner, désactiver, supprimer</div></div>
      <button class="btn btn-primary" id="newAgent"><i class="fas fa-user-plus"></i> Créer un agent</button>
    </div>
    <div class="card">
      <div class="card-title"><i class="fas fa-list"></i> Tous les agents</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Niveau</th><th>Parent</th><th class="text-right">Filleuls</th><th class="text-right">Restos</th><th>Statut</th><th>Dernière connexion</th><th class="text-right">Actions</th></tr></thead>
        <tbody>${agents.length ? agents.map(a => `<tr>
          <td><strong>${escapeHtml(a.prenom + ' ' + a.nom)}</strong></td>
          <td style="font-size:.85rem">${escapeHtml(a.email)}</td>
          <td>${niveauPill(a.niveau)}</td>
          <td>${a.parent_nom ? escapeHtml(a.parent_nom) : '<span class="text-muted">—</span>'}</td>
          <td class="text-right">${a.nb_enfants_directs}</td>
          <td class="text-right">${a.nb_restos}</td>
          <td>${a.actif ? '<span class="badge badge-primary">Actif</span>' : '<span class="badge badge-danger">Inactif</span>'}</td>
          <td style="font-size:.85rem">${fmtDateTime(a.derniere_connexion)}</td>
          <td class="text-right" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" data-edit="${a.id}" title="Modifier"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm ${a.actif ? 'btn-warning' : 'btn-primary'}" data-toggle="${a.id}" data-actif="${a.actif}" title="${a.actif ? 'Désactiver' : 'Activer'}"><i class="fas fa-${a.actif ? 'pause' : 'play'}"></i></button>
            <button class="btn btn-sm btn-info" data-pwd="${a.id}" title="Reset mot de passe"><i class="fas fa-key"></i></button>
            <button class="btn btn-sm btn-danger" data-del="${a.id}" title="Supprimer"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted">Aucun agent</td></tr>'}</tbody>
      </table></div>
    </div>
  `
  c.querySelector('#newAgent').onclick = () => adminAgentFormModal(null, () => navigate('admin-agents-crud'))
  c.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const a = agents.find(x => x.id == b.dataset.edit)
    adminAgentFormModal(a, () => navigate('admin-agents-crud'))
  })
  c.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    const id = b.dataset.toggle, actif = b.dataset.actif === '1'
    const url = actif ? '/admin/agents-crud/' + id + '/desactiver' : '/admin/agents-crud/' + id + '/activer'
    confirmDialog(actif ? 'Désactiver cet agent ? Toutes ses sessions seront fermées.' : 'Activer cet agent ?',
      async () => { await api.put(url); toast('OK'); navigate('admin-agents-crud') })
  })
  c.querySelectorAll('[data-pwd]').forEach(b => b.onclick = () => {
    const id = b.dataset.pwd
    const pwd = prompt('Nouveau mot de passe (≥6 caractères) :')
    if (!pwd) return
    api.put('/admin/omnipotence/user/' + id + '/password', { new_password: pwd })
      .then(() => toast('Mot de passe modifié'))
      .catch(e => toast(e.response?.data?.error || 'Erreur', 'error'))
  })
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    confirmDialog('Supprimer définitivement cet agent ? (Refusé s\'il a des filleuls ou restaurants associés)',
      async () => {
        try { await api.delete('/admin/agents-crud/' + b.dataset.del); toast('Agent supprimé'); navigate('admin-agents-crud') }
        catch (e) { toast(e.response?.data?.error || 'Erreur', 'error') }
      })
  })
}

async function adminAgentFormModal(agent, onSuccess) {
  const isEdit = !!agent
  const a = agent || { niveau: 1 }
  const niveau = a.niveau ?? 1
  const { data: pp } = await api.get('/admin/agents-crud/parents-possibles?level=' + niveau).catch(() => ({ data: { parents: [] } }))

  const m = modal(`<i class="fas fa-${isEdit ? 'edit' : 'user-plus'}"></i> ${isEdit ? 'Modifier' : 'Créer'} un agent`, `
    <form id="aaForm">
      <div class="form-grid">
        <div class="form-group"><label>Prénom <span class="req">*</span></label><input id="aaPrenom" value="${escapeHtml(a.prenom || '')}" required /></div>
        <div class="form-group"><label>Nom <span class="req">*</span></label><input id="aaNom" value="${escapeHtml(a.nom || '')}" required /></div>
        <div class="form-group" style="grid-column:1/-1"><label>Email <span class="req">*</span></label><input id="aaEmail" type="email" value="${escapeHtml(a.email || '')}" required /></div>
        <div class="form-group"><label>Téléphone</label><input id="aaTel" value="${escapeHtml(a.telephone || '')}" /></div>
        <div class="form-group"><label>IBAN</label><input id="aaIban" value="${escapeHtml(a.iban || '')}" /></div>
        <div class="form-group"><label>Niveau MLM <span class="req">*</span></label>
          <select id="aaNiveau">
            ${[0,1,2,3,4,5].map(n => `<option value="${n}" ${n===niveau?'selected':''}>N${n}${n===0?' (Commercial racine)':''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Parent (selon niveau)</label>
          <select id="aaParent">
            <option value="">— ${niveau === 0 ? 'Pas de parent' : 'Choisir parent'} —</option>
            ${pp.parents.map(p => `<option value="${p.id}" ${a.parent_id == p.id ? 'selected' : ''}>${escapeHtml(p.prenom + ' ' + p.nom)} (N${p.niveau})</option>`).join('')}
          </select>
        </div>
        ${!isEdit ? `<div class="form-group" style="grid-column:1/-1"><label>Mot de passe (optionnel — auto-généré si vide)</label><input id="aaPwd" type="text" placeholder="laisser vide pour générer" /></div>` : ''}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" data-close>Annuler</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? 'Enregistrer' : 'Créer'}</button>
      </div>
    </form>
  `)
  m.el.querySelector('[data-close]').onclick = () => m.close()
  m.el.querySelector('#aaNiveau').onchange = async () => {
    const lvl = parseInt(m.el.querySelector('#aaNiveau').value)
    const { data: nn } = await api.get('/admin/agents-crud/parents-possibles?level=' + lvl).catch(() => ({ data: { parents: [] } }))
    m.el.querySelector('#aaParent').innerHTML = `<option value="">— ${lvl === 0 ? 'Pas de parent' : 'Choisir parent'} —</option>` +
      nn.parents.map(p => `<option value="${p.id}">${escapeHtml(p.prenom + ' ' + p.nom)} (N${p.niveau})</option>`).join('')
  }
  m.el.querySelector('#aaForm').onsubmit = async e => {
    e.preventDefault()
    const body = {
      email: m.el.querySelector('#aaEmail').value.trim(),
      nom: m.el.querySelector('#aaNom').value.trim(),
      prenom: m.el.querySelector('#aaPrenom').value.trim(),
      telephone: m.el.querySelector('#aaTel').value.trim() || null,
      iban: m.el.querySelector('#aaIban').value.trim() || null,
      niveau: parseInt(m.el.querySelector('#aaNiveau').value),
      parent_id: m.el.querySelector('#aaParent').value ? parseInt(m.el.querySelector('#aaParent').value) : null
    }
    try {
      if (isEdit) {
        await api.put('/admin/agents-crud/' + agent.id, body)
        toast('Agent modifié')
      } else {
        body.password = m.el.querySelector('#aaPwd')?.value.trim() || null
        const r = await api.post('/admin/agents-crud/create', body)
        m.close()
        showAccessCodeModal(r.data.code_acces, () => onSuccess && onSuccess())
        return
      }
      m.close()
      onSuccess && onSuccess()
    } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
  }
}

// ===== Bootstrap =====
bootstrap()
