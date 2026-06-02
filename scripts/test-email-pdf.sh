#!/bin/bash
# ============================================================
# Test end-to-end : Facture PDF + Email + Settings
# ============================================================
set -e
BASE=${BASE:-http://localhost:3000}
COOKIE_FILE=$(mktemp)

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok() { echo -e "${GREEN}✓${NC} $1"; }
ko() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
section() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }

# --- LOGIN ---
section "1. AUTHENTIFICATION"
LOGIN=$(curl -s -c "$COOKIE_FILE" -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dropeat.io","password":"admin123"}')
echo "$LOGIN" | grep -q '"success":true' && ok "Login admin" || ko "Login: $LOGIN"

# --- SETTINGS EMAIL ---
section "2. ENDPOINTS PARAMÈTRES EMAIL"

S=$(curl -s -b "$COOKIE_FILE" $BASE/api/admin/settings/email)
echo "$S" | grep -q '"email_provider":"resend"' && ok "GET /settings/email" || ko "GET failed: $S"

# PUT update
PR=$(curl -s -b "$COOKIE_FILE" -X PUT $BASE/api/admin/settings/email \
  -H "Content-Type: application/json" \
  -d '{"email_from_name":"DropEat Test E2E","app_base_url":"http://localhost:3000","email_enabled":false}')
echo "$PR" | grep -q '"success":true' && ok "PUT /settings/email" || ko "PUT failed: $PR"

# Vérifie la persistance
S2=$(curl -s -b "$COOKIE_FILE" $BASE/api/admin/settings/email)
echo "$S2" | grep -q '"email_from_name":"DropEat Test E2E"' && ok "Settings persisted" || ko "Not persisted: $S2"

# Test email (mode log)
T=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/admin/settings/email/test \
  -H "Content-Type: application/json" \
  -d '{"to":"e2e@test.com"}')
echo "$T" | grep -q '"mode":"logged"' && ok "POST /settings/email/test (mode log)" || ko "Test email: $T"

# Erreur si pas d'email
NE=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/admin/settings/email/test \
  -H "Content-Type: application/json" -d '{}')
echo "$NE" | grep -q '"error"' && ok "POST /settings/email/test rejette si pas d'email" || ko "Should reject: $NE"

# --- CRÉATION FACTURE VIA INSERT DIRECT ---
section "3. CRÉATION FACTURE DE TEST (insert SQL)"

