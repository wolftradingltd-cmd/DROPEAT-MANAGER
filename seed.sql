-- ============================================================
-- DONNÉES INITIALES - PALIERS DE COMMISSION PAR DÉFAUT
-- (à ajuster selon vos vraies règles métier)
-- ============================================================

-- Paliers ENTREPRISE (sur CA mensuel net du restaurant)
INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre) VALUES
  ('entreprise', 'ca', 'mensuel', 0, 5000, 15, 1),
  ('entreprise', 'ca', 'mensuel', 5000, 10000, 12, 2),
  ('entreprise', 'ca', 'mensuel', 10000, 20000, 10, 3),
  ('entreprise', 'ca', 'mensuel', 20000, NULL, 8, 4);

-- Paliers AGENT commercial (niveau 1) - sur la commission entreprise
INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre) VALUES
  ('agent', 'ca', 'mensuel', 0, 5000, 20, 1),
  ('agent', 'ca', 'mensuel', 5000, 10000, 25, 2),
  ('agent', 'ca', 'mensuel', 10000, NULL, 30, 3);

-- Paliers SOUS-AGENT (niveau 2)
INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre) VALUES
  ('sous_agent', 'ca', 'mensuel', 0, 5000, 10, 1),
  ('sous_agent', 'ca', 'mensuel', 5000, 10000, 12, 2),
  ('sous_agent', 'ca', 'mensuel', 10000, NULL, 15, 3);

-- Paliers SOUS-SOUS-AGENT (niveau 3)
INSERT INTO paliers_commissions (type, base, mode, seuil_min, seuil_max, taux, ordre) VALUES
  ('sous_sous_agent', 'ca', 'mensuel', 0, 5000, 5, 1),
  ('sous_sous_agent', 'ca', 'mensuel', 5000, 10000, 7, 2),
  ('sous_sous_agent', 'ca', 'mensuel', 10000, NULL, 10, 3);

-- Configuration générale
INSERT INTO config (cle, valeur, description) VALUES
  ('devise', 'EUR', 'Devise utilisée'),
  ('symbole_devise', '€', 'Symbole de la devise'),
  ('base_commission', 'montant_net', 'Champ utilisé pour calcul commissions: montant_net ou montant_brut'),
  ('nom_societe', 'Ma Société', 'Nom de la société pour les rapports');

-- Exemples d'agents (pour démo - vous pouvez les supprimer)
INSERT INTO agents (nom, prenom, email, telephone, niveau, parent_id) VALUES
  ('Dupont', 'Jean', 'jean.dupont@example.com', '0612345678', 1, NULL),
  ('Martin', 'Sophie', 'sophie.martin@example.com', '0623456789', 1, NULL),
  ('Bernard', 'Karim', 'karim.bernard@example.com', '0634567890', 2, 1),
  ('Petit', 'Lina', 'lina.petit@example.com', '0645678901', 3, 3);
