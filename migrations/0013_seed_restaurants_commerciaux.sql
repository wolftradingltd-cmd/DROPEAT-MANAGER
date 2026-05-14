-- ============================================================
-- Migration 0013 : Restaurants/Marques RÉELS pour les 7 commerciaux EXISTANTS
--                + Challenge Sébastien Garcia (1er mai → 30 juin 2026)
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
-- RÈGLE CRITIQUE : Tous les restos/marques sont rentrés AVANT le challenge
-- (date_signature < 2026-05-01) afin qu'ils ne soient PAS comptabilisés
-- dans la progression du challenge.
--
-- Pour Sébastien : à partir de « Sultant Restaurant » (tranche 2 / resto 4),
-- la règle standard 5/5 est SUSPENDUE jusqu'au 30 juin 2026.
-- ============================================================

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- 1. RESTAURANTS DE SÉBASTIEN GARCIA (user_id = 14)
-- ============================================================
-- TRANCHE 1 (5 restos) — règle 5/5 STANDARD : O'Grill = 5e portefeuille
-- Note : O'Grill apparaît UNE seule fois en tant que restaurant
-- (avec 2 marques : Pizza Nostra + Krock Takos, la 5e marque portefeuille)
-- ============================================================
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  -- Tranche 1
  (17, 'O''Grill', '24 Route d''Espalion', '12850', 'Onet-le-Château', 14, 1, 1,
   '2026-01-20', 1, 'CIFTCI', 'CAHIT', 'cahitdrop@atomicmail.io',
   'Sébastien — TRANCHE 1 / R1 — Restaurant principal (Tacos/Pizzas/Burgers). Mot de passe : Dropeat2026@. Plateforme Uber : https://urls.fr/Fjz5KE. 5e MARQUE portefeuille = Krock Takos (dans ce restaurant).',
   '2026-01-20 10:00:00', '2026-01-20 10:00:00'),
  (18, 'Taco 19', '21 B Avenue Franklin Roosevelt', '30000', 'Nîmes', 14, 2, 0,
   '2026-02-01', 1, 'CHERKAOUI', 'IMANE', 'imanecher@atomicmail.io',
   'Sébastien — TRANCHE 1 / R2. Emails : imanecher@atomicmail.io + coversip.business@gmail.com. Mot de passe : Dropeat@2026. Plateforme Uber : https://urlr.me/fGDxEN.',
   '2026-02-01 10:00:00', '2026-02-01 10:00:00'),
  (19, 'BIGG BURGER30', '21 Boulevard Gambetta', '30000', 'Nîmes', 14, 3, 0,
   '2026-02-15', 1, 'KAMEL', 'Laila', 'lailakamel@atomicmail.io',
   'Sébastien — TRANCHE 1 / R3. Emails : lailakamel@atomicmail.io + robertsannaofficiel@gmail.com. Mot de passe : Dropeat@2026. Plateforme Uber : https://urls.fr/VLvgOf.',
   '2026-02-15 10:00:00', '2026-02-15 10:00:00'),
  (20, 'GUJJAR', '18 Rue des Écoles Laïques', '34000', 'Montpellier', 14, 4, 0,
   '2026-03-01', 1, 'SHAHZAD', 'Ajmal', 'shahzadajmal@atomicmail.io',
   'Sébastien — TRANCHE 1 / R4. Emails : shahzadajmal@atomicmail.io + juliapaya361@gmail.com. Mot de passe : Dropeat@2026. Plateforme Uber : https://urls.fr/98BBnc.',
   '2026-03-01 10:00:00', '2026-03-01 10:00:00'),
  -- PORTEFEUILLE CLIENT (5e resto) — règle 5/5 standard
  (21, 'La Corniche', '24 Boulevard Victor Hugo', '13150', 'Tarascon', 14, 5, 1,
   '2026-03-10', 1, 'JABRI', 'MAHER', 'lacorniche15@protonmail.com',
   'Sébastien — TRANCHE 1 / R5 = PORTEFEUILLE CLIENT 100% (règle 5/5 standard). Mot de passe : Dropeat@2026. Plateforme Uber : https://l1nq.com/7g2wuvq.',
   '2026-03-10 10:00:00', '2026-03-10 10:00:00'),
  -- TRANCHE 2 — RÈGLE 5/5 SUSPENDUE à partir de Sultant Restaurant
  (22, 'CITY BRUNCH', '35 Rue de Verdun', '34000', 'Montpellier', 14, 6, 0,
   '2026-03-20', 1, 'MANAP', 'Delphine', 'citybrunch@protonmail.com',
   'Sébastien — TRANCHE 2 / R1. Mot de passe : Dropeat@2026.',
   '2026-03-20 10:00:00', '2026-03-20 10:00:00'),
  (23, 'Le 100dwich', '2 Boulevard du Sergent Triaire', '30000', 'Nîmes', 14, 7, 0,
   '2026-04-01', 1, 'TALHAOUI', 'Hommad', 'le100witch@atomicmail.io',
   'Sébastien — TRANCHE 2 / R2. Mot de passe : Dropeat@2026. Lien : https://urli.info/1tYPY.',
   '2026-04-01 10:00:00', '2026-04-01 10:00:00'),
  (24, 'SMASHOW', '118 Route d''Avignon', '30000', 'Nîmes', 14, 8, 0,
   '2026-04-10', 1, 'NAOUALI', 'Bilel', 'solarimpulse.game@gmail.com',
   'Sébastien — TRANCHE 2 / R3. Mot de passe : Dropeat@2026. Plateforme Uber.',
   '2026-04-10 10:00:00', '2026-04-10 10:00:00'),
  -- DÉBUT SUSPENSION RÈGLE 5/5 (Sultant Restaurant)
  (25, 'Sultant Restaurant', '21 Place du Millénaire', '34000', 'Montpellier', 14, 9, 0,
   '2026-04-20', 1, 'MEHMET', 'Selim', 'sultant34@protonmail.com',
   'Sébastien — TRANCHE 2 / R4 — RESTAURANT DE DÉPART DE LA SUSPENSION RÈGLE 5/5 (jusqu''au 30 juin 2026). Mot de passe : Dropeat@2026. Plateforme Uber : https://urls.fr/UTxE2t.',
   '2026-04-20 10:00:00', '2026-04-20 10:00:00'),
  (26, 'CHEZLEBOSS', '320 Allée de Craponne', NULL, 'Salon-de-Provence', 14, 10, 0,
   '2026-04-28', 1, 'Bouwdene', 'Jessim', 'chezleboss@protonmail.com',
   'Sébastien — TRANCHE 2 / R5 — règle 5/5 SUSPENDUE : pas d''attribution automatique. Mot de passe : Dropeat@2026. Plateforme Uber : https://urlr.me/B9G7xN.',
   '2026-04-28 10:00:00', '2026-04-28 10:00:00');