# Crée d'abord un profil société pour l'agent #2 si absent
npx wrangler d1 execute webapp-production --local --command="
INSERT OR IGNORE INTO profils_societe (id, user_id, type_societe, raison_sociale, nom_commercial, forme_juridique, capital, siret, numero_tva, adresse_rue, code_postal, ville, pays, telephone, email_facturation, iban, regime_tva, taux_tva, validated_at, created_at, updated_at)
VALUES (100, 2, 'sarl', 'JEAN COMMERCIAL SARL', 'Jean Commercial', 'SARL', '5000', '12345678901234', 'FR12345678901', '1 rue Test', '75001', 'Paris', 'France', '0102030405', 'jean@dropeat.io', 'FR761234567890123456789012', 'franchise', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
" >/dev/null 2>&1 && ok "Profil société agent #2 créé/présent"

# Snapshot émetteur (agent jean) — selon les vraies colonnes
EMETTEUR=$(cat <<EOF
{"raison_sociale":"JEAN COMMERCIAL SARL","nom_commercial":"Jean Commercial","forme_juridique":"SARL","capital":"5000","siret":"12345678901234","numero_tva":"FR12345678901","adresse_rue":"1 rue Test","code_postal":"75001","ville":"Paris","pays":"France","telephone":"0102030405","email_facturation":"jean@dropeat.io","iban":"FR761234567890123456789012"}
EOF
)
DEST=$(cat <<EOF
{"raison_sociale":"DROPEAT LTD","nom_commercial":"DropEat™","forme_juridique":"LTD","pays":"United Kingdom","email_facturation":"admin@dropeat.io","company_number":"12345678"}
EOF
)
MENTIONS='["Article 293 B du CGI : TVA non applicable, art. 293 B du CGI","Pénalités de retard : 3 fois le taux d''intérêt légal"]'

# Insert facture brouillon
INSERT_RESULT=$(npx wrangler d1 execute webapp-production --local --command="
INSERT INTO factures (numero, type, emetteur_user_id, dest_user_id, emetteur_snapshot, dest_snapshot, mentions_legales, periode_mois, periode_annee, date_emission, date_echeance, montant_ht, montant_tva, taux_tva, montant_ttc, devise, statut, dest_email)
VALUES ('TEST-E2E-001', 'agent_to_dropeat', 2, 1, '$EMETTEUR', '$DEST', '$MENTIONS', 4, 2026, '2026-05-01', '2026-05-31', 150.00, 0.00, 0, 150.00, 'EUR', 'brouillon', 'admin@dropeat.io')
RETURNING id" --json 2>/dev/null)
FID=$(echo "$INSERT_RESULT" | grep -oP '"id":\s*\K\d+' | head -1)
[ -n "$FID" ] && ok "Facture créée id=$FID" || ko "Insert facture: $INSERT_RESULT"

# Ajoute une ligne
npx wrangler d1 execute webapp-production --local --command="
INSERT INTO facture_lignes (facture_id, ordre, libelle, description, quantite, prix_unitaire, montant_ht, marque_id)
VALUES ($FID, 1, 'Commission test', 'Ligne de test E2E', 1, 150, 150, NULL)
" >/dev/null 2>&1 && ok "Ligne facture créée"

# --- ROUTES PDF + EMAIL ---
section "4. ROUTES PDF + EMAIL FACTURE"

# GET /pdf
PDF=$(curl -s -b "$COOKIE_FILE" -o /tmp/facture.html -w "%{http_code}" $BASE/api/factures/$FID/pdf)
[ "$PDF" = "200" ] && ok "GET /factures/$FID/pdf HTTP 200" || ko "PDF http $PDF"

# Vérifie contenu HTML
grep -q "TEST-E2E-001" /tmp/facture.html && ok "PDF contient numéro facture" || ko "PDF sans numéro"
grep -q "JEAN COMMERCIAL SARL" /tmp/facture.html && ok "PDF contient émetteur" || ko "PDF sans émetteur"
grep -q "DROPEAT LTD" /tmp/facture.html && ok "PDF contient destinataire" || ko "PDF sans destinataire"
grep -q "150,00 €" /tmp/facture.html && ok "PDF contient montant formaté FR" || ko "PDF sans montant"
grep -q "@page" /tmp/facture.html && ok "PDF a CSS @page A4" || ko "PDF pas CSS print"

# GET /envois (vide au départ)
ENV1=$(curl -s -b "$COOKIE_FILE" $BASE/api/factures/$FID/envois)
echo "$ENV1" | grep -q '"envois":\[\]' && ok "GET /envois vide au départ" || ko "Envois init: $ENV1"

# POST /email manuel
EM=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID/email \
  -H "Content-Type: application/json" \
  -d '{"evenement":"manuel"}')
echo "$EM" | grep -q '"success":true' && ok "POST /factures/$FID/email" || ko "Email send: $EM"

# Historique non vide
ENV2=$(curl -s -b "$COOKIE_FILE" $BASE/api/factures/$FID/envois)
N_ENVOIS=$(echo "$ENV2" | grep -oP '"id":\s*\d+' | wc -l)
[ "$N_ENVOIS" -ge 1 ] && ok "Historique contient $N_ENVOIS envoi(s)" || ko "Historique vide: $ENV2"

# Le compteur nb_envois_email doit être à 1
NB=$(npx wrangler d1 execute webapp-production --local --command="SELECT nb_envois_email FROM factures WHERE id=$FID" --json 2>/dev/null | grep -oP '"nb_envois_email":\s*\K\d+' | head -1)
[ "$NB" = "1" ] && ok "nb_envois_email = 1" || ko "nb_envois_email = $NB"

# --- HOOKS TRANSITIONS DE STATUT ---
section "5. HOOKS AUTO TRANSITIONS DE STATUT"

# envoyer (brouillon → envoyee)
SEND=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID/envoyer)
echo "$SEND" | grep -q '"success":true' && ok "POST /envoyer" || ko "Envoyer: $SEND"

