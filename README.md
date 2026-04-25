# UberCommissions - Suivi MLM Uber Eats

## Présentation
Application web pour gérer le suivi des commissions Uber Eats dans une structure MLM (Multi-Level Marketing) à 3 niveaux :
- **Agents commerciaux (N1)** qui ramènent des restaurants/snacks
- **Sous-agents (N2)** rattachés à un agent N1
- **Sous-sous-agents (N3)** rattachés à un sous-agent N2

Chaque snack/restaurant peut avoir plusieurs **marques virtuelles** sur Uber Eats. L'application importe les CSV exportés depuis Uber Eats Manager (par marque virtuelle) et calcule automatiquement les commissions selon des **paliers progressifs** configurables.

## URLs
- **Local (sandbox dev)** : http://localhost:3000
- **Public sandbox** : https://3000-i0ckn8yixm6q6inqrrm6t-2e1b9533.sandbox.novita.ai
- **Production Cloudflare Pages** : *(non encore déployé)*

## Fonctionnalités complétées (v1)

### Dashboard
- Stats globales : nb agents (par niveau), restaurants, marques, commandes
- CA total + CA du mois en cours
- Top 5 restaurants par CA
- Top 5 agents par CA généré
- Graphique évolution CA sur 6 mois

### Gestion MLM des agents
- CRUD agents avec niveau hiérarchique (1, 2 ou 3)
- Liaison parent/enfant (sous-agent → agent / sous-sous-agent → sous-agent)
- Vue arbre hiérarchique
- Coordonnées + IBAN pour paiement des commissions

### Restaurants & Marques virtuelles
- CRUD restaurants avec agent référent
- Plusieurs marques virtuelles par restaurant
- ID Uber Eats stockable par marque
- Vue détaillée avec stats par marque (commandes, CA)

### Import CSV Uber Eats
- Drag & drop ou sélection de fichier
- **Détection automatique des colonnes** (FR + EN) : ID commande, date, total, frais Uber, net, statut
- Mapping manuel possible si la détection échoue
- Aperçu avant import
- **Détection automatique des doublons** (basé sur Order ID)
- Support des dates FR (`dd/mm/yyyy`) et EN (`yyyy-mm-dd`)
- Support des nombres avec séparateurs FR (virgule) et EN (point)
- Historique complet des imports avec possibilité de suppression