-- ============================================================
-- 2. RESTAURANTS DES AUTRES COMMERCIAUX
-- ============================================================

-- Kamel Mehdi (user_id = 12) — 1 resto
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (27, 'MEAL N. FOOD', '72 Rue Montplaisir', '26000', 'Valence', 12, 1, 0,
   '2026-02-15', 1, 'MERZOUG', 'BRICE', 'merzougbrice@atomicmail.io',
   'Kamel — TRANCHE 1 / R1. Emails : merzougbrice@atomicmail.io + arricaltd@gmail.com. Mot de passe : Dropeat@2026. Plateforme Uber : https://urls.fr/JjQqBuu. Région : ARA.',
   '2026-02-15 11:00:00', '2026-02-15 11:00:00');

-- Hamou OULD BESSI (user_id = 29) — 1 resto
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (28, 'MALABAR FOODS', '39 Rue Berbisey', '21000', 'Dijon', 29, 1, 0,
   '2026-02-20', 1, 'THOMAS', 'ROBIN', 'malabarfood@protonmail.com',
   'Hamou — TRANCHE 1 / R1. Adresses : 39 Rue Berbisey, 21000 Dijon ET 13 Boulevard de Strasbourg, Dijon 21000. Mot de passe : Dropeat@2026. Plateforme Uber : https://sl1nk.com/l8itfvu.',
   '2026-02-20 11:00:00', '2026-02-20 11:00:00');

-- Sabrina Hadri (user_id = 13) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (29, 'Brasserie du Carré St Dominique', '329 Avenue de Bir Hakeim, Carré St Dominique', '30000', 'Nîmes', 13, 1, 0,
   '2026-03-01', 1, 'KRAICHI', 'MOUNIA', 'taibimounia@protonmail.com',
   'Sabrina — TRANCHE 1 / R1. Mot de passe : Dropeat@2026. Plateforme Uber : https://sl1nk.com/qge11h5.',
   '2026-03-01 11:00:00', '2026-03-01 11:00:00'),
  (30, 'ELSA DELICE', '39 Rue Nationale', '30000', 'Nîmes', 13, 2, 0,
   '2026-03-20', 1, 'RIFI-LOUTFI', 'Fatine', 'biggburgerf@atomicmail.io',
   'Sabrina — TRANCHE 1 / R2. Mot de passe : Dropeat@2026. Plateforme Uber : https://shorturl.at/VwkUM.',
   '2026-03-20 11:00:00', '2026-03-20 11:00:00');

