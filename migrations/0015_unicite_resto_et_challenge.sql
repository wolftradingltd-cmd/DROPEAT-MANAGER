-- ============================================================
-- Migration 0015 : Unicité restaurant + marquage challenge + correction Sébastien
-- ============================================================
-- Objet : suite à l'audit portefeuille (tranche 104 Sébastien à 7 marques),
-- on introduit :
--   1) Une colonne is_challenge sur tranche_elements pour distinguer les
--      éléments comptabilisés au titre d'un challenge (récompense séparée)
--      des 4 marques qualifiantes standard du palier 5/5.
--   2) On marque les positions 6-7 de la tranche 104 de Sébastien comme
--      "challenge" (CH-2026-05-SEBASTIAN-30R) pour qu'elles n'apparaissent
--      plus dans la liste éligibles au palier 5/5 standard.
--   3) On corrige le portefeuille : Krock Takos → Pizza Nostra, avec
--      date_signature_portefeuille = 2026-05-05 (décision métier).
-- ============================================================

-- 1) Colonne is_challenge sur tranche_elements
ALTER TABLE tranche_elements ADD COLUMN is_challenge INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tranche_elements_challenge
  ON tranche_elements(agent_id, is_challenge);

-- 2) Marquer les positions 6 et 7 de Sébastien comme "challenge"
--    Tranche 104 (n°2 ouverte), agent_id=14 — challenge CH-2026-05-SEBASTIAN-30R
UPDATE tranche_elements
SET is_challenge = 1,
    notes = COALESCE(notes || ' | ', '') || 'Marqué challenge CH-2026-05-SEBASTIAN-30R (migration 0015)'
WHERE agent_id = 14
  AND tranche_id = 104
  AND type = 'marque'
  AND position_dans_tranche IN (6, 7);

-- 3) Correction portefeuille Sébastien : Krock Takos (id=13) → Pizza Nostra (id=9)
--    Décision métier de l'utilisateur : la 5e marque attribuée doit être
--    Pizza Nostra, signature contrat portefeuille au 2026-05-05.

-- 3a) Pizza Nostra (id=9) devient portefeuille propriétaire avec date_signature 2026-05-05
UPDATE marques_virtuelles
SET is_portefeuille_proprietaire = 1,
    date_signature_portefeuille = '2026-05-05',
    statut_marque = 'portefeuille',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 9;

-- 3b) Krock Takos (id=13) redevient une marque normale (perd statut portefeuille)
UPDATE marques_virtuelles
SET is_portefeuille_proprietaire = 0,
    date_signature_portefeuille = NULL,
    statut_marque = 'active',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 13;

-- 3c) Swap des positions dans la tranche 103 : Pizza Nostra prend la position 5 (attribution),
--     Krock Takos prend la position 1 (qualifiante). On utilise un trick (position temp -1)
--     pour éviter la contrainte d'unicité (tranche_id, position_dans_tranche).
UPDATE tranche_elements SET position_dans_tranche = -1, is_attribution = 0
  WHERE tranche_id = 103 AND element_id = 9;
UPDATE tranche_elements SET position_dans_tranche = 1,  is_attribution = 0
  WHERE tranche_id = 103 AND element_id = 13;
UPDATE tranche_elements SET position_dans_tranche = 5,  is_attribution = 1,
       notes = COALESCE(notes || ' | ', '') || 'Marque portefeuille (migration 0015, signée 2026-05-05)'
  WHERE tranche_id = 103 AND element_id = 9;

-- 3d) Mettre à jour element_attribue_id de la tranche 103
UPDATE tranches_attribution
SET element_attribue_id = 9,
    date_validation = '2026-05-05 00:00:00'
WHERE id = 103;
