-- ============================================================
-- DROPEAT v2 — Tranches v2, prospection, omnipotence superadmin
-- ============================================================

-- 1) Marques : champ "héritée d'un resto attribué" (décalage tranche)
ALTER TABLE marques_virtuelles ADD COLUMN heritee_de_resto_id INTEGER REFERENCES restaurants(id);
ALTER TABLE marques_virtuelles ADD COLUMN exclue_tranche INTEGER DEFAULT 0;
-- exclue_tranche = 1 : cette marque est issue automatiquement d'un resto attribué 100% portefeuille
--                     elle ne compte PAS dans la tranche marques courante mais ouvre la suivante.

-- 2) Demandes d'attribution de la 5ème marque propriétaire (choix par l'agent + validation superadmin)
CREATE TABLE IF NOT EXISTS demandes_attribution_marque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tranche_id INTEGER NOT NULL REFERENCES tranches_attribution(id) ON DELETE CASCADE,
  marque_choisie_id INTEGER NOT NULL REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  motif TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente', -- en_attente / validee / refusee
  validateur_id INTEGER REFERENCES users(id),
  date_decision DATETIME,
  notes_validateur TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_demandes_agent ON demandes_attribution_marque(agent_id);
CREATE INDEX IF NOT EXISTS idx_demandes_tranche ON demandes_attribution_marque(tranche_id);
CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes_attribution_marque(statut);

-- 3) Visibilité du parent : superadmin peut cacher le parent à un filleul
ALTER TABLE users ADD COLUMN parent_visible_par_enfant INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN masque_par_admin INTEGER DEFAULT 0;
-- masque_par_admin = 1 : superadmin a forcé l'invisibilité de la hiérarchie pour cet user

-- 4) Audit log "invisible" : marqué pour superadmin uniquement
ALTER TABLE audit_log ADD COLUMN visible_agent INTEGER DEFAULT 1;
-- visible_agent = 0 : action superadmin masquée aux agents (omnipotence discrète)

-- 5) Override manuel des commissions (superadmin omnipotent)
ALTER TABLE commissions_calculees ADD COLUMN override_par INTEGER REFERENCES users(id);
ALTER TABLE commissions_calculees ADD COLUMN override_motif TEXT;
ALTER TABLE commissions_calculees ADD COLUMN override_at DATETIME;

-- 6) Module Aide à la prospection — Leads
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom_etablissement TEXT NOT NULL,
  contact_nom TEXT,
  contact_prenom TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  type_cuisine TEXT, -- pizza, burger, asiatique, …
  source TEXT, -- referral, ubereats, deliveroo, terrain, web, …
  statut TEXT NOT NULL DEFAULT 'a_contacter',
  -- a_contacter / contacte / rdv_planifie / negociation / signe / perdu
  score INTEGER DEFAULT 50, -- 0-100, qualification du prospect
  agent_assigne_id INTEGER REFERENCES users(id),
  cree_par_id INTEGER REFERENCES users(id),
  prochaine_relance DATE,
  derniere_action_at DATETIME,
  notes TEXT,
  -- Conversion :
  restaurant_cree_id INTEGER REFERENCES restaurants(id),
  date_conversion DATETIME,
  -- Soft delete pour audit
  archive INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prospects_agent ON prospects(agent_assigne_id);
CREATE INDEX IF NOT EXISTS idx_prospects_statut ON prospects(statut);
CREATE INDEX IF NOT EXISTS idx_prospects_relance ON prospects(prochaine_relance);

-- 7) Historique d'actions sur prospects (timeline)
CREATE TABLE IF NOT EXISTS prospect_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type_action TEXT NOT NULL, -- appel / email / rdv / sms / note / relance / changement_statut
  description TEXT,
  ancien_statut TEXT,
  nouveau_statut TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_actions_prospect ON prospect_actions(prospect_id);

-- 8) Notifications internes (alertes superadmin / agent)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinataire_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- demande_attribution / document_expire / nouvelle_signature / relance_due / palier_atteint
  titre TEXT NOT NULL,
  message TEXT,
  lien TEXT, -- URL relative pour l'action
  lu INTEGER DEFAULT 0,
  metadata TEXT, -- JSON contextuel
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(destinataire_id, lu);

-- 9) Snapshot Uber Eats raw (anti-doublon par UUID)
ALTER TABLE commandes ADD COLUMN uber_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_commandes_uuid ON commandes(uber_uuid);
ALTER TABLE commandes ADD COLUMN type_honoree TEXT;
-- Pickup / Delivery / MULTI_MERCHANT
