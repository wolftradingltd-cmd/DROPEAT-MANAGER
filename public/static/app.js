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
          </div>
        </div>
      </div>
    </div>`
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
  { id: 'tree', label: 'Arborescence MLM', icon: 'fa-sitemap' },
  { id: 'restaurants', label: 'Restaurants', icon: 'fa-store' },
  { id: 'marques', label: 'Marques virtuelles', icon: 'fa-tags' },
  { section: 'OPÉRATIONS' },
  { id: 'imports', label: 'Imports CSV', icon: 'fa-file-csv' },
  { id: 'commissions', label: 'Commissions', icon: 'fa-coins' },
  { id: 'paiements', label: 'Paiements', icon: 'fa-money-check-dollar' },
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
  { id: 'a-historique', label: 'Historique paiements', icon: 'fa-receipt' },
  { section: 'MON RÉSEAU' },
  { id: 'a-sous-agents', label: 'Mes sous-agents', icon: 'fa-people-group' },
  { section: 'AIDE' },
  { id: 'a-tutoriel', label: 'Tutoriel', icon: 'fa-graduation-cap' },
  { id: 'a-paliers', label: 'Grille des paliers', icon: 'fa-layer-group' },
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
  const { data } = await api.get('/admin/dashboard')
  const s = data.stats, m = data.mois_courant
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Tableau de bord</h1><div class="subtitle">Vue d'ensemble — ${monthsFR[m.mois - 1]} ${m.annee}</div></div>
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
    </div>`
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
  const { data } = await api.get('/admin/restaurants/' + id)
  const r = data.restaurant, marques = data.marques
  const m = modal(`Restaurant : ${r.nom}`, `
    <div class="form-grid mb-3">
      <div><strong>Agent :</strong> ${r.agent_nom ? escapeHtml(r.agent_prenom + ' ' + r.agent_nom) : '—'}</div>
      <div><strong>Rang :</strong> #${r.rang_apport || '-'} ${r.is_portefeuille_proprietaire ? '<span class="badge badge-gold">PORTEFEUILLE</span>' : ''}</div>
      <div><strong>Tablette SR :</strong> ${r.tablette_sr_shop ? 'Oui' : 'Non'}</div>
    </div>
    <div class="card-title"><i class="fas fa-tags"></i> Marques virtuelles (${marques.length})
      <button class="btn btn-sm btn-primary" id="btnAddMarque" style="margin-left:auto"><i class="fas fa-plus"></i> Ajouter</button>
    </div>
    <table class="data-table">
      <thead><tr><th>#</th><th>Nom</th><th>Plateforme</th><th>Uber Store ID</th><th class="text-right">Cmds</th><th class="text-right">CA</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${marques.length ? marques.map(mq => `
        <tr>
          <td>${mq.rang_creation || '-'} ${mq.is_portefeuille_proprietaire ? '<span class="badge badge-gold" style="font-size:.6rem">P</span>' : ''}</td>
          <td><strong>${escapeHtml(mq.nom)}</strong></td>
          <td>${escapeHtml(mq.plateforme)}</td>
          <td><code>${escapeHtml(mq.uber_store_id || '-')}</code></td>
          <td class="text-right">${fmtNum(mq.nb_commandes)}</td>
          <td class="text-right">${fmtEUR(mq.ca_total)}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" data-edit-marque="${mq.id}" data-marque-data='${escapeHtml(JSON.stringify(mq))}'><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm btn-danger" data-del-marque="${mq.id}"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Aucune marque</td></tr>'}</tbody>
    </table>`)
  m.el.querySelector('#btnAddMarque').onclick = () => marqueModal(id, null, m)
  m.el.querySelectorAll('[data-edit-marque]').forEach(b => {
    b.onclick = () => marqueModal(id, JSON.parse(b.dataset.marqueData.replace(/&quot;/g, '"').replace(/&amp;/g, '&')), m)
  })
  m.el.querySelectorAll('[data-del-marque]').forEach(b => b.onclick = () => confirmDialog(
    'Supprimer cette marque virtuelle ? Toutes ses commandes seront supprimées.',
    async () => { await api.delete('/admin/restaurants/marques/' + b.dataset.delMarque); toast('Marque supprimée'); m.close(); restaurantDetailModal(id, agents) }
  ))
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
      <div><h1>Imports CSV</h1><div class="subtitle">Importer les commandes Uber Eats par marque virtuelle</div></div>
    </div>
    <div class="card mb-4">
      <div class="card-title"><i class="fas fa-cloud-arrow-up"></i> Nouvel import</div>
      <div class="form-grid mb-3">
        <div class="form-group">
          <label>Marque virtuelle <span class="req">*</span></label>
          <select id="marqueSelect">
            <option value="">— Sélectionner —</option>
            ${marques.map(m => `<option value="${m.id}">${escapeHtml(m.restaurant_nom + ' / ' + m.nom)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="upload-zone" id="dropZone">
        <i class="fas fa-file-csv"></i>
        <h3>Glissez-déposez votre fichier CSV / Excel ici</h3>
        <div class="hint">ou cliquez pour parcourir · CSV, TSV, TXT — Uber Eats ou autres plateformes</div>
        <input type="file" id="fileInput" style="display:none" accept=".csv,.tsv,.txt"/>
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
    const reader = new FileReader()
    reader.onload = async () => {
      pendingCsv = reader.result
      pendingFilename = file.name
      try {
        const { data } = await api.post(baseEndpoint.replace('/imports', '/imports/preview').replace('/admin/admin', '/admin'), { csv: pendingCsv })
        renderPreview(data, file.name)
      } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error') }
    }
    reader.readAsText(file)
  }

  function renderPreview(data, filename) {
    const box = c.querySelector('#previewBox')
    box.innerHTML = `
      <div class="card mt-3" style="background:var(--slate-50)">
        <div class="card-title"><i class="fas fa-magnifying-glass-chart"></i> Aperçu — ${escapeHtml(filename)}</div>
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
      try {
        const { data: r } = await api.post(baseEndpoint, { marque_id: parseInt(marque_id), csv: pendingCsv, nom_fichier: pendingFilename, mapping })
        toast(`Import OK : ${r.nb_importees} commandes / ${r.nb_doublons} doublons / ${r.nb_erreurs} erreurs`)
        navigate(isAdmin ? 'imports' : 'a-imports')
      } catch (err) { toast(err.response?.data?.error || 'Erreur d\'import', 'error') }
    }
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
  const [me, com] = await Promise.all([
    api.get('/agent/me'),
    api.get(`/agent/commissions?annee=${annee}&mois=${mois}`)
  ])
  const u = me.data.user, s = me.data.stats, d = com.data.detail
  const reste = me.data.reste_avant_portefeuille
  const myRestos = s.nb_restaurants_propres
  const palier = 5
  const filledSteps = (myRestos % palier)

  c.innerHTML = `
    <div class="page-header">
      <div><h1>Bonjour ${escapeHtml(u.prenom)} 👋</h1>
        <div class="subtitle">${niveauLabel(u.niveau)}${u.parent_nom ? ' · Rattaché à ' + escapeHtml(u.parent_prenom + ' ' + u.parent_nom) : ''}</div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card primary"><div class="stat-label">Mes commissions du mois</div><div class="stat-value">${fmtEUR(d.total)}</div><div class="stat-extra">${monthsFR[mois-1]} ${annee}</div></div>
      <div class="stat-card accent"><div class="stat-label">Mes restaurants directs</div><div class="stat-value">${s.nb_restaurants_propres}</div><div class="stat-extra">${s.nb_marques} marques · ${s.nb_restaurants} dans ma branche</div></div>
      <div class="stat-card gold"><div class="stat-label">Sous-agents</div><div class="stat-value">${s.nb_sous_agents}</div></div>
      <div class="stat-card info"><div class="stat-label">Statut paiement</div><div class="stat-value" style="font-size:1.1rem">${com.data.paiement_existant ? (com.data.paiement_existant.statut === 'paye' ? '<span class="text-success"><i class="fas fa-check-circle"></i> Payé</span>' : '<span class="text-danger">En attente</span>') : '<span class="text-muted">Non traité</span>'}</div></div>
    </div>
    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-crown"></i> Progression Portefeuille Propriétaire</div>
      <p class="text-muted" style="font-size:.9rem">Tous les <strong>5 restaurants</strong> que vous apportez, le 5e (puis le 10e, 15e…) vous appartient à <strong>100%</strong> : vous touchez l'intégralité de la commission DropEat sur ses commandes.</p>
      <div class="flex gap-3" style="align-items:center">
        <div style="flex:1">
          <div class="portfolio-progress">
            ${[1,2,3,4,5].map(i => `<div class="step ${filledSteps >= i ? (i === 5 ? 'gold' : 'filled') : ''}"></div>`).join('')}
          </div>
          <div class="text-muted mt-2" style="font-size:.85rem">${myRestos} restaurant${myRestos > 1 ? 's' : ''} apporté${myRestos > 1 ? 's' : ''} · ${reste === palier ? 'Le prochain compte pour le palier suivant' : `Plus que <strong>${reste}</strong> avant votre prochain Portefeuille 🎁`}</div>
        </div>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-title"><i class="fas fa-coins"></i> Détail commissions du mois</div>
      <table class="data-table">
        <tbody>
          <tr><td><i class="fas fa-store"></i> Mes ventes (clients standards)</td><td class="text-right">${d.nb_commandes_propres} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_propre)}</strong></td></tr>
          <tr><td><i class="fas fa-crown" style="color:var(--gold)"></i> Mes ventes (Portefeuille Propriétaire — 100%)</td><td class="text-right">${d.nb_commandes_portefeuille} cmds</td><td class="text-right"><strong class="text-success">${fmtEUR(d.commission_portefeuille)}</strong></td></tr>
          <tr><td><i class="fas fa-user-plus"></i> Sur ventes de mes sous-agents directs</td><td class="text-right">${d.nb_commandes_n1} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_n1)}</strong></td></tr>
          <tr><td><i class="fas fa-users"></i> Sur ventes de mes sous-sous-agents</td><td class="text-right">${d.nb_commandes_n2} cmds</td><td class="text-right"><strong>${fmtEUR(d.commission_n2)}</strong></td></tr>
          <tr style="background:var(--primary-light)"><td><strong>TOTAL DU MOIS</strong></td><td></td><td class="text-right"><strong style="font-size:1.2rem;color:var(--primary-dark)">${fmtEUR(d.total)}</strong></td></tr>
        </tbody>
      </table>
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
  const { data } = await api.get('/agent/sous-agents')
  c.innerHTML = `
    <div class="page-header">
      <div><h1>Mes sous-agents</h1><div class="subtitle">${data.sous_agents.length} personne(s) dans votre branche</div></div>
    </div>
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
      </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted">Aucun sous-agent. Demandez à l\'administrateur de créer des sous-agents rattachés à vous.</td></tr>'}</tbody>
    </table></div>
    <div class="card mt-3" style="background:var(--info-light)">
      <p style="margin:0"><i class="fas fa-circle-info"></i> Pour ajouter un sous-agent à votre branche, contactez votre administrateur DropEat™.</p>
    </div>`
}

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

// ===== Bootstrap =====
bootstrap()
