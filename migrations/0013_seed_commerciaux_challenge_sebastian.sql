-- ============================================================
-- Migration 0013 : SEED des 7 commerciaux + portefeuilles existants
--                 + Challenge Sebastian Garcia (1er mai → 30 juin 2026)
-- ============================================================
-- Tous les restaurants/marques sont rentrés AVANT le challenge.
-- Sebastian a déjà 5e marque portefeuille = Krock Takos (règle standard 5/5).
-- À partir de Sultant Restaurant (rang_apport=9), la règle 5/5 est suspendue
-- car remplacée par le challenge.
-- ============================================================

-- ============================================================
-- 1. UTILISATEURS (commerciaux) — tous niveau 0, parent_id=NULL (N0 direct)
-- ============================================================
-- Mots de passe (PBKDF2/100000/SHA-256) :
--   sebastian.garcia@dropeat.fr → Sebastian2026!
--   kamel@dropeat.fr            → Kamel2026!
--   hamou@dropeat.fr            → Hamou2026!
--   sabrina@dropeat.fr          → Sabrina2026!
--   greg@dropeat.fr             → Greg2026!
--   fabien@dropeat.fr           → Fabien2026!
--   elbak@dropeat.fr            → Elbak2026!

INSERT OR IGNORE INTO users (email, password_hash, role, nom, prenom, niveau, parent_id, actif, notes)
VALUES
  ('sebastian.garcia@dropeat.fr',
   'pbkdf2$100000$6f05e61fb3db377f229209b37a1fbdc1$688875874df0f4b1a9bddb142adc8d65c0dc145ccfae0dfe5e2cab8e7b9e88a4',
   'agent', 'Garcia', 'Sebastian', 0, NULL, 1,
   'Commercial principal — Top performer. Participe au challenge CH-2026-SEB-30R.'),
  ('kamel@dropeat.fr',
   'pbkdf2$100000$ee7b4c4aec3178e0e9c694751f6f7fad$1111a6a7f3f9e3bfad4b04e80fd42cce6a2c92092b4aa35b8b9d7a00781d7013',
   'agent', 'Kamel', 'Commercial', 0, NULL, 1, 'Commercial N0.'),
  ('hamou@dropeat.fr',
   'pbkdf2$100000$7e9d7095aeb50fd23567b88c95632d3c$358f90c8cf92a06ab641714ce09a9616c551f36afaa986dcf16635b450060602',
   'agent', 'Hamou', 'Commercial', 0, NULL, 1, 'Commercial N0 — secteur Dijon.'),
  ('sabrina@dropeat.fr',
   'pbkdf2$100000$cd041a46a7cca20821d4d6b4f3b82c4e$79de353d3cde9c3b30cd37a605beece9420c5a4076d791f34a77355ae1799526',
   'agent', 'Sabrina', 'Commerciale', 0, NULL, 1, 'Commerciale N0 — secteur Nîmes.'),
  ('greg@dropeat.fr',
   'pbkdf2$100000$914301c88dd41ab10c0e9c5cfa4a90a9$35e76a893f3c901e9a6c382c2743b3410e8d17ad5ac6994c84e005ed892f6255',
   'agent', 'Greg', 'Commercial', 0, NULL, 1, 'Commercial N0.'),
  ('fabien@dropeat.fr',
   'pbkdf2$100000$9a6bd10527a3d046bba490eb3730a785$a5695e18d4797bb1b2cfb26d5533f04d4617b0287b6f376a7d20e5e1811a23f6',
   'agent', 'Fabien', 'Commercial', 0, NULL, 1, 'Commercial N0 — secteur Marseille.'),
  ('elbak@dropeat.fr',
   'pbkdf2$100000$0f2a532bf265ba96169332140a55ce3b$d0f0845aced04ae4061838e40b3e204b9826f6221b06d878df1ff3d338331c02',
   'agent', 'Elbak', 'Commercial', 0, NULL, 1, 'Commercial N0 — secteur Laval.');

