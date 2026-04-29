-- ============================================================
-- DONNÉES INITIALES DROPEAT™
-- Mot de passe superadmin : "admin" (bcrypt)
-- À CHANGER IMMÉDIATEMENT après première connexion
-- ============================================================

-- Superadmin par défaut (email: admin@dropeat.io / mdp: admin123)
-- Hash PBKDF2 (100000 itérations, SHA-256) - compatible Cloudflare Workers
-- À CHANGER IMMÉDIATEMENT après première connexion
INSERT OR IGNORE INTO users (email, password_hash, role, nom, prenom, niveau, parent_id) VALUES
  ('admin@dropeat.io', 'pbkdf2$100000$a640f81e0a9074ee2191979a087fa7ec$fd1eb3ca87b5ba1f56c7e53e6df42ad91ed33adef19f4ddb012142379055eff3', 'superadmin', 'Admin', 'Super', NULL, NULL);

-- ============================================================
-- PALIERS DE COMMISSION DROPEAT™
-- ============================================================

-- 1) FACTURATION RESTAURANT (sans tablette) - DropEat → Restaurant
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('facturation_restaurant', 0, 30, 0.75, 1),
  ('facturation_restaurant', 30, 60, 1.50, 2),
  ('facturation_restaurant', 60, 120, 2.50, 3),
  ('facturation_restaurant', 120, 200, 3.50, 4),
  ('facturation_restaurant', 200, NULL, 5.00, 5);

-- 2) FACTURATION RESTAURANT AVEC TABLETTE SR SHOP (+0.05€)
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('facturation_restaurant_tablette', 0, 30, 0.80, 1),
  ('facturation_restaurant_tablette', 30, 60, 1.55, 2),
  ('facturation_restaurant_tablette', 60, 120, 2.55, 3),
  ('facturation_restaurant_tablette', 120, 200, 3.55, 4),
  ('facturation_restaurant_tablette', 200, NULL, 5.05, 5);

-- 3) AGENT COMMERCIAL STANDARD (sur ses propres clients hors Portefeuille)
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('agent_standard', 0, 30, 0.30, 1),
  ('agent_standard', 30, 60, 0.50, 2),
  ('agent_standard', 60, 120, 0.75, 3),
  ('agent_standard', 120, 200, 1.00, 4),
  ('agent_standard', 200, NULL, 2.00, 5);

-- 4) AGENT - PORTEFEUILLE PROPRIÉTAIRE (100% de la commission DropEat sur 5e client/marque)
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('agent_portefeuille', 0, 30, 0.75, 1),
  ('agent_portefeuille', 30, 60, 1.50, 2),
  ('agent_portefeuille', 60, 120, 2.50, 3),
  ('agent_portefeuille', 120, 200, 3.50, 4),
  ('agent_portefeuille', 200, NULL, 5.00, 5);

-- 5) COMMISSION SUR SOUS-AGENT NIVEAU 1 (perçue par l'agent parent)
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('sous_agent_n1', 0, 30, 0.10, 1),
  ('sous_agent_n1', 30, 60, 0.15, 2),
  ('sous_agent_n1', 60, 120, 0.20, 3),
  ('sous_agent_n1', 120, 200, 0.25, 4),
  ('sous_agent_n1', 200, NULL, 0.35, 5);

-- 6) COMMISSION SUR SOUS-AGENT NIVEAU 2 (perçue par le grand-parent)
INSERT INTO paliers_commissions (type, seuil_min, seuil_max, montant_par_commande, ordre) VALUES
  ('sous_agent_n2', 0, 30, 0.05, 1),
  ('sous_agent_n2', 30, 60, 0.07, 2),
  ('sous_agent_n2', 60, 120, 0.10, 3),
  ('sous_agent_n2', 120, 200, 0.12, 4),
  ('sous_agent_n2', 200, NULL, 0.18, 5);

-- ============================================================
-- CONFIGURATION
-- ============================================================
INSERT OR REPLACE INTO config (cle, valeur, description) VALUES
  ('devise', 'EUR', 'Devise utilisée'),
  ('symbole_devise', '€', 'Symbole de la devise'),
  ('nom_societe', 'DropEat™', 'Nom de la société'),
  ('societe_juridique', 'SR SHOP LIMITED', 'Entité juridique'),
  ('palier_portefeuille', '5', 'Tous les N restaurants/marques, le N-ième est 100% pour l''agent'),
  ('app_version', '2.0', 'Version de l''application');
