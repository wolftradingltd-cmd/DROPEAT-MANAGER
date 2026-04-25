// ====================================
// Application principale - SPA Vanilla JS
// ====================================

const API = axios.create({ baseURL: '/api' });

// Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmtEUR = (n) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const fmtNum = (n) => (n ?? 0).toLocaleString('fr-FR');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR') : '';
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const NIVEAU_LABEL = { 1: 'Agent', 2: 'Sous-agent', 3: 'Sous-sous-agent' };
const NIVEAU_BADGE = { 1: 'badge-blue', 2: 'badge-purple', 3: 'badge-yellow' };

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function confirmDialog(msg) {
  return window.confirm(msg);
}

// ====================================
// État global
// ====================================
const state = {
  currentPage: 'dashboard',
  agents: [],
  restaurants: [],
  marques: [],
  paliers: { entreprise: [], agent: [], sous_agent: [], sous_sous_agent: [] },
  periode: {
    annee: new Date().getFullYear(),
    mois: new Date().getMonth() + 1
  }
};

// ====================================
// Layout principal
// ====================================
function renderLayout() {
  document.querySelector('#app').innerHTML = `
    <div class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="w-64 bg-slate-900 text-white p-4 flex flex-col">
        <div class="mb-6 px-2">
          <h1 class="text-lg font-bold flex items-center gap-2">
            <i class="fas fa-utensils text-orange-400"></i>
            UberCommissions
          </h1>
          <p class="text-xs text-slate-400 mt-1">Suivi MLM Uber Eats</p>
        </div>
        <nav class="flex flex-col gap-1 flex-1">
          <a class="sidebar-link" data-page="dashboard"><i class="fas fa-chart-line"></i> Dashboard</a>
          <a class="sidebar-link" data-page="agents"><i class="fas fa-users"></i> Agents (MLM)</a>
          <a class="sidebar-link" data-page="restaurants"><i class="fas fa-store"></i> Restaurants</a>
          <a class="sidebar-link" data-page="marques"><i class="fas fa-tags"></i> Marques virtuelles</a>
          <a class="sidebar-link" data-page="imports"><i class="fas fa-file-csv"></i> Import CSV</a>
          <a class="sidebar-link" data-page="commissions"><i class="fas fa-coins"></i> Commissions</a>
          <a class="sidebar-link" data-page="paiements"><i class="fas fa-money-bill-wave"></i> Paiements</a>
          <a class="sidebar-link" data-page="paliers"><i class="fas fa-layer-group"></i> Paliers</a>
        </nav>
        <div class="text-xs text-slate-500 px-2 mt-4 border-t border-slate-800 pt-4">
          v1.0.0 - Cloudflare D1
        </div>
      </aside>

      <!-- Main -->
      <main class="flex-1 overflow-x-hidden">
        <div id="page-content" class="p-6"></div>
      </main>
    </div>
  `;

  $$('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.page);
    });
  });
}

