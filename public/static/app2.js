// ====================================
// Pages : Marques, Imports CSV, Commissions, Paiements, Paliers
// ====================================

// ====================================
// PAGE: MARQUES (vue globale)
// ====================================
async function renderMarques() {
  const { data } = await API.get('/restaurants/marques/all');
  const marques = data.marques;

  $('#page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Toutes les marques virtuelles</h2>
        <p class="text-slate-500 text-sm">Vue globale de toutes les marques sur Uber Eats</p>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Marque</th>
          <th>Restaurant</th>
          <th>Agent</th>
          <th>ID Uber</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${marques.length === 0 ? '<tr><td colspan="5" class="text-center text-slate-400 py-8">Aucune marque virtuelle. Créez-en depuis la page Restaurants.</td></tr>' :
          marques.map(m => `
            <tr>
              <td class="font-medium">${escapeHtml(m.nom)}</td>
              <td>${escapeHtml(m.restaurant_nom)}</td>
              <td class="text-slate-500">${m.agent_nom ? `${escapeHtml(m.agent_prenom)} ${escapeHtml(m.agent_nom)}` : '—'}</td>
              <td class="text-slate-500 text-xs">${escapeHtml(m.uber_store_id || '')}</td>
              <td>${m.actif ? '<span class="badge badge-green">Actif</span>' : '<span class="badge badge-gray">Inactif</span>'}</td>
            </tr>
          `).join('')}
      </tbody>
    </table>
  `;
}

// ====================================
// PAGE: IMPORTS CSV
// ====================================
async function renderImports() {
  const [{ data: marquesData }, { data: importsData }] = await Promise.all([
    API.get('/restaurants/marques/all'),
    API.get('/imports')
  ]);

  $('#page-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900">Import CSV Uber Eats</h2>
      <p class="text-slate-500 text-sm">Importez les fichiers CSV exportés depuis Uber Eats pour chaque marque virtuelle</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Zone d'import -->
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-semibold mb-4">Nouvel import</h3>
        <form id="importForm" class="space-y-4">
          <div>
            <label class="form-label">Marque virtuelle *</label>
            <select class="form-input" name="marque_id" id="importMarque" required>
              <option value="">— Sélectionner —</option>
              ${marquesData.marques.map(m => `<option value="${m.id}">${escapeHtml(m.restaurant_nom)} → ${escapeHtml(m.nom)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Fichier CSV *</label>
            <div class="drop-area" id="dropArea">
              <i class="fas fa-cloud-upload-alt text-3xl text-slate-400 mb-2"></i>
              <p class="text-sm text-slate-600">Cliquez ou glissez votre fichier CSV ici</p>
              <p class="text-xs text-slate-400 mt-1" id="fileName"></p>
              <input type="file" id="csvFile" accept=".csv,text/csv" style="display:none">
            </div>
          </div>
          <div id="previewArea" class="hidden">
            <h4 class="font-semibold text-sm mb-2">Aperçu et mapping des colonnes</h4>
            <div id="previewContent"></div>
          </div>
          <button type="submit" class="btn btn-primary w-full" disabled id="importBtn">
            <i class="fas fa-file-import"></i> Importer
          </button>
        </form>
      </div>

      <!-- Aide -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 class="font-semibold mb-3 text-blue-900"><i class="fas fa-info-circle"></i> Comment ça marche ?</h3>
        <ol class="list-decimal list-inside space-y-2 text-sm text-blue-800">
          <li>Exportez le CSV des commandes depuis votre tableau de bord Uber Eats Manager</li>
          <li>Faites-le pour chaque marque virtuelle séparément</li>
          <li>Sélectionnez la marque correspondante ci-contre</li>
          <li>Glissez le fichier - les colonnes seront détectées automatiquement</li>
          <li>Vérifiez le mapping et cliquez sur Importer</li>
        </ol>
        <div class="mt-4 text-xs text-blue-700 bg-blue-100 p-3 rounded">
          <strong>Détection auto :</strong> ID commande, date, montant total, frais Uber, montant net, statut.
          <br>Les doublons (même ID Uber) sont automatiquement ignorés.
        </div>
      </div>
    </div>

    <!-- Historique des imports -->
    <div class="bg-white rounded-xl border border-slate-200 p-5">
      <h3 class="font-semibold mb-4">Historique des imports</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Restaurant / Marque</th><th>Fichier</th><th>Période</th>
            <th class="text-right">Lignes</th><th class="text-right">Importées</th><th class="text-right">Doublons</th>
            <th class="text-right">Montant</th><th>Statut</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${importsData.imports.length === 0 ? '<tr><td colspan="10" class="text-center text-slate-400 py-8">Aucun import</td></tr>' :
            importsData.imports.map(i => `
              <tr>
                <td class="text-slate-500 text-xs">${fmtDateTime(i.created_at)}</td>
                <td><div class="font-medium">${escapeHtml(i.restaurant_nom)}</div><div class="text-xs text-slate-500">${escapeHtml(i.marque_nom)}</div></td>
                <td class="text-xs text-slate-500">${escapeHtml(i.nom_fichier || '')}</td>
                <td class="text-xs">${fmtDate(i.periode_debut)} → ${fmtDate(i.periode_fin)}</td>
                <td class="text-right">${fmtNum(i.nb_lignes)}</td>
                <td class="text-right text-green-600 font-medium">${fmtNum(i.nb_lignes_importees)}</td>
                <td class="text-right text-yellow-600">${fmtNum(i.nb_doublons)}</td>
                <td class="text-right font-medium">${fmtEUR(i.montant_total)}</td>
                <td>${i.statut === 'complete' ? '<span class="badge badge-green">OK</span>' : i.statut === 'partiel' ? '<span class="badge badge-yellow">Partiel</span>' : '<span class="badge badge-red">Erreur</span>'}</td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteImport(${i.id})"><i class="fas fa-trash"></i></button></td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;

  setupImportForm();
}

let importCsvContent = null;
let importDetected = null;
let importHeaders = null;

function setupImportForm() {
  const dropArea = $('#dropArea');
  const fileInput = $('#csvFile');

  dropArea.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
  dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  $('#importForm').addEventListener('submit', doImport);
}

async function handleFile(file) {
  $('#fileName').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
  const text = await file.text();
  importCsvContent = text;
  $('#importForm').dataset.fileName = file.name;

  // Preview
  try {
    const { data } = await API.post('/imports/preview', { csv: text });
    importDetected = data.detected;
    importHeaders = data.headers;
    renderPreview(data);
    $('#importBtn').disabled = false;
  } catch (err) {
    toast('Erreur lecture CSV: ' + (err.response?.data?.error || err.message), 'error');
  }
}

function renderPreview(data) {
  const area = $('#previewArea');
  area.classList.remove('hidden');
  const fields = [
    { key: 'order_id', label: 'ID commande' },
    { key: 'date', label: 'Date *' },
    { key: 'total', label: 'Montant total' },
    { key: 'uber_fee', label: 'Frais Uber' },
    { key: 'net', label: 'Montant net (base commission) *' },
    { key: 'status', label: 'Statut' }
  ];

  $('#previewContent').innerHTML = `
    <div class="space-y-2 mb-3">
      ${fields.map(f => `
        <div class="flex items-center gap-2">
          <label class="text-xs text-slate-600 w-44">${f.label}</label>
          <select class="form-input flex-1 text-xs" data-mapping="${f.key}">
            <option value="">— Aucun —</option>
            ${data.headers.map(h => `<option value="${escapeHtml(h)}" ${data.detected[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
    <details class="text-xs text-slate-600">
      <summary class="cursor-pointer">Aperçu des données (${data.nb_lignes} lignes au total)</summary>
      <div class="mt-2 max-h-48 overflow-auto border rounded">
        <table class="text-xs w-full">
          <thead class="bg-slate-100"><tr>${data.headers.map(h => `<th class="p-1 text-left">${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${data.apercu.map(row => `<tr>${data.headers.map(h => `<td class="p-1 border-t">${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

async function doImport(e) {
  e.preventDefault();
  const marque_id = $('#importMarque').value;
  if (!marque_id || !importCsvContent) return toast('Sélectionnez une marque et un fichier', 'error');

  const mapping = {};
  $$('[data-mapping]').forEach(s => { mapping[s.dataset.mapping] = s.value || null; });

  $('#importBtn').disabled = true;
  $('#importBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Import en cours...';

  try {
    const fileName = $('#importForm').dataset.fileName || 'import.csv';
    const { data } = await API.post('/imports', {
      marque_id: parseInt(marque_id),
      csv: importCsvContent,
      nom_fichier: fileName,
      mapping
    });
    toast(`${data.nb_importees} commandes importées (${data.nb_doublons} doublons, ${data.nb_erreurs} erreurs)`);
    importCsvContent = null;
    navigate('imports');
  } catch (err) {
    toast(err.response?.data?.error || err.message, 'error');
    $('#importBtn').disabled = false;
    $('#importBtn').innerHTML = '<i class="fas fa-file-import"></i> Importer';
  }
}

window.deleteImport = async function(id) {
  if (!confirmDialog('Supprimer cet import et toutes ses commandes ?')) return;
  await API.delete(`/imports/${id}`);
  toast('Import supprimé');
  navigate('imports');
};

// ====================================
// PAGE: COMMISSIONS
// ====================================
async function renderCommissions() {
  const { annee, mois } = state.periode;
  const { data } = await API.get(`/commissions/recap?annee=${annee}&mois=${mois}`);
  const t = data.totaux;

  $('#page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Commissions</h2>
        <p class="text-slate-500 text-sm">Calcul automatique selon les paliers configurés</p>
      </div>
      <div class="flex gap-2">
        ${renderPeriodeSelector()}
      </div>
    </div>

    <!-- Totaux -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <div class="stat-card">
        <div class="text-xs text-slate-500">Restaurants actifs</div>
        <div class="text-xl font-bold">${fmtNum(t.nb_restaurants)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-slate-500">CA Net total</div>
        <div class="text-xl font-bold">${fmtEUR(t.ca_net)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-slate-500">Comm. Entreprise</div>
        <div class="text-xl font-bold text-blue-600">${fmtEUR(t.commission_entreprise)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-slate-500">Comm. Agents N1</div>
        <div class="text-xl font-bold text-purple-600">${fmtEUR(t.commission_agent)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-slate-500">Comm. N2 + N3</div>
        <div class="text-xl font-bold text-orange-600">${fmtEUR(t.commission_sous_agent + t.commission_sous_sous_agent)}</div>
      </div>
      <div class="stat-card">
        <div class="text-xs text-slate-500">Marge finale</div>
        <div class="text-xl font-bold text-green-600">${fmtEUR(t.marge_finale)}</div>
      </div>
    </div>

    <!-- Onglets -->
    <div class="flex gap-2 mb-4 border-b border-slate-200">
      <button class="tab-btn px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium" data-tab="restaurants" onclick="setCommTab('restaurants')">
        Par restaurant
      </button>
      <button class="tab-btn px-4 py-2 text-slate-500" data-tab="agents" onclick="setCommTab('agents')">
        Par agent (à payer)
      </button>
    </div>

    <div id="commContent"></div>
  `;

  setCommTab('restaurants');
}

function renderPeriodeSelector() {
  const { annee, mois } = state.periode;
  const annees = [];
  for (let y = new Date().getFullYear(); y >= 2022; y--) annees.push(y);
  return `
    <select class="form-input" onchange="changePeriode('mois', this.value)">
      ${MOIS.map((m, i) => `<option value="${i+1}" ${mois === i+1 ? 'selected' : ''}>${m}</option>`).join('')}
    </select>
    <select class="form-input" onchange="changePeriode('annee', this.value)">
      ${annees.map(y => `<option value="${y}" ${annee === y ? 'selected' : ''}>${y}</option>`).join('')}
    </select>
  `;
}

window.changePeriode = function(field, val) {
  state.periode[field] = parseInt(val);
  navigate(state.currentPage);
};

window.setCommTab = async function(tab) {
  $$('.tab-btn').forEach(b => {
    if (b.dataset.tab === tab) {
      b.classList.add('border-b-2', 'border-blue-600', 'text-blue-600', 'font-medium');
      b.classList.remove('text-slate-500');
    } else {
      b.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600', 'font-medium');
      b.classList.add('text-slate-500');
    }
  });

  const { annee, mois } = state.periode;
  const container = $('#commContent');

  if (tab === 'restaurants') {
    container.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
    const { data } = await API.get(`/commissions/recap?annee=${annee}&mois=${mois}`);
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Restaurant</th>
            <th>Agent</th>
            <th class="text-right">Cmd</th>
            <th class="text-right">CA Net</th>
            <th class="text-right">Comm. Entreprise</th>
            <th class="text-right">Comm. Agent</th>
            <th class="text-right">Comm. Sous-Agent</th>
            <th class="text-right">Comm. N3</th>
            <th class="text-right">Marge</th>
          </tr>
        </thead>
        <tbody>
          ${data.restaurants.length === 0 ? '<tr><td colspan="9" class="text-center text-slate-400 py-8">Aucune commande sur cette période</td></tr>' :
            data.restaurants.map(r => `
              <tr>
                <td class="font-medium">${escapeHtml(r.restaurant_nom)}</td>
                <td class="text-xs">
                  ${r.hierarchy.agent ? `<div>${escapeHtml(r.hierarchy.agent.prenom)} ${escapeHtml(r.hierarchy.agent.nom)}</div>` : '<span class="text-slate-400">—</span>'}
                  ${r.hierarchy.sous_agent ? `<div class="text-purple-600">↳ ${escapeHtml(r.hierarchy.sous_agent.prenom)} ${escapeHtml(r.hierarchy.sous_agent.nom)}</div>` : ''}
                  ${r.hierarchy.sous_sous_agent ? `<div class="text-orange-600">↳↳ ${escapeHtml(r.hierarchy.sous_sous_agent.prenom)} ${escapeHtml(r.hierarchy.sous_sous_agent.nom)}</div>` : ''}
                </td>
                <td class="text-right">${fmtNum(r.nb_commandes)}</td>
                <td class="text-right font-medium">${fmtEUR(r.ca_net)}</td>
                <td class="text-right text-blue-600 font-medium">${fmtEUR(r.commission_entreprise)}</td>
                <td class="text-right text-purple-600">${fmtEUR(r.commission_agent)}</td>
                <td class="text-right text-orange-600">${fmtEUR(r.commission_sous_agent)}</td>
                <td class="text-right text-yellow-600">${fmtEUR(r.commission_sous_sous_agent)}</td>
                <td class="text-right text-green-600 font-bold">${fmtEUR(r.marge_entreprise_finale)}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;
  } else {
    container.innerHTML = '<div class="flex justify-center py-8"><div class="spinner"></div></div>';
    const { data } = await API.get(`/commissions/agents?annee=${annee}&mois=${mois}`);
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Niveau</th>
            <th>Détail</th>
            <th class="text-right">Total à payer</th>
            <th>Statut paiement</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${data.agents.length === 0 ? '<tr><td colspan="6" class="text-center text-slate-400 py-8">Aucune commission à payer</td></tr>' :
            data.agents.map(a => `
              <tr>
                <td class="font-medium">${escapeHtml(a.prenom)} ${escapeHtml(a.nom)}</td>
                <td><span class="badge ${NIVEAU_BADGE[a.niveau]}">${NIVEAU_LABEL[a.niveau]}</span></td>
                <td class="text-xs">
                  <details>
                    <summary class="cursor-pointer text-slate-500">${a.details.length} ligne(s)</summary>
                    <div class="mt-1 space-y-1">
                      ${a.details.map(d => `<div>• ${escapeHtml(d.restaurant)} (${d.type}) → ${fmtEUR(d.montant)}</div>`).join('')}
                    </div>
                  </details>
                </td>
                <td class="text-right font-bold text-lg">${fmtEUR(a.total_a_payer)}</td>
                <td>
                  ${a.paiement_existant
                    ? (a.paiement_existant.statut === 'paye'
                        ? '<span class="badge badge-green"><i class="fas fa-check"></i> Payé</span>'
                        : '<span class="badge badge-yellow">En attente</span>')
                    : '<span class="badge badge-gray">Non créé</span>'}
                </td>
                <td class="text-right">
                  ${a.paiement_existant && a.paiement_existant.statut === 'paye'
                    ? `<button class="btn btn-sm btn-secondary" onclick="generePaiement(${a.agent_id}, ${a.total_a_payer})"><i class="fas fa-sync"></i> Régénérer</button>`
                    : `<button class="btn btn-sm btn-primary" onclick="generePaiement(${a.agent_id}, ${a.total_a_payer})">
                        <i class="fas fa-file-invoice"></i> Créer paiement
                      </button>`
                  }
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    `;
  }
};

window.generePaiement = async function(agent_id, montant) {
  const { annee, mois } = state.periode;
  if (!confirmDialog(`Créer un paiement de ${fmtEUR(montant)} pour ${MOIS[mois-1]} ${annee} ?`)) return;
  try {
    await API.post('/paiements', {
      agent_id,
      periode_mois: mois,
      periode_annee: annee,
      montant,
      statut: 'en_attente'
    });
    toast('Paiement créé');
    setCommTab('agents');
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ====================================
// PAGE: PAIEMENTS
// ====================================
async function renderPaiements() {
  const { annee, mois } = state.periode;
  const { data } = await API.get(`/paiements?annee=${annee}&mois=${mois}`);

  let total_du = 0, total_paye = 0;
  data.paiements.forEach(p => {
    if (p.statut === 'paye') total_paye += p.montant;
    else if (p.statut === 'en_attente') total_du += p.montant;
  });

  $('#page-content').innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">Paiements aux agents</h2>
        <p class="text-slate-500 text-sm">Suivi des paiements de commissions</p>
      </div>
      <div class="flex gap-2">${renderPeriodeSelector()}</div>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="stat-card">
        <div class="text-sm text-slate-500">À payer (en attente)</div>
        <div class="text-2xl font-bold text-yellow-600">${fmtEUR(total_du)}</div>
      </div>
      <div class="stat-card">
        <div class="text-sm text-slate-500">Déjà payé</div>
        <div class="text-2xl font-bold text-green-600">${fmtEUR(total_paye)}</div>
      </div>
      <div class="stat-card">
        <div class="text-sm text-slate-500">Total période</div>
        <div class="text-2xl font-bold">${fmtEUR(total_du + total_paye)}</div>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Agent</th>
          <th>Niveau</th>
          <th>Période</th>
          <th class="text-right">Montant</th>
          <th>Statut</th>
          <th>Date paiement</th>
          <th>Méthode</th>
          <th>Référence</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${data.paiements.length === 0 ? '<tr><td colspan="9" class="text-center text-slate-400 py-8">Aucun paiement. Créez-les depuis la page <a href="#" onclick="navigate(\'commissions\')" class="text-blue-600 underline">Commissions</a>.</td></tr>' :
          data.paiements.map(p => `
            <tr>
              <td class="font-medium">${escapeHtml(p.agent_prenom)} ${escapeHtml(p.agent_nom)}</td>
              <td><span class="badge ${NIVEAU_BADGE[p.agent_niveau]}">${NIVEAU_LABEL[p.agent_niveau]}</span></td>
              <td>${MOIS[p.periode_mois-1]} ${p.periode_annee}</td>
              <td class="text-right font-bold">${fmtEUR(p.montant)}</td>
              <td>
                ${p.statut === 'paye' ? '<span class="badge badge-green"><i class="fas fa-check"></i> Payé</span>' :
                  p.statut === 'annule' ? '<span class="badge badge-red">Annulé</span>' :
                  '<span class="badge badge-yellow">En attente</span>'}
              </td>
              <td class="text-slate-500">${fmtDate(p.date_paiement)}</td>
              <td class="text-slate-500">${escapeHtml(p.methode || '')}</td>
              <td class="text-slate-500 text-xs">${escapeHtml(p.reference || '')}</td>
              <td class="text-right whitespace-nowrap">
                ${p.statut !== 'paye' ? `<button class="btn btn-sm btn-success" onclick="markPaye(${p.id})"><i class="fas fa-check"></i> Marquer payé</button>` : ''}
                <button class="btn btn-sm btn-secondary" onclick="editPaiement(${p.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deletePaiement(${p.id})"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `).join('')}
      </tbody>
    </table>
  `;
}

window.markPaye = async function(id) {
  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">Marquer comme payé</h3>
      <form id="payForm" class="space-y-4">
        <div>
          <label class="form-label">Date du paiement</label>
          <input class="form-input" name="date_paiement" type="date" value="${new Date().toISOString().substring(0,10)}" required>
        </div>
        <div>
          <label class="form-label">Méthode</label>
          <select class="form-input" name="methode">
            <option value="virement">Virement</option>
            <option value="especes">Espèces</option>
            <option value="paypal">PayPal</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div>
          <label class="form-label">Référence</label>
          <input class="form-input" name="reference" placeholder="Ex: VIR-2024-001">
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-success"><i class="fas fa-check"></i> Confirmer</button>
        </div>
      </form>
    </div>
  `);

  $('#payForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.post(`/paiements/${id}/pay`, {
      date_paiement: fd.get('date_paiement'),
      methode: fd.get('methode'),
      reference: fd.get('reference')
    });
    toast('Paiement enregistré');
    closeModal();
    navigate('paiements');
  });
};

window.editPaiement = async function(id) {
  const { data } = await API.get(`/paiements?`);
  const p = data.paiements.find(x => x.id === id);
  if (!p) return;

  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">Modifier le paiement</h3>
      <form id="editForm" class="space-y-4">
        <div>
          <label class="form-label">Montant</label>
          <input class="form-input" name="montant" type="number" step="0.01" value="${p.montant}" required>
        </div>
        <div>
          <label class="form-label">Statut</label>
          <select class="form-input" name="statut">
            <option value="en_attente" ${p.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
            <option value="paye" ${p.statut === 'paye' ? 'selected' : ''}>Payé</option>
            <option value="annule" ${p.statut === 'annule' ? 'selected' : ''}>Annulé</option>
          </select>
        </div>
        <div>
          <label class="form-label">Date paiement</label>
          <input class="form-input" name="date_paiement" type="date" value="${p.date_paiement || ''}">
        </div>
        <div>
          <label class="form-label">Méthode</label>
          <input class="form-input" name="methode" value="${escapeHtml(p.methode || '')}">
        </div>
        <div>
          <label class="form-label">Référence</label>
          <input class="form-input" name="reference" value="${escapeHtml(p.reference || '')}">
        </div>
        <div>
          <label class="form-label">Notes</label>
          <textarea class="form-input" name="notes" rows="2">${escapeHtml(p.notes || '')}</textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `);

  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await API.put(`/paiements/${id}`, {
      montant: parseFloat(fd.get('montant')),
      statut: fd.get('statut'),
      date_paiement: fd.get('date_paiement') || null,
      methode: fd.get('methode') || null,
      reference: fd.get('reference') || null,
      notes: fd.get('notes') || null
    });
    toast('Paiement modifié');
    closeModal();
    navigate('paiements');
  });
};

window.deletePaiement = async function(id) {
  if (!confirmDialog('Supprimer ce paiement ?')) return;
  await API.delete(`/paiements/${id}`);
  toast('Paiement supprimé');
  navigate('paiements');
};

// ====================================
// PAGE: PALIERS
// ====================================
async function renderPaliers() {
  const { data } = await API.get('/paliers');
  state.paliers = data.paliers;

  const renderTable = (type, label, color) => {
    const list = data.paliers[type] || [];
    return `
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold ${color}"><i class="fas fa-layer-group"></i> ${label}</h3>
          <button class="btn btn-sm btn-primary" onclick="openPalierModal('${type}')">
            <i class="fas fa-plus"></i> Ajouter palier
          </button>
        </div>
        <table class="data-table">
          <thead>
            <tr><th>Tranche (CA mensuel)</th><th class="text-right">Taux</th><th>Mode</th><th class="text-right"></th></tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="4" class="text-center text-slate-400 py-4">Aucun palier configuré</td></tr>' :
              list.map(p => `
                <tr>
                  <td>${fmtEUR(p.seuil_min)} → ${p.seuil_max ? fmtEUR(p.seuil_max) : '∞'}</td>
                  <td class="text-right font-bold">${p.taux}%</td>
                  <td><span class="badge badge-gray">${p.mode}</span></td>
                  <td class="text-right whitespace-nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="openPalierModal('${type}', ${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deletePalier(${p.id})"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  $('#page-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-900">Paliers de commission</h2>
      <p class="text-slate-500 text-sm">Configurez les taux par tranche de CA mensuel. Le calcul est progressif (style tranches d'imposition).</p>
    </div>

    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
      <p class="font-semibold mb-1"><i class="fas fa-info-circle"></i> Logique de calcul</p>
      <p>1. <strong>Commission Entreprise</strong> = appliquée au CA Net mensuel du restaurant (après frais Uber)</p>
      <p>2. <strong>Commission Agent / Sous-agent / Sous-sous-agent</strong> = appliquée à la commission Entreprise</p>
      <p>3. La <strong>marge finale</strong> = Comm. Entreprise - (Comm. Agent + Sous-agent + Sous-sous-agent)</p>
      <p class="mt-2 text-xs">⚠️ Vérifiez que la somme des taux Agent + Sous-agent + Sous-sous-agent reste &lt; 100% pour conserver une marge.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${renderTable('entreprise', 'Entreprise (sur CA net)', 'text-blue-600')}
      ${renderTable('agent', 'Agent N1 (sur comm. entreprise)', 'text-purple-600')}
      ${renderTable('sous_agent', 'Sous-agent N2 (sur comm. entreprise)', 'text-orange-600')}
      ${renderTable('sous_sous_agent', 'Sous-sous-agent N3 (sur comm. entreprise)', 'text-yellow-600')}
    </div>
  `;
}

window.openPalierModal = function(type, id = null) {
  const palier = id ? state.paliers[type]?.find(p => p.id === id) : null;
  showModal(`
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">${id ? 'Modifier' : 'Nouveau'} palier (${type})</h3>
      <form id="palierForm" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Seuil min (€)</label>
            <input class="form-input" name="seuil_min" type="number" step="0.01" value="${palier?.seuil_min ?? 0}" required>
          </div>
          <div>
            <label class="form-label">Seuil max (€) — vide = infini</label>
            <input class="form-input" name="seuil_max" type="number" step="0.01" value="${palier?.seuil_max ?? ''}">
          </div>
        </div>
        <div>
          <label class="form-label">Taux (%)</label>
          <input class="form-input" name="taux" type="number" step="0.01" value="${palier?.taux ?? ''}" required>
        </div>
        <div>
          <label class="form-label">Mode</label>
          <select class="form-input" name="mode">
            <option value="mensuel" ${palier?.mode === 'mensuel' ? 'selected' : ''}>Mensuel (reset chaque mois)</option>
            <option value="cumulatif" ${palier?.mode === 'cumulatif' ? 'selected' : ''}>Cumulatif</option>
          </select>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
        </div>
      </form>
    </div>
  `);

  $('#palierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      type,
      base: 'ca',
      mode: fd.get('mode'),
      seuil_min: parseFloat(fd.get('seuil_min')) || 0,
      seuil_max: fd.get('seuil_max') ? parseFloat(fd.get('seuil_max')) : null,
      taux: parseFloat(fd.get('taux'))
    };
    if (id) await API.put(`/paliers/${id}`, payload);
    else await API.post('/paliers', payload);
    toast('Palier enregistré');
    closeModal();
    navigate('paliers');
  });
};

window.deletePalier = async function(id) {
  if (!confirmDialog('Supprimer ce palier ?')) return;
  await API.delete(`/paliers/${id}`);
  toast('Palier supprimé');
  navigate('paliers');
};