# Vérifie statut + envoi logged
STAT1=$(npx wrangler d1 execute webapp-production --local --command="SELECT statut FROM factures WHERE id=$FID" --json 2>/dev/null | grep -oP '"statut":\s*"\K[^"]+' | head -1)
[ "$STAT1" = "envoyee" ] && ok "Statut = envoyee" || ko "Statut: $STAT1"

EVT1=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID AND evenement='envoyee'" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT1" = "1" ] && ok "Hook 'envoyee' déclenché (1 log)" || ko "Hook envoyee = $EVT1"

# valider
VAL=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID/valider)
echo "$VAL" | grep -q '"success":true' && ok "POST /valider" || ko "Valider: $VAL"
EVT2=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID AND evenement='validee'" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT2" = "1" ] && ok "Hook 'validee' déclenché" || ko "Hook validee = $EVT2"

# payer
PAY=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID/payer \
  -H "Content-Type: application/json" -d '{"reference_paiement":"VIR-2026-001"}')
echo "$PAY" | grep -q '"success":true' && ok "POST /payer" || ko "Payer: $PAY"
EVT3=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID AND evenement='payee'" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT3" = "1" ] && ok "Hook 'payee' déclenché" || ko "Hook payee = $EVT3"

# --- TEST HOOK 'creee' via envoi manuel (l'endpoint /email accepte tous les événements) ---
EMC=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID/email \
  -H "Content-Type: application/json" -d '{"evenement":"creee"}')
echo "$EMC" | grep -q '"success":true' && ok "POST /email avec evenement=creee" || ko "Creee: $EMC"
EVT4=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID AND evenement='creee'" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT4" = "1" ] && ok "Template 'creee' produit un log" || ko "Template creee = $EVT4"

# --- TEST refus avec motif ---
section "5b. TEST REFUSER (Statut spécial avec motif)"
# Recrée une facture pour tester le refus
INSERT_RESULT2=$(npx wrangler d1 execute webapp-production --local --command="
INSERT INTO factures (numero, type, emetteur_user_id, dest_user_id, emetteur_snapshot, dest_snapshot, mentions_legales, periode_mois, periode_annee, date_emission, date_echeance, montant_ht, montant_tva, taux_tva, montant_ttc, devise, statut, dest_email)
VALUES ('TEST-REFUS-001', 'agent_to_dropeat', 2, 1, '$EMETTEUR', '$DEST', '$MENTIONS', 4, 2026, '2026-05-01', '2026-05-31', 99.00, 0.00, 0, 99.00, 'EUR', 'envoyee', 'admin@dropeat.io')
RETURNING id" --json 2>/dev/null)
FID2=$(echo "$INSERT_RESULT2" | grep -oP '"id":\s*\K\d+' | head -1)
[ -n "$FID2" ] && ok "Facture envoyee créée id=$FID2"

REF=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID2/refuser \
  -H "Content-Type: application/json" -d '{"motif":"Test E2E : montant erroné"}')
echo "$REF" | grep -q '"success":true' && ok "POST /refuser avec motif" || ko "Refuser: $REF"
EVT5=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID2 AND evenement='refusee'" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT5" = "1" ] && ok "Hook 'refusee' déclenché" || ko "Hook refusee = $EVT5"

# Vérifier que le motif est bien stocké
MOTIF=$(npx wrangler d1 execute webapp-production --local --command="SELECT motif_refus FROM factures WHERE id=$FID2" --json 2>/dev/null | grep -oP '"motif_refus":\s*"\K[^"]+' | head -1)
[ "$MOTIF" = "Test E2E : montant erroné" ] && ok "Motif refus stocké" || ko "Motif: $MOTIF"

