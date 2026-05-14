-- ============================================================
-- Migration 0013 : Restaurants/Marques pour les 7 commerciaux EXISTANTS
--                + Challenge Sebastian Garcia (1er mai → 30 juin 2026)
-- ============================================================
-- ATTENTION : NE CRÉE AUCUN UTILISATEUR — utilise les IDs existants :
--   ID 14 → Sébastien Garcia    (developpement.restaurent@gmail.com)
--   ID 12 → Kamel Mehdi         (kamelmarketeur@gmail.com)
--   ID 29 → Hamou OULD BESSI    (obhamou@gmail.com)
--   ID 13 → Sabrina Hadri       (sabrinahadri.succes@gmail.com)
--   ID 22 → Gregory Hadri       (hadri.gregory@gmail.com)
--   ID 20 → Fabien Rosso        (fafaginou@live.fr)
--   ID 21 → Elbac Haidar Mohamed (moielbac@gmail.com)
--
-- Tous les restaurants et marques sont rentrés AVANT le challenge
-- (date_signature < 2026-05-01) afin qu'ils ne soient PAS comptés
-- dans la progression du challenge.
--
-- Règle critique : pour Sébastien, à partir de Sultant Restaurant,
-- la règle standard 5/5 est SUSPENDUE jusqu'au 30 juin 2026.
-- Les 5 premiers restos (tranche 1) ont déjà attribué le 5e en
-- portefeuille 100% (O'Grill avec Krock Takos en 5e marque).
-- Les 5 suivants (tranche 2) sont apportés AVANT le 1er mai mais
-- la 5e attribution n'a PAS lieu (règle suspendue par le challenge).
-- ============================================================

-- ============================================================
-- 1. RESTAURANTS DE SÉBASTIEN GARCIA (user_id = 14) — 10 restos
-- ============================================================
-- IDs 17..26 — toutes date_signature < 2026-05-01 (avant challenge)
-- Tranche 1 (restos 1..5) : règle 5/5 standard appliquée → resto #5 = portefeuille 100%
-- Tranche 2 (restos 6..10) : commence à Sultant Restaurant → règle SUSPENDUE par challenge
-- ============================================================
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  -- Tranche 1 Sébastien : restos 1..5 (règle 5/5 standard appliquée)
  (17, 'Restaurant SG #1', 'Adresse SG1', NULL, 14, 1, 0,
   '2026-01-20', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 1 / position 1',
   '2026-01-20 10:00:00', '2026-01-20 10:00:00'),
  (18, 'Restaurant SG #2', 'Adresse SG2', NULL, 14, 2, 0,
   '2026-02-01', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 1 / position 2',
   '2026-02-01 10:00:00', '2026-02-01 10:00:00'),
  (19, 'Restaurant SG #3', 'Adresse SG3', NULL, 14, 3, 0,
   '2026-02-15', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 1 / position 3',
   '2026-02-15 10:00:00', '2026-02-15 10:00:00'),
  (20, 'Restaurant SG #4', 'Adresse SG4', NULL, 14, 4, 0,
   '2026-03-01', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 1 / position 4',
   '2026-03-01 10:00:00', '2026-03-01 10:00:00'),
  (21, 'O''Grill (Portefeuille 100%)', 'Adresse O''Grill', NULL, 14, 5, 1,
   '2026-03-10', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 1 / position 5 = ATTRIBUTION portefeuille 100% (règle 5/5 standard)',
   '2026-03-10 10:00:00', '2026-03-10 10:00:00'),
  -- Tranche 2 Sébastien : à partir de Sultant Restaurant — règle 5/5 SUSPENDUE par challenge
  (22, 'Sultant Restaurant', 'Adresse Sultant', NULL, 14, 6, 0,
   '2026-03-20', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 2 / position 1 — Sultant Restaurant : point de départ de la suspension règle 5/5 (remplacée par challenge CH-2026-05-SEBASTIAN-30R)',
   '2026-03-20 10:00:00', '2026-03-20 10:00:00'),
  (23, 'Restaurant SG #7', 'Adresse SG7', NULL, 14, 7, 0,
   '2026-04-01', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 2 / position 2 (règle 5/5 suspendue)',
   '2026-04-01 10:00:00', '2026-04-01 10:00:00'),
  (24, 'Restaurant SG #8', 'Adresse SG8', NULL, 14, 8, 0,
   '2026-04-10', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 2 / position 3 (règle 5/5 suspendue)',
   '2026-04-10 10:00:00', '2026-04-10 10:00:00'),
  (25, 'Restaurant SG #9', 'Adresse SG9', NULL, 14, 9, 0,
   '2026-04-20', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 2 / position 4 (règle 5/5 suspendue)',
   '2026-04-20 10:00:00', '2026-04-20 10:00:00'),
  (26, 'Restaurant SG #10', 'Adresse SG10', NULL, 14, 10, 0,
   '2026-04-28', 1, 'Garcia', 'Sébastien',
   'Apport Sébastien — tranche 2 / position 5 — règle 5/5 SUSPENDUE : pas d''attribution automatique (remplacée par challenge)',
   '2026-04-28 10:00:00', '2026-04-28 10:00:00');

-- ============================================================
-- 2. RESTAURANTS DES AUTRES COMMERCIAUX
-- ============================================================

-- Kamel Mehdi (user_id = 12) — 1 resto : MEAL N. FOOD
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (27, 'MEAL N. FOOD', 'Adresse Meal N Food', NULL, 12, 1, 0,
   '2026-02-15', 1, 'Mehdi', 'Kamel',
   'Apport Kamel Mehdi — 1er restaurant',
   '2026-02-15 11:00:00', '2026-02-15 11:00:00');

-- Hamou OULD BESSI (user_id = 29) — 1 resto : MALABAR FOODS
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (28, 'MALABAR FOODS', 'Adresse Malabar', NULL, 29, 1, 0,
   '2026-02-20', 1, 'OULD BESSI', 'Hamou',
   'Apport Hamou OULD BESSI — 1er restaurant',
   '2026-02-20 11:00:00', '2026-02-20 11:00:00');

-- Sabrina Hadri (user_id = 13) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (29, 'Restaurant Sabrina #1', 'Adresse Sabrina 1', NULL, 13, 1, 0,
   '2026-03-01', 1, 'Hadri', 'Sabrina',
   'Apport Sabrina Hadri — 1er restaurant',
   '2026-03-01 11:00:00', '2026-03-01 11:00:00'),
  (30, 'Restaurant Sabrina #2', 'Adresse Sabrina 2', NULL, 13, 2, 0,
   '2026-03-20', 1, 'Hadri', 'Sabrina',
   'Apport Sabrina Hadri — 2ème restaurant',
   '2026-03-20 11:00:00', '2026-03-20 11:00:00');

-- Gregory Hadri (user_id = 22) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (31, 'Restaurant Gregory #1', 'Adresse Gregory 1', NULL, 22, 1, 0,
   '2026-03-05', 1, 'Hadri', 'Gregory',
   'Apport Gregory Hadri — 1er restaurant',
   '2026-03-05 11:00:00', '2026-03-05 11:00:00'),
  (32, 'Restaurant Gregory #2', 'Adresse Gregory 2', NULL, 22, 2, 0,
   '2026-03-25', 1, 'Hadri', 'Gregory',
   'Apport Gregory Hadri — 2ème restaurant',
   '2026-03-25 11:00:00', '2026-03-25 11:00:00');

-- Fabien Rosso (user_id = 20) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (33, 'Restaurant Fabien #1', 'Adresse Fabien 1', NULL, 20, 1, 0,
   '2026-03-10', 1, 'Rosso', 'Fabien',
   'Apport Fabien Rosso — 1er restaurant',
   '2026-03-10 11:00:00', '2026-03-10 11:00:00'),
  (34, 'Restaurant Fabien #2', 'Adresse Fabien 2', NULL, 20, 2, 0,
   '2026-04-01', 1, 'Rosso', 'Fabien',
   'Apport Fabien Rosso — 2ème restaurant',
   '2026-04-01 11:00:00', '2026-04-01 11:00:00');

-- Elbac Haidar Mohamed (user_id = 21) — 1 resto : LK
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, notes,
   created_at, updated_at)
