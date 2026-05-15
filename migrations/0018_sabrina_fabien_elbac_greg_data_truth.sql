-- ============================================================
-- Migration 0018 : Source de vérité commerciaux SABRINA, FABIEN, ELBAC, GREG
-- ============================================================
-- Périmètre :
--   - Sabrina Hadri (id=13) — Tranche 1 / 2 restos
--       R1 : Brasserie du Carré St Dominique (rid=29) / Burgerignos Nîmes (mid=23)
--       R2 : ELSA DELICE (rid=30) / Kroc Burgers Nîmes (mid=24)
--   - Fabien Rosso (id=20) — Tranche 1 / 2 restos
--       R1 : Le Grill System (rid=33) / Gros Croc Marseille (mid=27)
--       R2 : Istanbul Kebab (rid=34) / Kroc Takos Marseille (mid=28)
--             ⚠ pas de lien Uber fourni, pas de MFA fourni
--   - Elbac Haidar Mohamed (id=21) — Tranche 1 / 1 resto
--       R1 : LK (rid=35) / BB GOOD BURGER LAVAL (mid=29)
--             ⚠ 2 emails : principal (protonmail) + email Uber (ext.uber.com)
--             ⚠ pas de lien Uber fourni, pas de MFA fourni
--   - Gregory Hadri (id=22) — Tranche 1 / 2 restos
--       R1 : CAVERNE A PIZZA (rid=31) / Pizza Banger (mid=25)
--       R2 : BENASTA (rid=32) / Maison Nassima (mid=26)
--             ⚠ pas de lien Uber fourni (MFA fourni)
--
-- Logique (cohérente avec migrations 0016/0017) :
--   - Schéma déjà enrichi par 0016 : statut_portefeuille_client + mfa_totp_secret
--   - Compléter gerant_email pour les 7 restaurants
--   - Mettre à jour credentials Uber des marques (email/password/url quand disponibles)
--   - Insérer comptes_plateformes (1 manager / marque, +1 backup pour Elbac)
--   - Aucune restructuration tranche : palier 1/5 ou 2/5 normal
--   - Aucun challenge à appliquer (aucun mentionné par le métier)
-- ============================================================

-- ============================================================
-- 1) SABRINA — R1 : Brasserie du Carré St Dominique (rid=29, mid=23)
-- ============================================================

-- 1.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'taibimounia@protonmail.com',
  notes = 'TRANCHE 1 / R1 (Sabrina). Carré St Dominique, Nîmes. Mot de passe Uber : Dropeat@2026.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 29;

-- 1.2) Marque : credentials Uber
UPDATE marques_virtuelles SET
  uber_manager_email = 'taibimounia@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://sl1nk.com/qge11h5',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 23;

-- 1.3) Compte plateforme manager
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  29, 23, 'uber_eats', 'manager', 'Burgerignos Nîmes (Brasserie du Carré St Dominique)',
  'taibimounia@protonmail.com', 'Dropeat@2026', 'https://sl1nk.com/qge11h5',
  'SLW4WBTJYUNZQSDFFJVNIZ6IAZB6FSA5',
  'restaurant', 1
);

-- ============================================================
-- 2) SABRINA — R2 : ELSA DELICE (rid=30, mid=24)
-- ============================================================

-- 2.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'biggburgerf@atomicmail.io',
  notes = 'TRANCHE 1 / R2 (Sabrina). 39 Rue Nationale, 30000 Nîmes. Mot de passe Uber : Dropeat@2026.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 30;

-- 2.2) Marque : credentials Uber (Kroc Burgers Nîmes - Restaurant Virtuel)
UPDATE marques_virtuelles SET
  uber_manager_email = 'biggburgerf@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://shorturl.at/VwkUM',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 24;

-- 2.3) Compte plateforme manager
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  30, 24, 'uber_eats', 'manager', 'Kroc Burgers Nîmes (ELSA DELICE)',
  'biggburgerf@atomicmail.io', 'Dropeat@2026', 'https://shorturl.at/VwkUM',
  'AKPTBNUPUIGJELXBOJ2V7SB4KS3NSZYB',
  'restaurant', 1
);

