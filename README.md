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
