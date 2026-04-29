-- ============================================================
-- REFONTE COMPLÈTE - SYSTÈME DROPEAT™
-- ============================================================

-- Drop des anciennes tables (refonte complète)
DROP TABLE IF EXISTS paiements;
DROP TABLE IF EXISTS commandes;
DROP TABLE IF EXISTS imports_csv;
DROP TABLE IF EXISTS marques_virtuelles;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS paliers_commissions;
DROP TABLE IF EXISTS config;

-- ============================================================
-- UTILISATEURS (superadmin + agents)
-- ============================================================
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent', -- 'superadmin' / 'agent'
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  niveau INTEGER, -- NULL pour superadmin, 0=Agent commercial principal, 1=Sous-agent N1, 2=Sous-agent N2
  parent_id INTEGER, -- agent parent (pour MLM)
  iban TEXT,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  derniere_connexion DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_parent ON users(parent_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- SESSIONS (JWT-like avec table)
-- ============================================================
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- token aléatoire
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- RESTAURANTS (snacks partenaires)
-- ============================================================
CREATE TABLE restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  raison_sociale TEXT,
  siret TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'France',
  telephone TEXT,
  email TEXT,
  contact_nom TEXT,
  agent_id INTEGER, -- agent qui a apporté ce restaurant
  rang_apport INTEGER, -- 1, 2, 3, 4, 5 (5e = Portefeuille Propriétaire)
  is_portefeuille_proprietaire INTEGER DEFAULT 0, -- 1 si ce resto est le 5e (100% pour l'agent)
  tablette_sr_shop INTEGER DEFAULT 0, -- 1 si tablette fournie par SR SHOP (supplément 0.05€)
  date_signature DATE,
  date_lancement DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_restaurants_agent ON restaurants(agent_id);
CREATE INDEX idx_restaurants_portefeuille ON restaurants(is_portefeuille_proprietaire);

-- ============================================================
-- MARQUES VIRTUELLES
-- ============================================================
CREATE TABLE marques_virtuelles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  nom TEXT NOT NULL,
  uber_store_id TEXT, -- ID Uber Eats
  plateforme TEXT DEFAULT 'uber_eats', -- uber_eats / deliveroo / just_eat / etc
  rang_creation INTEGER, -- 1,2,3,4,5 dans le restaurant (5e marque = 100% pour l'agent)
  is_portefeuille_proprietaire INTEGER DEFAULT 0, -- 1 si c'est la 5e marque (100% pour l'agent)
  date_lancement DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);
CREATE INDEX idx_marques_restaurant ON marques_virtuelles(restaurant_id);
CREATE INDEX idx_marques_portefeuille ON marques_virtuelles(is_portefeuille_proprietaire);

-- ============================================================
-- COMMANDES (importées via CSV)
-- ============================================================
CREATE TABLE commandes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  uber_order_id TEXT,
  date_commande DATETIME NOT NULL,
  montant_brut REAL NOT NULL DEFAULT 0,
  frais_uber REAL NOT NULL DEFAULT 0,
  montant_net REAL NOT NULL DEFAULT 0,
  statut TEXT DEFAULT 'completee', -- completee / annulee / remboursee
  paye_integralement INTEGER DEFAULT 1, -- pour appliquer "validée et intégralement payée"
  raw_data TEXT,
  import_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE
);
CREATE INDEX idx_commandes_marque ON commandes(marque_id);
CREATE INDEX idx_commandes_date ON commandes(date_commande);
CREATE INDEX idx_commandes_uber_id ON commandes(uber_order_id);
CREATE INDEX idx_commandes_import ON commandes(import_id);

-- ============================================================
-- IMPORTS CSV
-- ============================================================
CREATE TABLE imports_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  uploader_user_id INTEGER, -- qui a uploadé (admin ou agent)
  nom_fichier TEXT,
  periode_debut DATE,
  periode_fin DATE,
  nb_lignes INTEGER DEFAULT 0,
  nb_lignes_importees INTEGER DEFAULT 0,
  nb_doublons INTEGER DEFAULT 0,
  montant_total REAL DEFAULT 0,
  statut TEXT DEFAULT 'complete',
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- PALIERS DE COMMISSION (configurable, par tranche de montant commande)
-- ============================================================
-- Types :
-- 'facturation_restaurant'         : ce que DropEat facture au restaurant (sans tablette)
-- 'facturation_restaurant_tablette' : avec supplément tablette (+0.05€)
-- 'agent_standard'                 : commission agent commercial standard
-- 'agent_portefeuille'             : commission agent sur Portefeuille Propriétaire (100%)
-- 'sous_agent_n1'                  : commission agent parent quand un sous-agent N1 vend
-- 'sous_agent_n2'                  : commission agent parent quand un sous-agent N2 vend
CREATE TABLE paliers_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  seuil_min REAL NOT NULL DEFAULT 0,
  seuil_max REAL, -- NULL = infini
  montant_par_commande REAL NOT NULL, -- ex: 0.30 €
  ordre INTEGER NOT NULL DEFAULT 0,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_paliers_type ON paliers_commissions(type);

-- ============================================================
-- PAIEMENTS aux agents
-- ============================================================
CREATE TABLE paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  periode_annee INTEGER NOT NULL,
  montant REAL NOT NULL,
  statut TEXT DEFAULT 'en_attente',
  date_paiement DATE,
  methode TEXT,
  reference TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_paiements_agent ON paiements(agent_id);
CREATE INDEX idx_paiements_periode ON paiements(periode_annee, periode_mois);

-- ============================================================
-- CONFIGURATION
-- ============================================================
CREATE TABLE config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- AUDIT LOG (traçabilité des actions critiques)
-- ============================================================
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
