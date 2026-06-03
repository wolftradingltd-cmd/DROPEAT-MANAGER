UPDATE tranche_elements_new
SET hooked_resto_id = (
  SELECT m.restaurant_id FROM marques_virtuelles m WHERE m.id = tranche_elements_new.element_id
)
WHERE type = 'marque';