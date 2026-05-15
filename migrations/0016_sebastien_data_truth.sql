-- ============================================================
-- Migration 0016 : Source de vérité commercial SEBASTIEN GARCIA (id=14)
-- ============================================================
-- Objectif : aligner intégralement la base sur la fiche officielle
-- fournie par le métier pour Sébastien Garcia, en respectant la
-- logique du contrat DropEat™ :
--
--   1) Schéma : ajout des concepts manquants
--      - restaurants.statut_portefeuille_client (resto client en
--        portefeuille personnel de l'agent, hors palier 5/5)
--      - comptes_plateformes.mfa_totp_secret (Google Authenticator)
--      - challenges.date_debut peut maintenant être antérieur à
--        2026-05-01 si un resto post-Sultant a été signé avant
--
--   2) Restaurants : compléter les fiches gérant (email)
--      - O'Grill : retire pf=1 au niveau resto (resto multi-marques,
--        seule Pizza Nostra est en portefeuille agent)
--      - La Corniche : statut_portefeuille_client=1, pf_proprietaire=0
--      - CHEZLEBOSS : code postal 13300
--
--   3) Marques : compléter les credentials Uber (email manager,
--      password, URL d'accès) pour les 11 marques existantes
--      - Créer la marque manquante BB GOOD BURGER TARASCON
--        sur La Corniche (rid=21), exclue_tranche=1 (portefeuille_client)
--
--   4) Comptes plateformes Uber : 1 ligne par marque (12 au total)
--      avec email, password, url, mfa_totp_secret
--      Cas particuliers gérés :
--        - BIGG BURGER30 a 2 MFA → ligne principale + ligne backup
--        - GUJJAR a 2 MFA → ligne principale + ligne backup
--        - Taco 19 / BB HOT BURGER a 2 emails → ligne principale +
--          ligne backup avec email coversip.business
--
--   5) Tranche 2 (104) : RESTRUCTURATION conforme à la règle métier
--      - La règle 5/5 s'applique aux marques de restos signés AVANT
--        Sultant Restaurant (2026-04-20 exclus)
--      - Les marques de restos signés ≥ Sultant relèvent du challenge
--      - Les marques additionnelles créées sur des restos PRÉ-existants
--        ne comptent PAS pour la tranche (anti double-dipping : le
--        restaurant a déjà servi à qualifier la tranche 1)
--
--      Conséquence : tranche 104 ne contient plus que 3 marques
--        qualifiantes (Naanwich, Gare au Panini, Ma Pizza Bangers)
--      → tranche reste ouverte 3/4, en attente de la fin du
--        challenge (2026-07-01) pour reprendre les apports standards
--
--   6) Challenge CH-2026-05-SEBASTIAN-30R :
--      - Étend date_debut à 2026-04-20 (signature Sultant)
--      - Crée challenge_elements pour Sultant + CHEZLEBOSS (2/30)
--      - Met à jour progression_actuelle = 2
--
--   7) IMPORTANT : la marque "Kroc Takos — Le Gras C'Est La Vie"
--      (rattachée à Sultant) et "BB GOOD BURGER Salon-de-Provence"
--      (rattachée à CHEZLEBOSS) sont retirées de tranche_elements
--      car le critère challenge est au niveau RESTAURANT, pas marque.
--      Elles existent dans marques_virtuelles avec exclue_tranche=0
--      (elles seront comptées si le challenge échoue et que la règle
--      classique reprend pour Sébastien après 2026-06-30 — décision
--      métier à acter à ce moment-là).
--
--   8) Marques additionnelles déjà rattachées à des restos pré-Sultant
--      (Kroc Arena Nîmes, BANGER TAKOS NÎMES) : retirées de
--      tranche_elements 104 car leur resto sous-jacent a déjà servi
--      à qualifier la tranche 1 (anti double-dipping). Elles restent
--      dans marques_virtuelles avec exclue_tranche=1.
-- ============================================================

-- ============================================================
-- 1) SCHÉMA : nouvelles colonnes
-- ============================================================

