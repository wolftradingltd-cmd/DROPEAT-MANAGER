-- ============================================================
-- TRAÇABILITÉ 100% : facture DropEat par marque/par commande
-- ============================================================
-- Persiste sur chaque commande :
--   - montant_facture_resto    : ce que DropEat facture au resto
--   - commission_portefeuille  : montant 100% si la marque/resto est en portefeuille
--   - marge_dropeat_montant    : marge nette DropEat sur cette commande
--   - palier_facture_id        : palier appliqué pour la facturation resto
--   - palier_agent_id          : palier appliqué pour la commission agent
--   - is_portefeuille_snapshot : flag mémorisé au moment du calcul (audit)
--   - is_tablette_snapshot     : flag tablette mémorisé au moment du calcul
-- ============================================================

ALTER TABLE commandes ADD COLUMN montant_facture_resto REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN commission_portefeuille_montant REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN marge_dropeat_montant REAL DEFAULT 0;
ALTER TABLE commandes ADD COLUMN palier_facture_id INTEGER;
ALTER TABLE commandes ADD COLUMN palier_agent_id INTEGER;
ALTER TABLE commandes ADD COLUMN is_portefeuille_snapshot INTEGER DEFAULT 0;
ALTER TABLE commandes ADD COLUMN is_tablette_snapshot INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_commandes_palier_facture ON commandes(palier_facture_id);
CREATE INDEX IF NOT EXISTS idx_commandes_palier_agent   ON commandes(palier_agent_id);
CREATE INDEX IF NOT EXISTS idx_commandes_marque_date    ON commandes(marque_id, date_commande);