### Calcul des commissions
- **Paliers progressifs** (style tranches d'imposition) configurables par type :
  - Entreprise (sur CA Net mensuel du restaurant)
  - Agent N1 (sur la commission entreprise)
  - Sous-agent N2 (sur la commission entreprise)
  - Sous-sous-agent N3 (sur la commission entreprise)
- Calcul automatique mensuel par restaurant
- Vue récap **par restaurant** : CA, commissions de chaque niveau, marge finale
- Vue récap **par agent** : montant total à payer à chaque agent (toutes ses commissions cumulées)
- Détection auto de la chaîne hiérarchique selon le niveau de l'agent qui a ramené le restaurant

### Paiements
- Génération de paiement directement depuis l'écran commissions
- Suivi en attente / payé / annulé
- Date de paiement, méthode (virement / espèces / etc.), référence
- Filtrage par mois/année/agent
- Stats : total dû, total payé

### Configuration paliers
- Édition des taux par tranche (CA min/max, taux %)
- Mode mensuel ou cumulatif
- 4 types de paliers (entreprise, agent, sous-agent, sous-sous-agent)

## URIs / Endpoints API

| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/health` | Healthcheck |
| GET | `/api/dashboard` | Stats globales + tops |
| GET/POST/PUT/DELETE | `/api/agents` | CRUD agents |
| GET | `/api/agents/tree` | Arbre hiérarchique |
| GET/POST/PUT/DELETE | `/api/restaurants` | CRUD restaurants |
| GET | `/api/restaurants/:id` | Détail + marques |
| GET | `/api/restaurants/marques/all` | Toutes les marques |
| POST | `/api/restaurants/:id/marques` | Créer marque |
| PUT/DELETE | `/api/restaurants/marques/:id` | Modifier/supprimer marque |
| GET/POST/PUT/DELETE | `/api/paliers` | CRUD paliers |
| POST | `/api/paliers/replace/:type` | Remplacer tous les paliers d'un type |
| POST | `/api/imports/preview` | Détection colonnes CSV |
| POST | `/api/imports` | Import CSV (params: marque_id, csv, mapping) |
| GET | `/api/imports` | Historique imports |
| DELETE | `/api/imports/:id` | Supprimer un import + ses commandes |
| GET | `/api/commissions/recap?annee=&mois=` | Récap par restaurant |
| GET | `/api/commissions/agents?annee=&mois=` | Récap par agent (montant à payer) |
| GET | `/api/commissions/agent/:id?annee=&mois=` | Détail commissions d'un agent |
| GET/POST/PUT/DELETE | `/api/paiements` | CRUD paiements |
| POST | `/api/paiements/:id/pay` | Marquer comme payé |

## Architecture des données
- **agents** : id, nom, prénom, email, niveau (1/2/3), parent_id, iban, actif
- **restaurants** : id, nom, ville, agent_id, date_signature
- **marques_virtuelles** : id, restaurant_id, nom, uber_store_id
- **commandes** : id, marque_id, uber_order_id, date_commande, montant_brut, frais_uber, montant_net, statut
- **imports_csv** : id, marque_id, nom_fichier, periode, nb_lignes, nb_importees, nb_doublons, montant_total, statut
- **paliers_commissions** : id, type, base, mode, seuil_min, seuil_max, taux
- **paiements** : id, agent_id, periode_mois, periode_annee, montant, statut, date_paiement, methode, reference

## Logique de calcul des commissions
Pour chaque restaurant et chaque mois :
1. **CA Net** = somme des `montant_net` des commandes du mois (statut ≠ annulée)
2. **Commission Entreprise** = paliers progressifs appliqués au CA Net
3. **Commission Agent N1** = paliers appliqués sur la commission entreprise
4. **Commission Sous-agent N2** = paliers appliqués sur la commission entreprise (si l'agent qui a ramené est N2 ou N3)
5. **Commission Sous-sous-agent N3** = paliers appliqués sur la commission entreprise (si l'agent qui a ramené est N3)
6. **Marge entreprise finale** = Comm. Entreprise − (Comm. Agent + Sous-agent + Sous-sous-agent)

**Détection chaîne hiérarchique** : quand un sous-sous-agent (N3) ramène un resto, son parent (N2) et le grand-parent (N1) touchent leurs commissions respectives en plus.

## Fonctionnalités à implémenter (TODO)
- 🔜 Authentification (login admin / agents)
- 🔜 Comptes agents pour qu'ils consultent leurs propres commissions
- 🔜 Export PDF des fiches de commission par agent
- 🔜 Export Excel/CSV des récaps
- 🔜 Notifications email automatiques aux agents
- 🔜 Mode "cumulatif" effectivement implémenté (actuellement seul "mensuel" est utilisé)
- 🔜 Multi-devises
- 🔜 Gestion des avoirs / annulations a posteriori
- 🔜 Dashboard mobile-friendly amélioré
- 🔜 Comparaison mois N vs N-1
- 🔜 Filtres avancés (par agent, par ville, etc.)

## Recommandations next steps
1. **Vérifier les paliers** dans `Paliers` - les valeurs par défaut sont génériques (15/12/10% entreprise...). Adaptez-les à vos vraies règles métier.
2. **Créer vos vrais agents** depuis la page Agents (et supprimer les exemples Dupont/Martin/Bernard/Petit)
3. **Saisir vos restaurants et marques virtuelles**
4. **Faire un premier import CSV de test** avec une période courte pour vérifier le mapping et le calcul
5. **Déployer en production** sur Cloudflare Pages

## Stack technique
- **Backend** : Hono (TypeScript) sur Cloudflare Workers / Pages
- **Database** : Cloudflare D1 (SQLite distribué)
- **Frontend** : SPA Vanilla JS + TailwindCSS (CDN) + Chart.js + Axios + Font Awesome
- **Build** : Vite
- **Déploiement** : Cloudflare Pages

## Commandes utiles
```bash
# Build
npm run build

# Lancer en local (PM2)
pm2 start ecosystem.config.cjs
pm2 logs webapp --nostream

# Reset DB locale + seed
rm -rf .wrangler/state/v3/d1
npx wrangler d1 execute webapp-production --local --file=./migrations/0001_initial_schema.sql
npm run db:seed

# Console SQL locale
npm run db:console:local

# Déploiement Cloudflare Pages
npm run deploy
```

## Statut
- **Plateforme** : Cloudflare Pages
- **Statut** : ✅ Fonctionnel en local
- **Tech** : Hono + TypeScript + Cloudflare D1 + TailwindCSS
- **Date** : 2026-04-25
