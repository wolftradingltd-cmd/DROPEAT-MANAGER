-- ============================================================
-- Migration 0017 : Source de vérité commerciaux KAMEL & HAMOU
-- ============================================================
-- Périmètre :
--   - Mehdi Kamel (id=12) — Tranche 1 / R1 : MEAL N. FOOD (Valence)
--     1 marque : BB GOOD BURGER VALENCE
--   - OULD BESSI Hamou (id=29) — Tranche 1 / R1 : MALABAR FOODS (Dijon)
--     1 marque : BB GOOD BURGER DIJON, 2 adresses physiques
--
-- Logique appliquée (cohérente avec migration 0016 Sébastien) :
--   - Schéma déjà enrichi par 0016 : statut_portefeuille_client + mfa_totp_secret
--   - Compléter gerant_email, normaliser casse marques
--   - Insérer comptes_plateformes (manager + backup pour Kamel qui a 2 emails)
--   - 2 adresses MALABAR FOODS : adresse principale + ligne séparée en notes
--     structurée (le schéma ne supporte qu'une adresse, on documente
--     la 2e dans notes_internes claires)
--   - Aucune restructuration tranche : 1 marque / 1 resto, palier 1/5 normal
--   - Pas de challenge à appliquer (aucun mentionné par le métier)
-- ============================================================

-- ============================================================
-- 1) KAMEL — MEAL N. FOOD (rid=27, mid=21)
-- ============================================================

-- 1.1) Restaurant : email gérant + notes nettoyées
UPDATE restaurants SET
  gerant_email = 'merzougbrice@atomicmail.io',
  notes = 'TRANCHE 1 / R1 (Kamel). Région ARA. Mot de passe Uber : Dropeat@2026. Emails Uber : merzougbrice@atomicmail.io (principal) + arricaltd@gmail.com (backup).',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 27;

-- 1.2) Marque : normaliser casse (Valence → VALENCE) + credentials Uber
UPDATE marques_virtuelles SET
  nom = 'BB GOOD BURGER VALENCE',
  uber_manager_email = 'merzougbrice@atomicmail.io',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://urls.fr/JjQqBuu',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 21;

-- 1.3) Compte plateforme principal
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  27, 21, 'uber_eats', 'manager', 'BB GOOD BURGER VALENCE (MEAL N. FOOD)',
  'merzougbrice@atomicmail.io', 'Dropeat@2026', 'https://urls.fr/JjQqBuu',
  'NQDJNOVHWVBBD2KD3JNACGMLNGQWQIPU',
  'restaurant', 1
);

-- 1.4) Compte plateforme backup (2e email)
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif, notes
) VALUES (
  27, 21, 'uber_eats', 'backup', 'BB GOOD BURGER VALENCE — email backup',
  'arricaltd@gmail.com', 'Dropeat@2026', 'https://urls.fr/JjQqBuu',
  'NQDJNOVHWVBBD2KD3JNACGMLNGQWQIPU',
  'agent', 1, 'Email de récupération / backup'
);

-- ============================================================
-- 2) HAMOU — MALABAR FOODS (rid=28, mid=22)
-- ============================================================

-- 2.1) Restaurant : email gérant + adresses structurées dans notes
UPDATE restaurants SET
  gerant_email = 'malabarfood@protonmail.com',
  notes = 'TRANCHE 1 / R1 (Hamou). 2 ADRESSES PHYSIQUES : (1) 39 Rue Berbisey, 21000 Dijon [adresse principale enregistrée] ; (2) 13 Boulevard de Strasbourg, 21000 Dijon [adresse secondaire — même Uber store]. Mot de passe Uber : Dropeat@2026.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 28;

-- 2.2) Marque : credentials Uber
UPDATE marques_virtuelles SET
  uber_manager_email = 'malabarfood@protonmail.com',
  uber_manager_password = 'Dropeat@2026',
  uber_manager_url = 'https://sl1nk.com/l8itfvu',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 22;

-- 2.3) Compte plateforme
INSERT INTO comptes_plateformes (
  restaurant_id, marque_id, plateforme, type_acces, libelle,
  email_connexion, password_chiffre, url_acces, mfa_totp_secret,
  proprietaire_acces, actif
) VALUES (
  28, 22, 'uber_eats', 'manager', 'BB GOOD BURGER DIJON (MALABAR FOODS)',
  'malabarfood@protonmail.com', 'Dropeat@2026', 'https://sl1nk.com/l8itfvu',
  '3C2GME6VTPF7FTGYSEUMIZIPLPGLJHK2',
  'restaurant', 1
);

-- ============================================================
-- 3) AUDIT LOG
-- ============================================================
INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, created_at)
VALUES
  (1, 'data_truth_migration', 'agent', 12,
   'Migration 0017 : alignement source de vérité Kamel Mehdi. MEAL N. FOOD (rid=27) gerant_email renseigné. Marque BB GOOD BURGER VALENCE (mid=21) credentials Uber + casse normalisée. Comptes plateformes : 1 manager + 1 backup (2 emails).',
   CURRENT_TIMESTAMP),
  (1, 'data_truth_migration', 'agent', 29,
   'Migration 0017 : alignement source de vérité Hamou OULD BESSI. MALABAR FOODS (rid=28) gerant_email + 2 adresses documentées (39 Rue Berbisey principale + 13 Boulevard de Strasbourg secondaire). Marque BB GOOD BURGER DIJON (mid=22) credentials Uber. Compte plateforme manager.',
   CURRENT_TIMESTAMP);