function setActiveNav(page) {
  $$('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
}

async function navigate(page) {
  state.currentPage = page;
  setActiveNav(page);
  const el = $('#page-content');
  el.innerHTML = '<div class="flex justify-center py-12"><div class="spinner"></div></div>';
  try {
    if (page === 'dashboard') await renderDashboard();
    else if (page === 'agents') await renderAgents();
    else if (page === 'restaurants') await renderRestaurants();
    else if (page === 'marques') await renderMarques();
    else if (page === 'imports') await renderImports();
    else if (page === 'commissions') await renderCommissions();
    else if (page === 'paiements') await renderPaiements();
    else if (page === 'paliers') await renderPaliers();
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded">Erreur: ${escapeHtml(e.message)}</div>`;
  }
}

// ====================================
// PAGE: DASHBOARD
// ====================================
async function renderDashboard() {
  const { data } = await API.get('/dashboard');
  const s = data.stats;

  $('#page-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900">Tableau de bord</h2>
      <p class="text-slate-500 text-sm">Vue d'ensemble de votre activité</p>
    </div>

    <!-- Stats globales -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="stat-card flex items-center gap-4">
        <div class="stat-card-icon bg-blue-100 text-blue-600"><i class="fas fa-users"></i></div>
        <div>
          <div class="text-sm text-slate-500">Agents actifs</div>
          <div class="text-2xl font-bold">${fmtNum(s.nb_agents)}</div>
          <div class="text-xs text-slate-400">${s.nb_agents_n1} N1 · ${s.nb_agents_n2} N2 · ${s.nb_agents_n3} N3</div>
        </div>
      </div>
      <div class="stat-card flex items-center gap-4">
        <div class="stat-card-icon bg-orange-100 text-orange-600"><i class="fas fa-store"></i></div>
        <div>
          <div class="text-sm text-slate-500">Restaurants</div>
          <div class="text-2xl font-bold">${fmtNum(s.nb_restaurants)}</div>
          <div class="text-xs text-slate-400">${s.nb_marques} marques virtuelles</div>
        </div>
      </div>
      <div class="stat-card flex items-center gap-4">
        <div class="stat-card-icon bg-green-100 text-green-600"><i class="fas fa-shopping-bag"></i></div>
        <div>
          <div class="text-sm text-slate-500">Commandes ce mois</div>
          <div class="text-2xl font-bold">${fmtNum(s.nb_commandes_mois)}</div>
          <div class="text-xs text-slate-400">${fmtNum(s.nb_commandes)} au total</div>
        </div>
      </div>
      <div class="stat-card flex items-center gap-4">
        <div class="stat-card-icon bg-purple-100 text-purple-600"><i class="fas fa-euro-sign"></i></div>
        <div>
          <div class="text-sm text-slate-500">CA ce mois</div>
          <div class="text-2xl font-bold">${fmtEUR(s.ca_mois_courant)}</div>
          <div class="text-xs text-slate-400">${fmtEUR(s.ca_total)} au total</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-semibold mb-4">Évolution du CA (6 derniers mois)</h3>
        <canvas id="evolutionChart" height="120"></canvas>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-semibold mb-4">Top 5 restaurants</h3>
        ${data.top_restaurants.length === 0 ? '<p class="text-slate-400 text-sm">Aucune donnée</p>' :
          `<table class="data-table"><thead><tr><th>Restaurant</th><th class="text-right">CA</th><th class="text-right">Commandes</th></tr></thead><tbody>
            ${data.top_restaurants.map(r => `
              <tr><td class="font-medium">${escapeHtml(r.nom)}</td><td class="text-right">${fmtEUR(r.ca)}</td><td class="text-right">${fmtNum(r.nb_commandes)}</td></tr>
            `).join('')}
          </tbody></table>`}
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="font-semibold mb-4">Top 5 agents (par CA généré)</h3>
      ${data.top_agents.length === 0 ? '<p class="text-slate-400 text-sm">Aucun agent</p>' :
        `<table class="data-table"><thead><tr><th>Agent</th><th>Niveau</th><th class="text-right">Restaurants</th><th class="text-right">CA généré</th></tr></thead><tbody>
          ${data.top_agents.map(a => `
            <tr>
              <td class="font-medium">${escapeHtml(a.prenom)} ${escapeHtml(a.nom)}</td>
              <td><span class="badge ${NIVEAU_BADGE[a.niveau]}">${NIVEAU_LABEL[a.niveau]}</span></td>
              <td class="text-right">${fmtNum(a.nb_restaurants)}</td>
              <td class="text-right">${fmtEUR(a.ca_total)}</td>
            </tr>
          `).join('')}
        </tbody></table>`}
    </div>
  `;

  // Chart
  if (data.evolution.length > 0) {
    const ctx = $('#evolutionChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.evolution.map(e => e.mois),
        datasets: [{
          label: 'CA (€)',
          data: data.evolution.map(e => e.ca),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('fr-FR') + ' €' } } }
      }
    });
  }
}

// ====================================
// PAGE: AGENTS
// ====================================
async function renderAgents() {
  const { data } = await API.get('/agents');
  state.agents = data.agents;

  $('#page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Agents (MLM)</h2>
        <p class="text-slate-500 text-sm">Gestion hiérarchique : Agents → Sous-agents → Sous-sous-agents</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="showAgentTree()">
          <i class="fas fa-sitemap"></i> Vue arbre
        </button>
        <button class="btn btn-primary" onclick="openAgentModal()">
          <i class="fas fa-plus"></i> Nouvel agent
        </button>
      </div>
    </div>

    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Niveau</th>
            <th>Parent</th>
            <th>Email</th>
            <th>Téléphone</th>
            <th class="text-right">Restaurants</th>
            <th class="text-right">Sous-agents</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.agents.length === 0 ? '<tr><td colspan="9" class="text-center text-slate-400 py-8">Aucun agent. Créez-en un pour commencer.</td></tr>' :
            state.agents.map(a => `
              <tr>
                <td class="font-medium">${escapeHtml(a.prenom)} ${escapeHtml(a.nom)}</td>
                <td><span class="badge ${NIVEAU_BADGE[a.niveau]}">${NIVEAU_LABEL[a.niveau]}</span></td>
                <td class="text-slate-500">${a.parent_nom ? `${escapeHtml(a.parent_prenom)} ${escapeHtml(a.parent_nom)}` : '—'}</td>
                <td class="text-slate-500">${escapeHtml(a.email || '')}</td>
                <td class="text-slate-500">${escapeHtml(a.telephone || '')}</td>
                <td class="text-right">${fmtNum(a.nb_restaurants)}</td>
                <td class="text-right">${fmtNum(a.nb_sous_agents)}</td>
                <td>${a.actif ? '<span class="badge badge-green">Actif</span>' : '<span class="badge badge-gray">Inactif</span>'}</td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn btn-sm btn-secondary" onclick="openAgentModal(${a.id})"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger" onclick="deleteAgent(${a.id})"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.openAgentModal = async function(id = null) {
  const agent = id ? state.agents.find(a => a.id === id) : null;
  // Parents possibles = agents actifs de niveau inférieur
  const parents = state.agents.filter(a => a.id !== id && a.actif);

  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">${id ? 'Modifier' : 'Nouvel'} agent</h3>
      <form id="agentForm" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Prénom *</label>
            <input class="form-input" name="prenom" value="${escapeHtml(agent?.prenom || '')}" required>
          </div>
          <div>
            <label class="form-label">Nom *</label>
            <input class="form-input" name="nom" value="${escapeHtml(agent?.nom || '')}" required>
          </div>
        </div>
        <div>
          <label class="form-label">Niveau hiérarchique *</label>
          <select class="form-input" name="niveau" id="niveauSelect" required>
            <option value="1" ${agent?.niveau === 1 ? 'selected' : ''}>1 - Agent commercial</option>
            <option value="2" ${agent?.niveau === 2 ? 'selected' : ''}>2 - Sous-agent</option>
            <option value="3" ${agent?.niveau === 3 ? 'selected' : ''}>3 - Sous-sous-agent</option>
          </select>
        </div>
        <div id="parentField" style="${agent?.niveau === 1 ? 'display:none' : ''}">
          <label class="form-label">Agent parent</label>
          <select class="form-input" name="parent_id">
            <option value="">— Aucun —</option>
            ${parents.map(p => `<option value="${p.id}" ${agent?.parent_id === p.id ? 'selected' : ''}>${escapeHtml(p.prenom)} ${escapeHtml(p.nom)} (${NIVEAU_LABEL[p.niveau]})</option>`).join('')}
          </select>
          <p class="text-xs text-slate-500 mt-1">Sous-agent = parent niveau 1 / Sous-sous-agent = parent niveau 2</p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Email</label>
            <input class="form-input" name="email" type="email" value="${escapeHtml(agent?.email || '')}">
          </div>
          <div>
            <label class="form-label">Téléphone</label>
            <input class="form-input" name="telephone" value="${escapeHtml(agent?.telephone || '')}">
          </div>
        </div>
        <div>
          <label class="form-label">IBAN (paiement commissions)</label>
          <input class="form-input" name="iban" value="${escapeHtml(agent?.iban || '')}">
        </div>
        <div>
          <label class="form-label">Notes</label>
          <textarea class="form-input" name="notes" rows="2">${escapeHtml(agent?.notes || '')}</textarea>
        </div>
        ${id ? `<label class="flex items-center gap-2"><input type="checkbox" name="actif" ${agent?.actif ? 'checked' : ''}> Actif</label>` : ''}
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `);

  $('#niveauSelect').addEventListener('change', (e) => {
    $('#parentField').style.display = e.target.value === '1' ? 'none' : '';
  });

  $('#agentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      nom: fd.get('nom'),
      prenom: fd.get('prenom'),
      niveau: parseInt(fd.get('niveau')),
      parent_id: fd.get('parent_id') ? parseInt(fd.get('parent_id')) : null,
      email: fd.get('email') || null,
      telephone: fd.get('telephone') || null,
      iban: fd.get('iban') || null,
      notes: fd.get('notes') || null,
      actif: id ? (fd.get('actif') ? 1 : 0) : 1
    };
    try {
      if (id) await API.put(`/agents/${id}`, payload);
      else await API.post('/agents', payload);
      toast('Agent enregistré');
      closeModal();
      navigate('agents');
    } catch (err) {
      toast(err.response?.data?.error || err.message, 'error');
    }
  });
};

window.deleteAgent = async function(id) {
  if (!confirmDialog('Supprimer cet agent ? Ses sous-agents seront détachés et ses restaurants resteront sans agent.')) return;
  try {
    await API.delete(`/agents/${id}`);
    toast('Agent supprimé');
    navigate('agents');
  } catch (err) { toast(err.message, 'error'); }
};

window.showAgentTree = async function() {
  const { data } = await API.get('/agents/tree');
  function renderTree(nodes, depth = 0) {
    if (!nodes.length) return '';
    return nodes.map(n => `
      <div class="${depth > 0 ? 'tree-node' : ''}">
        <div class="tree-node-content flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="badge ${NIVEAU_BADGE[n.niveau]}">${NIVEAU_LABEL[n.niveau]}</span>
            <span class="font-medium">${escapeHtml(n.prenom)} ${escapeHtml(n.nom)}</span>
            <span class="text-xs text-slate-500">${n.nb_restaurants} resto${n.nb_restaurants > 1 ? 's' : ''}</span>
          </div>
          <span class="text-xs text-slate-400">${escapeHtml(n.email || '')}</span>
        </div>
        ${renderTree(n.enfants, depth + 1)}
      </div>
    `).join('');
  }
  showModal(`
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold">Arbre hiérarchique des agents</h3>
        <button class="btn btn-secondary" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="max-h-[70vh] overflow-y-auto">
        ${data.tree.length === 0 ? '<p class="text-slate-400">Aucun agent</p>' : renderTree(data.tree)}
      </div>
    </div>
  `, 'large');
};

// ====================================
// PAGE: RESTAURANTS
// ====================================
async function renderRestaurants() {
  const [{ data: rData }, { data: aData }] = await Promise.all([
    API.get('/restaurants'),
    API.get('/agents')
  ]);
  state.restaurants = rData.restaurants;
  state.agents = aData.agents;

  $('#page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Restaurants / Snacks</h2>
        <p class="text-slate-500 text-sm">Vos partenaires et l'agent qui les a ramenés</p>
      </div>
      <button class="btn btn-primary" onclick="openRestaurantModal()">
        <i class="fas fa-plus"></i> Nouveau restaurant
      </button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Ville</th>
          <th>Agent</th>
          <th>Date signature</th>
          <th class="text-right">Marques</th>
          <th>Statut</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.restaurants.length === 0 ? '<tr><td colspan="7" class="text-center text-slate-400 py-8">Aucun restaurant</td></tr>' :
          state.restaurants.map(r => `
            <tr>
              <td class="font-medium">${escapeHtml(r.nom)}</td>
              <td class="text-slate-500">${escapeHtml(r.ville || '')}</td>
              <td>${r.agent_nom ? `${escapeHtml(r.agent_prenom)} ${escapeHtml(r.agent_nom)}` : '<span class="text-slate-400">—</span>'}</td>
              <td class="text-slate-500">${fmtDate(r.date_signature)}</td>
              <td class="text-right">${fmtNum(r.nb_marques)}</td>
              <td>${r.actif ? '<span class="badge badge-green">Actif</span>' : '<span class="badge badge-gray">Inactif</span>'}</td>
              <td class="text-right whitespace-nowrap">
                <button class="btn btn-sm btn-secondary" onclick="openRestaurantDetail(${r.id})" title="Voir / gérer marques"><i class="fas fa-tags"></i></button>
                <button class="btn btn-sm btn-secondary" onclick="openRestaurantModal(${r.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteRestaurant(${r.id})"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>
  `;
}

window.openRestaurantModal = function(id = null) {
  const r = id ? state.restaurants.find(x => x.id === id) : null;
  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">${id ? 'Modifier' : 'Nouveau'} restaurant</h3>
      <form id="restoForm" class="space-y-4">
        <div>
          <label class="form-label">Nom *</label>
          <input class="form-input" name="nom" value="${escapeHtml(r?.nom || '')}" required>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Ville</label>
            <input class="form-input" name="ville" value="${escapeHtml(r?.ville || '')}">
          </div>
          <div>
            <label class="form-label">Téléphone</label>
            <input class="form-input" name="telephone" value="${escapeHtml(r?.telephone || '')}">
          </div>
        </div>
        <div>
          <label class="form-label">Adresse</label>
          <input class="form-input" name="adresse" value="${escapeHtml(r?.adresse || '')}">
        </div>
        <div>
          <label class="form-label">Email</label>
          <input class="form-input" name="email" type="email" value="${escapeHtml(r?.email || '')}">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Agent qui a ramené ce restaurant</label>
            <select class="form-input" name="agent_id">
              <option value="">— Aucun —</option>
              ${state.agents.map(a => `<option value="${a.id}" ${r?.agent_id === a.id ? 'selected' : ''}>${escapeHtml(a.prenom)} ${escapeHtml(a.nom)} (${NIVEAU_LABEL[a.niveau]})</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Date signature</label>
            <input class="form-input" name="date_signature" type="date" value="${r?.date_signature || ''}">
          </div>
        </div>
        <div>
          <label class="form-label">Notes</label>
          <textarea class="form-input" name="notes" rows="2">${escapeHtml(r?.notes || '')}</textarea>
        </div>
        ${id ? `<label class="flex items-center gap-2"><input type="checkbox" name="actif" ${r?.actif ? 'checked' : ''}> Actif</label>` : ''}
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `);

  $('#restoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      nom: fd.get('nom'),
      ville: fd.get('ville') || null,
      adresse: fd.get('adresse') || null,
      telephone: fd.get('telephone') || null,
      email: fd.get('email') || null,
      agent_id: fd.get('agent_id') ? parseInt(fd.get('agent_id')) : null,
      date_signature: fd.get('date_signature') || null,
      notes: fd.get('notes') || null,
      actif: id ? (fd.get('actif') ? 1 : 0) : 1
    };
    try {
      if (id) await API.put(`/restaurants/${id}`, payload);
      else await API.post('/restaurants', payload);
      toast('Restaurant enregistré');
      closeModal();
      navigate('restaurants');
    } catch (err) {
      toast(err.response?.data?.error || err.message, 'error');
    }
  });
};

window.deleteRestaurant = async function(id) {
  if (!confirmDialog('Supprimer ce restaurant ? Ses marques et commandes seront aussi supprimées.')) return;
  await API.delete(`/restaurants/${id}`);
  toast('Restaurant supprimé');
  navigate('restaurants');
};

window.openRestaurantDetail = async function(id) {
  const { data } = await API.get(`/restaurants/${id}`);
  const r = data.restaurant;
  const marques = data.marques;
  showModal(`
    <div class="p-6">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="text-lg font-bold">${escapeHtml(r.nom)}</h3>
          <p class="text-sm text-slate-500">${escapeHtml(r.ville || '')} · Agent: ${r.agent_nom ? escapeHtml(r.agent_prenom) + ' ' + escapeHtml(r.agent_nom) : '—'}</p>
        </div>
        <button class="btn btn-secondary" onclick="closeModal()"><i class="fas fa-times"></i></button>
      </div>

      <div class="flex justify-between items-center mb-3">
        <h4 class="font-semibold">Marques virtuelles (${marques.length})</h4>
        <button class="btn btn-sm btn-primary" onclick="openMarqueModal(${id})">
          <i class="fas fa-plus"></i> Ajouter une marque
        </button>
      </div>

      <table class="data-table">
        <thead>
          <tr><th>Nom</th><th>ID Uber</th><th class="text-right">Commandes</th><th class="text-right">CA total</th><th></th></tr>
        </thead>
        <tbody>
          ${marques.length === 0 ? '<tr><td colspan="5" class="text-center text-slate-400 py-4">Aucune marque virtuelle. Ajoutez-en une pour pouvoir importer les CSV Uber Eats.</td></tr>' :
            marques.map(m => `
              <tr>
                <td class="font-medium">${escapeHtml(m.nom)}</td>
                <td class="text-slate-500">${escapeHtml(m.uber_store_id || '')}</td>
                <td class="text-right">${fmtNum(m.nb_commandes)}</td>
                <td class="text-right">${fmtEUR(m.ca_total)}</td>
                <td class="text-right whitespace-nowrap">
                  <button class="btn btn-sm btn-secondary" onclick="openMarqueModal(${id}, ${m.id})"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger" onclick="deleteMarque(${m.id}, ${id})"><i class="fas fa-trash"></i></button>
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `, 'large');
};

window.openMarqueModal = async function(restaurantId, marqueId = null) {
  let marque = null;
  if (marqueId) {
    const { data } = await API.get(`/restaurants/${restaurantId}`);
    marque = data.marques.find(m => m.id === marqueId);
  }
  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">${marqueId ? 'Modifier' : 'Nouvelle'} marque virtuelle</h3>
      <form id="marqueForm" class="space-y-4">
        <div>
          <label class="form-label">Nom de la marque *</label>
          <input class="form-input" name="nom" value="${escapeHtml(marque?.nom || '')}" required placeholder="Ex: Pizza Express, Tacos Royal...">
        </div>
        <div>
          <label class="form-label">ID Uber Eats (optionnel)</label>
          <input class="form-input" name="uber_store_id" value="${escapeHtml(marque?.uber_store_id || '')}">
        </div>
        <div>
          <label class="form-label">Date de lancement</label>
          <input class="form-input" name="date_lancement" type="date" value="${marque?.date_lancement || ''}">
        </div>
        <div>
          <label class="form-label">Notes</label>
          <textarea class="form-input" name="notes" rows="2">${escapeHtml(marque?.notes || '')}</textarea>
        </div>
        ${marqueId ? `<label class="flex items-center gap-2"><input type="checkbox" name="actif" ${marque?.actif ? 'checked' : ''}> Actif</label>` : ''}
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `);

  $('#marqueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      nom: fd.get('nom'),
      uber_store_id: fd.get('uber_store_id') || null,
      date_lancement: fd.get('date_lancement') || null,
      notes: fd.get('notes') || null,
      actif: marqueId ? (fd.get('actif') ? 1 : 0) : 1
    };
    try {
      if (marqueId) await API.put(`/restaurants/marques/${marqueId}`, payload);
      else await API.post(`/restaurants/${restaurantId}/marques`, payload);
      toast('Marque enregistrée');
      closeModal();
      openRestaurantDetail(restaurantId);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
};

window.deleteMarque = async function(marqueId, restaurantId) {
  if (!confirmDialog('Supprimer cette marque ? Toutes ses commandes seront aussi supprimées.')) return;
  await API.delete(`/restaurants/marques/${marqueId}`);
  toast('Marque supprimée');
  openRestaurantDetail(restaurantId);
};

// ====================================
// MODAL helpers
// ====================================
function showModal(html, size = '') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal';
  overlay.innerHTML = `<div class="modal-content ${size}">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
window.closeModal = function() {
  const m = $('#modal');
  if (m) m.remove();
};

// ====================================
// INIT
// ====================================
document.addEventListener('DOMContentLoaded', () => {
  renderLayout();
  navigate('dashboard');
});