-- ============================================================
-- 2. RESTAURANTS de Sebastian Garcia (10 restaurants)
-- ============================================================
-- IMPORTANT : tous ces restos sont apportés AVANT ou pendant la période,
-- mais entrés dans le système avant le démarrage du challenge.
-- date_signature de chaque resto encode l'ordre d'apport (rang_apport).
-- À partir du resto rang=9 (Sultant Restaurant), date_signature = 2026-05-01
-- (basculement vers la règle Challenge, suspension du 5/5 standard).

-- Resto 1 : O'Grill
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'O''Grill', 'Nîmes', u.id, 1, '2025-09-15', 1,
       'Apporté par Sebastian Garcia — rang 1'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 2 : Taco 19
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Taco 19', 'Nîmes', u.id, 2, '2025-10-10', 1,
       'Apporté par Sebastian Garcia — rang 2'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 3 : BIGG BURGER30
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'BIGG BURGER30', 'Nîmes', u.id, 3, '2025-11-05', 1,
       'Apporté par Sebastian Garcia — rang 3'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 4 : GUJJAR
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'GUJJAR', 'Nîmes', u.id, 4, '2025-12-01', 1,
       'Apporté par Sebastian Garcia — rang 4'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 5 : La Corniche (Portefeuille Client)
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif,
                                    is_portefeuille_proprietaire, date_signature_portefeuille, notes)
SELECT 'La Corniche', 'Tarascon', u.id, 5, '2026-01-08', 1,
       0, NULL,
       'Apporté par Sebastian Garcia — rang 5. PORTEFEUILLE CLIENT (BB GOOD BURGER TARASCON).'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 6 : CITY BRUNCH
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'CITY BRUNCH', 'Montpellier', u.id, 6, '2026-02-02', 1,
       'Apporté par Sebastian Garcia — rang 6'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 7 : Le 100dwich
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Le 100dwich', 'Nîmes', u.id, 7, '2026-03-04', 1,
       'Apporté par Sebastian Garcia — rang 7'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 8 : SMASHOW
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'SMASHOW', 'Nîmes', u.id, 8, '2026-04-12', 1,
       'Apporté par Sebastian Garcia — rang 8'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 9 : Sultant Restaurant — POINT DE BASCULE CHALLENGE
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Sultant Restaurant', 'Nîmes', u.id, 9, '2026-05-01', 1,
       'Apporté par Sebastian Garcia — rang 9. POINT DE BASCULE : début du challenge CH-2026-SEB-30R. Règle standard 5/5 suspendue à partir d''ici.'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- Resto 10 : CHEZLEBOSS
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'CHEZLEBOSS', 'Salon-de-Provence', u.id, 10, '2026-05-10', 1,
       'Apporté par Sebastian Garcia — rang 10. Pendant le challenge.'
FROM users u WHERE u.email = 'sebastian.garcia@dropeat.fr';

