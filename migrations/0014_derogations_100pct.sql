-- ============================================================
-- MIGRATION 0014 — DÉROGATIONS 100% EXCEPTIONNELLES
-- ============================================================
-- Permet à l'admin DropEat d'octroyer ponctuellement 100% de la
-- facturation à un agent commercial, sans contrat de portefeuille
-- propriétaire formel.
--
-- Règles métier (validées avec utilisateur 2026-05-15) :
--   - Cible : restaurant ENTIER ou marque ENTIÈRE (au choix admin)
--   - Période bornée (date_debut obligatoire, date_fin optionnelle)
--   - Si date_fin NULL → dérogation ouverte (clôture manuelle)
--   - Ne s'applique PAS aux restos/marques déjà en portefeuille
--     propriétaire (cumul interdit, le portefeuille prime)
--   - L'agent prend 100% de la facturation_restaurant
--   - DropEat marge = 0 sur ces commandes
--   - PAS de remontée N+1 / N+2 (cohérent avec portefeuille)
--   - Motif obligatoire pour traçabilité audit
--   - Création réservée admin (validateur_id = id admin créateur)
-- ============================================================

PRAGMA defer_foreign_keys = ON;

-- Table principale
CREATE TABLE IF NOT EXISTS derogations_100pct (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Cible : EXACTEMENT UNE des deux doit être renseignée
  marque_id INTEGER,
  restaurant_id INTEGER,

  -- Agent bénéficiaire (l'agent qui prend les 100%)
  -- Normalement = l'agent rattaché au resto/marque, mais on le stocke
  -- explicitement au cas où l'agent du resto changerait après la dérogation
  agent_id INTEGER NOT NULL,

  -- Période d'application
  date_debut TEXT NOT NULL,         -- YYYY-MM-DD (inclusif)
  date_fin TEXT,                    -- YYYY-MM-DD (inclusif) ou NULL = ouvert

  -- Traçabilité administrative
  motif TEXT NOT NULL,              -- Justification obligatoire
  cree_par_admin_id INTEGER NOT NULL,
  cree_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Clôture (si dérogation fermée manuellement avant date_fin)
  cloturee_par_admin_id INTEGER,
  cloturee_at DATETIME,
  motif_cloture TEXT,

  -- Statut : 'active' | 'cloturee' | 'expiree'
  -- 'expiree' calculé automatiquement quand date_fin < aujourd'hui
  statut TEXT NOT NULL DEFAULT 'active',

  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (cree_par_admin_id) REFERENCES users(id),
  FOREIGN KEY (cloturee_par_admin_id) REFERENCES users(id),

  -- Contrainte : exactement une cible (XOR)
  CHECK (
    (marque_id IS NOT NULL AND restaurant_id IS NULL) OR
    (marque_id IS NULL AND restaurant_id IS NOT NULL)
  )
);

-- Indexes pour performance (lookup par cible + statut)
CREATE INDEX IF NOT EXISTS idx_derog_marque ON derogations_100pct(marque_id, statut);
CREATE INDEX IF NOT EXISTS idx_derog_resto ON derogations_100pct(restaurant_id, statut);
CREATE INDEX IF NOT EXISTS idx_derog_agent ON derogations_100pct(agent_id, statut);
CREATE INDEX IF NOT EXISTS idx_derog_dates ON derogations_100pct(date_debut, date_fin);

-- Colonne traçabilité sur commandes : id de la dérogation appliquée
-- (NULL = pas de dérogation, sinon id de la dérogation active à la date de la commande)
ALTER TABLE commandes ADD COLUMN derogation_id INTEGER REFERENCES derogations_100pct(id);
CREATE INDEX IF NOT EXISTS idx_cmd_derogation ON commandes(derogation_id);

-- Flag dans le snapshot commande pour reconnaître facilement
-- (les calculs persistent déjà is_portefeuille_snapshot, on ajoute is_derogation_snapshot)
ALTER TABLE commandes ADD COLUMN is_derogation_snapshot INTEGER DEFAULT 0;