-- Gregory Hadri (user_id = 22) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (31, 'CAVERNE A PIZZA', '27 Rue Raymond Marcheron', '92170', 'Vanves', 22, 1, 0,
   '2026-03-05', 1, 'BOZLUR', 'ROHOMAN', 'caverneapizza@protonmail.com',
   'Greg — TRANCHE 1 / R1. Mot de passe : Dropeat@2026. Plateforme Uber : https://urlr.me/KY4pG7.',
   '2026-03-05 11:00:00', '2026-03-05 11:00:00'),
  (32, 'BENASTA', '46 Rue de Villacoublay', '78140', 'Vélizy-Villacoublay', 22, 2, 0,
   '2026-03-25', 1, 'ATTAR', 'Nassima', 'benastracouscous@protonmail.com',
   'Greg — TRANCHE 1 / R2. Mot de passe : Dropeat@2026.',
   '2026-03-25 11:00:00', '2026-03-25 11:00:00');

-- Fabien Rosso (user_id = 20) — 2 restos
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (33, 'Le Grill System', '1 Avenue des Olives', '13013', 'Marseille', 20, 1, 0,
   '2026-03-10', 1, 'AHMADZAI', 'Munir', 'grillfoodmars@protonmail.com',
   'Fabien — TRANCHE 1 / R1. Région : Provence-Alpes-Côte d''Azur. Mot de passe : Dropeat@2026. Plateforme Uber : https://shorturl.at/brRib.',
   '2026-03-10 11:00:00', '2026-03-10 11:00:00'),
  (34, 'Istanbul Kebab', '179 Avenue de la Rose', '13013', 'Marseille', 20, 2, 0,
   '2026-04-01', 1, 'OZEL', 'Deniz', 'ezomarseille13@protonmail.com',
   'Fabien — TRANCHE 1 / R2. Mot de passe : Dropeat@2026. Plateforme Uber.',
   '2026-04-01 11:00:00', '2026-04-01 11:00:00');

-- Elbac Haidar Mohamed (user_id = 21) — 1 resto
INSERT OR IGNORE INTO restaurants
  (id, nom, adresse, code_postal, ville, agent_id, rang_apport, is_portefeuille_proprietaire,
   date_signature, actif, gerant_nom, gerant_prenom, email, notes,
   created_at, updated_at)
VALUES
  (35, 'LK', '38 Avenue Robert Buron', '53000', 'Laval', 21, 1, 0,
   '2026-03-15', 1, 'LAMJED', 'Riadh', 'lk53000@protonmail.com',
   'Elbac — TRANCHE 1 / R1. Email Uber : byouss1@ext.uber.com. Mot de passe : Dropeat@2026. Plateforme Uber.',
   '2026-03-15 11:00:00', '2026-03-15 11:00:00');

-- ============================================================
-- 3. MARQUES VIRTUELLES (Uber Eats) — données RÉELLES
-- ============================================================
-- Note : Le champ "commission_info" et "acces_operationnels" stockent
-- les codes Google Authenticator (TOTP 2FA) + mots de passe + URLs Uber.
-- ============================================================

-- SÉBASTIEN — TRANCHE 1 marques
-- Resto O'Grill (id=17) a DEUX marques : Pizza Nostra + Krock Takos (5e portefeuille)
INSERT OR IGNORE INTO marques_virtuelles
  (id, restaurant_id, nom, plateforme, rang_creation, is_portefeuille_proprietaire,
   date_lancement, actif, statut_marque, exclue_tranche,
   uber_manager_email, uber_manager_password, uber_manager_url,
   commission_info, acces_operationnels, notes,
   created_at, updated_at)
