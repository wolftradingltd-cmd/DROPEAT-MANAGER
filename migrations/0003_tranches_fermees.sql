-- ============================================================
-- Migration 0003 : Système de tranches fermées (clause 5 du contrat)
-- ============================================================
-- Principe : compteur de 5 éléments qualifiants qui se RÉINITIALISE
-- définitivement après attribution. Un élément déjà comptabilisé
-- dans une tranche clôturée ne peut JAMAIS être recompté.
-- ============================================================

-- Table des tranches d'attribution (par agent et par type)
CREATE TABLE IF NOT EXISTS tranches_attribution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque')),
  numero_tranche INTEGER NOT NULL,        -- 1, 2, 3... pour cet agent et ce type
  date_ouverture DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_cloture DATETIME,                   -- NULL = tranche ouverte
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK(statut IN ('ouverte', 'cloturee')),
  element_attribue_id INTEGER,             -- ID du 5e élément (resto ou marque) qui a clôturé
  validation_ecrite INTEGER DEFAULT 0,     -- Validation écrite SR SHOP requise
  date_validation DATETIME,
  validateur_user_id INTEGER,              -- Qui a validé
  notes TEXT,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (validateur_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tranches_agent ON tranches_attribution(agent_id, type);
CREATE INDEX IF NOT EXISTS idx_tranches_statut ON tranches_attribution(statut);

-- Table des éléments comptabilisés dans une tranche
-- Un élément (restaurant ou marque) ne peut apparaître QU'UNE SEULE FOIS
-- dans toute l'histoire d'un agent (UNIQUE constraint).
CREATE TABLE IF NOT EXISTS tranche_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tranche_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque')),
  element_id INTEGER NOT NULL,             -- restaurant_id ou marque_id
  position_dans_tranche INTEGER NOT NULL,  -- 1, 2, 3, 4 ou 5
  date_qualification DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_attribution INTEGER DEFAULT 0,        -- 1 si c'est le 5e (attribution 100% agent)
  notes TEXT,
  FOREIGN KEY (tranche_id) REFERENCES tranches_attribution(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  -- INTERDICTION DE REVENDICATION RÉTROACTIVE :
  -- Un élément (resto ou marque) ne peut être comptabilisé qu'une seule fois par agent.
  UNIQUE(agent_id, type, element_id)
);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_tranche ON tranche_elements(tranche_id);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_agent_type ON tranche_elements(agent_id, type);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_element ON tranche_elements(type, element_id);

-- Configuration : seuil de tranche (5 par défaut)
INSERT OR IGNORE INTO config (cle, valeur, description) VALUES
  ('tranche_seuil', '5', 'Nombre d''éléments qualifiants par tranche fermée'),
  ('tranche_validation_ecrite_requise', '1', 'Validation écrite SR SHOP requise pour clôturer une tranche');
