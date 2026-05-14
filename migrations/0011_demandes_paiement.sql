-- ============================================================
-- 0011 — DEMANDES DE PAIEMENT (seuil 20€, multi-demandes par mois)
-- ============================================================
-- Règles métier :
--   1) Tout agent (N0, N+1, N+2) peut demander un paiement DÈS que le
--      total cumulé de ses commissions NON PAYÉES atteint 20 €.
--   2) Le cumul = commission propre + commission portefeuille + N+1 reçues
--      + N+2 reçues, sur l'ensemble des périodes, MOINS ce qui est déjà
--      lié à un paiement validé/payé.
--   3) Plusieurs demandes par mois autorisées dès que le seuil est atteint.
--      Après paiement, le cumul "disponible" repart à 0.
--   4) La demande capture un SNAPSHOT précis des commissions incluses,
--      pour permettre la traçabilité réglementaire.
-- ============================================================

-- Table principale des demandes de paiement
CREATE TABLE IF NOT EXISTS demandes_paiement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Snapshot au moment de la demande
  montant_demande REAL NOT NULL,           -- Total réclamé (cumul disponible à l'instant T)
  montant_propre REAL NOT NULL DEFAULT 0,  -- Part "ventes perso" (selon paliers)
  montant_portefeuille REAL NOT NULL DEFAULT 0, -- Part Portefeuille 100% (5e marque)
  montant_n1 REAL NOT NULL DEFAULT 0,      -- Part N+1 reçue des filleuls
  montant_n2 REAL NOT NULL DEFAULT 0,      -- Part N+2 reçue des sous-filleuls

  -- Détail JSON des périodes/commissions incluses (audit + reprise paiement)
  -- Format : [{annee, mois, commission_id, propre, portefeuille, n1, n2}]
  detail_json TEXT,

  -- Workflow
  statut TEXT NOT NULL DEFAULT 'en_attente',
    -- 'en_attente' : demande créée par l'agent, attend validation superadmin
    -- 'validee'    : superadmin a validé, paiement en cours de traitement
    -- 'payee'      : paiement effectif (virement émis)
    -- 'rejetee'    : superadmin a rejeté (motif obligatoire)
    -- 'annulee'    : annulée par l'agent avant traitement
  motif_rejet TEXT,
  notes_agent TEXT,                        -- Notes de l'agent à la création
  notes_admin TEXT,                        -- Notes du superadmin au traitement

  -- Traçabilité
  date_demande DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_traitement DATETIME,                -- Quand le superadmin a validé/rejeté
  date_paiement DATETIME,                  -- Quand le virement est émis
  superadmin_id INTEGER REFERENCES users(id),
  paiement_id INTEGER REFERENCES paiements(id), -- FK créée à la validation

  -- Paiement
  methode_paiement TEXT,                   -- 'virement' / 'especes' / 'autre'
  reference_paiement TEXT,                 -- Référence virement bancaire

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_demandes_paiement_agent ON demandes_paiement(agent_id);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_statut ON demandes_paiement(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_date ON demandes_paiement(date_demande);

-- ============================================================
-- LIAISON commissions ↔ demandes de paiement
-- ============================================================
-- Permet de savoir QUELLES commissions ont été incluses dans QUELLE demande
-- → calcul du "cumul disponible" = SUM(commissions) - SUM(commissions liées payées)
-- → empêche de demander 2× la même commission
CREATE TABLE IF NOT EXISTS demande_paiement_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demande_id INTEGER NOT NULL REFERENCES demandes_paiement(id) ON DELETE CASCADE,
  commission_id INTEGER NOT NULL REFERENCES commissions_calculees(id) ON DELETE CASCADE,
  montant_inclus REAL NOT NULL DEFAULT 0,  -- Montant de cette commission inclus dans la demande
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(demande_id, commission_id)
);
CREATE INDEX IF NOT EXISTS idx_dpc_demande ON demande_paiement_commissions(demande_id);
CREATE INDEX IF NOT EXISTS idx_dpc_commission ON demande_paiement_commissions(commission_id);

-- ============================================================
-- AJOUT colonnes à commissions_calculees pour suivi paiement
-- ============================================================
-- Pour ne pas réinclure une commission déjà demandée/payée
ALTER TABLE commissions_calculees ADD COLUMN demande_paiement_id INTEGER REFERENCES demandes_paiement(id);
ALTER TABLE commissions_calculees ADD COLUMN statut_paiement TEXT DEFAULT 'disponible';
  -- 'disponible' : pas encore demandée
  -- 'demandee'   : incluse dans une demande en cours
  -- 'payee'      : paiement effectivement émis

CREATE INDEX IF NOT EXISTS idx_commissions_statut_paiement ON commissions_calculees(statut_paiement);
CREATE INDEX IF NOT EXISTS idx_commissions_demande ON commissions_calculees(demande_paiement_id);

-- ============================================================
-- CONFIG : seuil minimum de demande (20 € par défaut, modifiable)
-- ============================================================
INSERT OR IGNORE INTO config (cle, valeur, description)
VALUES ('seuil_min_demande_paiement', '20', 'Seuil minimum (€) pour qu''un agent puisse demander un paiement');

-- Trace
INSERT INTO _migration_log (migration) VALUES ('0011_demandes_paiement');