VALUES
  (9, 17, 'Pizza Nostra', 'uber_eats', 1, 0, '2026-01-25', 1, 'active', 0,
   'cahitdrop@atomicmail.io', 'Dropeat2026@', 'https://urls.fr/Fjz5KE',
   'TOTP 2FA : S6AHWDWW3PP7BNWQIFNYHBMKCXH4ZXVE', 'O''Grill — Marque principale',
   'Sébastien — TRANCHE 1 marque #1 (dans O''Grill)',
   '2026-01-25 10:00:00', '2026-01-25 10:00:00'),
  (10, 18, 'BB HOT BURGER', 'uber_eats', 1, 0, '2026-02-05', 1, 'active', 0,
   'imanecher@atomicmail.io', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
   'TOTP 2FA : HPUD36SBJYENIBXSIKPID52RV5CAD3PL',
   'Email secondaire : coversip.business@gmail.com',
   'Sébastien — TRANCHE 1 marque #2 (dans Taco 19)',
   '2026-02-05 10:00:00', '2026-02-05 10:00:00'),
  (11, 19, 'BB GOOD BURGER', 'uber_eats', 1, 0, '2026-02-20', 1, 'active', 0,
   'lailakamel@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/VLvgOf',
   'TOTP 2FA : 6DGQEGKCHCVVRCX2HD3NEN5XIK7ZDBQF + LVUASTPUL42ROYWFQQW3MN4ZBLQYNXZG',
   'Email secondaire : robertsannaofficiel@gmail.com',
   'Sébastien — TRANCHE 1 marque #3 (dans BIGG BURGER30)',
   '2026-02-20 10:00:00', '2026-02-20 10:00:00'),
  (12, 20, 'Palais d''Or Poulet et Riz', 'uber_eats', 1, 0, '2026-03-05', 1, 'active', 0,
   'shahzadajmal@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/98BBnc',
   'TOTP 2FA : OKVVL2TTMFV443MR3HKJPRXZ7OQGVPX6 + K6UXRG2PA6VA5OFXUR7XT6MNM5LZRHF6',
   'Email secondaire : juliapaya361@gmail.com',
   'Sébastien — TRANCHE 1 marque #4 (dans GUJJAR)',
   '2026-03-05 10:00:00', '2026-03-05 10:00:00'),
  -- 5e MARQUE PORTEFEUILLE 100% (règle 5/5 standard) = Krock Takos
  (13, 17, 'Krock Takos', 'uber_eats', 2, 1, '2026-03-15', 1, 'portefeuille', 0,
   'CIFTCIKROC@proton.me', 'Dropeat@2026', 'https://urls.fr/Fjz5KE',
   'TOTP 2FA : S6AHWDWW3PP7BNWQIFNYHBMKCXH4ZXVE',
   'Seconde marque dans O''Grill — 5e MARQUE PORTEFEUILLE PERSONNEL 100% AGENT (règle 5/5 standard)',
   'Sébastien — TRANCHE 1 marque #5 = PORTEFEUILLE PERSONNEL 100%',
   '2026-03-15 10:00:00', '2026-03-15 10:00:00');

-- SÉBASTIEN — TRANCHE 2 marques (règle 5/5 SUSPENDUE à partir de Sultant)
INSERT OR IGNORE INTO marques_virtuelles
  (id, restaurant_id, nom, plateforme, rang_creation, is_portefeuille_proprietaire,
   date_lancement, actif, statut_marque, exclue_tranche,
   uber_manager_email, uber_manager_password, uber_manager_url,
   commission_info, acces_operationnels, notes,
   created_at, updated_at)
