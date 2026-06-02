#!/bin/bash
# ============================================================
# TESTS E2E — Système de tranches unifiées chronologiques
# ============================================================
# Couvre :
#  1. Auth admin
#  2. Endpoint /audit (cohérence générale)
#  3. Endpoint /chronologie (ordre temporel)
#  4. Endpoint /etat (tranche ouverte + clôturées + héritages)
#  5. Endpoint /recalculer (un agent + tous)
#  6. Scénario chronologique sur agent réel #2 (Jean Dupont)
#  7. Vérif propagation héritage marques
#  8. ACL (401 sans auth, 403 sans superadmin)
# ============================================================

set -e
HOST=http://localhost:3000
COOKIE=/tmp/cookies-tranches.txt
ASSERT_OK=0
ASSERT_KO=0

assert() {
  local label="$1"; local cond="$2"
  if eval "$cond"; then echo "  ✅ $label"; ASSERT_OK=$((ASSERT_OK+1))
  else echo "  ❌ $label"; echo "     condition: $cond"; ASSERT_KO=$((ASSERT_KO+1)); fi
}

echo "════════════════════════════════════════"
echo "  TESTS E2E — Tranches unifiées"
echo "════════════════════════════════════════"

# 1) Auth
echo
echo "▶ 1. Authentification admin"
RESP=$(curl -s -c "$COOKIE" -X POST $HOST/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@dropeat.io","password":"admin123"}')
assert "Login admin OK" "echo '$RESP' | grep -q '\"success\":true'"
assert "Rôle = superadmin" "echo '$RESP' | grep -q '\"role\":\"superadmin\"'"

# 2) Audit
echo
echo "▶ 2. Endpoint /api/admin/tranches/audit"
AUDIT=$(curl -s -b "$COOKIE" $HOST/api/admin/tranches/audit)
assert "Audit répond JSON valide" "echo '$AUDIT' | grep -q '\"summary\"'"
assert "Champ total présent" "echo '$AUDIT' | grep -q '\"total\":'"
assert "Champ anomalies présent" "echo '$AUDIT' | grep -q '\"anomalies\":'"
TOTAL_ANO=$(echo "$AUDIT" | grep -oP '"total":\K\d+' | head -1)
echo "    → $TOTAL_ANO anomalie(s) détectée(s)"

# 3) Chronologie agent #2 (Jean Dupont — 18 apports attendus)
echo
echo "▶ 3. Chronologie agent #2"
CHRONO=$(curl -s -b "$COOKIE" "$HOST/api/admin/tranches/chronologie?agent_id=2")
assert "Chronologie répond JSON" "echo '$CHRONO' | grep -q '\"apports\"'"
NB_APPORTS=$(echo "$CHRONO" | grep -oP '"total":\K\d+' | head -1)
assert "Au moins 15 apports pour agent #2" "[ $NB_APPORTS -ge 15 ]"
assert "Tri chronologique : 1er apport date 2026-04-29" "echo '$CHRONO' | grep -oP '\"date_validation\":\"\K[^\"]+' | head -1 | grep -q '2026-04-29'"

# 4) État agent #2
echo
echo "▶ 4. État tranches agent #2"
ETAT=$(curl -s -b "$COOKIE" "$HOST/api/admin/tranches/etat?agent_id=2")
assert "Type unifiee renvoyé" "echo '$ETAT' | grep -q '\"type\":\"unifiee\"'"
assert "Tranches clôturées présentes" "echo '$ETAT' | grep -q '\"tranches_cloturees\":\\['"
NB_CLOT=$(echo "$ETAT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['tranches_cloturees']))")
assert "Au moins 1 tranche clôturée pour Jean" "[ $NB_CLOT -ge 1 ]"
NB_ATT=$(echo "$ETAT" | grep -oP '"nb_attributions_total":\K\d+' | head -1)
echo "    → $NB_CLOT tranches clôturées, $NB_ATT attributions"

# 5) Recalcul global
echo
echo "▶ 5. Recalcul global (tous les agents)"
RECALC=$(curl -s -b "$COOKIE" -X POST $HOST/api/admin/tranches/recalculer \
  -H "Content-Type: application/json" -d '{"all":true}')
RECALC_OK=$(echo "$RECALC" | grep -c '"success":true')
assert "Recalcul success" "[ $RECALC_OK -ge 1 ]"
TOTAL_AGENTS=$(echo "$RECALC" | grep -oP '"total_agents":\K\d+' | head -1)
assert "37 agents traités" "[ $TOTAL_AGENTS -eq 37 ]"
TOTAL_ATTR=$(echo "$RECALC" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['summary']['total_attributions'])")
TOTAL_HER=$(echo "$RECALC" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['summary']['total_heritages'])")
echo "    → $TOTAL_ATTR attribution(s), $TOTAL_HER héritage(s)"
assert "Au moins 1 attribution générée" "[ $TOTAL_ATTR -ge 1 ]"

# 6) Audit après recalcul = 0 anomalie
echo
echo "▶ 6. Audit après recalcul (doit être à zéro)"
AUDIT2=$(curl -s -b "$COOKIE" $HOST/api/admin/tranches/audit)
TOTAL_ANO2=$(echo "$AUDIT2" | grep -oP '"total":\K\d+' | head -1)
assert "Aucune anomalie après recalcul" "[ $TOTAL_ANO2 -eq 0 ]"

# 7) Vérif scénario Burger XL : marque sur resto déjà compté en tranche 1 → doit aller en tranche 2
echo
echo "▶ 7. Scénario Burger XL (Q4 - chronologie inter-tranches)"
ETAT_JEAN=$(curl -s -b "$COOKIE" "$HOST/api/admin/tranches/etat?agent_id=2")
# Burger XL = marque #1, resto_id=1 (Snack Test Jean, position 1 tranche 1)
# Doit apparaître dans tranche 2
BURGER_IN_T2=$(npx wrangler d1 execute webapp-production --local --command="
  SELECT ta.numero_tranche FROM tranche_elements te
  JOIN tranches_attribution ta ON te.tranche_id=ta.id
  WHERE te.agent_id=2 AND te.type='marque' AND te.element_id=1" 2>/dev/null | grep -oP '"numero_tranche":\s*\K\d+' | head -1)
assert "Burger XL est dans tranche 2 de Jean (rejoint tranche actuelle après clôture T1)" "[ \"$BURGER_IN_T2\" = \"2\" ]"

# 8) Vérif chronologique : la 5ème position d'une tranche doit toujours être l'élément attribué
echo
echo "▶ 8. Position 5 = attribution (cohérence)"
DECAL=$(npx wrangler d1 execute webapp-production --local --command="
  SELECT COUNT(*) as n FROM tranche_elements te
  JOIN tranches_attribution ta ON te.tranche_id=ta.id
  WHERE ta.statut='cloturee' AND te.position_dans_tranche=5 AND te.is_attribution=0" 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
assert "Aucune position 5 sans is_attribution dans tranches clôturées" "[ \"$DECAL\" = \"0\" ]"

# 9) ACL : pas de session → 401
echo
echo "▶ 9. ACL — sans session = 401"
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" $HOST/api/admin/tranches/audit)
assert "GET /audit sans cookie = 401" "[ \"$NOAUTH\" = \"401\" ]"

# 10) ACL : agent non-superadmin = 403
echo
echo "▶ 10. ACL — non-superadmin = 403 sur /audit"
# On utilise un cookie agent (Jean Dupont #2)
curl -s -c /tmp/cookies-jean.txt -X POST $HOST/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"jean@dropeat.io","password":"agent123"}' > /dev/null 2>&1
HTTP_403=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/cookies-jean.txt $HOST/api/admin/tranches/audit)
assert "Agent non-superadmin = 403 sur /audit" "[ \"$HTTP_403\" = \"403\" ]"

# 11) Recalcul pour un seul agent
echo
echo "▶ 11. Recalcul agent unique"
RECALC1=$(curl -s -b "$COOKIE" -X POST $HOST/api/admin/tranches/recalculer \
  -H "Content-Type: application/json" -d '{"agent_id":2}')
assert "Recalcul agent #2 success" "echo '$RECALC1' | grep -q '\"success\":true'"
assert "Un seul rapport renvoyé" "echo '$RECALC1' | python3 -c \"import json,sys;d=json.load(sys.stdin);exit(0 if len(d['reports'])==1 else 1)\""

# 12) Recalcul log
echo
echo "▶ 12. Historique des recalculs"
LOG=$(curl -s -b "$COOKIE" "$HOST/api/admin/tranches/recalcul-log?limit=10")
assert "Log retourné" "echo '$LOG' | grep -q '\"logs\":'"
NB_LOGS=$(echo "$LOG" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d['logs']))")
assert "Au moins 1 entrée de log" "[ $NB_LOGS -ge 1 ]"

# Cleanup
rm -f "$COOKIE" /tmp/cookies-jean.txt 2>/dev/null

echo
echo "════════════════════════════════════════"
echo "  RÉSULTATS"
echo "════════════════════════════════════════"
echo "  ✅ $ASSERT_OK assertions OK"
echo "  ❌ $ASSERT_KO assertions KO"
if [ $ASSERT_KO -eq 0 ]; then
  echo "  🎉 TOUS LES TESTS PASSENT"
  exit 0
else
  echo "  ⚠️  Certains tests ont échoué"
  exit 1
fi
