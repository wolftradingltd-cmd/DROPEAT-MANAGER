CREATE TABLE tranches_attribution_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque', 'unifiee')),
  numero_tranche INTEGER NOT NULL,
  date_ouverture DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_cloture DATETIME,
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK(statut IN ('ouverte', 'cloturee')),
  element_attribue_id INTEGER,
  element_attribue_kind TEXT CHECK(element_attribue_kind IN ('client','marque') OR element_attribue_kind IS NULL),
  validation_ecrite INTEGER DEFAULT 0,
  date_validation DATETIME,
  validateur_user_id INTEGER,
  notes TEXT,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (validateur_user_id) REFERENCES users(id)
);