VALUES
  (14, 22, 'Naanwich Burger Montpellier', 'uber_eats', 1, 0, '2026-03-25', 1, 'active', 0,
   'citybrunch@protonmail.com', 'Dropeat@2026', NULL,
   'TOTP 2FA : K4C3S2ODECZ6JH3IGZOGI5S4M6NJU67S', NULL,
   'Sébastien — TRANCHE 2 marque #1 (dans CITY BRUNCH)',
   '2026-03-25 10:00:00', '2026-03-25 10:00:00'),
  (15, 23, 'Gare au Panini Nîmes', 'uber_eats', 1, 0, '2026-04-05', 1, 'active', 0,
   'le100witch@atomicmail.io', 'Dropeat@2026', 'https://urli.info/1tYPY',
   'TOTP 2FA : 5EQOOTHEEGZCA7RGXFYGSGMKFRGPXMCA', NULL,
   'Sébastien — TRANCHE 2 marque #2 (dans Le 100dwich)',
   '2026-04-05 10:00:00', '2026-04-05 10:00:00'),
  -- Seconde marque dans BIGG BURGER30
  (16, 19, 'Kroc Arena Nîmes', 'uber_eats', 2, 0, '2026-04-08', 1, 'active', 0,
   'krocarenanimes@proton.me', 'Dropeat@2026', 'https://urls.fr/VLvgOf',
   'TOTP 2FA : MBR45RY2OHTPSCMDR7FRBYKOBELB4SQV',
   'Seconde marque dans BIGG BURGER30',
   'Sébastien — TRANCHE 2 marque #3 (2e marque dans BIGG BURGER30)',
   '2026-04-08 10:00:00', '2026-04-08 10:00:00'),
  (17, 24, 'Ma Pizza Bangers', 'uber_eats', 1, 0, '2026-04-15', 1, 'active', 0,
   'solarimpulse.game@gmail.com', 'Dropeat@2026', NULL,
   'TOTP 2FA : DJ5ZLUWQTNUX52DRA2ZSX2FDVQXVNQAB', NULL,
   'Sébastien — TRANCHE 2 marque #4 (dans SMASHOW)',
   '2026-04-15 10:00:00', '2026-04-15 10:00:00'),
  -- Sultant Restaurant — DÉBUT SUSPENSION règle 5/5
  (18, 25, 'Kroc Takos — Le Gras C''Est La Vie', 'uber_eats', 1, 0, '2026-04-22', 1, 'active', 0,
   'sultant34@protonmail.com', 'Dropeat@2026', 'https://urls.fr/UTxE2t',
   'TOTP 2FA : RDZP-Y5ZR-ECJT-Y4OC-IWJU-ISPT-5MF7-UL55',
   'DÉBUT de la SUSPENSION règle 5/5 par le challenge CH-2026-05-SEBASTIAN-30R',
   'Sébastien — TRANCHE 2 marque #5 (Sultant) — règle 5/5 SUSPENDUE',
   '2026-04-22 10:00:00', '2026-04-22 10:00:00'),
  (19, 26, 'BB GOOD BURGER Salon-de-Provence', 'uber_eats', 1, 0, '2026-04-29', 1, 'active', 0,
   'chezleboss@protonmail.com', 'Dropeat@2026', 'https://urlr.me/B9G7xN',
   'TOTP 2FA : 7TPT-7BVJ-KRRQ-R67J-D73R-QMP2-GCY5-ECMA', NULL,
   'Sébastien — TRANCHE 2 marque #6 (dans CHEZLEBOSS) — règle 5/5 SUSPENDUE',
   '2026-04-29 10:00:00', '2026-04-29 10:00:00'),
  -- Seconde marque dans Taco 19
  (20, 18, 'BANGER TAKOS NÎMES', 'uber_eats', 2, 0, '2026-04-30', 1, 'active', 0,
   'bangertakos@proton.me', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
   'TOTP 2FA : YGRTS44SCQQNAHTYMIYKAGY6HCKP43NI',
   'Seconde marque dans Taco 19. Email secondaire : coversip.business@gmail.com',
   'Sébastien — TRANCHE 2 marque #7 (2e marque dans Taco 19) — règle 5/5 SUSPENDUE',
   '2026-04-30 10:00:00', '2026-04-30 10:00:00');

-- MARQUES DES AUTRES COMMERCIAUX
INSERT OR IGNORE INTO marques_virtuelles
  (id, restaurant_id, nom, plateforme, rang_creation, is_portefeuille_proprietaire,
   date_lancement, actif, statut_marque, exclue_tranche,
   uber_manager_email, uber_manager_password, uber_manager_url,
   commission_info, acces_operationnels, notes,
   created_at, updated_at)
