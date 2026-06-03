INSERT INTO tranche_elements_new (
  id, tranche_id, agent_id, type, element_id, position_dans_tranche,
  date_qualification, is_attribution, notes, is_challenge
)
SELECT
  id, tranche_id, agent_id, type, element_id, position_dans_tranche,
  date_qualification, is_attribution, notes, is_challenge
FROM tranche_elements;