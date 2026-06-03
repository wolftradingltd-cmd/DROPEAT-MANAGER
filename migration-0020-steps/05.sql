CREATE TABLE tranche_elements_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tranche_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque')),  -- nature de l'élément (le compteur reste unifié)
  element_id INTEGER NOT NULL,
  position_dans_tranche INTEGER NOT NULL,
  date_qualification DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_attribution INTEGER DEFAULT 0,
  notes TEXT,
  is_challenge INTEGER NOT NULL DEFAULT 0,
  hooked_resto_id INTEGER,   -- pour les marques : le resto parent au moment de la qualif
  FOREIGN KEY (tranche_id) REFERENCES tranches_attribution(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  UNIQUE(agent_id, type, element_id)
);