VALUES
  -- Kamel
  (21, 27, 'BB GOOD BURGER Valence', 'uber_eats', 1, 0, '2026-02-18', 1, 'active', 0,
   'merzougbrice@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/JjQqBuu',
   'TOTP 2FA : NQDJNOVHWVBBD2KD3JNACGMLNGQWQIPU',
   'Email secondaire : arricaltd@gmail.com',
   'Kamel — TRANCHE 1 marque #1',
   '2026-02-18 11:00:00', '2026-02-18 11:00:00'),
  -- Hamou
  (22, 28, 'BB GOOD BURGER DIJON', 'uber_eats', 1, 0, '2026-02-23', 1, 'active', 0,
   'malabarfood@protonmail.com', 'Dropeat@2026', 'https://sl1nk.com/l8itfvu',
   'TOTP 2FA : 3C2GME6VTPF7FTGYSEUMIZIPLPGLJHK2', NULL,
   'Hamou — TRANCHE 1 marque #1',
   '2026-02-23 11:00:00', '2026-02-23 11:00:00'),
  -- Sabrina
  (23, 29, 'Burgerignos Nîmes', 'uber_eats', 1, 0, '2026-03-05', 1, 'active', 0,
   'taibimounia@protonmail.com', 'Dropeat@2026', 'https://sl1nk.com/qge11h5',
   'TOTP 2FA : SLW4WBTJYUNZQSDFFJVNIZ6IAZB6FSA5', NULL,
   'Sabrina — TRANCHE 1 marque #1',
   '2026-03-05 11:00:00', '2026-03-05 11:00:00'),
  (24, 30, 'Kroc Burgers Nîmes', 'uber_eats', 1, 0, '2026-03-25', 1, 'active', 0,
   'biggburgerf@atomicmail.io', 'Dropeat@2026', 'https://shorturl.at/VwkUM',
   'TOTP 2FA : AKPTBNUPUIGJELXBOJ2V7SB4KS3NSZYB',
   'Restaurant Virtuel',
   'Sabrina — TRANCHE 1 marque #2',
   '2026-03-25 11:00:00', '2026-03-25 11:00:00'),
  -- Greg
  (25, 31, 'Pizza Banger', 'uber_eats', 1, 0, '2026-03-10', 1, 'active', 0,
   'caverneapizza@protonmail.com', 'Dropeat@2026', 'https://urlr.me/KY4pG7',
   'TOTP 2FA : VKMLRHXMDCSO53LXYEEWF6FJ72XNS262', NULL,
   'Greg — TRANCHE 1 marque #1',
   '2026-03-10 11:00:00', '2026-03-10 11:00:00'),
  (26, 32, 'Maison Nassima', 'uber_eats', 1, 0, '2026-03-30', 1, 'active', 0,
   'benastracouscous@protonmail.com', 'Dropeat@2026', NULL,
   'TOTP 2FA : SC3FY6ANK2U2YDWVKKDT3P2TKJWANH2E', NULL,
   'Greg — TRANCHE 1 marque #2',
   '2026-03-30 11:00:00', '2026-03-30 11:00:00'),
  -- Fabien
  (27, 33, 'Gros Croc Marseille', 'uber_eats', 1, 0, '2026-03-15', 1, 'active', 0,
   'grillfoodmars@protonmail.com', 'Dropeat@2026', 'https://shorturl.at/brRib',
   'TOTP 2FA : 7LWFB5BO6OP77N37J6YLSOLS6HR2CL2V', NULL,
   'Fabien — TRANCHE 1 marque #1',
   '2026-03-15 11:00:00', '2026-03-15 11:00:00'),
  (28, 34, 'Kroc Takos Marseille', 'uber_eats', 1, 0, '2026-04-05', 1, 'active', 0,
   'ezomarseille13@protonmail.com', 'Dropeat@2026', NULL,
   NULL, NULL,
   'Fabien — TRANCHE 1 marque #2',
   '2026-04-05 11:00:00', '2026-04-05 11:00:00'),
  -- Elbac
  (29, 35, 'BB GOOD BURGER LAVAL', 'uber_eats', 1, 0, '2026-03-18', 1, 'active', 0,
   'lk53000@protonmail.com', 'Dropeat@2026', NULL,
   NULL, 'Email Uber : byouss1@ext.uber.com',
   'Elbac — TRANCHE 1 marque #1',
   '2026-03-18 11:00:00', '2026-03-18 11:00:00');

-- ============================================================
-- 4. TRANCHES FERMÉES DE SÉBASTIEN (user_id = 14)
-- ============================================================
-- TRANCHE 1 client : restos 17..21 — CLÔTURÉE (5e = La Corniche portefeuille)
-- TRANCHE 2 client : restos 22..26 — OUVERTE (règle 5/5 suspendue à partir de Sultant)
-- TRANCHE 1 marque : marques 9..13 — CLÔTURÉE (5e = Krock Takos portefeuille)
-- TRANCHE 2 marque : marques 14..20 — OUVERTE (règle suspendue)
-- ============================================================
INSERT OR IGNORE INTO tranches_attribution
  (id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
   element_attribue_id, validation_ecrite, notes)
VALUES
  (101, 14, 'client', 1, '2026-01-20 10:00:00', '2026-03-10 10:00:00', 'cloturee',
   21, 1, 'Tranche 1 client Sébastien — 5e resto La Corniche = PORTEFEUILLE CLIENT 100% (règle 5/5 standard)'),
  (102, 14, 'client', 2, '2026-03-20 10:00:00', NULL, 'ouverte',
   NULL, 0, 'Tranche 2 client Sébastien — Sultant Restaurant marque le DÉBUT de la SUSPENSION règle 5/5 par challenge CH-2026-05-SEBASTIAN-30R. Pas d''attribution automatique sur le 5e.'),
  (103, 14, 'marque', 1, '2026-01-25 10:00:00', '2026-03-15 10:00:00', 'cloturee',
   13, 1, 'Tranche 1 marque Sébastien — 5e marque Krock Takos (dans O''Grill) = PORTEFEUILLE MARQUE PERSONNEL 100%'),
  (104, 14, 'marque', 2, '2026-03-25 10:00:00', NULL, 'ouverte',
   NULL, 0, 'Tranche 2 marque Sébastien — Sultant marque le DÉBUT de la SUSPENSION règle 5/5');