ALTER TABLE restaurants ADD COLUMN statut_portefeuille_client INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comptes_plateformes ADD COLUMN mfa_totp_secret TEXT;

CREATE INDEX IF NOT EXISTS idx_restaurants_portefeuille_client
  ON restaurants(statut_portefeuille_client);

-- ============================================================
-- 2) RESTAURANTS Sébastien : compléter gerant_email + statut spéciaux
-- ============================================================

-- O'Grill (rid=17) : retire pf=1 au niveau resto (seule la marque Pizza Nostra est en portefeuille)
UPDATE restaurants SET
  gerant_email = 'cahitdrop@atomicmail.io',
  is_portefeuille_proprietaire = 0,
  date_signature_portefeuille = NULL,
  notes = COALESCE(notes || ' | ', '') || 'Resto multi-marques. Seule Pizza Nostra est en portefeuille agent (signée 2026-05-05).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 17;

-- Taco 19 (rid=18) : email gérant
UPDATE restaurants SET
  gerant_email = 'imanecher@atomicmail.io',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 18;

-- BIGG BURGER30 (rid=19)
UPDATE restaurants SET
  gerant_email = 'lailakamel@atomicmail.io',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 19;

-- GUJJAR (rid=20)
UPDATE restaurants SET
  gerant_email = 'shahzadajmal@atomicmail.io',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 20;

-- La Corniche (rid=21) : portefeuille_client (PAS portefeuille_proprietaire)
UPDATE restaurants SET
  gerant_email = 'lacorniche15@protonmail.com',
  is_portefeuille_proprietaire = 0,
  date_signature_portefeuille = NULL,
  statut_portefeuille_client = 1,
  notes = COALESCE(notes || ' | ', '') || 'Portefeuille CLIENT : commissions DropEat+MLM normales, mais HORS palier 5/5 et HORS challenge. Marque BB GOOD BURGER TARASCON également exclue.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 21;

-- CITY BRUNCH (rid=22)
UPDATE restaurants SET
  gerant_email = 'citybrunch@protonmail.com',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 22;

-- Le 100dwich (rid=23)
UPDATE restaurants SET
  gerant_email = 'le100witch@atomicmail.io',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 23;

-- SMASHOW (rid=24)
UPDATE restaurants SET
  gerant_email = 'solarimpulse.game@gmail.com',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 24;

-- Sultant Restaurant (rid=25) : 1er resto challenge
UPDATE restaurants SET
  gerant_email = 'sultant34@protonmail.com',
  notes = COALESCE(notes || ' | ', '') || 'PREMIER RESTAURANT DU CHALLENGE CH-2026-05-SEBASTIAN-30R. La règle 5/5 standard est suspendue pour Sébastien à partir de ce restaurant (jusqu''au 30 juin 2026).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 25;

-- CHEZLEBOSS (rid=26) : code postal manquant + 2e resto challenge
UPDATE restaurants SET
  gerant_email = 'chezleboss@protonmail.com',
  code_postal = '13300',
  notes = COALESCE(notes || ' | ', '') || 'Restaurant inclus dans le challenge CH-2026-05-SEBASTIAN-30R.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 26;

-- ============================================================
-- 3) MARQUES : compléter credentials Uber (11 UPDATE + 1 INSERT)
-- ============================================================

-- 3.1) Pizza Nostra (mid=9, O'Grill, portefeuille agent)
UPDATE marques_virtuelles SET
  uber_manager_email = 'cahitdrop@atomicmail.io',
  uber_manager_password = 'Dropeat2026@',
  uber_manager_url = 'https://urls.fr/Fjz5KE',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 9;

-- 3.2) BB HOT BURGER (mid=10, Taco 19)
UPDATE marques_virtuelles SET
  uber_manager_email = 'imanecher@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urlr.me/fGDxEN',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 10;

-- 3.3) BB GOOD BURGER (mid=11, BIGG BURGER30)
UPDATE marques_virtuelles SET
  uber_manager_email = 'lailakamel@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/VLvgOf',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 11;

