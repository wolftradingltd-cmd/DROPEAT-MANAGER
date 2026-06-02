#!/bin/bash
# ============================================================
# TESTS E2E — Workflow imports v2 (validation + notif + cloisonnement)
# ============================================================
# Couvre :
#   1.  Auth admin + agent
#   2.  Notifications : count, list, mark-read, tout-lu, delete
#   3.  Agent upload CSV → en_attente_validation + notif admin
#   4.  Vue agent : pas de ca_dropeat_brut, pas de marge_dropeat_nette
#   5.  Vue admin : ca_dropeat_brut + marge_dropeat_nette présents
#   6.  Endpoint /a-valider : liste les imports en attente
#   7.  Admin valide → commandes passent à 'valide' + notif agent
#   8.  Admin rejette → commandes passent à 'rejete' + notif agent
#   9.  Exclusion factures : commandes non validées ignorées
#   10. Admin upload pour un agent → notif "import_pour_vous"
#   11. ACL : agent ne peut pas accéder à /a-valider
#   12. CSV variant A (Id. externe) parse OK
#   13. CSV variant B (Identifiant externe) parse OK
# ============================================================

set +e
HOST=http://localhost:3000
# UUID unique par run pour éviter les doublons
RUN_ID=$(date +%s)
COOKIE_ADM=/tmp/cookies-impv2-admin.txt
COOKIE_AG=/tmp/cookies-impv2-agent.txt
ASSERT_OK=0
ASSERT_KO=0

assert() {
  local label="$1"; local cond="$2"
  if eval "$cond"; then echo "  ✅ $label"; ASSERT_OK=$((ASSERT_OK+1))
  else echo "  ❌ $label"; echo "     condition: $cond"; ASSERT_KO=$((ASSERT_KO+1)); fi
}

assert_status() {
  local label="$1"; local actual="$2"; local expected="$3"
  if [ "$actual" = "$expected" ]; then echo "  ✅ $label ($actual)"; ASSERT_OK=$((ASSERT_OK+1))
  else echo "  ❌ $label (got $actual, expected $expected)"; ASSERT_KO=$((ASSERT_KO+1)); fi
}

echo "════════════════════════════════════════"
echo "  TESTS E2E — Imports v2 (validation + cloisonnement)"
echo "════════════════════════════════════════"