-- ============================================================
-- 3) FABIEN — R1 : Le Grill System (rid=33, mid=27)
-- ============================================================

-- 3.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'grillfoodmars@protonmail.com',
  notes = 'TRANCHE 1 / R1 (Fabien). 1 Avenue des Olives, Marseille 13013 (PACA). Mot de passe Uber : Dropeat@2026.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 33;

-- 3.2) Marque : credentials Uber
UPDATE marques_virtuelles SET
  uber_manager_email = 'grillfoodmars@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://shorturl.at/brRib',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 27;

-- 3.3) Compte plateforme manager
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  33, 27, 'uber_eats', 'manager', 'Gros Croc Marseille (Le Grill System)',
  'grillfoodmars@protonmail.com', 'Dropeat@2026', 'https://shorturl.at/brRib',
  '7LWFB5BO6OP77N37J6YLSOLS6HR2CL2V',
  'restaurant', 1
);

-- ============================================================
-- 4) FABIEN — R2 : Istanbul Kebab (rid=34, mid=28)
--    ⚠ Pas de lien Uber fourni, pas de MFA fourni
-- ============================================================

-- 4.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'ezomarseille13@protonmail.com',
  notes = 'TRANCHE 1 / R2 (Fabien). 179 Avenue de la Rose, 13013 Marseille. Mot de passe Uber : Dropeat@2026. ⚠ Lien Uber et MFA Google Authenticator à compléter (non fournis lors de l''import initial).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 34;

-- 4.2) Marque : credentials Uber (url et mfa pending)
UPDATE marques_virtuelles SET
  uber_manager_email = 'ezomarseille13@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  notes = 'TRANCHE 1 / R2 Fabien. ⚠ Lien Uber et MFA TOTP à fournir.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 28;

-- 4.3) Compte plateforme manager (sans url_acces ni mfa_totp_secret)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre,
  proprietaire_acces, actif, notes
) VALUES (
  34, 28, 'uber_eats', 'manager', 'Kroc Takos Marseille (Istanbul Kebab)',
  'ezomarseille13@protonmail.com', 'Dropeat@2026',
  'restaurant', 1,
  '⚠ Lien Uber et MFA TOTP à compléter.'
);

-- ============================================================
-- 5) ELBAC — R1 : LK (rid=35, mid=29)
--    ⚠ 2 emails (principal protonmail + email Uber ext.uber.com)
--    ⚠ Pas de lien Uber fourni, pas de MFA fourni
-- ============================================================

-- 5.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'lk53000@protonmail.com',
  notes = 'TRANCHE 1 / R1 (Elbac). 38 Avenue Robert Buron, 53000 Laval. Mot de passe Uber : Dropeat@2026. Emails : lk53000@protonmail.com (principal) + byouss1@ext.uber.com (compte Uber). ⚠ Lien Uber et MFA Google Authenticator à compléter (non fournis lors de l''import initial).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 35;

-- 5.2) Marque : credentials Uber (url et mfa pending)
UPDATE marques_virtuelles SET
  uber_manager_email = 'lk53000@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  notes = 'TRANCHE 1 / R1 Elbac. 2 emails : lk53000@protonmail.com (principal) + byouss1@ext.uber.com (Uber). ⚠ Lien Uber et MFA TOTP à fournir.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 29;

-- 5.3) Compte plateforme manager (email principal)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre,
  proprietaire_acces, actif, notes
) VALUES (
  35, 29, 'uber_eats', 'manager', 'BB GOOD BURGER LAVAL (LK) — email principal',
  'lk53000@protonmail.com', 'Dropeat@2026',
  'restaurant', 1,
  '⚠ Lien Uber et MFA TOTP à compléter.'
);

-- 5.4) Compte plateforme backup (email Uber externe)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre,
  proprietaire_acces, actif, notes
) VALUES (
  35, 29, 'uber_eats', 'backup', 'BB GOOD BURGER LAVAL — email Uber externe',
  'byouss1@ext.uber.com', 'Dropeat@2026',
  'agent', 1,
  'Email Uber externe (compte ext.uber.com) — second accès. ⚠ MFA TOTP à compléter.'
);

-- ============================================================
-- 6) GREG — R1 : CAVERNE A PIZZA (rid=31, mid=25)
-- ============================================================

