-- ============================================================
-- 0009 — FACTURATION AGENT → RESTAURANT (portefeuille 100%)
-- ============================================================
-- Règle métier :
--   Sur la 5e marque / le 5e restaurant en portefeuille propriétaire,
--   l'agent facture DIRECTEMENT le restaurant à 100% (PAS DropEat).
--   DropEat ne facture pas ce que l'agent encaisse en direct.
--   Les commissions N+1 et N+2 ne s'appliquent pas non plus.
--
-- Type de facture ajouté : 'agent_to_resto'
-- (la colonne `type` étant un TEXT libre, aucune ALTER TABLE nécessaire)
--
-- Cette migration ajoute uniquement des INDEX dédiés pour ce type.
-- ============================================================

-- (Optionnel) Marquer explicitement les types acceptés via un commentaire de doc
-- Index sur (type, statut) déjà couvert par les index existants

-- Pas de schema change requis : la table factures et facture_lignes
-- supportent déjà tous les champs nécessaires.

-- On note simplement la nouvelle catégorie de ligne :
--   categorie = 'comm_portefeuille' (déjà supporté)
--   ce qui est facturé directement au resto correspond à 100% des commissions portefeuille

-- Migration "no-op SQL" pour traçabilité du déploiement.
CREATE TABLE IF NOT EXISTS _migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO _migration_log (migration) VALUES ('0009_facture_agent_resto');