-- 3.4) Palais d'Or Poulet et Riz (mid=12, GUJJAR)
UPDATE marques_virtuelles SET
  uber_manager_email = 'shahzadajmal@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/98BBnc',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 12;

-- 3.5) Krock Takos (mid=13, O'Grill — marque additionnelle)
UPDATE marques_virtuelles SET
  uber_manager_email = 'CIFTCIKROC@proton.me',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/Fjz5KE',
  exclue_tranche = 1,
  notes = COALESCE(notes || ' | ', '') || 'Marque additionnelle sur resto O''Grill (déjà compté tr1). Exclue tranche.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 13;

-- 3.6) Naanwich Burger Montpellier (mid=14, CITY BRUNCH)
UPDATE marques_virtuelles SET
  uber_manager_email = 'citybrunch@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 14;

-- 3.7) Gare au Panini Nîmes (mid=15, Le 100dwich)
UPDATE marques_virtuelles SET
  uber_manager_email = 'le100witch@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urli.info/1tYPY',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 15;

-- 3.8) Kroc Arena Nîmes (mid=16, BIGG BURGER30 — marque additionnelle)
UPDATE marques_virtuelles SET
  uber_manager_email = 'krocarenanimes@proton.me',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/VLvgOf',
  exclue_tranche = 1,
  notes = COALESCE(notes || ' | ', '') || 'Marque additionnelle sur resto BIGG BURGER30 (déjà compté tr1). Exclue tranche.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 16;

-- 3.9) Ma Pizza Bangers (mid=17, SMASHOW)
UPDATE marques_virtuelles SET
  uber_manager_email = 'solarimpulse.game@gmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 17;

-- 3.10) Kroc Takos — Le Gras C'Est La Vie (mid=18, Sultant — CHALLENGE)
UPDATE marques_virtuelles SET
  uber_manager_email = 'sultant34@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/UTxE2t',
  exclue_tranche = 0,
  notes = COALESCE(notes || ' | ', '') || 'Marque du resto Sultant Restaurant (premier resto du challenge CH-2026-05-SEBASTIAN-30R). N''est pas qualifiante pour le palier 5/5 standard (règle suspendue depuis Sultant).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 18;

-- 3.11) BB GOOD BURGER Salon-de-Provence (mid=19, CHEZLEBOSS — CHALLENGE)
UPDATE marques_virtuelles SET
  uber_manager_email = 'chezleboss@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urlr.me/B9G7xN',
  exclue_tranche = 0,
  notes = COALESCE(notes || ' | ', '') || 'Marque du resto CHEZLEBOSS (challenge CH-2026-05-SEBASTIAN-30R).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 19;

-- 3.12) BANGER TAKOS NÎMES (mid=20, Taco 19 — marque additionnelle)
UPDATE marques_virtuelles SET
  uber_manager_email = 'bangertakos@proton.me',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urlr.me/fGDxEN',
  exclue_tranche = 1,
  notes = COALESCE(notes || ' | ', '') || 'Marque additionnelle sur resto Taco 19 (déjà compté tr1). Exclue tranche.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 20;

-- 3.13) NOUVELLE MARQUE : BB GOOD BURGER TARASCON (La Corniche, rid=21)
--       Marque de portefeuille_client : exclue tranche + commissions normales
INSERT INTO marques_virtuelles (
  restaurant_id, nom, plateforme, rang_creation,
  is_portefeuille_proprietaire, date_lancement, actif,
  exclue_tranche, uber_manager_email, uber_manager_password,
  uber_manager_url, statut_marque, notes
) VALUES (
  21, 'BB GOOD BURGER TARASCON', 'uber_eats', 1,
  0, '2026-03-15', 1,
  1, 'lacorniche15@protonmail.com', 'Dropeat@2026',
  'https://l1nq.com/7g2wuvq', 'active',
  'Marque de portefeuille CLIENT (La Corniche). Exclue tranche, hors challenge, commissions DropEat+MLM normales.'
);