# --- TEST sans email destinataire (cas où resolveDestinataireEmail ne trouve rien) ---
section "5c. RÉSILIENCE : facture sans email destinataire"
INSERT_NOEMAIL=$(npx wrangler d1 execute webapp-production --local --command="
INSERT INTO factures (numero, type, emetteur_user_id, emetteur_snapshot, dest_snapshot, mentions_legales, periode_mois, periode_annee, date_emission, date_echeance, montant_ht, montant_tva, taux_tva, montant_ttc, devise, statut)
VALUES ('TEST-NOEMAIL', 'agent_to_dropeat', 2, '$EMETTEUR', '{}', '[]', 4, 2026, '2026-05-01', '2026-05-31', 50.00, 0, 0, 50.00, 'EUR', 'brouillon')
RETURNING id" --json 2>/dev/null)
FID3=$(echo "$INSERT_NOEMAIL" | grep -oP '"id":\s*\K\d+' | head -1)
[ -n "$FID3" ] && ok "Facture sans email créée id=$FID3"

# Envoyer cette facture : le hook doit s'exécuter SILENCIEUSEMENT sans erreur
SEND_NOEMAIL=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID3/envoyer)
echo "$SEND_NOEMAIL" | grep -q '"success":true' && ok "Transition statut OK même sans email" || ko "Transition: $SEND_NOEMAIL"

# Pas de log d'envoi car silently ignored
EVT_NOEMAIL=$(npx wrangler d1 execute webapp-production --local --command="SELECT COUNT(*) as n FROM facture_envois WHERE facture_id=$FID3" --json 2>/dev/null | grep -oP '"n":\s*\K\d+' | head -1)
[ "$EVT_NOEMAIL" = "0" ] && ok "Pas de log d'envoi si pas d'email (skip silencieux)" || ko "Should be 0, got: $EVT_NOEMAIL"

# Envoyer manuellement avec override email doit fonctionner
OVERRIDE=$(curl -s -b "$COOKIE_FILE" -X POST $BASE/api/factures/$FID3/email \
  -H "Content-Type: application/json" -d '{"evenement":"manuel","destinataire_email":"override@test.com"}')
echo "$OVERRIDE" | grep -q '"success":true' && ok "POST /email avec override fonctionne" || ko "Override: $OVERRIDE"
DESTSTORE=$(npx wrangler d1 execute webapp-production --local --command="SELECT destinataire_email FROM facture_envois WHERE facture_id=$FID3 LIMIT 1" --json 2>/dev/null | grep -oP '"destinataire_email":\s*"\K[^"]+' | head -1)
[ "$DESTSTORE" = "override@test.com" ] && ok "Override email stocké dans historique" || ko "Override stored: $DESTSTORE"

# Nettoyage des factures supplémentaires
npx wrangler d1 execute webapp-production --local --command="
DELETE FROM facture_envois WHERE facture_id IN ($FID2, $FID3);
DELETE FROM facture_lignes WHERE facture_id IN ($FID2, $FID3);
DELETE FROM factures WHERE id IN ($FID2, $FID3);
" >/dev/null 2>&1

# --- ACL ---
section "6. CONTRÔLES ACL"

# Non authentifié → 401/403
NA=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/factures/$FID/pdf)
[ "$NA" = "401" ] || [ "$NA" = "403" ] && ok "PDF sans auth refusé ($NA)" || ko "Should deny: $NA"

NA2=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/admin/settings/email)
[ "$NA2" = "401" ] || [ "$NA2" = "403" ] && ok "Settings sans auth refusé ($NA2)" || ko "Should deny: $NA2"

# --- CLEANUP ---
section "7. NETTOYAGE"
npx wrangler d1 execute webapp-production --local --command="
DELETE FROM facture_envois WHERE facture_id=$FID;
DELETE FROM facture_lignes WHERE facture_id=$FID;
DELETE FROM factures WHERE id=$FID;
DELETE FROM profils_societe WHERE id=100;
" >/dev/null 2>&1 && ok "Données de test supprimées"

rm -f "$COOKIE_FILE" /tmp/facture.html

echo -e "\n${GREEN}══════════════════════════════════════════"
echo -e "  TOUS LES TESTS PASSÉS ✓"
echo -e "══════════════════════════════════════════${NC}"
