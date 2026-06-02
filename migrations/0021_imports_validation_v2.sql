-- ============================================================
-- Migration 0021 : Renforcement workflow imports + validation
-- ============================================================
-- Objectifs :
--   1. Validation admin obligatoire avant comptabilisation en facture
--   2. Permettre à l'admin d'uploader pour un agent (avec notification)
--   3. Cloisonnement : les agents ne voient JAMAIS la marge DropEat
--   4. Notifications live admin & agent
--   5. Préserver les imports existants (validation_statut='valide' par défaut
--      pour ne pas casser les factures déjà émises)
-- ============================================================

-- ============================================================
-- 1. imports_csv : workflow de validation
-- ============================================================

-- Statut de validation (en_attente_validation | valide | rejete)
ALTER TABLE imports_csv ADD COLUMN validation_statut TEXT
  NOT NULL DEFAULT 'valide'
  CHECK (validation_statut IN ('en_attente_validation','valide','rejete'));

-- Qui a validé/rejeté (FK users.id, NULL si pas encore traité)
ALTER TABLE imports_csv ADD COLUMN validation_par INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Quand
ALTER TABLE imports_csv ADD COLUMN validation_at DATETIME;

-- Notes admin (raison rejet, commentaire validation)
ALTER TABLE imports_csv ADD COLUMN validation_notes TEXT;

-- Agent concerné par l'import (peut différer du uploader si admin upload pour agent)
-- NULL = on déduit via marque_id → restaurants.agent_id (rétrocompat)
ALTER TABLE imports_csv ADD COLUMN pour_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Source de l'upload (agent | admin | admin_pour_agent)
ALTER TABLE imports_csv ADD COLUMN source_upload TEXT NOT NULL DEFAULT 'admin'
  CHECK (source_upload IN ('agent','admin','admin_pour_agent'));

-- Index pour requêtes "à valider"
CREATE INDEX IF NOT EXISTS idx_imports_validation_statut ON imports_csv(validation_statut);
CREATE INDEX IF NOT EXISTS idx_imports_pour_agent ON imports_csv(pour_agent_id);

-- ============================================================
-- 2. commandes : flag de validation (hérité de l'import parent)
-- ============================================================
-- Une commande est comptée dans les factures uniquement si validation_statut='valide'.
-- Default 'valide' pour ne pas casser les commandes pré-existantes (déjà facturées).
ALTER TABLE commandes ADD COLUMN validation_statut TEXT
  NOT NULL DEFAULT 'valide'
  CHECK (validation_statut IN ('en_attente_validation','valide','rejete'));

CREATE INDEX IF NOT EXISTS idx_commandes_validation_statut ON commandes(validation_statut);

-- ============================================================
-- 3. notifications : enrichissement type
-- ============================================================
-- Table déjà existante avec colonnes : id, destinataire_id, type, titre,
-- message, lien, lu, metadata, created_at.
-- On ajoute juste un index pour le badge "non lues"
CREATE INDEX IF NOT EXISTS idx_notifications_destinataire_lu ON notifications(destinataire_id, lu);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