-- Éléments des tranches Sébastien
INSERT OR IGNORE INTO tranche_elements
  (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, date_qualification, notes)
VALUES
  -- Tranche 1 client (restos 17..21) — clôturée
  (101, 14, 'client', 17, 1, 0, '2026-01-20 10:00:00', 'Position 1 — O''Grill'),
  (101, 14, 'client', 18, 2, 0, '2026-02-01 10:00:00', 'Position 2 — Taco 19'),
  (101, 14, 'client', 19, 3, 0, '2026-02-15 10:00:00', 'Position 3 — BIGG BURGER30'),
  (101, 14, 'client', 20, 4, 0, '2026-03-01 10:00:00', 'Position 4 — GUJJAR'),
  (101, 14, 'client', 21, 5, 1, '2026-03-10 10:00:00', 'Position 5 = ATTRIBUTION (La Corniche)'),
  -- Tranche 2 client (restos 22..26) — ouverte
  (102, 14, 'client', 22, 1, 0, '2026-03-20 10:00:00', 'Position 1 — CITY BRUNCH'),
  (102, 14, 'client', 23, 2, 0, '2026-04-01 10:00:00', 'Position 2 — Le 100dwich'),
  (102, 14, 'client', 24, 3, 0, '2026-04-10 10:00:00', 'Position 3 — SMASHOW'),
  (102, 14, 'client', 25, 4, 0, '2026-04-20 10:00:00', 'Position 4 — Sultant Restaurant (DÉBUT SUSPENSION règle 5/5)'),
  (102, 14, 'client', 26, 5, 0, '2026-04-28 10:00:00', 'Position 5 — CHEZLEBOSS — règle 5/5 SUSPENDUE : PAS d''attribution'),
  -- Tranche 1 marque (marques 9..13) — clôturée
  (103, 14, 'marque',  9, 1, 0, '2026-01-25 10:00:00', 'Position 1 — Pizza Nostra'),
  (103, 14, 'marque', 10, 2, 0, '2026-02-05 10:00:00', 'Position 2 — BB HOT BURGER'),
  (103, 14, 'marque', 11, 3, 0, '2026-02-20 10:00:00', 'Position 3 — BB GOOD BURGER'),
  (103, 14, 'marque', 12, 4, 0, '2026-03-05 10:00:00', 'Position 4 — Palais d''Or Poulet et Riz'),
  (103, 14, 'marque', 13, 5, 1, '2026-03-15 10:00:00', 'Position 5 = ATTRIBUTION (Krock Takos)'),
  -- Tranche 2 marque (marques 14..20) — ouverte
  (104, 14, 'marque', 14, 1, 0, '2026-03-25 10:00:00', 'Position 1 — Naanwich Burger Montpellier'),
  (104, 14, 'marque', 15, 2, 0, '2026-04-05 10:00:00', 'Position 2 — Gare au Panini Nîmes'),
  (104, 14, 'marque', 16, 3, 0, '2026-04-08 10:00:00', 'Position 3 — Kroc Arena Nîmes'),
  (104, 14, 'marque', 17, 4, 0, '2026-04-15 10:00:00', 'Position 4 — Ma Pizza Bangers'),
  (104, 14, 'marque', 18, 5, 0, '2026-04-22 10:00:00', 'Position 5 — Kroc Takos Sultant (DÉBUT SUSPENSION) — règle 5/5 SUSPENDUE'),
  (104, 14, 'marque', 19, 6, 0, '2026-04-29 10:00:00', 'Position 6 — BB GOOD BURGER Salon-de-Provence — règle suspendue'),
  (104, 14, 'marque', 20, 7, 0, '2026-04-30 10:00:00', 'Position 7 — BANGER TAKOS NÎMES — règle suspendue');

-- ============================================================
-- 5. TRANCHES POUR LES AUTRES COMMERCIAUX (ouvertes)
-- ============================================================
INSERT OR IGNORE INTO tranches_attribution
  (id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
   element_attribue_id, validation_ecrite, notes)
