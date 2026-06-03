UPDATE tranches_attribution
SET element_attribue_kind = type
WHERE element_attribue_kind IS NULL AND element_attribue_id IS NOT NULL AND type IN ('client','marque');