-- ============================================================
-- 4) COMPTES PLATEFORMES UBER (14 lignes : 12 marques + 2 backups multi-MFA)
-- ============================================================

-- 4.1) Pizza Nostra — O'Grill
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  17, 9, 'uber_eats', 'manager', 'Pizza Nostra (O''Grill)',
  'cahitdrop@atomicmail.io', 'Dropeat2026@', 'https://urls.fr/Fjz5KE',
  'S6AHWDWW3PP7BNWQIFNYHBMKCXH4ZXVE',
  'agent', 1
);

-- 4.2) Krock Takos — O'Grill (même lien Uber, même MFA mais email différent)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  17, 13, 'uber_eats', 'manager', 'Krock Takos (O''Grill)',
  'CIFTCIKROC@proton.me', 'Dropeat@2026', 'https://urls.fr/Fjz5KE',
  'S6AHWDWW3PP7BNWQIFNYHBMKCXH4ZXVE',
  'restaurant', 1
);

-- 4.3) BB HOT BURGER — Taco 19 (compte principal)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  18, 10, 'uber_eats', 'manager', 'BB HOT BURGER (Taco 19)',
  'imanecher@atomicmail.io', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
  'HPUD36SBJYENIBXSIKPID52RV5CAD3PL',
  'restaurant', 1
);

-- 4.3 bis) BB HOT BURGER — Taco 19 (email backup coversip.business)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  18, 10, 'uber_eats', 'backup', 'BB HOT BURGER — email backup',
  'coversip.business@gmail.com', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
  'HPUD36SBJYENIBXSIKPID52RV5CAD3PL',
  'agent', 1, 'Email de récupération / backup'
);

-- 4.4) BANGER TAKOS NÎMES — Taco 19
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  18, 20, 'uber_eats', 'manager', 'BANGER TAKOS NÎMES (Taco 19)',
  'bangertakos@proton.me', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
  'YGRTS44SCQQNAHTYMIYKAGY6HCKP43NI',
  'agent', 1
);

-- 4.4 bis) BANGER TAKOS NÎMES — backup coversip.business
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  18, 20, 'uber_eats', 'backup', 'BANGER TAKOS — email backup',
  'coversip.business@gmail.com', 'Dropeat@2026', 'https://urlr.me/fGDxEN',
  'YGRTS44SCQQNAHTYMIYKAGY6HCKP43NI',
  'agent', 1, 'Email de récupération / backup'
);

-- 4.5) BB GOOD BURGER — BIGG BURGER30 (MFA principal)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  19, 11, 'uber_eats', 'manager', 'BB GOOD BURGER (BIGG BURGER30)',
  'lailakamel@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/VLvgOf',
  '6DGQEGKCHCVVRCX2HD3NEN5XIK7ZDBQF',
  'restaurant', 1
);

-- 4.5 bis) BB GOOD BURGER — backup MFA + email backup robertsannaofficiel
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  19, 11, 'uber_eats', 'backup', 'BB GOOD BURGER — MFA backup',
  'robertsannaofficiel@gmail.com', 'Dropeat@2026', 'https://urls.fr/VLvgOf',
  'LVUASTPUL42ROYWFQQW3MN4ZBLQYNXZG',
  'agent', 1, 'Second TOTP secret + email backup'
);

-- 4.6) Kroc Arena Nîmes — BIGG BURGER30
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  19, 16, 'uber_eats', 'manager', 'Kroc Arena Nîmes (BIGG BURGER30)',
  'krocarenanimes@proton.me', 'Dropeat@2026', 'https://urls.fr/VLvgOf',
  'MBR45RY2OHTPSCMDR7FRBYKOBELB4SQV',
  'agent', 1
);

-- 4.7) Palais d'Or Poulet et Riz — GUJJAR (MFA principal)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  20, 12, 'uber_eats', 'manager', 'Palais d''Or (GUJJAR)',
  'shahzadajmal@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/98BBnc',
  'OKVVL2TTMFV443MR3HKJPRXZ7OQGVPX6',
  'restaurant', 1
);

