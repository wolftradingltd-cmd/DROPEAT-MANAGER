-- ============================================================
-- SCHÉMA DE BASE DE DONNÉES - SUIVI COMMISSIONS UBER EATS MLM
-- ============================================================

-- Table des agents (structure MLM hiérarchique : agent → sous-agent → sous-sous-agent)
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT UNIQUE,
  telephone TEXT,
  niveau INTEGER NOT NULL DEFAULT 1, -- 1=agent, 2=sous-agent, 3=sous-sous-agent
  parent_id INTEGER, -- agent parent dans la hiérarchie
  iban TEXT, -- pour le paiement des commissions
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_niveau ON agents(niveau);

-- Table des restaurants (snacks)
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  adresse TEXT,
  ville TEXT,
  telephone TEXT,
  email TEXT,
  agent_id INTEGER, -- agent qui a ramené ce restaurant
  date_signature DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurants_agent ON restaurants(agent_id);

-- Table des marques virtuelles (un restaurant peut avoir plusieurs marques)
CREATE TABLE IF NOT EXISTS marques_virtuelles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  nom TEXT NOT NULL,
  uber_store_id TEXT, -- identifiant Uber Eats si disponible
  date_lancement DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_marques_restaurant ON marques_virtuelles(restaurant_id);

-- Table des paliers de commission (configurable)
-- type: 'entreprise', 'agent', 'sous_agent', 'sous_sous_agent'
-- base: 'ca' (chiffre d'affaires) ou 'commandes' (nombre)
-- mode: 'mensuel' ou 'cumulatif'
CREATE TABLE IF NOT EXISTS paliers_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- entreprise / agent / sous_agent / sous_sous_agent
  base TEXT NOT NULL DEFAULT 'ca', -- ca / commandes
  mode TEXT NOT NULL DEFAULT 'mensuel', -- mensuel / cumulatif
  seuil_min REAL NOT NULL DEFAULT 0, -- seuil minimum (CA ou nb commandes)
  seuil_max REAL, -- NULL = infini
  taux REAL NOT NULL, -- pourcentage (ex: 5.5 pour 5.5%)
  ordre INTEGER NOT NULL DEFAULT 0,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_paliers_type ON paliers_commissions(type);

-- Table des commandes Uber Eats (importées via CSV)
CREATE TABLE IF NOT EXISTS commandes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  uber_order_id TEXT, -- ID de la commande chez Uber
  date_commande DATETIME NOT NULL,
  montant_brut REAL NOT NULL DEFAULT 0, -- total commande
  frais_uber REAL NOT NULL DEFAULT 0, -- commission Uber
  montant_net REAL NOT NULL DEFAULT 0, -- net pour le restaurant (base de calcul commissions)
  statut TEXT DEFAULT 'completee', -- completee / annulee / remboursee
  raw_data TEXT, -- JSON brut de la ligne CSV pour traçabilité
  import_id INTEGER, -- référence à l'import CSV
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  FOREIGN KEY (import_id) REFERENCES imports_csv(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commandes_marque ON commandes(marque_id);
CREATE INDEX IF NOT EXISTS idx_commandes_date ON commandes(date_commande);
CREATE INDEX IF NOT EXISTS idx_commandes_uber_id ON commandes(uber_order_id);

-- Table de suivi des imports CSV
CREATE TABLE IF NOT EXISTS imports_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  nom_fichier TEXT,
  periode_debut DATE,
  periode_fin DATE,
  nb_lignes INTEGER DEFAULT 0,
  nb_lignes_importees INTEGER DEFAULT 0,
  nb_doublons INTEGER DEFAULT 0,
  montant_total REAL DEFAULT 0,
  statut TEXT DEFAULT 'complete', -- complete / partiel / erreur
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE
);

-- Table des paiements de commissions (suivi des paiements aux agents)
CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL, -- 1-12
  periode_annee INTEGER NOT NULL,
  montant REAL NOT NULL,
  statut TEXT DEFAULT 'en_attente', -- en_attente / paye / annule
  date_paiement DATE,
  methode TEXT, -- virement / especes / autre
  reference TEXT, -- référence du paiement
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_paiements_agent ON paiements(agent_id);
CREATE INDEX IF NOT EXISTS idx_paiements_periode ON paiements(periode_annee, periode_mois);

-- Table de configuration générale
CREATE TABLE IF NOT EXISTS config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