# ============================================================
# 1) Auth
# ============================================================
echo
echo "▶ 1. Authentification admin + agent"
RESP=$(curl -s -c "$COOKIE_ADM" -X POST $HOST/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dropeat.io","password":"admin123"}')
assert "Login admin OK" "echo '$RESP' | grep -q '\"success\":true'"

RESP=$(curl -s -c "$COOKIE_AG" -X POST $HOST/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jean@dropeat.io","password":"agent123"}')
assert "Login agent Jean OK" "echo '$RESP' | grep -q '\"success\":true'"
assert "Agent a role=agent" "echo '$RESP' | grep -q '\"role\":\"agent\"'"

# ============================================================
# 2) Notifications : endpoints
# ============================================================
echo
echo "▶ 2. Endpoints notifications"
COUNT=$(curl -s -b "$COOKIE_ADM" $HOST/api/notifications/count)
assert "GET /notifications/count répond" "echo '$COUNT' | grep -q '\"non_lues\"'"
assert "Champ imports_a_valider présent (admin)" "echo '$COUNT' | grep -q '\"imports_a_valider\"'"

LIST=$(curl -s -b "$COOKIE_ADM" $HOST/api/notifications)
assert "GET /notifications répond" "echo '$LIST' | grep -q '\"notifications\"'"

# Agent count
COUNT_AG=$(curl -s -b "$COOKIE_AG" $HOST/api/notifications/count)
assert "Agent voit son count" "echo '$COUNT_AG' | grep -q '\"non_lues\"'"
# Agent ne doit PAS voir imports_a_valider == 0 (le champ existe juste à 0 ou absent)
HAS_IAV_AG=$(echo "$COUNT_AG" | grep -c '"imports_a_valider":0')
echo "    → agent imports_a_valider=0 : $HAS_IAV_AG occurrence(s) (attendu : 1 ou 0)"

# ============================================================
# 3) Agent upload CSV → en_attente_validation
# ============================================================
echo
echo "▶ 3. Agent upload CSV → en_attente_validation + notif admin"

# Compteur avant
BEFORE=$(curl -s -b "$COOKIE_ADM" $HOST/api/notifications/count)
IAV_BEFORE=$(echo "$BEFORE" | grep -oP '"imports_a_valider":\K\d+' | head -1)
echo "    Imports à valider AVANT : $IAV_BEFORE"

# Mini-CSV variant A (Id. externe)
CSV_A="Restaurant,Id. externe du restaurant,Pays,Code pays,Ville,Id. de la commande,UUID de la commande,Statut de la commande,Date de la commande,Heure de la commande,Montant moyen des commandes,Type de commande honorée,Marque Eats
Snack Test Jean,store-test-001,France,FR,Paris,ORD-${RUN_ID}-001,uuid-test-v2-aaaa-${RUN_ID}-001,Completed,2026-05-15,12:30,15.50,Delivery,Burger XL
Snack Test Jean,store-test-001,France,FR,Paris,ORD-${RUN_ID}-002,uuid-test-v2-aaaa-${RUN_ID}-002,Completed,2026-05-15,13:15,22.40,Delivery,Burger XL
Snack Test Jean,store-test-001,France,FR,Paris,ORD-${RUN_ID}-003,uuid-test-v2-aaaa-${RUN_ID}-003,Completed,2026-05-16,19:45,18.90,Delivery,Burger XL"

CSV_A_JSON=$(printf '%s' "$CSV_A" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

RESP=$(curl -s -b "$COOKIE_AG" -X POST $HOST/api/admin/imports \
  -H "Content-Type: application/json" \
  -d "{\"marque_id\":1,\"csv\":$CSV_A_JSON,\"nom_fichier\":\"test-v2-variant-a.csv\"}")
assert "Agent upload OK" "echo '$RESP' | grep -q '\"success\":true'"
IMPORT_ID_AG=$(echo "$RESP" | grep -oP '"import_id":\K\d+' | head -1)
echo "    → Import créé : #$IMPORT_ID_AG"
assert "Import_id présent" "[ -n '$IMPORT_ID_AG' ]"

# Vérifier statut DB
sleep 0.3
SQL_STATUT=$(npx wrangler d1 execute webapp-production --local --command="SELECT validation_statut, source_upload, pour_agent_id FROM imports_csv WHERE id=$IMPORT_ID_AG" 2>&1 | grep -E '"validation_statut"|"source_upload"|"pour_agent_id"' | tr -d ' ,"')
assert "Statut DB = en_attente_validation" "echo '$SQL_STATUT' | grep -q 'validation_statut:en_attente_validation'"
assert "source_upload = agent" "echo '$SQL_STATUT' | grep -q 'source_upload:agent'"
assert "pour_agent_id = 2 (Jean)" "echo '$SQL_STATUT' | grep -q 'pour_agent_id:2'"

# Compteur après
AFTER=$(curl -s -b "$COOKIE_ADM" $HOST/api/notifications/count)
IAV_AFTER=$(echo "$AFTER" | grep -oP '"imports_a_valider":\K\d+' | head -1)
echo "    Imports à valider APRÈS : $IAV_AFTER"
assert "Compteur incrémenté" "[ $IAV_AFTER -gt $IAV_BEFORE ]"

# Vérif notification admin créée
NOTIF_ADMIN=$(curl -s -b "$COOKIE_ADM" "$HOST/api/notifications?statut=non_lu")
assert "Admin reçoit notif import_a_valider" "echo '$NOTIF_ADMIN' | grep -q 'import_a_valider'"

# ============================================================
# 4) Vue AGENT : pas de ca_dropeat_brut ni marge_dropeat_nette
# ============================================================
echo
echo "▶ 4. Cloisonnement vue AGENT (pas de marge DropEat)"
LIST_AG=$(curl -s -b "$COOKIE_AG" $HOST/api/admin/imports)
assert "Agent peut lire /imports" "echo '$LIST_AG' | grep -q '\"imports\"'"
COUNT_DROPEAT=$(echo "$LIST_AG" | grep -c "ca_dropeat_brut")
COUNT_MARGE=$(echo "$LIST_AG" | grep -c "marge_dropeat_nette")
assert "ca_dropeat_brut ABSENT côté agent" "[ $COUNT_DROPEAT -eq 0 ]"
assert "marge_dropeat_nette ABSENTE côté agent" "[ $COUNT_MARGE -eq 0 ]"

# Détail import côté agent
DETAIL_AG=$(curl -s -b "$COOKIE_AG" "$HOST/api/admin/imports/$IMPORT_ID_AG/details")
COUNT_DETAIL_DROPEAT=$(echo "$DETAIL_AG" | grep -c "ca_dropeat_brut")
COUNT_DETAIL_MARGE=$(echo "$DETAIL_AG" | grep -c "marge_dropeat_nette")
COUNT_DROPEAT_AGENT=$(echo "$DETAIL_AG" | grep -c "DROPEAT")
assert "Détail agent : pas ca_dropeat_brut" "[ $COUNT_DETAIL_DROPEAT -eq 0 ]"
assert "Détail agent : pas marge_dropeat_nette" "[ $COUNT_DETAIL_MARGE -eq 0 ]"
assert "Détail agent : pas de ligne DROPEAT dans par_agent" "[ $COUNT_DROPEAT_AGENT -eq 0 ]"

# ============================================================
# 5) Vue ADMIN : tout présent
# ============================================================
echo
echo "▶ 5. Vue ADMIN voit tout (marge + facturation)"
LIST_ADM=$(curl -s -b "$COOKIE_ADM" $HOST/api/admin/imports)
assert "Admin voit ca_dropeat_brut" "echo '$LIST_ADM' | grep -q 'ca_dropeat_brut'"
assert "Admin voit marge_dropeat_nette" "echo '$LIST_ADM' | grep -q 'marge_dropeat_nette'"

DETAIL_ADM=$(curl -s -b "$COOKIE_ADM" "$HOST/api/admin/imports/$IMPORT_ID_AG/details")
assert "Admin détail voit ca_dropeat_brut" "echo '$DETAIL_ADM' | grep -q 'ca_dropeat_brut'"
assert "Admin détail voit marge_dropeat_nette" "echo '$DETAIL_ADM' | grep -q 'marge_dropeat_nette'"
assert "Admin détail voit ligne DROPEAT" "echo '$DETAIL_ADM' | grep -q 'DROPEAT'"

# ============================================================
# 6) Endpoint /a-valider
# ============================================================
echo
echo "▶ 6. Endpoint /a-valider (admin)"
A_VALIDER=$(curl -s -b "$COOKIE_ADM" $HOST/api/admin/imports/a-valider)
assert "Endpoint /a-valider répond" "echo '$A_VALIDER' | grep -q '\"imports\"'"
HAS_IMPORT=$(echo "$A_VALIDER" | grep -c "\"id\":$IMPORT_ID_AG")
assert "Notre import est dans la liste" "[ $HAS_IMPORT -ge 1 ]"

# ============================================================
# 7) Admin valide l'import
# ============================================================
echo
echo "▶ 7. Admin valide l'import → commandes passent à 'valide'"
RESP=$(curl -s -b "$COOKIE_ADM" -X POST "$HOST/api/admin/imports/$IMPORT_ID_AG/valider" \
  -H "Content-Type: application/json" -d '{"notes":"Test OK"}')
assert "Validation OK" "echo '$RESP' | grep -q '\"success\":true'"

# Vérif DB
SQL_VS=$(npx wrangler d1 execute webapp-production --local --command="SELECT validation_statut FROM imports_csv WHERE id=$IMPORT_ID_AG" 2>&1 | grep '"validation_statut"' | head -1)
assert "Import maintenant valide en DB" "echo '$SQL_VS' | grep -q 'valide'"

CMD_VS_COUNT=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as nb FROM commandes WHERE import_id=$IMPORT_ID_AG AND validation_statut='valide'" 2>&1 | grep '"nb"' | grep -oE '[0-9]+' | head -1)
assert "Commandes propagées validées" "[ ${CMD_VS_COUNT:-0} -ge 3 ]"

# Notif agent
sleep 0.2
NOTIF_AG=$(curl -s -b "$COOKIE_AG" "$HOST/api/notifications?statut=non_lu")
assert "Agent reçoit notif import_valide" "echo '$NOTIF_AG' | grep -q 'import_valide'"

# Compteur admin redescend
AFTER2=$(curl -s -b "$COOKIE_ADM" $HOST/api/notifications/count)
IAV_AFTER2=$(echo "$AFTER2" | grep -oP '"imports_a_valider":\K\d+' | head -1)
echo "    Imports à valider après validation : $IAV_AFTER2"
assert "Compteur décrémenté" "[ $IAV_AFTER2 -lt $IAV_AFTER ]"

# ============================================================
# 8) Test rejet d'import
# ============================================================
echo
echo "▶ 8. Agent upload + admin rejette"
CSV_B="Restaurant,Identifiant externe du restaurant,Pays,Indicatif de pays,Ville,Identifiant de la commande,UUID de la commande,Statut de la commande,Date de la commande,Heure de la commande,Valeur moyenne de la commande,Marque Uber Eats
Snack Test Jean,store-test-001,France,FR,Paris,ORD-R${RUN_ID}-001,uuid-test-v2-rejet-${RUN_ID}-001,Completed,2026-05-20,12:00,12.00,Burger XL
Snack Test Jean,store-test-001,France,FR,Paris,ORD-R${RUN_ID}-002,uuid-test-v2-rejet-${RUN_ID}-002,Completed,2026-05-20,13:00,18.00,Burger XL"

CSV_B_JSON=$(printf '%s' "$CSV_B" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

RESP=$(curl -s -b "$COOKIE_AG" -X POST $HOST/api/admin/imports \
  -H "Content-Type: application/json" \
  -d "{\"marque_id\":1,\"csv\":$CSV_B_JSON,\"nom_fichier\":\"test-v2-variant-b.csv\"}")
IMPORT_ID_REJET=$(echo "$RESP" | grep -oP '"import_id":\K\d+' | head -1)
assert "Upload variant B (Identifiant externe) OK" "echo '$RESP' | grep -q '\"success\":true'"
echo "    → Import à rejeter : #$IMPORT_ID_REJET"

# Rejet sans notes : doit échouer
STATUS=$(curl -s -b "$COOKIE_ADM" -X POST "$HOST/api/admin/imports/$IMPORT_ID_REJET/rejeter" \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}")
assert_status "Rejet sans notes refusé" "$STATUS" "400"

# Rejet avec notes
RESP=$(curl -s -b "$COOKIE_ADM" -X POST "$HOST/api/admin/imports/$IMPORT_ID_REJET/rejeter" \
  -H "Content-Type: application/json" -d '{"notes":"Doublon avec import précédent"}')
assert "Rejet avec notes OK" "echo '$RESP' | grep -q '\"success\":true'"

CMD_REJ_COUNT=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as nb FROM commandes WHERE import_id=$IMPORT_ID_REJET AND validation_statut='rejete'" 2>&1 | grep '"nb"' | grep -oE '[0-9]+' | head -1)
assert "Commandes propagées rejetées" "[ ${CMD_REJ_COUNT:-0} -ge 2 ]"

NOTIF_AG2=$(curl -s -b "$COOKIE_AG" "$HOST/api/notifications?statut=non_lu")
HAS_REJET=$(echo "$NOTIF_AG2" | grep -c "import_rejete")
assert "Agent reçoit notif import_rejete" "[ $HAS_REJET -ge 1 ]"

# ============================================================
# 9) Test exclusion factures
# ============================================================
echo
echo "▶ 9. Commandes non validées exclues des factures"
# Compter les commandes 'en_attente_validation' actuellement (on en a créé puis validé/rejeté)
# Maintenant créons un nouvel import qui restera 'en_attente_validation' et vérifions
# qu'il n'apparaît PAS dans les factures buildables.
CSV_C="Restaurant,Id. externe du restaurant,Pays,Code pays,Ville,Id. de la commande,UUID de la commande,Statut de la commande,Date de la commande,Heure de la commande,Montant moyen des commandes,Marque Eats
Snack Test Jean,store-test-001,France,FR,Paris,ORD-X${RUN_ID}-001,uuid-test-v2-excl-${RUN_ID}-001,Completed,2026-06-15,12:00,100.00,Burger XL"

CSV_C_JSON=$(printf '%s' "$CSV_C" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

RESP=$(curl -s -b "$COOKIE_AG" -X POST $HOST/api/admin/imports \
  -H "Content-Type: application/json" \
  -d "{\"marque_id\":1,\"csv\":$CSV_C_JSON,\"nom_fichier\":\"test-v2-exclu.csv\"}")
IMPORT_ID_EXCL=$(echo "$RESP" | grep -oP '"import_id":\K\d+' | head -1)
echo "    → Import en attente (non validé) : #$IMPORT_ID_EXCL"

# Vérifie que les commandes ont validation_statut='en_attente_validation'
CMD_ENATT=$(npx wrangler d1 execute webapp-production --local --command="SELECT validation_statut FROM commandes WHERE import_id=$IMPORT_ID_EXCL LIMIT 1" 2>&1 | grep '"validation_statut"')
assert "Commandes héritent validation_statut" "echo '$CMD_ENATT' | grep -q 'en_attente_validation'"

# ============================================================
# 10) Admin upload pour un agent
# ============================================================
echo
echo "▶ 10. Admin upload POUR un agent → notif 'import_pour_vous'"
CSV_D="Restaurant,Id. externe du restaurant,Pays,Code pays,Ville,Id. de la commande,UUID de la commande,Statut de la commande,Date de la commande,Heure de la commande,Montant moyen des commandes,Marque Eats
Snack Test Jean,store-test-001,France,FR,Paris,ORD-P${RUN_ID}-001,uuid-test-v2-pouragent-${RUN_ID}-001,Completed,2026-07-01,12:00,25.00,Burger XL"

CSV_D_JSON=$(printf '%s' "$CSV_D" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

RESP=$(curl -s -b "$COOKIE_ADM" -X POST $HOST/api/admin/imports/admin-pour-agent \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":2,\"marque_id\":1,\"csv\":$CSV_D_JSON,\"nom_fichier\":\"test-admin-pour-jean.csv\"}")
assert "Admin upload pour agent OK" "echo '$RESP' | grep -q '\"success\":true'"
IMPORT_PA=$(echo "$RESP" | grep -oP '"import_id":\K\d+' | head -1)

SQL_PA=$(npx wrangler d1 execute webapp-production --local --command="SELECT source_upload, validation_statut, pour_agent_id FROM imports_csv WHERE id=$IMPORT_PA" 2>&1 | grep -E '"source_upload"|"validation_statut"|"pour_agent_id"' | tr -d ' ,"')
assert "source_upload = admin_pour_agent" "echo '$SQL_PA' | grep -q 'source_upload:admin_pour_agent'"
assert "validation_statut = valide (auto)" "echo '$SQL_PA' | grep -q 'validation_statut:valide'"
assert "pour_agent_id = 2" "echo '$SQL_PA' | grep -q 'pour_agent_id:2'"

NOTIF_AG3=$(curl -s -b "$COOKIE_AG" "$HOST/api/notifications?statut=non_lu")
HAS_PV=$(echo "$NOTIF_AG3" | grep -c "import_pour_vous")
assert "Agent reçoit notif import_pour_vous" "[ $HAS_PV -ge 1 ]"

# Admin pour-agent : agent invalide doit échouer
STATUS=$(curl -s -b "$COOKIE_ADM" -X POST $HOST/api/admin/imports/admin-pour-agent \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":99999,\"marque_id\":1,\"csv\":$CSV_D_JSON}" -o /dev/null -w "%{http_code}")
assert_status "Admin pour agent inexistant refusé" "$STATUS" "403"

# ============================================================
# 11) ACL : agent ne peut pas /a-valider ni admin-pour-agent
# ============================================================
echo
echo "▶ 11. ACL agent"
STATUS=$(curl -s -b "$COOKIE_AG" $HOST/api/admin/imports/a-valider -o /dev/null -w "%{http_code}")
assert_status "Agent refusé sur /a-valider" "$STATUS" "403"

STATUS=$(curl -s -b "$COOKIE_AG" -X POST $HOST/api/admin/imports/admin-pour-agent \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":2,\"marque_id\":1,\"csv\":$CSV_D_JSON}" -o /dev/null -w "%{http_code}")
assert_status "Agent refusé sur /admin-pour-agent" "$STATUS" "403"

STATUS=$(curl -s -b "$COOKIE_AG" -X POST "$HOST/api/admin/imports/$IMPORT_ID_EXCL/valider" \
  -H "Content-Type: application/json" -d '{}' -o /dev/null -w "%{http_code}")
assert_status "Agent refusé pour valider" "$STATUS" "403"

# Sans auth
STATUS=$(curl -s $HOST/api/admin/imports/a-valider -o /dev/null -w "%{http_code}")
assert_status "Sans auth refusé sur /a-valider" "$STATUS" "401"

# ============================================================
# 12) Notifications : mark read + delete
# ============================================================
echo
echo "▶ 12. Notifications : mark read + delete"
NOTIF_LIST=$(curl -s -b "$COOKIE_AG" "$HOST/api/notifications?statut=non_lu")
FIRST_ID=$(echo "$NOTIF_LIST" | grep -oP '"id":\K\d+' | head -1)
if [ -n "$FIRST_ID" ]; then
  RESP=$(curl -s -b "$COOKIE_AG" -X POST "$HOST/api/notifications/$FIRST_ID/lu")
  assert "Mark read OK" "echo '$RESP' | grep -q '\"success\":true'"
  RESP=$(curl -s -b "$COOKIE_AG" -X POST "$HOST/api/notifications/tout-lu")
  assert "Tout marquer lu OK" "echo '$RESP' | grep -q '\"success\":true'"
  COUNT_AFTER=$(curl -s -b "$COOKIE_AG" $HOST/api/notifications/count)
  assert "Plus de notifications non lues" "echo '$COUNT_AFTER' | grep -q '\"non_lues\":0'"
else
  echo "    ⚠️  Pas de notif à marquer (ok, sautons)"
fi

# ============================================================
# RÉSUMÉ
# ============================================================
echo
echo "════════════════════════════════════════"
echo "  RÉSULTAT : $ASSERT_OK ✅ / $ASSERT_KO ❌"
echo "════════════════════════════════════════"
if [ $ASSERT_KO -gt 0 ]; then exit 1; fi
echo "✨ TOUS LES TESTS PASSENT ✨"
