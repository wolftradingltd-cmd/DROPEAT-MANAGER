# 🍔 DropEat™ - Suivi Commissions Uber Eats - MLM

## ⚠️ DÉPLOIEMENT — LIRE EN PREMIER

**Problème connu** : un `wrangler pages deploy` ne déploie que le **code**, **PAS la base D1**. Si vous avez 36 commerciaux + restaurants en local et que vous faites `Hosted Deployment`, la base distante reste vide.

### Workflow de déploiement complet (préserve les commerciaux)

```bash
# 1. Exporter la base locale (37 users + 16 restos + 8 marques + 471 lignes)
npm run db:export:prod
#   → génère seed-production.sql

# 2. Build + déployer le code
npm run build
npx wrangler pages deploy dist --project-name webapp

# 3. Appliquer les migrations sur la D1 distante (1ère fois ou nouvelles migrations)
npm run db:migrate:prod

# 4. Injecter le seed complet (commerciaux, restos, marques, paliers, etc.)
npm run db:seed:prod
```

**Raccourci** : `npm run deploy:full` enchaîne export → build → deploy.
Il faut **ensuite** lancer manuellement `npm run db:migrate:prod && npm run db:seed:prod`
(commandes interactives wrangler `--remote`).

Scripts disponibles :
| Script | Action |
|--------|--------|
| `npm run db:export:prod` | Génère `seed-production.sql` depuis la DB locale |
| `npm run db:seed:prod` | Applique `seed-production.sql` sur D1 distante |
| `npm run db:migrate:prod` | Applique les migrations sur D1 distante |
| `npm run db:console:prod` | Console SQL interactive sur D1 distante |
| `npm run deploy` | Build + deploy code seul (sans DB) |
| `npm run deploy:full` | Export DB + build + deploy code (DB à seeder ensuite) |

---

## Vue d'ensemble

Application web complète pour gérer le suivi des commissions de votre activité **marques virtuelles Uber Eats** avec un système commercial **MLM à 3 niveaux**.