VALUES
  -- Tranches client
  (105, 12, 'client', 1, '2026-02-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Kamel Mehdi'),
  (106, 29, 'client', 1, '2026-02-20 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Hamou OULD BESSI'),
  (107, 13, 'client', 1, '2026-03-01 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Sabrina Hadri'),
  (108, 22, 'client', 1, '2026-03-05 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Gregory Hadri'),
  (109, 20, 'client', 1, '2026-03-10 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Fabien Rosso'),
  (110, 21, 'client', 1, '2026-03-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 client Elbac Haidar Mohamed'),
  -- Tranches marque
  (111, 12, 'marque', 1, '2026-02-18 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Kamel Mehdi'),
  (112, 29, 'marque', 1, '2026-02-23 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Hamou OULD BESSI'),
  (113, 13, 'marque', 1, '2026-03-05 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Sabrina Hadri'),
  (114, 22, 'marque', 1, '2026-03-10 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Gregory Hadri'),
  (115, 20, 'marque', 1, '2026-03-15 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Fabien Rosso'),
  (116, 21, 'marque', 1, '2026-03-18 11:00:00', NULL, 'ouverte', NULL, 0, 'Tranche 1 marque Elbac Haidar Mohamed');

INSERT OR IGNORE INTO tranche_elements
  (tranche_id, agent_id, type, element_id, position_dans_tranche, is_attribution, date_qualification, notes)
VALUES
  -- Kamel
  (105, 12, 'client', 27, 1, 0, '2026-02-15 11:00:00', 'MEAL N. FOOD'),
  (111, 12, 'marque', 21, 1, 0, '2026-02-18 11:00:00', 'BB GOOD BURGER Valence'),
  -- Hamou
  (106, 29, 'client', 28, 1, 0, '2026-02-20 11:00:00', 'MALABAR FOODS'),
  (112, 29, 'marque', 22, 1, 0, '2026-02-23 11:00:00', 'BB GOOD BURGER DIJON'),
  -- Sabrina
  (107, 13, 'client', 29, 1, 0, '2026-03-01 11:00:00', 'Brasserie du Carré St Dominique'),
  (107, 13, 'client', 30, 2, 0, '2026-03-20 11:00:00', 'ELSA DELICE'),
  (113, 13, 'marque', 23, 1, 0, '2026-03-05 11:00:00', 'Burgerignos Nîmes'),
  (113, 13, 'marque', 24, 2, 0, '2026-03-25 11:00:00', 'Kroc Burgers Nîmes'),
  -- Greg
  (108, 22, 'client', 31, 1, 0, '2026-03-05 11:00:00', 'CAVERNE A PIZZA'),
  (108, 22, 'client', 32, 2, 0, '2026-03-25 11:00:00', 'BENASTA'),
  (114, 22, 'marque', 25, 1, 0, '2026-03-10 11:00:00', 'Pizza Banger'),
  (114, 22, 'marque', 26, 2, 0, '2026-03-30 11:00:00', 'Maison Nassima'),
  -- Fabien
  (109, 20, 'client', 33, 1, 0, '2026-03-10 11:00:00', 'Le Grill System'),
  (109, 20, 'client', 34, 2, 0, '2026-04-01 11:00:00', 'Istanbul Kebab'),
  (115, 20, 'marque', 27, 1, 0, '2026-03-15 11:00:00', 'Gros Croc Marseille'),
  (115, 20, 'marque', 28, 2, 0, '2026-04-05 11:00:00', 'Kroc Takos Marseille'),
  -- Elbac
  (110, 21, 'client', 35, 1, 0, '2026-03-15 11:00:00', 'LK'),
  (116, 21, 'marque', 29, 1, 0, '2026-03-18 11:00:00', 'BB GOOD BURGER LAVAL');

-- ============================================================
-- 6. CHALLENGE Sébastien : CH-2026-05-SEBASTIAN-30R
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
   'Challenge créé pour Sébastien Garcia (user_id=14). RÈGLE EXCEPTIONNELLE : à partir du restaurant « Sultant Restaurant » (tranche 2 / resto 4), la règle standard 5/5 est SUSPENDUE jusqu''au 30 juin 2026. Pour les autres commerciaux, tous les restos/marques actuels sont entrés AVANT le challenge.',
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
   'Sébastien Garcia inscrit dès la création du challenge. Tous ses restos actuels sont signés AVANT le 2026-05-01, ils ne comptent donc pas dans la progression. Le compteur démarre à 0 et incrémentera à chaque nouveau resto signé entre le 1er mai et le 30 juin 2026.');