-- 4.7 bis) Palais d'Or — backup MFA + email backup juliapaya361
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  20, 12, 'uber_eats', 'backup', 'Palais d''Or — MFA backup',
  'juliapaya361@gmail.com', 'Dropeat@2026', 'https://urls.fr/98BBnc',
  'K6UXRG2PA6VA5OFXUR7XT6MNM5LZRHF6',
  'agent', 1, 'Second TOTP secret + email backup'
);

-- 4.8) BB GOOD BURGER TARASCON — La Corniche (portefeuille_client)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  21, (SELECT id FROM marques_virtuelles WHERE nom = 'BB GOOD BURGER TARASCON' AND restaurant_id = 21),
  'uber_eats', 'manager', 'BB GOOD BURGER TARASCON (La Corniche)',
  'lacorniche15@protonmail.com', 'Dropeat@2026', 'https://l1nq.com/7g2wuvq',
  'ESD76E6KSOSH76CKU5I5VRULIO5UN72A',
  'restaurant', 1, 'Restaurant en portefeuille CLIENT (hors palier 5/5 et hors challenge)'
);

-- 4.9) Naanwich Burger Montpellier — CITY BRUNCH
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  22, 14, 'uber_eats', 'manager', 'Naanwich (CITY BRUNCH)',
  'citybrunch@protonmail.com', 'Dropeat@2026', NULL,
  'K4C3S2ODECZ6JH3IGZOGI5S4M6NJU67S',
  'restaurant', 1
);

-- 4.10) Gare au Panini Nîmes — Le 100dwich
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  23, 15, 'uber_eats', 'manager', 'Gare au Panini (Le 100dwich)',
  'le100witch@atomicmail.io', 'Dropeat@2026', 'https://urli.info/1tYPY',
  '5EQOOTHEEGZCA7RGXFYGSGMKFRGPXMCA',
  'restaurant', 1
);

-- 4.11) Ma Pizza Bangers — SMASHOW
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  24, 17, 'uber_eats', 'manager', 'Ma Pizza Bangers (SMASHOW)',
  'solarimpulse.game@gmail.com', 'Dropeat@2026', NULL,
  'DJ5ZLUWQTNUX52DRA2ZSX2FDVQXVNQAB',
  'agent', 1
);

-- 4.12) Kroc Takos — Le Gras C'Est La Vie — Sultant Restaurant (CHALLENGE)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  25, 18, 'uber_eats', 'manager', 'Kroc Takos (Sultant)',
  'sultant34@protonmail.com', 'Dropeat@2026', 'https://urls.fr/UTxE2t',
  'RDZPY5ZRECJTY4OCIWJUISPT5MF7UL55',  -- TOTP secret nettoyé des tirets
  'restaurant', 1, '1er resto du challenge CH-2026-05-SEBASTIAN-30R'
);

-- 4.13) BB GOOD BURGER Salon-de-Provence — CHEZLEBOSS (CHALLENGE)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  26, 19, 'uber_eats', 'manager', 'BB GOOD BURGER Salon (CHEZLEBOSS)',
  'chezleboss@protonmail.com', 'Dropeat@2026', 'https://urlr.me/B9G7xN',
  '7TPT7BVJKRRQR67JD73RQMP2GCY5ECMA',  -- TOTP secret nettoyé des tirets
  'restaurant', 1, '2e resto du challenge CH-2026-05-SEBASTIAN-30R'
);

