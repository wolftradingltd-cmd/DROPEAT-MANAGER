-- ============================================================
-- DROPEAT v3 — Traçabilité 100%, comptes plateformes, URL shortener
-- ============================================================

-- 1) Comptes plateformes par restaurant (Uber Manager/Order, Deliveroo, JustEat, site web...)
-- Chaque restaurant peut avoir N comptes sur N plateformes
CREATE TABLE IF NOT EXISTS comptes_plateformes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- Type d'accès: uber_manager, uber_order, uber_eats, deliveroo, justeat, site_web,
  --              instagram, google_business, doordash, autre
  plateforme TEXT NOT NULL,
  type_acces TEXT NOT NULL DEFAULT 'manager',
  -- 'manager' (back-office), 'order' (tablette commande), 'public' (URL client final),
  -- 'commercial' (accès du commercial DropEat), 'autre'
  libelle TEXT, -- ex: "Uber Manager Pizza Nostra"
  email_connexion TEXT,
  password_chiffre TEXT, -- chiffré en base64 simple (pas de secret réel sans KMS)
  url_acces TEXT, -- URL de connexion ou site public
  url_courte_id INTEGER, -- FK url_courtes (raccourci si généré)
  store_id_externe TEXT, -- ID Uber/Deliveroo store
  marque_id INTEGER REFERENCES marques_virtuelles(id) ON DELETE SET NULL, -- si lié à une marque précise
  notes TEXT,
  actif INTEGER DEFAULT 1,
  proprietaire_acces TEXT DEFAULT 'restaurant', -- 'restaurant' (resto), 'commercial' (DropEat), 'partage'
  created_par_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comptes_resto ON comptes_plateformes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_comptes_marque ON comptes_plateformes(marque_id);
CREATE INDEX IF NOT EXISTS idx_comptes_plateforme ON comptes_plateformes(plateforme);

-- 2) URL Shortener — raccourcis internes
CREATE TABLE IF NOT EXISTS url_courtes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, -- ex: "x7Bk2Q"
  url_originale TEXT NOT NULL,
  libelle TEXT, -- description optionnelle
  cree_par_id INTEGER REFERENCES users(id),
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  marque_id INTEGER REFERENCES marques_virtuelles(id) ON DELETE SET NULL,
  nb_clics INTEGER DEFAULT 0,
  derniere_visite DATETIME,
  expire_at DATETIME,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_url_code ON url_courtes(code);
CREATE INDEX IF NOT EXISTS idx_url_resto ON url_courtes(restaurant_id);

-- 3) Liens marques → plateformes (multi-plateformes par marque)
-- Une marque peut être présente sur Uber Eats + Deliveroo + JustEat + site web
CREATE TABLE IF NOT EXISTS marque_plateformes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  plateforme TEXT NOT NULL, -- uber_eats, deliveroo, justeat, site_web, instagram, ...
  url_publique TEXT, -- URL de la fiche client
  url_courte_id INTEGER REFERENCES url_courtes(id),
  store_id_externe TEXT, -- ID dans la plateforme (uber_store_id, deliveroo_id, ...)
  actif INTEGER DEFAULT 1,
  date_lancement DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marque_id, plateforme)
);
CREATE INDEX IF NOT EXISTS idx_mqplat_marque ON marque_plateformes(marque_id);
CREATE INDEX IF NOT EXISTS idx_mqplat_plateforme ON marque_plateformes(plateforme);

-- 4) Liaison commande ↔ commission (traçabilité 100%)
-- Pour chaque commande on peut désormais retrouver l'agent payé et le montant exact
ALTER TABLE commandes ADD COLUMN commission_agent_montant REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN commission_n1_montant REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN commission_n2_montant REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN commission_calculee_at DATETIME;
ALTER TABLE commandes ADD COLUMN commission_taux_propre REAL DEFAULT 0; -- taux % au moment du calcul
ALTER TABLE commandes ADD COLUMN palier_applique_id INTEGER REFERENCES paliers_commissions(id);

CREATE INDEX IF NOT EXISTS idx_commandes_marque_date ON commandes(marque_id, date_commande);
CREATE INDEX IF NOT EXISTS idx_commandes_palier ON commandes(palier_applique_id);

-- 5) Checklist restaurant étendue : tout doit être validé pour activer le compte
-- Champs supplémentaires sur restaurants
ALTER TABLE restaurants ADD COLUMN compte_active INTEGER DEFAULT 0;
-- 0 = en cours, 1 = activé (toute la checklist verte)
ALTER TABLE restaurants ADD COLUMN date_activation DATETIME;
ALTER TABLE restaurants ADD COLUMN active_par_id INTEGER REFERENCES users(id);
ALTER TABLE restaurants ADD COLUMN menu_url TEXT; -- lien menu PDF
-- siret et raison_sociale déjà présents sur la table restaurants (migration initiale)

-- 6) Items checklist générique (extensible)
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- Code: kbis, piece_identite, rib, menu, contrat, photo_facade, attestation,
  --       acces_uber_manager, acces_uber_order, acces_deliveroo, acces_justeat,
  --       acces_site_web, acces_commercial, autre
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  obligatoire INTEGER DEFAULT 1,
  statut TEXT DEFAULT 'non_renseigne', -- non_renseigne / en_attente / valide / refuse / non_applicable
  ressource_type TEXT, -- 'document' / 'compte_plateforme' / 'champ_resto'
  ressource_id INTEGER, -- id de la ressource liée
  validateur_id INTEGER REFERENCES users(id),
  date_validation DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_checklist_resto ON checklist_items(restaurant_id);

-- 7) Codes d'accès générés (mots de passe en clair affichés une seule fois)
-- Permet à un agent de créer son filleul et de récupérer le code à transmettre
CREATE TABLE IF NOT EXISTS codes_acces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cree_par_id INTEGER REFERENCES users(id),
  password_temporaire TEXT NOT NULL, -- en clair, montré une fois
  affiche INTEGER DEFAULT 0, -- 1 quand consulté/copié
  utilise INTEGER DEFAULT 0, -- 1 si user a changé son mdp
  expire_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_codes_user ON codes_acces(user_id);

-- 8) Historique connexions (audit / dernière connexion)
CREATE TABLE IF NOT EXISTS connexions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  succes INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_connexions_user ON connexions_log(user_id, created_at);