-- 6.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'caverneapizza@protonmail.com',
  notes = 'TRANCHE 1 / R1 (Gregory). 27 Rue Raymond Marcheron, 92170 Vanves. Mot de passe Uber : Dropeat@2026.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 31;

-- 6.2) Marque : credentials Uber
UPDATE marques_virtuelles SET
  uber_manager_email = 'caverneapizza@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urlr.me/KY4pG7',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 25;

-- 6.3) Compte plateforme manager
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  31, 25, 'uber_eats', 'manager', 'Pizza Banger (CAVERNE A PIZZA)',
  'caverneapizza@protonmail.com', 'Dropeat@2026', 'https://urlr.me/KY4pG7',
  'VKMLRHXMDCSO53LXYEEWF6FJ72XNS262',
  'restaurant', 1
);

-- ============================================================
-- 7) GREG — R2 : BENASTA (rid=32, mid=26)
--    ⚠ Pas de lien Uber fourni (MFA fourni)
-- ============================================================

-- 7.1) Restaurant
UPDATE restaurants SET
  gerant_email = 'benastracouscous@protonmail.com',
  notes = 'TRANCHE 1 / R2 (Gregory). 46 Rue de Villacoublay, 78140 Vélizy-Villacoublay. Mot de passe Uber : Dropeat@2026. ⚠ Lien Uber à compléter (non fourni lors de l''import initial).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 32;

-- 7.2) Marque : credentials Uber (url pending, mfa OK)
UPDATE marques_virtuelles SET
  uber_manager_email = 'benastracouscous@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  notes = 'TRANCHE 1 / R2 Gregory. ⚠ Lien Uber à fournir. MFA TOTP renseigné dans compte_plateforme.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 26;

-- 7.3) Compte plateforme manager (sans url_acces, avec mfa_totp_secret)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  32, 26, 'uber_eats', 'manager', 'Maison Nassima (BENASTA)',
  'benastracouscous@protonmail.com', 'Dropeat@2026',
  'SC3FY6ANK2U2YDWVKKDT3P2TKJWANH2E',
  'restaurant', 1,
  '⚠ Lien Uber à compléter.'
);

-- ============================================================
-- 8) AUDIT LOG
-- ============================================================
INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
VALUES
  (1, 'data_truth_migration', 'agent', 13,
   'Migration 0018 : alignement source de vérité Sabrina Hadri. R1 Brasserie du Carré St Dominique (rid=29) + Burgerignos Nîmes (mid=23). R2 ELSA DELICE (rid=30) + Kroc Burgers Nîmes (mid=24). 2 gerant_email renseignés, 2 marques mises à jour (credentials Uber + MFA), 2 comptes plateformes insérés.',
   CURRENT_TIMESTAMP),
  (1, 'data_truth_migration', 'agent', 20,
   'Migration 0018 : alignement source de vérité Fabien Rosso. R1 Le Grill System (rid=33) + Gros Croc Marseille (mid=27) complet (credentials + MFA). R2 Istanbul Kebab (rid=34) + Kroc Takos Marseille (mid=28) PARTIEL : email gérant + password OK, ⚠ lien Uber et MFA TOTP à compléter. 2 comptes plateformes insérés.',
   CURRENT_TIMESTAMP),
  (1, 'data_truth_migration', 'agent', 21,
   'Migration 0018 : alignement source de vérité Elbac Haidar Mohamed. R1 LK (rid=35) + BB GOOD BURGER LAVAL (mid=29). Email principal lk53000@protonmail.com + email Uber externe byouss1@ext.uber.com. ⚠ Lien Uber et MFA TOTP à compléter. 2 comptes plateformes insérés (manager + backup).',
   CURRENT_TIMESTAMP),
  (1, 'data_truth_migration', 'agent', 22,
   'Migration 0018 : alignement source de vérité Gregory Hadri. R1 CAVERNE A PIZZA (rid=31) + Pizza Banger (mid=25) complet (credentials + MFA). R2 BENASTA (rid=32) + Maison Nassima (mid=26) : MFA OK, ⚠ lien Uber à compléter. 2 comptes plateformes insérés.',
   CURRENT_TIMESTAMP);
