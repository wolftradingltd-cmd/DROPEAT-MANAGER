-- ============================================================
-- 0010 — Portefeuille signé à une date + docs/checklist resto + accès marque
-- ============================================================
-- Règles métier introduites :
--   1) Le portefeuille d'une marque devient effectif à la DATE DE SIGNATURE
--      du contrat de portefeuille (≠ date de création de la marque).
--      Avant cette date : commissions normales (DropEat + N+1/N+2 si applicable).
--      À partir de cette date : 100% pour l'agent (pas de N+1/N+2, pas de marge DropEat).
--
--   2) Restaurants enrichis : nom+prénom gérant + RIB manuel (titulaire/IBAN/BIC/banque)
--      + manager d'inscription (qui crée le resto, agent en général).
--
--   3) Marques enrichies : accès Uber Manager / Uber Orders / tablette / commissions infos.
--
--   4) Checklist restaurant complète (recréée pour les valeurs standard manquantes).
-- ============================================================

-- =============== 1. PORTEFEUILLE: date de signature contrat ===============
-- (sur marques) : date à partir de laquelle la marque devient portefeuille 100% agent
ALTER TABLE marques_virtuelles ADD COLUMN date_signature_portefeuille DATE;
-- (sur restaurants) : idem pour un resto 5e attribué globalement
ALTER TABLE restaurants ADD COLUMN date_signature_portefeuille DATE;

-- =============== 2. RESTAURANTS : gérant + RIB manuel ===============
ALTER TABLE restaurants ADD COLUMN gerant_nom TEXT;
ALTER TABLE restaurants ADD COLUMN gerant_prenom TEXT;
ALTER TABLE restaurants ADD COLUMN gerant_telephone TEXT;
ALTER TABLE restaurants ADD COLUMN gerant_email TEXT;

-- RIB manuel (si pas d'upload de fichier RIB)
ALTER TABLE restaurants ADD COLUMN rib_titulaire TEXT;
ALTER TABLE restaurants ADD COLUMN rib_iban TEXT;
ALTER TABLE restaurants ADD COLUMN rib_bic TEXT;
ALTER TABLE restaurants ADD COLUMN rib_banque_nom TEXT;
ALTER TABLE restaurants ADD COLUMN rib_references TEXT;

-- =============== 3. MARQUES : accès Uber + tablette + commissions info ===============
ALTER TABLE marques_virtuelles ADD COLUMN uber_manager_email TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN uber_manager_password TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN uber_manager_url TEXT;

ALTER TABLE marques_virtuelles ADD COLUMN uber_orders_email TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN uber_orders_password TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN uber_orders_url TEXT;

ALTER TABLE marques_virtuelles ADD COLUMN tablette_fournie INTEGER DEFAULT 0;
ALTER TABLE marques_virtuelles ADD COLUMN tablette_serial TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN tablette_notes TEXT;

ALTER TABLE marques_virtuelles ADD COLUMN commission_info TEXT;
ALTER TABLE marques_virtuelles ADD COLUMN acces_operationnels TEXT;

ALTER TABLE marques_virtuelles ADD COLUMN statut_marque TEXT DEFAULT 'en_creation';
-- 'en_creation' / 'active' / 'suspendue' / 'portefeuille' / 'refusee' / 'en_attente'

-- =============== 4. CHECKLIST : pré-création des items standards ===============
-- (utilise INSERT OR IGNORE pour ne pas écraser si déjà présents)
INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'kbis', 'Extrait KBIS', 1, 'non_renseigne', 'document'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'piece_identite', 'CNI / Pièce d''identité', 1, 'non_renseigne', 'document'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'rib', 'RIB / IBAN', 1, 'non_renseigne', 'document'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'contrat', 'Contrat signé DropEat', 1, 'non_renseigne', 'document'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'acces_uber_manager', 'Accès Uber Eats Manager', 1, 'non_renseigne', 'compte_plateforme'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'acces_uber_orders', 'Accès Uber Eats Orders / Tablette', 1, 'non_renseigne', 'compte_plateforme'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'tablette', 'Tablette de prise de commandes', 0, 'non_renseigne', 'champ_resto'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'onboarding', 'Onboarding terminé', 1, 'non_renseigne', 'champ_resto'
FROM restaurants r;

INSERT OR IGNORE INTO checklist_items (restaurant_id, code, libelle, obligatoire, statut, ressource_type)
SELECT r.id, 'validation_admin', 'Validation administrative', 1, 'non_renseigne', 'champ_resto'
FROM restaurants r;

-- Index utile pour les requêtes "commandes avant/après signature portefeuille"
CREATE INDEX IF NOT EXISTS idx_marques_date_sign_porte ON marques_virtuelles(date_signature_portefeuille);
CREATE INDEX IF NOT EXISTS idx_restos_date_sign_porte ON restaurants(date_signature_portefeuille);

-- Trace
INSERT INTO _migration_log (migration) VALUES ('0010_portefeuille_signature_docs');