VALUES
  (35, 'LK', 'Adresse LK', NULL, 21, 1, 0,
   '2026-03-15', 1, 'Haidar Mohamed', 'Elbac',
   'Apport Elbac Haidar Mohamed — 1er restaurant',
   '2026-03-15 11:00:00', '2026-03-15 11:00:00');

-- ============================================================
-- 3. MARQUES VIRTUELLES (Uber Eats) — toutes AVANT le challenge
-- ============================================================
-- IDs 9..27
-- Pour Sébastien : 5 premières marques + 5e (Krock Takos dans O'Grill) = portefeuille 100%
-- À partir de Sultant Restaurant : règle 5/5 marques également suspendue
-- ============================================================
INSERT OR IGNORE INTO marques_virtuelles
  (id, restaurant_id, nom, plateforme, rang_creation, is_portefeuille_proprietaire,
   date_lancement, actif, statut_marque, exclue_tranche, notes,
   created_at, updated_at)
VALUES
  -- Sébastien — tranche 1 marques (positions 1..5 — 5e = portefeuille 100%)
  (9,  17, 'Marque SG1',   'uber_eats', 1, 0, '2026-01-25', 1, 'active', 0,
   'Marque Sébastien #1 — avant challenge', '2026-01-25 10:00:00', '2026-01-25 10:00:00'),
  (10, 18, 'Marque SG2',   'uber_eats', 1, 0, '2026-02-05', 1, 'active', 0,
   'Marque Sébastien #2 — avant challenge', '2026-02-05 10:00:00', '2026-02-05 10:00:00'),
  (11, 19, 'Marque SG3',   'uber_eats', 1, 0, '2026-02-20', 1, 'active', 0,
   'Marque Sébastien #3 — avant challenge', '2026-02-20 10:00:00', '2026-02-20 10:00:00'),
  (12, 20, 'Marque SG4',   'uber_eats', 1, 0, '2026-03-05', 1, 'active', 0,
   'Marque Sébastien #4 — avant challenge', '2026-03-05 10:00:00', '2026-03-05 10:00:00'),
  (13, 21, 'Krock Takos',  'uber_eats', 1, 1, '2026-03-15', 1, 'portefeuille', 0,
   '5ème marque choisie par Sébastien pour son portefeuille personnel (dans O''Grill) — règle 5/5 standard',
   '2026-03-15 10:00:00', '2026-03-15 10:00:00'),
  -- Sébastien — tranche 2 marques (à partir de Sultant — règle suspendue)
  (14, 22, 'Sultant',      'uber_eats', 1, 0, '2026-03-25', 1, 'active', 0,
   'Marque Sultant Restaurant — début de la suspension règle 5/5 (challenge)',
   '2026-03-25 10:00:00', '2026-03-25 10:00:00'),
  (15, 23, 'Marque SG7',   'uber_eats', 1, 0, '2026-04-05', 1, 'active', 0,
   'Marque Sébastien #7 — règle 5/5 suspendue', '2026-04-05 10:00:00', '2026-04-05 10:00:00'),
  (16, 24, 'Marque SG8',   'uber_eats', 1, 0, '2026-04-15', 1, 'active', 0,
   'Marque Sébastien #8 — règle 5/5 suspendue', '2026-04-15 10:00:00', '2026-04-15 10:00:00'),
  (17, 25, 'Marque SG9',   'uber_eats', 1, 0, '2026-04-22', 1, 'active', 0,
   'Marque Sébastien #9 — règle 5/5 suspendue', '2026-04-22 10:00:00', '2026-04-22 10:00:00'),
  (18, 26, 'Marque SG10',  'uber_eats', 1, 0, '2026-04-29', 1, 'active', 0,
   'Marque Sébastien #10 — règle 5/5 suspendue', '2026-04-29 10:00:00', '2026-04-29 10:00:00'),
  -- Autres commerciaux : 1 marque par restaurant
  (19, 27, 'Meal N Food',          'uber_eats', 1, 0, '2026-02-18', 1, 'active', 0,
   'Marque Kamel Mehdi', '2026-02-18 11:00:00', '2026-02-18 11:00:00'),
  (20, 28, 'Malabar Foods',        'uber_eats', 1, 0, '2026-02-23', 1, 'active', 0,
   'Marque Hamou OULD BESSI', '2026-02-23 11:00:00', '2026-02-23 11:00:00'),
  (21, 29, 'Marque Sabrina #1',    'uber_eats', 1, 0, '2026-03-05', 1, 'active', 0,
   'Marque Sabrina Hadri #1', '2026-03-05 11:00:00', '2026-03-05 11:00:00'),
  (22, 30, 'Marque Sabrina #2',    'uber_eats', 1, 0, '2026-03-25', 1, 'active', 0,
   'Marque Sabrina Hadri #2', '2026-03-25 11:00:00', '2026-03-25 11:00:00'),
  (23, 31, 'Marque Gregory #1',    'uber_eats', 1, 0, '2026-03-10', 1, 'active', 0,
   'Marque Gregory Hadri #1', '2026-03-10 11:00:00', '2026-03-10 11:00:00'),
  (24, 32, 'Marque Gregory #2',    'uber_eats', 1, 0, '2026-03-30', 1, 'active', 0,
   'Marque Gregory Hadri #2', '2026-03-30 11:00:00', '2026-03-30 11:00:00'),
  (25, 33, 'Marque Fabien #1',     'uber_eats', 1, 0, '2026-03-15', 1, 'active', 0,
   'Marque Fabien Rosso #1', '2026-03-15 11:00:00', '2026-03-15 11:00:00'),
  (26, 34, 'Marque Fabien #2',     'uber_eats', 1, 0, '2026-04-05', 1, 'active', 0,
   'Marque Fabien Rosso #2', '2026-04-05 11:00:00', '2026-04-05 11:00:00'),
  (27, 35, 'LK',                   'uber_eats', 1, 0, '2026-03-18', 1, 'active', 0,
   'Marque Elbac Haidar Mohamed — LK', '2026-03-18 11:00:00', '2026-03-18 11:00:00');

-- ============================================================
-- 4. TRANCHES FERMÉES DE SÉBASTIEN (user_id = 14)
-- ============================================================
-- Tranche 1 client : restos 17..21 — CLÔTURÉE (5e = O'Grill attribué portefeuille)
-- Tranche 2 client : restos 22..26 — OUVERTE (5e PAS attribué : règle suspendue par challenge)
-- Tranche 1 marque : marques 9..13 — CLÔTURÉE (5e = Krock Takos attribué portefeuille)
-- Tranche 2 marque : marques 14..18 — OUVERTE (5e PAS attribué : règle suspendue)
-- ============================================================
INSERT OR IGNORE INTO tranches_attribution
  (id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
   element_attribue_id, validation_ecrite, notes)
VALUES
  (1, 14, 'client', 1, '2026-01-20 10:00:00', '2026-03-10 10:00:00', 'cloturee',
   21, 1, 'Tranche 1 client Sébastien — 5e resto O''Grill attribué portefeuille 100% (règle 5/5 standard)'),
  (2, 14, 'client', 2, '2026-03-20 10:00:00', NULL, 'ouverte',
   NULL, 0, 'Tranche 2 client Sébastien — commence à Sultant Restaurant. La règle 5/5 est SUSPENDUE par le challenge CH-2026-05-SEBASTIAN-30R, donc le 5e resto ne déclenche PAS d''attribution automatique.'),
  (3, 14, 'marque', 1, '2026-01-25 10:00:00', '2026-03-15 10:00:00', 'cloturee',
   13, 1, 'Tranche 1 marque Sébastien — 5e marque Krock Takos (dans O''Grill) attribuée portefeuille 100%'),
  (4, 14, 'marque', 2, '2026-03-25 10:00:00', NULL, 'ouverte',
   NULL, 0, 'Tranche 2 marque Sébastien — commence à Sultant. Règle 5/5 SUSPENDUE par challenge.');

-- Éléments des tranches (UNIQUE agent_id, type, element_id)
INSERT OR IGNORE INTO tranche_elements
  (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, date_qualification, notes)
VALUES
  -- Tranche 1 client (restos 17..21) — clôturée
  (1, 14, 'client', 17, 1, 0, '2026-01-20 10:00:00', 'Position 1'),
  (1, 14, 'client', 18, 2, 0, '2026-02-01 10:00:00', 'Position 2'),
  (1, 14, 'client', 19, 3, 0, '2026-02-15 10:00:00', 'Position 3'),
  (1, 14, 'client', 20, 4, 0, '2026-03-01 10:00:00', 'Position 4'),
  (1, 14, 'client', 21, 5, 1, '2026-03-10 10:00:00', 'Position 5 = ATTRIBUTION (O''Grill)'),
  -- Tranche 2 client (restos 22..26) — ouverte (5e PAS attribué)
  (2, 14, 'client', 22, 1, 0, '2026-03-20 10:00:00', 'Position 1 (Sultant Restaurant — début règle suspendue)'),
  (2, 14, 'client', 23, 2, 0, '2026-04-01 10:00:00', 'Position 2 (règle suspendue)'),
  (2, 14, 'client', 24, 3, 0, '2026-04-10 10:00:00', 'Position 3 (règle suspendue)'),
  (2, 14, 'client', 25, 4, 0, '2026-04-20 10:00:00', 'Position 4 (règle suspendue)'),
  (2, 14, 'client', 26, 5, 0, '2026-04-28 10:00:00', 'Position 5 — règle 5/5 SUSPENDUE : PAS d''attribution automatique'),
  -- Tranche 1 marque (marques 9..13) — clôturée
  (3, 14, 'marque',  9, 1, 0, '2026-01-25 10:00:00', 'Position 1'),
  (3, 14, 'marque', 10, 2, 0, '2026-02-05 10:00:00', 'Position 2'),
  (3, 14, 'marque', 11, 3, 0, '2026-02-20 10:00:00', 'Position 3'),
  (3, 14, 'marque', 12, 4, 0, '2026-03-05 10:00:00', 'Position 4'),
  (3, 14, 'marque', 13, 5, 1, '2026-03-15 10:00:00', 'Position 5 = ATTRIBUTION (Krock Takos)'),
  -- Tranche 2 marque (marques 14..18) — ouverte (5e PAS attribué)
  (4, 14, 'marque', 14, 1, 0, '2026-03-25 10:00:00', 'Position 1 (Sultant — règle suspendue)'),
  (4, 14, 'marque', 15, 2, 0, '2026-04-05 10:00:00', 'Position 2 (règle suspendue)'),
  (4, 14, 'marque', 16, 3, 0, '2026-04-15 10:00:00', 'Position 3 (règle suspendue)'),
  (4, 14, 'marque', 17, 4, 0, '2026-04-22 10:00:00', 'Position 4 (règle suspendue)'),
  (4, 14, 'marque', 18, 5, 0, '2026-04-29 10:00:00', 'Position 5 — règle 5/5 SUSPENDUE : PAS d''attribution automatique');

-- ============================================================
-- 5. TRANCHES POUR LES AUTRES COMMERCIAUX (ouvertes, pas de 5e)
-- ============================================================
INSERT OR IGNORE INTO tranches_attribution
  (id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
   element_attribue_id, validation_ecrite, notes)
VALUES
  (5, 12, 'client', 1, '2026-02-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Kamel Mehdi'),
  (6, 29, 'client', 1, '2026-02-20 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Hamou OULD BESSI'),
  (7, 13, 'client', 1, '2026-03-01 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Sabrina Hadri'),
  (8, 22, 'client', 1, '2026-03-05 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Gregory Hadri'),
  (9, 20, 'client', 1, '2026-03-10 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Fabien Rosso'),
  (10, 21, 'client', 1, '2026-03-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 Elbac Haidar Mohamed');

INSERT OR IGNORE INTO tranche_elements
  (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, date_qualification, notes)
VALUES
  -- Kamel Mehdi : 1 resto + 1 marque
  (5, 12, 'client', 27, 1, 0, '2026-02-15 11:00:00', 'MEAL N. FOOD — position 1'),
  -- Hamou OULD BESSI : 1 resto + 1 marque
  (6, 29, 'client', 28, 1, 0, '2026-02-20 11:00:00', 'MALABAR FOODS — position 1'),
  -- Sabrina Hadri : 2 restos
  (7, 13, 'client', 29, 1, 0, '2026-03-01 11:00:00', 'Position 1'),
  (7, 13, 'client', 30, 2, 0, '2026-03-20 11:00:00', 'Position 2'),
  -- Gregory Hadri : 2 restos
  (8, 22, 'client', 31, 1, 0, '2026-03-05 11:00:00', 'Position 1'),
  (8, 22, 'client', 32, 2, 0, '2026-03-25 11:00:00', 'Position 2'),
  -- Fabien Rosso : 2 restos
  (9, 20, 'client', 33, 1, 0, '2026-03-10 11:00:00', 'Position 1'),
  (9, 20, 'client', 34, 2, 0, '2026-04-01 11:00:00', 'Position 2'),
  -- Elbac Haidar Mohamed : 1 resto LK
  (10, 21, 'client', 35, 1, 0, '2026-03-15 11:00:00', 'LK — position 1');

-- Tranches marques pour les autres commerciaux
INSERT OR IGNORE INTO tranches_attribution
  (id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
   element_attribue_id, validation_ecrite, notes)
VALUES
  (11, 12, 'marque', 1, '2026-02-18 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Kamel Mehdi'),
  (12, 29, 'marque', 1, '2026-02-23 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Hamou OULD BESSI'),
  (13, 13, 'marque', 1, '2026-03-05 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Sabrina Hadri'),
  (14, 22, 'marque', 1, '2026-03-10 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Gregory Hadri'),
  (15, 20, 'marque', 1, '2026-03-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Fabien Rosso'),
  (16, 21, 'marque', 1, '2026-03-18 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Elbac Haidar Mohamed');

INSERT OR IGNORE INTO tranche_elements
  (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, date_qualification, notes)
VALUES
  (11, 12, 'marque', 19, 1, 0, '2026-02-18 11:00:00', 'Meal N Food — position 1'),
  (12, 29, 'marque', 20, 1, 0, '2026-02-23 11:00:00', 'Malabar Foods — position 1'),
  (13, 13, 'marque', 21, 1, 0, '2026-03-05 11:00:00', 'Position 1'),
  (13, 13, 'marque', 22, 2, 0, '2026-03-25 11:00:00', 'Position 2'),
  (14, 22, 'marque', 23, 1, 0, '2026-03-10 11:00:00', 'Position 1'),
  (14, 22, 'marque', 24, 2, 0, '2026-03-30 11:00:00', 'Position 2'),
  (15, 20, 'marque', 25, 1, 0, '2026-03-15 11:00:00', 'Position 1'),
  (15, 20, 'marque', 26, 2, 0, '2026-04-05 11:00:00', 'Position 2'),
  (16, 21, 'marque', 27, 1, 0, '2026-03-18 11:00:00', 'LK — position 1');

-- ============================================================
-- 6. CHALLENGE Sébastien : CH-2026-05-SEBASTIAN-30R
-- ============================================================
-- Du 1er mai au 30 juin 2026
-- Objectif : 30 restaurants apportés sur la période
-- Récompense : 15 restaurants choisis en portefeuille 100%
-- suspend_tranche_standard = 1 → règle 5/5 suspendue pendant le challenge
-- ============================================================
INSERT OR IGNORE INTO challenges
  (id, code, nom, description,
   date_debut, date_fin,
   type_objectif, objectif_quantite,
   type_recompense, recompense_quantite, recompense_montant, recompense_description,
   suspend_tranche_standard, cible, actif,
   notes_internes, created_by,
   created_at, updated_at)
VALUES
  (1,
   'CH-2026-05-SEBASTIAN-30R',
   'Challenge été 2026 — 30 restos = 15 en portefeuille 100%',
   'Apporter 30 restaurants entre le 1er mai et le 30 juin 2026. Si l''objectif est atteint, l''agent peut choisir 15 restaurants à mettre dans son portefeuille personnel à 100%. Pendant la durée du challenge, la règle standard 5/5 (5e resto = portefeuille) est SUSPENDUE pour les participants : aucun resto/marque apporté pendant le challenge ne déclenche d''attribution automatique. La récompense de 15 restos remplace ce mécanisme.',
   '2026-05-01', '2026-06-30',
   'restaurants', 30,
   'portefeuille_restaurants', 15, NULL,
   '15 restaurants au choix de l''agent en portefeuille 100%',
   1,                   -- suspend_tranche_standard
   'selection',         -- cible : uniquement les agents inscrits
   1,                   -- actif
   'Challenge créé pour Sébastien Garcia (user_id=14). Démarrage à partir de Sultant Restaurant (resto #6) — tous les restos signés avant le 2026-05-01 ne comptent PAS dans la progression. La règle 5/5 est suspendue à partir de Sultant pour Sébastien.',
   1,                   -- created_by = admin (user 1)
   '2026-04-25 09:00:00', '2026-04-25 09:00:00');

-- ============================================================
-- 7. INSCRIPTION de Sébastien (user_id = 14) dans le challenge
-- ============================================================
INSERT OR IGNORE INTO challenge_participations
  (id, challenge_id, agent_id, statut, progression_actuelle,
   date_participation, notes_admin)
VALUES
  (1, 1, 14, 'en_cours', 0,
   '2026-04-25 09:30:00',
   'Sébastien Garcia inscrit dès la création du challenge. Tous ses restos actuels (10) sont signés AVANT le 2026-05-01, ils ne comptent donc pas dans la progression. Le compteur démarre à 0 et incrémentera à chaque nouveau resto signé entre le 1er mai et le 30 juin 2026.');
