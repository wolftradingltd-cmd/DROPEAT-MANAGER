-- ============================================================
-- Migration 0004 : Documents restaurants + Register + MLM hiérarchique
-- ============================================================

-- ===== 1. Documents restaurants (KBIS, pièce d'identité, contrats…) =====
CREATE TABLE IF NOT EXISTS restaurant_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  type_document TEXT NOT NULL,          -- kbis, piece_identite, rib, contrat, attestation, photo_facade, autre
  nom_fichier TEXT NOT NULL,
  taille_octets INTEGER,
  mime_type TEXT,
  contenu_base64 TEXT,                   -- Stockage direct (petits fichiers < 1Mo)
  url_externe TEXT,                      -- Ou lien vers stockage externe
  date_emission DATE,                    -- Date sur le document (ex: KBIS du …)
  date_expiration DATE,                  -- Date de fin de validité (utile pour KBIS, CNI…)
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente', 'valide', 'rejete', 'expire')),
  uploaded_by INTEGER,                   -- user_id qui a uploadé
  validated_by INTEGER,                  -- user_id (admin) qui a validé
  date_validation DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  FOREIGN KEY (validated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_doc_restaurant ON restaurant_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_doc_type ON restaurant_documents(type_document);
CREATE INDEX IF NOT EXISTS idx_doc_statut ON restaurant_documents(statut);

-- ===== 2. Checklist de conformité par restaurant =====
-- Liste fixe des documents requis avec statut OK / manquant
CREATE TABLE IF NOT EXISTS restaurant_checklist (
  restaurant_id INTEGER NOT NULL,
  type_document TEXT NOT NULL,
  requis INTEGER DEFAULT 1,             -- 1 = obligatoire, 0 = optionnel
  fourni INTEGER DEFAULT 0,
  document_id INTEGER,                   -- Lien vers le document fourni
  date_demande DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_fourniture DATETIME,
  notes TEXT,
  PRIMARY KEY (restaurant_id, type_document),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES restaurant_documents(id) ON DELETE SET NULL
);

-- ===== 3. Register : codes d'invitation pour parrainage agents =====
-- Un agent peut inviter un sous-agent via un code unique (lien d'inscription)
CREATE TABLE IF NOT EXISTS invitations_agent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,            -- token aléatoire
  parent_id INTEGER NOT NULL,           -- agent qui invite
  niveau_cible INTEGER NOT NULL,        -- niveau du futur sous-agent (parent.niveau + 1)
  email_pre_rempli TEXT,                -- email cible (optionnel)
  utilisee INTEGER DEFAULT 0,
  user_cree_id INTEGER,                 -- ID du user créé après inscription
  expire_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  FOREIGN KEY (parent_id) REFERENCES users(id),
  FOREIGN KEY (user_cree_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_inv_code ON invitations_agent(code);
CREATE INDEX IF NOT EXISTS idx_inv_parent ON invitations_agent(parent_id);

-- ===== 4. Snapshot mensuel des commissions calculées (pour audit + cache) =====
CREATE TABLE IF NOT EXISTS commissions_calculees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  periode_annee INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  commission_propre REAL DEFAULT 0,     -- Sa commission sur ses propres restos
  commission_portefeuille REAL DEFAULT 0,
  commission_n1 REAL DEFAULT 0,         -- Commission sur les sous-agents N+1
  commission_n2 REAL DEFAULT 0,         -- Commission sur les sous-sous-agents N+2
  total REAL DEFAULT 0,
  nb_commandes_propres INTEGER DEFAULT 0,
  ca_propre REAL DEFAULT 0,
  ca_filleuls REAL DEFAULT 0,           -- CA cumulé des filleuls (visible parent)
  ca_sous_filleuls REAL DEFAULT 0,
  detail_json TEXT,                      -- Détail JSON par restaurant
  calcule_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'auto_import',    -- auto_import, manuel, recalcul
  UNIQUE (agent_id, periode_annee, periode_mois),
  FOREIGN KEY (agent_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comm_calc_agent ON commissions_calculees(agent_id);
CREATE INDEX IF NOT EXISTS idx_comm_calc_periode ON commissions_calculees(periode_annee, periode_mois);

-- ===== 5. Insertion des types de documents standards en config =====
INSERT OR IGNORE INTO config (cle, valeur, description) VALUES
  ('docs_types_obligatoires', 'kbis,piece_identite,rib', 'Documents obligatoires pour activer un restaurant'),
  ('docs_types_optionnels', 'contrat,attestation,photo_facade,autre', 'Documents optionnels'),
  ('register_actif', '1', 'Activation du système d''inscription par invitation'),
  ('register_invitation_duree_jours', '30', 'Durée de validité d''une invitation (jours)'),
  ('commissions_calcul_auto', '1', 'Calcul automatique des commissions à chaque import CSV');