### Concept business
- Vous démarchez des snacks et leur ouvrez **plusieurs marques virtuelles** sur Uber Eats (4, 5, 6 marques par snack)
- Vous prenez des **commissions sur chaque commande**
- Vos **agents commerciaux** (et leurs sous-agents et sous-sous-agents) touchent aussi des commissions
- Le tout par **paliers progressifs** (style tranches d'imposition)

---

## 🆕 Nouveautés (session courante)

### 💰 Refonte complète du système de facturation (Phase B — modules 1→5)

**Problème résolu** : l'ancien écran "Facturer un restaurant" listait uniquement les restaurants sans laisser choisir les marques. La nouvelle facturation est multi-marques, supporte le mode groupé/séparé, et sépare les commissions MLM dans un scope dédié.

#### 3 types de factures (toujours présents mais réorganisés)
1. **`agent_to_dropeat` — Commissions standard** : numéro `AGT-YYYY-MM-NNNN`. Les commissions propres de l'agent sur ses marques (hors portefeuille).
2. **`agent_to_dropeat` — Commissions MLM** *(nouveau scope séparé)* : numéro `AGT-MLM-YYYY-MM-NNNN`. Les commissions N+1 / N+2 issues des filleuls. **Toujours facturées à part** pour traçabilité réglementaire.
3. **`agent_to_resto` — Portefeuille 100%** : numéro `PA-{agent_id}-YYYY-NNNN`. Sur la 5e marque/resto en portefeuille propriétaire, l'agent facture **directement** le restaurant.
4. **`dropeat_to_resto` — Commission DropEat → restaurant** : numéro `DRP-YYYY-MM-RNNN`. Facturation DropEat aux restaurants (hors portefeuille).

#### Nouveautés clés
- **Picker de marques partagé** (`marquesPicker`) : tableau interactif avec cases à cocher, totaux dynamiques, et marques en portefeuille **grisées + cliquables pour vérification** (avec icône cadenas).
- **Mode de facturation** (radio buttons) sur tous les modals :
  - **1 facture groupée** (défaut) : toutes les marques cochées dans une seule facture.
  - **N factures séparées** : 1 facture par marque (numérotation indépendante).
- **Assistant 3 étapes** côté superadmin pour "Facturer un restaurant" : Restaurant + Période → Marques → Aperçu/Émission.
- **Vue facture (`factureViewerModal`)** : les lignes sont **regroupées visuellement par marque** avec sous-totaux et code couleur (bleu = marque, violet = MLM).
- **Colonne "À facturer" sur la liste admin des restaurants** : badge `À facturer` / `Brouillon` / `En cours` / `Facturée` selon état + montant HT calculé pour le mois en cours, plus un bouton raccourci "Facturer" qui pré-sélectionne le resto dans l'assistant.

#### Endpoints backend ajoutés/modifiés (`/api/factures/...`)
- `POST /agent/preview` & `/agent/create` : nouveaux paramètres `marques_ids[]`, `scope` (`standard` / `mlm` / `all`), `split_by_marque`.
- `POST /resto/preview` *(nouveau)* : aperçu DropEat→resto avec sélection de marques.
- `POST /resto/create` : nouveaux paramètres `marques_ids[]` + `split_by_marque`.
- `POST /agent-resto/preview` & `/agent-resto/create` : idem (mode portefeuille).
- `GET /resto/marques-facturables?restaurant_id=&...` *(nouveau)* — superadmin.
- `GET /agent/marques-facturables-self?...` *(nouveau)* — agent.
- `GET /agent-resto/marques-portefeuille?restaurant_id=&...` *(nouveau)* — agent.
- `GET /resto/a-facturer-ce-mois?annee=&mois=` *(nouveau)* — agrégat utilisé par la liste des restos.

#### Règles préservées
- **Numérotation réglementaire (art. 242 nonies A CGI)** : continue et sans trou, par scope et par émetteur.
- **Anti-doublons** : actif uniquement si aucun filtre marque/scope appliqué (sinon on autorise plusieurs factures sur la même période avec ciblages différents).
- **Mentions légales** France (art. 293 B CGI franchise base) / UK (Late Payment Act 1998) inchangées.

#### Migration 0018 — Source of truth Sabrina/Fabien/Elbac/Greg
Alignement BDD pour 4 commerciaux (Sabrina Hadri, Fabien Rosso, Elbac Haidar Mohamed, Gregory Hadri) : 7 restaurants, 7 marques, 8 comptes plateformes (manager + backup Uber). Commit `1bdfa90`.

#### Migration 0019 — Facture PDF + notifications email
**Nouveauté** : système complet de génération PDF + envoi automatique d'emails via Resend API.

- **Génération PDF** : `GET /api/factures/:id/pdf` renvoie un HTML standalone optimisé impression (CSS @page A4, prêt à imprimer / Ctrl+P → "Enregistrer en PDF"). Bouton "PDF (nouvel onglet)" dans la modale facture. Compatible Cloudflare Workers (aucune lib Node).
- **Envoi automatique d'emails** sur les transitions de statut :
  - `envoyée` → email "facture à valider" au destinataire
  - `validée` → email de confirmation à l'émetteur
  - `refusée` → email avec motif au destinataire (l'émetteur)
  - `payée` → email final avec référence de paiement
- **Envoi manuel** : `POST /api/factures/:id/email` (bouton "Envoyer par email" dans la modale) — utilise le template `rappel`.
- **Historique des envois** : `GET /api/factures/:id/envois` affiché en bas de la modale facture (date, événement, destinataire, statut envoyé/échec, émetteur).
- **Page admin "Notifications email"** (CONFIGURATION > Notifications email) : configuration provider, clé API Resend (chiffrée en base, jamais réexposée en clair), email expéditeur, switch envoi réel / mode log, bouton "Envoyer email de test".
- **Mode log** : par défaut, `email_enabled=0` → aucun email réellement envoyé, mais l'historique est tracé. À activer après configuration de la clé Resend en production.
- **Résolution email destinataire** : `facture.dest_email` (override manuel) → `dest_snapshot.email_facturation` → email du user destinataire. Si aucun trouvé : envoi silencieusement ignoré (pas d'erreur bloquante).
- **Tables ajoutées** : `app_settings` (key-value config), `facture_envois` (historique). Colonnes ajoutées : `factures.dest_email`, `factures.derniere_notif_at`, `factures.nb_envois_email`.
- **Fichiers ajoutés** : `src/lib/email-service.ts` (350 LOC, templates HTML par événement), `src/lib/facture-pdf.ts` (rendu HTML standalone), `src/routes/admin-settings.ts`.

#### Refactor UI — Fusion Utilisateurs + Agents
Page unique `gestion-utilisateurs` qui remplace `users` + `admin-agents-crud` (2 entrées de menu redondantes supprimées). Onglets internes Agents / Superadmins, filtres drill-down (recherche, niveau, statut), stats globales en en-tête. Commit `168482b`.

---

### 🏁 Module CHALLENGES commerciaux (migration 0012 + seed 0013)
- **Superadmin** : CRUD complet des challenges temporaires (`admin-challenges`)
  - Période, type d'objectif (`restaurants` / `marques` / `restaurants_ou_marques`)
  - Quantité objectif (ex : 30 restos)
  - Type de récompense (`portefeuille_restaurants`, `portefeuille_marques`, `bonus_montant`, `autre`)
  - Quantité/montant/description de la récompense
  - **Suspension règle 5/5** standard pendant la période (`suspend_tranche_standard`)
  - Cible : `tous` (auto-inscription) ou `selection` (manuelle)
  - Bouton **Synchroniser** = recalcule la progression de toutes les participations
  - Bouton **Récompenser** sur une participation `reussi` (attribue les portefeuilles)
- **Agent** : page `a-challenges` avec cartes de progression
  - Barre de progression, statut (en cours / réussi / échoué / récompense attribuée)
  - Bouton **Participer** (si cible='tous' et pas encore inscrit)
  - Bouton **Recalculer** (force la synchro de sa progression)
- **Tables** : `challenges` + `challenge_participations` + `challenge_elements`
- **Seed 0013** : challenge `CH-2026-SEB-30R` pour Sebastian Garcia
  - Période **1er mai → 30 juin 2026**, objectif **30 restos**, récompense **15 portefeuille 100%** au choix
  - `suspend_tranche_standard=1` → règle standard 5/5 suspendue pendant la période
  - **Sebastian** inscrit avec progression initiale **2/30** (Sultant Restaurant + CHEZLEBOSS)
- **API** :
  - Agent : `GET /api/challenges/mine`, `GET /mine/:id`, `POST /:id/participer`, `POST /:id/synchroniser`
  - Admin : `GET/POST/PUT/DELETE /api/challenges/admin[/:id]`, `POST /admin/:id/inscrire`, `DELETE /admin/:id/participations/:pid`, `POST /admin/synchroniser`, `POST /admin/participations/:pid/recompenser`

### 👥 Seed 7 commerciaux (migration 0013)
Tous N0 (parent_id=NULL), portefeuilles existants entrés **avant le challenge** :
- **Sebastian Garcia** (`sebastian.garcia@dropeat.fr` / `Sebastian2026!`) — 10 restos / 13 marques
  - Krock Takos = **5e marque portefeuille** (règle standard 5/5)
  - La Corniche = **portefeuille client** (BB GOOD BURGER TARASCON)
  - Sultant Restaurant (rang 9, 2026-05-01) = **point de bascule** challenge
- **Kamel** (`kamel@dropeat.fr` / `Kamel2026!`) — MEAL N. FOOD → BB GOOD BURGER Valence
- **Hamou** (`hamou@dropeat.fr` / `Hamou2026!`) — MALABAR FOODS (2 adresses Dijon) → BB GOOD BURGER DIJON
- **Sabrina** (`sabrina@dropeat.fr` / `Sabrina2026!`) — Brasserie Carré St Dominique → Burgerignos Nîmes ; ELSA DELICE → Kroc Burgers Nîmes
- **Greg** (`greg@dropeat.fr` / `Greg2026!`) — CAVERNE A PIZZA → Pizza Banger ; BENASTA → Maison Nassima
- **Fabien** (`fabien@dropeat.fr` / `Fabien2026!`) — Le Grill System → Gros Croc Marseille ; Istanbul Kebab → Kroc Takos Marseille
- **Elbak** (`elbak@dropeat.fr` / `Elbak2026!`) — LK → BB GOOD BURGER LAVAL

### 🌳 Dashboard agent — Arbre MLM 2 niveaux (N+1 + N+2)
- Visualisation de l'arbre MLM avec **noms des filleuls** (N+1) et **sous-filleuls** (N+2)
- Compteurs par nœud : nb filleuls, CA période, etc.
- Résout l'absence de visibilité du réseau (ex. Sébastien Garcia)
- Mini-graphique historique des commissions sur le dashboard

### 📊 Historique des commissions
- Page dédiée `a-historique-comm` avec toggle **Mensuel / Hebdomadaire**
- Stacked bar chart : commissions propres / portefeuille / override N+1 / override N+2
- Tableau détail des 12 dernières périodes

### 👨‍👦 Commissions sous-agents (visualisation commerciale)
- Page `a-sous-agents-comm` groupée par niveau (N+1 et N+2)
- Voir les commissions générées par chaque filleul direct et indirect

### 🏢 Profil société + Facturation automatique
- **Profil société** par utilisateur (FR auto-entrepreneur ou UK Ltd)
- Superadmin : profil **DROPEAT LTD** (UK) pré-rempli
- **Agent → DropEat** : preview + création + workflow (envoyer/valider/refuser/payer)
- **DropEat → Restaurant** : génération automatique par superadmin (période + restaurant)
- Snapshots émetteur/destinataire JSON, numérotation atomique
- Mentions légales **2026 conformes** : FR (art. 293B CGI, L441-10, Décret 2012-1115) + UK (Late Payment Act 1998)
- Lignes facture incluent **commissions propres + portefeuille + overrides N+1 et N+2**
- Modal facture **imprimable en PDF** (window.print) avec CSS @media print

### 🔧 Superadmin omnipotent CRUD agents
- Page `admin-agents-crud` : create/update/activer/désactiver/supprimer
- Parent dropdown **dynamique selon niveau** (anti-cycle)
- Refuse suppression si filleuls ou restaurants attachés (réassignation possible)
- Génération automatique mot de passe + code d'accès

### 🧹 Nettoyage
- Suppression du **champ code invitation** du modal "Créer un filleul"
- **IA Prospection** mise en stand-by (pages + bloc dashboard admin retirés)

### 📡 Nouveaux endpoints API
- `GET /api/agent/mlm-tree?annee=&mois=` — arbre MLM 2 niveaux
- `GET /api/agent/commissions/history?type=monthly|weekly` — historique
- `GET /api/agent/sous-agents/commissions` — commissions agrégées par filleul
- `/api/societes/me`, `/api/societes/user/:id`, `/api/societes/user/:id/valider`, `/api/societes/all`
- `/api/factures` (CRUD + workflow), `/api/factures/agent/preview`, `/api/factures/agent/create`, `/api/factures/resto/create`, `/api/factures/:id/envoyer|valider|refuser|payer`
- `/api/admin/agents-crud/*` (CRUD complet + `parents-possibles?level=` + `reassign-restos`)

### 🗄️ Nouvelles tables (migration 0008)
- `profils_societe` — informations société par utilisateur (FR/UK)
- `factures` — entête facture + snapshots + statut workflow (brouillon → envoyée → validée/refusée → payée)
- `facture_lignes` — détail (catégorie : comm_propre / comm_portefeuille / comm_n1 / comm_n2 / facturation_resto)
- `facture_compteurs` — numérotation atomique par préfixe

---

## ✅ Fonctionnalités implémentées

### 👥 Gestion des agents (MLM 3 niveaux)
- Création/modification/suppression d'agents
- Hiérarchie : **Agent → Sous-agent → Sous-sous-agent**
- Chaque agent peut avoir des sous-agents rattachés
- IBAN pour le paiement des commissions
- Statut actif/inactif

### 🏪 Gestion des restaurants & marques virtuelles
- Création de restaurants (snacks partenaires)
- Affectation à un agent (celui qui a ramené le restaurant)
- **Plusieurs marques virtuelles par restaurant** (Uber Store ID optionnel)
- Suivi de la date de signature

### 📥 Import CSV Uber Eats
- Upload par drag & drop
- **Détection automatique** des colonnes (FR + EN) :
  - Order ID, Order Date, Order Total, Uber Service Fee, Payout, Status
- **Mapping manuel** ajustable si besoin
- Détection des **doublons** (par Uber Order ID)
- Support des formats de date FR (dd/mm/yyyy) et internationaux
- Support des nombres FR (virgule) et EN (point)
- **Aperçu des 5 premières lignes** avant import
- Historique complet des imports (annulables)

### 💰 Système de commissions par paliers
- **Paliers entreprise** : % sur le CA net du restaurant (ex: 0-5k€ = 15%, 5-10k€ = 12%, etc.)
- **Paliers agent (N1)** : % sur la commission entreprise
- **Paliers sous-agent (N2)** : % sur la commission entreprise
- **Paliers sous-sous-agent (N3)** : % sur la commission entreprise
- Calcul **par tranches progressives** (style impôts)
- **Configuration libre** : ajout/modif/suppression des paliers via UI

### 📊 Calcul automatique des commissions
- Vue **par restaurant** : CA, commission entreprise, commissions par niveau
- Vue **par agent** : montant total à payer à chaque agent (toutes commissions cumulées)
- Détail par agent : commissions par restaurant
- Sélection mois/année

### 💸 Suivi des paiements
- Création automatique depuis la page Commissions
- Statuts : `en_attente` / `payé` / `annulé`
- Méthode (virement, espèces, chèque), référence, date
- Filtres par mois/année/agent
- Marquage en un clic comme payé

### 📈 Dashboard
- Stats globales (agents, restaurants, marques, commandes, CA)
- Top 5 restaurants par CA
- Top 5 agents par CA généré
- Évolution du CA sur 6 mois (graphique Chart.js)

---

## 🌐 URIs de l'application

### Pages frontend (SPA)
| Route | Description |
|-------|-------------|
| `/` | Application complète (navigation interne par sidebar) |

### API REST

#### Dashboard
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/dashboard` | Statistiques globales |

#### Agents
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/agents` | Liste tous les agents |
| GET | `/api/agents/tree` | Arbre hiérarchique |
| GET | `/api/agents/:id` | Détail d'un agent |
| POST | `/api/agents` | Créer un agent |
| PUT | `/api/agents/:id` | Modifier un agent |
| DELETE | `/api/agents/:id` | Supprimer un agent |

#### Restaurants & Marques
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/restaurants` | Liste des restaurants |
| GET | `/api/restaurants/:id` | Détail + marques |
| POST | `/api/restaurants` | Créer |
| PUT | `/api/restaurants/:id` | Modifier |
| DELETE | `/api/restaurants/:id` | Supprimer |
| GET | `/api/restaurants/marques/all` | Toutes les marques (avec resto + agent) |
| POST | `/api/restaurants/:id/marques` | Créer une marque virtuelle |
| PUT | `/api/restaurants/marques/:marque_id` | Modifier une marque |
| DELETE | `/api/restaurants/marques/:marque_id` | Supprimer |

#### Imports CSV
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/imports/preview` | Analyse un CSV (détection colonnes) |
| POST | `/api/imports` | Importe les commandes |
| GET | `/api/imports` | Historique des imports |
| DELETE | `/api/imports/:id` | Annuler un import (et ses commandes) |

#### Paliers de commission
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/paliers` | Tous les paliers (groupés par type) |
| POST | `/api/paliers` | Créer un palier |
| PUT | `/api/paliers/:id` | Modifier |
| DELETE | `/api/paliers/:id` | Supprimer |
| POST | `/api/paliers/replace/:type` | Remplacer tous les paliers d'un type |

#### Commissions
| Méthode | Route | Params | Description |
|---------|-------|--------|-------------|
| GET | `/api/commissions/recap` | `?annee=2026&mois=4` | Récap par restaurant |
| GET | `/api/commissions/agents` | `?annee=2026&mois=4` | Montants à payer par agent |
| GET | `/api/commissions/agent/:id` | `?annee=2026&mois=4` | Détail commissions agent |

#### Paiements
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/paiements` | Liste (filtres `?annee=&mois=&agent_id=`) |
| POST | `/api/paiements` | Créer/MAJ paiement (upsert) |
| PUT | `/api/paiements/:id` | Modifier |
| DELETE | `/api/paiements/:id` | Supprimer |
| POST | `/api/paiements/:id/pay` | Marquer comme payé |

---

## 🗄️ Architecture des données

### Tables D1 (SQLite)
- **agents** : hiérarchie MLM (niveau 1/2/3 + parent_id)
- **restaurants** : snacks partenaires (lié à un agent)
- **marques_virtuelles** : marques sur Uber Eats (liées à un restaurant)
- **paliers_commissions** : paliers configurables par type
- **commandes** : lignes Uber Eats importées (CSV)
- **imports_csv** : historique des imports
- **paiements** : suivi des paiements aux agents

### Logique de calcul
1. CA net mensuel par restaurant = somme des `montant_net` des commandes
2. **Commission entreprise** = paliers progressifs sur le CA net
3. **Commission agent / sous-agent / sous-sous-agent** = paliers progressifs sur la commission entreprise
4. Le total des commissions agents ne dépasse jamais la commission entreprise
5. La répartition agent/sous-agent/sous-sous-agent dépend du **niveau de l'agent qui a ramené le restaurant**

---

## 🚀 Utilisation

### Premier démarrage (workflow recommandé)

1. **Configurer les paliers** (page "Paliers")
   - Vérifier/ajuster les pourcentages par défaut selon vos vraies règles

2. **Créer les agents** (page "Agents")
   - D'abord les agents N1, puis les sous-agents (en sélectionnant leur parent), puis les sous-sous-agents

3. **Créer les restaurants** (page "Restaurants")
   - Pour chaque snack, créer le restaurant et l'assigner à un agent
   - Cliquer sur "Marques" pour ajouter les marques virtuelles (4, 5, 6...)

4. **Importer les CSV Uber Eats** (page "Import CSV")
   - Pour chaque marque virtuelle, importer le CSV exporté depuis Uber Eats
   - L'app détecte automatiquement les colonnes
   - Vérifier le mapping puis cliquer sur "Importer"

5. **Voir les commissions** (page "Commissions")
   - Sélectionner mois/année
   - Onglet "Par restaurant" : voir le détail
   - Onglet "Par agent" : voir le montant à payer à chaque agent
   - Cliquer "Créer paiement" pour générer les fiches de paiement

6. **Gérer les paiements** (page "Paiements")
   - Marquer comme payé une fois le virement effectué
   - Renseigner la référence et la date

---

## 🔧 Stack technique

- **Backend** : [Hono](https://hono.dev/) (TypeScript, edge-first)
- **Frontend** : Vanilla JS + Tailwind CSS (CDN) + Chart.js + Font Awesome
- **Base de données** : Cloudflare D1 (SQLite distribué)
- **Build** : Vite
- **Hébergement** : Cloudflare Pages

---

## 📦 Scripts utiles

```bash
# Build production
npm run build

# Lancer en dev local (sandbox)
pm2 start ecosystem.config.cjs

# Migration DB locale
npm run db:migrate:local

# Charger données initiales (paliers + agents exemples)
npm run db:seed

# Reset complet de la DB locale
npm run db:reset

# Console SQL locale
npm run db:console:local

# Déploiement Cloudflare Pages
npm run deploy:prod
```

---

## ⏭️ Améliorations possibles (non implémentées)

- 📤 **Export Excel/PDF** des fiches de commissions par agent
- 🔐 **Authentification** (multi-utilisateurs : admin / chaque agent voit ses commissions)
- 📊 **Rapports plus avancés** : comparaison périodes, projections
- 📧 **Envoi automatique** des fiches de paie par email
- 🎯 **Objectifs / bonus** par agent
- 📅 **Calcul cumulatif annuel** (en plus du mensuel)
- 🏆 **Classement / leaderboard** des agents
- 📱 **App mobile** (PWA)
- 🌐 **Multi-devise**
- 🔄 **Synchronisation automatique** avec l'API Uber Eats (si disponible un jour)

---

## 📊 Statut du déploiement

- **Plateforme** : Cloudflare Pages
- **Statut local** : ✅ Fonctionnel
- **Statut production** : Non déployé (en attente de configuration)
- **Dernière mise à jour** : Avril 2026

---

## 📝 Données d'exemple incluses

Au démarrage avec `npm run db:seed`, l'application contient :
- **Paliers par défaut** (à ajuster selon vos règles) :
  - Entreprise : 15% (0-5k), 12% (5-10k), 10% (10-20k), 8% (20k+)
  - Agent N1 : 20% (0-5k), 25% (5-10k), 30% (10k+)
  - Sous-agent N2 : 10/12/15%
  - Sous-sous-agent N3 : 5/7/10%
- **4 agents exemples** : Jean Dupont (N1), Sophie Martin (N1), Karim Bernard (N2 sous Jean), Lina Petit (N3 sous Karim)