-- ============================================================
-- 5) RESTRUCTURATION TRANCHE 104 (n°2 Sébastien)
-- ============================================================
-- État avant : 7 éléments (pos 1-7) dont 2 marqués is_challenge
-- État cible : 3 éléments qualifiants uniquement (Naanwich, Gare au
--   Panini, Ma Pizza Bangers). Tranche reste ouverte 3/4.
--
-- Logique :
--   - pos 1 Naanwich (CITY BRUNCH, pré-Sultant)        → CONSERVER
--   - pos 2 Gare au Panini (Le 100dwich, pré-Sultant)  → CONSERVER
--   - pos 3 Kroc Arena (BIGG BURGER30 = resto tr1)     → SUPPRIMER (double-dipping)
--   - pos 4 Ma Pizza (SMASHOW, pré-Sultant)            → CONSERVER mais re-positionner pos 3
--   - pos 5 Kroc Takos Sultant (resto challenge)       → SUPPRIMER (challenge)
--   - pos 6 BB GOOD Salon (CHEZLEBOSS resto challenge) → SUPPRIMER (challenge)
--   - pos 7 BANGER TAKOS (Taco 19 = resto tr1)         → SUPPRIMER (double-dipping)

-- 5.1) Supprimer les éléments hors cadre
DELETE FROM tranche_elements
WHERE tranche_id = 104
  AND element_id IN (16, 18, 19, 20);
  -- 16=Kroc Arena (double-dipping), 18=Kroc Takos Sultant (challenge),
  -- 19=BB GOOD Salon (challenge), 20=BANGER TAKOS (double-dipping)

-- 5.2) Re-positionner Ma Pizza Bangers (mid=17) de pos 4 → pos 3
UPDATE tranche_elements
SET position_dans_tranche = 3,
    notes = COALESCE(notes || ' | ', '') || 'Re-positionné pos 4→3 (migration 0016, suite à suppression de Kroc Arena pos 3 pour double-dipping)'
WHERE tranche_id = 104 AND element_id = 17;

-- ============================================================
-- 6) CHALLENGE CH-2026-05-SEBASTIAN-30R : élargir + ajouter éléments
-- ============================================================

-- 6.1) Étendre la date de début à 2026-04-20 (signature Sultant)
UPDATE challenges
SET date_debut = '2026-04-20',
    notes_internes = COALESCE(notes_internes || ' | ', '') || 'date_debut étendue à 2026-04-20 (signature Sultant Restaurant, 1er resto challenge). Migration 0016.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

-- 6.2) Mettre à jour la progression du participant Sébastien
UPDATE challenge_participations
SET progression_actuelle = 2,
    notes_admin = COALESCE(notes_admin || ' | ', '') || 'Progression initialisée à 2/30 (Sultant + CHEZLEBOSS) suite à migration 0016.'
WHERE challenge_id = 1 AND agent_id = 14;

-- 6.3) Insérer les 2 premiers éléments du challenge (Sultant + CHEZLEBOSS au niveau RESTAURANT)
INSERT INTO challenge_elements (
  participation_id, challenge_id, agent_id, type_element, element_id,
  date_apport, notes
)
SELECT cp.id, 1, 14, 'restaurant', 25,
  '2026-04-20 00:00:00', '1er restaurant du challenge (Sultant Restaurant)'
FROM challenge_participations cp
WHERE cp.challenge_id = 1 AND cp.agent_id = 14;

INSERT INTO challenge_elements (
  participation_id, challenge_id, agent_id, type_element, element_id,
  date_apport, notes
)
SELECT cp.id, 1, 14, 'restaurant', 26,
  '2026-04-28 00:00:00', '2e restaurant du challenge (CHEZLEBOSS)'
FROM challenge_participations cp
WHERE cp.challenge_id = 1 AND cp.agent_id = 14;

-- ============================================================
-- 7) AUDIT LOG
-- ============================================================
INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
VALUES (
  1, 'data_truth_migration', 'agent', 14,
  'Migration 0016 : alignement complet base ↔ source de vérité métier pour Sébastien Garcia. Restos 10/10 complétés (gerant_email, statut_portefeuille_client). Marques 11+1=12 avec credentials Uber. Comptes plateformes 14 lignes (12 principaux + 2 backups MFA). Tranche 104 restructurée à 3 qualifiantes (Naanwich, Gare au Panini, Ma Pizza Bangers). Challenge CH-2026-05-SEBASTIAN-30R étendu à 2026-04-20 avec 2 éléments (Sultant + CHEZLEBOSS). La Corniche en portefeuille_client.',
  CURRENT_TIMESTAMP
);
