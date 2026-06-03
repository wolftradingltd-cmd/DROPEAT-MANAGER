INSERT INTO tranches_attribution_new (
  id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
  element_attribue_id, validation_ecrite, date_validation, validateur_user_id, notes
)
SELECT
  id, agent_id, type, numero_tranche, date_ouverture, date_cloture, statut,
  element_attribue_id, validation_ecrite, date_validation, validateur_user_id, notes
FROM tranches_attribution;