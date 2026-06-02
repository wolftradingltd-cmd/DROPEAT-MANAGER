-- ============================================================
-- Migration 0020 — Refonte du système de tranches (logique chronologique unifiée)
-- ============================================================
-- Changements :
-- 1) Ajoute le type 'unifiee' aux tranches (resto + marque dans le même compteur de 5)
-- 2) Ajoute des flags sur marques_virtuelles pour matérialiser l'héritage de portefeuille :
--    - heritee_portefeuille : 1 = la marque appartient 100% à l'agent (resto parent déjà portefeuille)
--    - exclue_mlm           : 1 = pas de commission N+1/N+2 (équivalent économique du 100% propriétaire)
--    - tranche_source_id    : tranche dans laquelle la marque a été qualifiée (ou NULL si héritée)
-- 3) Ajoute hooked_resto_id sur tranche_elements pour tracer la propagation
-- 4) Ne supprime AUCUNE donnée (agents/restos/marques préservés).
-- ============================================================

-- IMPORTANT : désactiver les foreign keys pendant les renames pour éviter les cascades
PRAGMA foreign_keys = OFF;

-- ÉTAPE A — Recréer tranches_attribution avec un CHECK étendu (SQLite n'autorise pas ALTER CHECK)
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

INSERT INTO tranches_attribution_new (
  id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
  element_attribue_id, validation_ecrite, date_validation, validateur_user_id, notes
)
SELECT
  id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
  element_attribue_id, validation_ecrite, date_validation, validateur_user_id, notes
FROM tranches_attribution;

DROP TABLE tranches_attribution;
ALTER TABLE tranches_attribution_new RENAME TO tranches_attribution;

-- Backfill element_attribue_kind à partir du type (pour anciennes tranches client/marque)
UPDATE tranches_attribution
SET element_attribue_kind = type
WHERE element_attribue_kind IS NULL AND element_attribue_id IS NOT NULL AND type IN ('client','marque');

-- ÉTAPE B — Recréer tranche_elements avec un CHECK étendu et la traçabilité
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

INSERT INTO tranche_elements_new (
  id, tranche_id, agent_id, type, element_id, position_dans_tranche,
  date_qualification, is_attribution, notes, is_challenge
)
SELECT
  id, tranche_id, agent_id, type, element_id, position_dans_tranche,
  date_qualification, is_attribution, notes, is_challenge
FROM tranche_elements;

-- Backfill hooked_resto_id pour les marques existantes
UPDATE tranche_elements_new
SET hooked_resto_id = (
  SELECT m.restaurant_id FROM marques_virtuelles m WHERE m.id = tranche_elements_new.element_id
)
WHERE type = 'marque';

DROP TABLE tranche_elements;
ALTER TABLE tranche_elements_new RENAME TO tranche_elements;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_tranche_elements_agent_date ON tranche_elements(agent_id, date_qualification);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_tranche ON tranche_elements(tranche_id);
CREATE INDEX IF NOT EXISTS idx_tranches_attribution_agent_statut ON tranches_attribution(agent_id, statut);

-- ÉTAPE C — Flags sur marques pour matérialiser l'héritage portefeuille resto → marque
ALTER TABLE marques_virtuelles ADD COLUMN heritee_portefeuille INTEGER DEFAULT 0;
ALTER TABLE marques_virtuelles ADD COLUMN exclue_mlm INTEGER DEFAULT 0;
ALTER TABLE marques_virtuelles ADD COLUMN tranche_source_id INTEGER REFERENCES tranches_attribution(id);
ALTER TABLE marques_virtuelles ADD COLUMN date_heritage DATETIME;

-- ÉTAPE D — Journal d'audit pour la recalibration des tranches
CREATE TABLE IF NOT EXISTS tranches_recalcul_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  before_snapshot TEXT,
  after_snapshot TEXT,
  executed_by INTEGER,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recalcul_agent ON tranches_recalcul_log(agent_id, executed_at);

-- Trace migration
INSERT INTO _migration_log (migration) VALUES ('0020_tranches_unifiees');

PRAGMA foreign_keys = ON;
