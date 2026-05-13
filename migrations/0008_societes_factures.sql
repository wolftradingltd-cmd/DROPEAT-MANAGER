-- ============================================================
-- 0008 — PROFILS SOCIÉTÉ + MODULE FACTURATION COMPLET
-- ============================================================
-- 1. profils_societe : coordonnées légales de chaque user (agent FR / superadmin UK)
-- 2. factures        : table unique pour 2 types de factures :
--    - 'agent_to_dropeat' : agent commercial facture DropEat (commissions)
--    - 'dropeat_to_resto' : DropEat facture le restaurant
-- 3. facture_lignes  : détail des lignes (par marque/par cmd/par commission)
-- 4. facture_paiements : suivi des paiements
-- ============================================================

CREATE TABLE IF NOT EXISTS profils_societe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_societe TEXT NOT NULL DEFAULT 'auto_entrepreneur',
    -- 'auto_entrepreneur' (FR), 'eurl', 'sarl', 'sasu', 'sas', 'ltd' (UK), 'individual_uk'
  raison_sociale TEXT NOT NULL,
  nom_commercial TEXT,
  forme_juridique TEXT,                  -- ex: "EURL", "SAS", "LTD"
  capital REAL,                          -- capital social (€/£)
  siret TEXT,                            -- France
  siren TEXT,                            -- France
  numero_tva TEXT,                       -- ex: FR12345678901 / GB123456789
  rcs TEXT,                              -- ex: "RCS Paris 123 456 789"
  ape_naf TEXT,                          -- code APE/NAF
  company_number TEXT,                   -- UK companies house number
  vat_uk TEXT,                           -- UK VAT number
  adresse_rue TEXT,
  adresse_complement TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'France',            -- 'France' ou 'United Kingdom'
  telephone TEXT,
  email_facturation TEXT,
  iban TEXT,
  bic TEXT,
  banque_nom TEXT,
  -- Spécifique auto-entrepreneur FR : "TVA non applicable, art. 293 B du CGI"
  regime_tva TEXT DEFAULT 'franchise_base',
    -- 'franchise_base' (auto-entrepreneur, pas de TVA)
    -- 'reel_normal' (TVA 20%)
    -- 'reel_simplifie'
    -- 'uk_vat_registered'
    -- 'uk_not_vat_registered'
  taux_tva REAL DEFAULT 0,               -- 0 / 20 / 19 etc.
  signature_url TEXT,                    -- image signature scannée (R2)
  logo_url TEXT,
  mentions_legales_extra TEXT,           -- mentions supplémentaires libres
  date_creation_entreprise DATE,
  numero_assurance_pro TEXT,
  validated_at DATETIME,                 -- validé par superadmin (KYC)
  validated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profils_societe_user ON profils_societe(user_id);

-- ============================================================
-- FACTURES
-- ============================================================
CREATE TABLE IF NOT EXISTS factures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE NOT NULL,           -- ex: AGT-2026-04-0001 / DRP-2026-04-R001
  type TEXT NOT NULL,                    -- 'agent_to_dropeat' | 'dropeat_to_resto'
  -- Émetteur (qui facture)
  emetteur_user_id INTEGER NOT NULL REFERENCES users(id),
  emetteur_snapshot TEXT NOT NULL,       -- JSON du profil société au moment de la facture
  -- Destinataire
  dest_user_id INTEGER REFERENCES users(id),       -- si destinataire = superadmin (cas agent_to_dropeat)
  dest_restaurant_id INTEGER REFERENCES restaurants(id), -- si destinataire = restaurant
  dest_snapshot TEXT NOT NULL,           -- JSON coordonnées destinataire au moment de la facture
  -- Période & montants
  periode_annee INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  date_emission DATE NOT NULL,
  date_echeance DATE NOT NULL,           -- 30j FR / 30j UK par défaut
  montant_ht REAL NOT NULL DEFAULT 0,
  montant_tva REAL NOT NULL DEFAULT 0,
  taux_tva REAL NOT NULL DEFAULT 0,
  montant_ttc REAL NOT NULL DEFAULT 0,
  devise TEXT NOT NULL DEFAULT 'EUR',    -- 'EUR' ou 'GBP'
  -- Workflow
  statut TEXT NOT NULL DEFAULT 'brouillon',
    -- 'brouillon' : créée mais pas envoyée
    -- 'envoyee'   : agent l'a soumise au super-admin
    -- 'validee'   : super-admin l'a validée
    -- 'refusee'   : super-admin l'a refusée (motif obligatoire)
    -- 'payee'     : paiement effectué
    -- 'annulee'   : annulée (avoir)
  motif_refus TEXT,
  envoyee_at DATETIME,
  validee_at DATETIME,
  validee_par INTEGER REFERENCES users(id),
  payee_at DATETIME,
  reference_paiement TEXT,               -- n° virement
  -- PDF
  pdf_url TEXT,                          -- URL du PDF généré (stockage R2 ou base64)
  pdf_genere_at DATETIME,
  -- Mentions légales (snapshot pour conformité historique)
  mentions_legales TEXT,                 -- JSON ou texte complet
  notes_internes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_factures_emetteur  ON factures(emetteur_user_id);
CREATE INDEX IF NOT EXISTS idx_factures_dest_user ON factures(dest_user_id);
CREATE INDEX IF NOT EXISTS idx_factures_dest_resto ON factures(dest_restaurant_id);
CREATE INDEX IF NOT EXISTS idx_factures_periode   ON factures(periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_factures_statut    ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_type      ON factures(type);

-- Lignes de facture
CREATE TABLE IF NOT EXISTS facture_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL DEFAULT 0,
  libelle TEXT NOT NULL,                 -- ex: "Commissions sur ventes Pizza Nostra - avril 2026"
  description TEXT,                      -- détail sous-libellé
  categorie TEXT,                        -- 'comm_propre' | 'comm_portefeuille' | 'comm_n1' | 'comm_n2' | 'facturation_resto' | 'autre'
  -- Référence métier
  marque_id INTEGER REFERENCES marques_virtuelles(id),
  restaurant_id INTEGER REFERENCES restaurants(id),
  agent_concerne_id INTEGER REFERENCES users(id), -- pour les lignes N+1/N+2
  quantite REAL DEFAULT 1,               -- nb commandes
  prix_unitaire REAL NOT NULL DEFAULT 0,
  montant_ht REAL NOT NULL DEFAULT 0,
  taux_tva REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id);

-- ============================================================
-- COMPTEUR de numéros par préfixe (pour AGT-YYYY-MM-NNNN sans collision)
-- ============================================================
CREATE TABLE IF NOT EXISTS facture_compteurs (
  prefixe TEXT NOT NULL,                 -- ex: 'AGT-2026-04'
  dernier_numero INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefixe)
);

-- ============================================================
-- Pré-remplir le profil société du superadmin (UK Ltd par défaut)
-- ============================================================
INSERT OR IGNORE INTO profils_societe
  (user_id, type_societe, raison_sociale, nom_commercial, forme_juridique,
   pays, regime_tva, taux_tva, email_facturation, created_at)
SELECT id, 'ltd', 'DROPEAT LTD', 'DropEat™', 'LTD',
       'United Kingdom', 'uk_not_vat_registered', 0, email, CURRENT_TIMESTAMP
FROM users WHERE role = 'superadmin'
  AND id NOT IN (SELECT user_id FROM profils_societe);
