-- ============================================================
-- Migration 0012 : Module CHALLENGES commerciaux
-- ============================================================
-- Permet au superadmin de créer des défis temporaires pour les
-- agents (ex : "30 restaurants apportés entre le 1er mai et le
-- 30 juin 2026 → 15 restaurants en portefeuille 100% à choisir").
--
-- Pendant la période d'un challenge actif, la règle standard
-- (5e marque / 5e resto = portefeuille) PEUT être suspendue pour
-- les participants (selon le champ suspend_tranche_standard).
--
-- Workflow :
--   1. Superadmin crée le challenge (type, période, objectif, récompense)
--   2. Les agents éligibles le voient et peuvent y "participer" (auto si actif)
--   3. À chaque restaurant/marque apporté pendant la période, la progression
--      du challenge se met à jour automatiquement
--   4. Si l'agent atteint l'objectif, le superadmin attribue les récompenses
--      (ex: 15 restos en portefeuille 100% choisis par l'agent)
-- ============================================================

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                -- ex: 'CH-2026-05-SEBASTIAN-30R'
  nom TEXT NOT NULL,                        -- ex: 'Challenge été 2026 — 30 restos = 15 portefeuille'
  description TEXT,                         -- description longue
  -- Période
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  -- Objectif
  type_objectif TEXT NOT NULL CHECK(type_objectif IN ('restaurants', 'marques', 'restaurants_ou_marques')),
  objectif_quantite INTEGER NOT NULL,       -- ex: 30
  -- Récompense
  type_recompense TEXT NOT NULL CHECK(type_recompense IN ('portefeuille_restaurants', 'portefeuille_marques', 'bonus_montant', 'autre')),
  recompense_quantite INTEGER,              -- ex: 15 (restos à choisir en portefeuille)
  recompense_montant REAL,                  -- pour bonus_montant
  recompense_description TEXT,              -- texte libre pour 'autre'
  -- Règles
  suspend_tranche_standard INTEGER DEFAULT 0, -- 1 = pendant la période, la règle 5/5 est suspendue pour les participants
  cible TEXT NOT NULL DEFAULT 'tous' CHECK(cible IN ('tous', 'selection')),
    -- 'tous' : tous les agents peuvent participer
    -- 'selection' : seuls les agents de challenge_participations préalablement créés
  -- Méta
  actif INTEGER NOT NULL DEFAULT 1,         -- 1 = visible/comptabilisé, 0 = archivé
  notes_internes TEXT,                      -- notes superadmin
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_challenges_periode ON challenges(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_challenges_actif ON challenges(actif);

-- ============================================================
-- Participation d'un agent à un challenge
-- ============================================================
CREATE TABLE IF NOT EXISTS challenge_participations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- État
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK(statut IN ('en_cours', 'reussi', 'echoue', 'recompense_attribuee', 'annule')),
  progression_actuelle INTEGER NOT NULL DEFAULT 0,  -- nb de restos/marques apportés sur la période
  date_reussite DATETIME,                 -- moment où objectif atteint
  -- Récompense
  recompense_attribuee_at DATETIME,
  recompense_attribuee_par INTEGER REFERENCES users(id),
  recompense_notes TEXT,                  -- détail de la récompense effectivement donnée
  -- Méta
  date_participation DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes_agent TEXT,
  notes_admin TEXT,
  UNIQUE(challenge_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_chal_part_challenge ON challenge_participations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_chal_part_agent ON challenge_participations(agent_id);
CREATE INDEX IF NOT EXISTS idx_chal_part_statut ON challenge_participations(statut);

-- ============================================================
-- Éléments comptabilisés dans la progression d'un participant
-- (sert d'audit + permet de choisir les N éléments pour la récompense)
-- ============================================================
CREATE TABLE IF NOT EXISTS challenge_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participation_id INTEGER NOT NULL REFERENCES challenge_participations(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_element TEXT NOT NULL CHECK(type_element IN ('restaurant', 'marque')),
  element_id INTEGER NOT NULL,            -- restaurant_id ou marque_id
  date_apport DATETIME NOT NULL,          -- date_signature du resto OU date_lancement marque
  choisi_pour_recompense INTEGER DEFAULT 0, -- 1 si l'agent a choisi cet élément dans sa récompense
  notes TEXT,
  UNIQUE(challenge_id, agent_id, type_element, element_id)
);
CREATE INDEX IF NOT EXISTS idx_chal_el_participation ON challenge_elements(participation_id);
CREATE INDEX IF NOT EXISTS idx_chal_el_agent ON challenge_elements(agent_id);

-- ============================================================
-- Config par défaut
-- ============================================================
INSERT OR IGNORE INTO config (cle, valeur, description, updated_at) VALUES
  ('challenges_actif', '1', 'Module Challenges activé', CURRENT_TIMESTAMP);