-- ============================================================
-- 3. MARQUES VIRTUELLES de Sebastian Garcia
-- ============================================================
-- Règle 5/5 standard : 5e marque créée = Portefeuille Propriétaire 100%
-- => Krock Takos (2e marque du resto O'Grill) est la 5e marque globale
--    de Sebastian → is_portefeuille_proprietaire = 1
-- Les marques créées APRÈS Krock Takos sont aussi des marques d'avant-challenge
-- (Sultant Restaurant marque le basculement). On ne marque PAS d'autre portefeuille
-- automatique : le 10e/15e/20e... bénéficiera du challenge (15 portefeuille libres).

-- O'Grill (resto 1) : Pizza Nostra (1) + Krock Takos (2) — Krock Takos = 5e marque globale
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Pizza Nostra', 1, 0, '2025-09-20', 'active',
       'Marque #1 globale de Sebastian. Resto O''Grill.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'O''Grill';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, date_signature_portefeuille, statut_marque, notes)
SELECT r.id, 'Krock Takos', 2, 1, '2025-10-01', '2025-10-01', 'portefeuille',
       'Marque #5 globale de Sebastian → 5e MARQUE PORTEFEUILLE (règle standard 5/5). Resto O''Grill.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'O''Grill';

-- Taco 19 (resto 2) : BB HOT BURGER (1) + BANGER TAKOS NÎMES (2)
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'BB HOT BURGER', 1, 0, '2025-10-15', 'active',
       'Marque #2 globale de Sebastian. Resto Taco 19.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'Taco 19';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'BANGER TAKOS NÎMES', 2, 0, '2025-10-20', 'active',
       'Marque #3 globale de Sebastian. Resto Taco 19.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'Taco 19';

-- BIGG BURGER30 (resto 3) : BB GOOD BURGER (1) + Kroc Arena Nîmes (2)
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER', 1, 0, '2025-11-10', 'active',
       'Marque #4 globale de Sebastian. Resto BIGG BURGER30.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'BIGG BURGER30';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Kroc Arena Nîmes', 2, 0, '2025-11-15', 'active',
       'Marque #6 globale de Sebastian. Resto BIGG BURGER30.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'BIGG BURGER30';

-- GUJJAR (resto 4) : Palais d'Or Poulet et Riz
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Palais d''Or Poulet et Riz', 1, 0, '2025-12-05', 'active',
       'Marque #7 globale de Sebastian. Resto GUJJAR.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'GUJJAR';

-- La Corniche (resto 5) : BB GOOD BURGER TARASCON (Portefeuille Client)
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER TARASCON', 1, 0, '2026-01-12', 'active',
       'Marque #8 globale de Sebastian. Resto La Corniche — Portefeuille Client.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'La Corniche';

-- CITY BRUNCH (resto 6) : Naanwich Burger Montpellier
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Naanwich Burger Montpellier', 1, 0, '2026-02-06', 'active',
       'Marque #9 globale de Sebastian. Resto CITY BRUNCH.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'CITY BRUNCH';

-- Le 100dwich (resto 7) : Gare au Panini Nîmes
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Gare au Panini Nîmes', 1, 0, '2026-03-08', 'active',
       'Marque #10 globale de Sebastian. Resto Le 100dwich.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'Le 100dwich';

-- SMASHOW (resto 8) : Ma Pizza Bangers
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Ma Pizza Bangers', 1, 0, '2026-04-15', 'active',
       'Marque #11 globale de Sebastian. Resto SMASHOW.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'SMASHOW';

-- Sultant Restaurant (resto 9) : Kroc Takos — Le Gras C'est La Vie (PENDANT CHALLENGE)
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'Kroc Takos — Le Gras C''est La Vie', 1, 0, '2026-05-02', 'active',
       'Marque #12 globale de Sebastian. Resto Sultant — DÉBUT CHALLENGE. Règle 5/5 standard SUSPENDUE.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'Sultant Restaurant';

-- CHEZLEBOSS (resto 10) : BB GOOD BURGER Salon-de-Provence (PENDANT CHALLENGE)
INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, is_portefeuille_proprietaire,
                                          date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER Salon-de-Provence', 1, 0, '2026-05-11', 'active',
       'Marque #13 globale de Sebastian. Resto CHEZLEBOSS — pendant CHALLENGE.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sebastian.garcia@dropeat.fr' AND r.nom = 'CHEZLEBOSS';

-- ============================================================
-- 4. KAMEL — MEAL N. FOOD → BB GOOD BURGER Valence
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'MEAL N. FOOD', 'Valence', u.id, 1, '2026-01-20', 1,
       'Apporté par Kamel.'
FROM users u WHERE u.email = 'kamel@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER Valence', 1, '2026-01-25', 'active',
       'Marque #1 de Kamel. Resto MEAL N. FOOD.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'kamel@dropeat.fr' AND r.nom = 'MEAL N. FOOD';

-- ============================================================
-- 5. HAMOU — MALABAR FOODS (2 adresses Dijon) → BB GOOD BURGER DIJON
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'MALABAR FOODS — Dijon Centre', 'Dijon', u.id, 1, '2026-02-10', 1,
       'Apporté par Hamou — 1re adresse.'
FROM users u WHERE u.email = 'hamou@dropeat.fr';

INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'MALABAR FOODS — Dijon Sud', 'Dijon', u.id, 2, '2026-02-15', 1,
       'Apporté par Hamou — 2e adresse.'
FROM users u WHERE u.email = 'hamou@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER DIJON', 1, '2026-02-20', 'active',
       'Marque #1 de Hamou.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'hamou@dropeat.fr' AND r.nom = 'MALABAR FOODS — Dijon Centre';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER DIJON', 1, '2026-02-22', 'active',
       'Marque #2 de Hamou (2e adresse).'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'hamou@dropeat.fr' AND r.nom = 'MALABAR FOODS — Dijon Sud';

-- ============================================================
-- 6. SABRINA — 2 restos
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Brasserie du Carré St Dominique', 'Nîmes', u.id, 1, '2026-01-15', 1,
       'Apporté par Sabrina.'
FROM users u WHERE u.email = 'sabrina@dropeat.fr';

INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'ELSA DELICE', 'Nîmes', u.id, 2, '2026-02-18', 1,
       'Apporté par Sabrina.'
FROM users u WHERE u.email = 'sabrina@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Burgerignos Nîmes', 1, '2026-01-20', 'active',
       'Marque #1 de Sabrina.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sabrina@dropeat.fr' AND r.nom = 'Brasserie du Carré St Dominique';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Kroc Burgers Nîmes', 1, '2026-02-22', 'active',
       'Marque #2 de Sabrina.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'sabrina@dropeat.fr' AND r.nom = 'ELSA DELICE';

-- ============================================================
-- 7. GREG — 2 restos
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'CAVERNE A PIZZA', NULL, u.id, 1, '2026-01-08', 1,
       'Apporté par Greg.'
FROM users u WHERE u.email = 'greg@dropeat.fr';

INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'BENASTA', NULL, u.id, 2, '2026-03-12', 1,
       'Apporté par Greg.'
FROM users u WHERE u.email = 'greg@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Pizza Banger', 1, '2026-01-12', 'active',
       'Marque #1 de Greg.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'greg@dropeat.fr' AND r.nom = 'CAVERNE A PIZZA';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Maison Nassima', 1, '2026-03-15', 'active',
       'Marque #2 de Greg.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'greg@dropeat.fr' AND r.nom = 'BENASTA';

-- ============================================================
-- 8. FABIEN — 2 restos Marseille
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Le Grill System', 'Marseille', u.id, 1, '2026-01-25', 1,
       'Apporté par Fabien.'
FROM users u WHERE u.email = 'fabien@dropeat.fr';

INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'Istanbul Kebab', 'Marseille', u.id, 2, '2026-03-05', 1,
       'Apporté par Fabien.'
FROM users u WHERE u.email = 'fabien@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Gros Croc Marseille', 1, '2026-01-30', 'active',
       'Marque #1 de Fabien.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'fabien@dropeat.fr' AND r.nom = 'Le Grill System';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'Kroc Takos Marseille', 1, '2026-03-08', 'active',
       'Marque #2 de Fabien.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'fabien@dropeat.fr' AND r.nom = 'Istanbul Kebab';

-- ============================================================
-- 9. ELBAK — LK → BB GOOD BURGER LAVAL
-- ============================================================
INSERT OR IGNORE INTO restaurants (nom, ville, agent_id, rang_apport, date_signature, actif, notes)
SELECT 'LK', 'Laval', u.id, 1, '2026-02-25', 1,
       'Apporté par Elbak.'
FROM users u WHERE u.email = 'elbak@dropeat.fr';

INSERT OR IGNORE INTO marques_virtuelles (restaurant_id, nom, rang_creation, date_lancement, statut_marque, notes)
SELECT r.id, 'BB GOOD BURGER LAVAL', 1, '2026-03-01', 'active',
       'Marque #1 de Elbak.'
FROM restaurants r JOIN users u ON r.agent_id = u.id
WHERE u.email = 'elbak@dropeat.fr' AND r.nom = 'LK';

-- ============================================================
-- 10. CHALLENGE CH-2026-SEB-30R
-- ============================================================
-- Sebastian doit apporter 30 restos (ou marques) entre 2026-05-01 et 2026-06-30
-- → récompense : 15 restos en portefeuille 100% au choix.
-- suspend_tranche_standard=1 : pendant la période, la règle 5/5 est suspendue
-- pour les participants.

INSERT OR IGNORE INTO challenges (
  code, nom, description,
  date_debut, date_fin,
  type_objectif, objectif_quantite,
  type_recompense, recompense_quantite, recompense_description,
  suspend_tranche_standard, cible,
  actif, notes_internes,
  created_by
)
SELECT
  'CH-2026-SEB-30R',
  'Challenge Sebastian Garcia — 30 restos → 15 portefeuille (mai-juin 2026)',
  'Sebastian doit apporter 30 restaurants entre le 1er mai et le 30 juin 2026. '
    || 'Si l''objectif est atteint, il pourra choisir 15 restaurants à mettre en portefeuille 100%. '
    || 'Pendant la période, la règle standard du 5e resto/marque est suspendue pour les participants.',
  '2026-05-01', '2026-06-30',
  'restaurants', 30,
  'portefeuille_restaurants', 15,
  '15 restaurants à choisir (par l''agent) parmi ceux apportés pendant la période — passés en portefeuille 100%.',
  1, -- suspend_tranche_standard
  'selection', -- inscription manuelle (seulement Sebastian)
  1,
  'Challenge dédié à Sebastian Garcia. Bascule à partir du resto "Sultant Restaurant" (rang 9).',
  (SELECT id FROM users WHERE role='superadmin' ORDER BY id LIMIT 1);

-- ============================================================
-- 11. PARTICIPATION : Sebastian inscrit au challenge
-- ============================================================
-- progression_actuelle calculée à partir des restos apportés
-- entre 2026-05-01 et 2026-06-30 par Sebastian.
-- À ce stade du seed : Sultant Restaurant (2026-05-01) + CHEZLEBOSS (2026-05-10)
-- = 2 restos déjà comptabilisés.

INSERT OR IGNORE INTO challenge_participations (
  challenge_id, agent_id,
  statut, progression_actuelle,
  notes_admin
)
SELECT
  c.id, u.id,
  'en_cours', 2,
  'Inscrit manuellement par superadmin au lancement du challenge. Progression : Sultant Restaurant + CHEZLEBOSS.'
FROM challenges c
CROSS JOIN users u
WHERE c.code = 'CH-2026-SEB-30R'
  AND u.email = 'sebastian.garcia@dropeat.fr';

-- ============================================================
-- 12. ÉLÉMENTS comptabilisés (snapshot des restos pendant la période)
-- ============================================================
-- Sultant Restaurant + CHEZLEBOSS (les 2 restos apportés depuis le 2026-05-01)

INSERT OR IGNORE INTO challenge_elements (
  participation_id, challenge_id, agent_id,
  type_element, element_id, date_apport
)
SELECT
  cp.id, c.id, u.id,
  'restaurant', r.id, r.date_signature
FROM challenges c
JOIN users u ON u.email = 'sebastian.garcia@dropeat.fr'
JOIN challenge_participations cp ON cp.challenge_id = c.id AND cp.agent_id = u.id
JOIN restaurants r ON r.agent_id = u.id
  AND r.date_signature >= c.date_debut
  AND r.date_signature <= c.date_fin
WHERE c.code = 'CH-2026-SEB-30R';

-- ============================================================
-- 13. TRACE
-- ============================================================
INSERT INTO _migration_log (migration) VALUES ('0013_seed_commerciaux_challenge_sebastian');
