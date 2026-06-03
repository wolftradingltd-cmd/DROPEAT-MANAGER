-- Schema dump (post 0020+0021)
CREATE TABLE IF NOT EXISTS _migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  ip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, visible_agent INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS challenge_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participation_id INTEGER NOT NULL REFERENCES challenge_participations(id) ON DELETE CASCADE,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_element TEXT NOT NULL CHECK(type_element IN ('restaurant', 'marque')),
  element_id INTEGER NOT NULL,            
  date_apport DATETIME NOT NULL,          
  choisi_pour_recompense INTEGER DEFAULT 0, 
  notes TEXT,
  UNIQUE(challenge_id, agent_id, type_element, element_id)
);
CREATE TABLE IF NOT EXISTS challenge_participations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK(statut IN ('en_cours', 'reussi', 'echoue', 'recompense_attribuee', 'annule')),
  progression_actuelle INTEGER NOT NULL DEFAULT 0,  
  date_reussite DATETIME,                 
  
  recompense_attribuee_at DATETIME,
  recompense_attribuee_par INTEGER REFERENCES users(id),
  recompense_notes TEXT,                  
  
  date_participation DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes_agent TEXT,
  notes_admin TEXT,
  UNIQUE(challenge_id, agent_id)
);
CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                
  nom TEXT NOT NULL,                        
  description TEXT,                         
  
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  
  type_objectif TEXT NOT NULL CHECK(type_objectif IN ('restaurants', 'marques', 'restaurants_ou_marques')),
  objectif_quantite INTEGER NOT NULL,       
  
  type_recompense TEXT NOT NULL CHECK(type_recompense IN ('portefeuille_restaurants', 'portefeuille_marques', 'bonus_montant', 'autre')),
  recompense_quantite INTEGER,              
  recompense_montant REAL,                  
  recompense_description TEXT,              
  
  suspend_tranche_standard INTEGER DEFAULT 0, 
  cible TEXT NOT NULL DEFAULT 'tous' CHECK(cible IN ('tous', 'selection')),
    
    
  
  actif INTEGER NOT NULL DEFAULT 1,         
  notes_internes TEXT,                      
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  
  
  
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  obligatoire INTEGER DEFAULT 1,
  statut TEXT DEFAULT 'non_renseigne', 
  ressource_type TEXT, 
  ressource_id INTEGER, 
  validateur_id INTEGER REFERENCES users(id),
  date_validation DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(restaurant_id, code)
);
CREATE TABLE IF NOT EXISTS codes_acces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cree_par_id INTEGER REFERENCES users(id),
  password_temporaire TEXT NOT NULL, 
  affiche INTEGER DEFAULT 0, 
  utilise INTEGER DEFAULT 0, 
  expire_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS commandes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  uber_order_id TEXT,
  date_commande DATETIME NOT NULL,
  montant_brut REAL NOT NULL DEFAULT 0,
  frais_uber REAL NOT NULL DEFAULT 0,
  montant_net REAL NOT NULL DEFAULT 0,
  statut TEXT DEFAULT 'completee', 
  paye_integralement INTEGER DEFAULT 1, 
  raw_data TEXT,
  import_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, uber_uuid TEXT, type_honoree TEXT, commission_agent_montant REAL DEFAULT 0, commission_n1_montant REAL DEFAULT 0, commission_n2_montant REAL DEFAULT 0, commission_calculee_at DATETIME, commission_taux_propre REAL DEFAULT 0, palier_applique_id INTEGER REFERENCES paliers_commissions(id), montant_facture_resto REAL DEFAULT 0, commission_portefeuille_montant REAL DEFAULT 0, marge_dropeat_montant REAL DEFAULT 0, palier_facture_id INTEGER, palier_agent_id INTEGER, is_portefeuille_snapshot INTEGER DEFAULT 0, is_tablette_snapshot INTEGER DEFAULT 0, derogation_id INTEGER REFERENCES derogations_100pct(id), is_derogation_snapshot INTEGER DEFAULT 0, validation_statut TEXT
  NOT NULL DEFAULT 'valide'
  CHECK (validation_statut IN ('en_attente_validation','valide','rejete')),
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS commissions_calculees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  periode_annee INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  commission_propre REAL DEFAULT 0,     
  commission_portefeuille REAL DEFAULT 0,
  commission_n1 REAL DEFAULT 0,         
  commission_n2 REAL DEFAULT 0,         
  total REAL DEFAULT 0,
  nb_commandes_propres INTEGER DEFAULT 0,
  ca_propre REAL DEFAULT 0,
  ca_filleuls REAL DEFAULT 0,           
  ca_sous_filleuls REAL DEFAULT 0,
  detail_json TEXT,                      
  calcule_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'auto_import', override_par INTEGER REFERENCES users(id), override_motif TEXT, override_at DATETIME, demande_paiement_id INTEGER REFERENCES demandes_paiement(id), statut_paiement TEXT DEFAULT 'disponible',    
  UNIQUE (agent_id, periode_annee, periode_mois),
  FOREIGN KEY (agent_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS comptes_plateformes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  
  
  plateforme TEXT NOT NULL,
  type_acces TEXT NOT NULL DEFAULT 'manager',
  
  
  libelle TEXT, 
  email_connexion TEXT,
  password_chiffre TEXT, 
  url_acces TEXT, 
  url_courte_id INTEGER, 
  store_id_externe TEXT, 
  marque_id INTEGER REFERENCES marques_virtuelles(id) ON DELETE SET NULL, 
  notes TEXT,
  actif INTEGER DEFAULT 1,
  proprietaire_acces TEXT DEFAULT 'restaurant', 
  created_par_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, mfa_totp_secret TEXT);
CREATE TABLE IF NOT EXISTS config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS connexions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  succes INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS demande_paiement_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demande_id INTEGER NOT NULL REFERENCES demandes_paiement(id) ON DELETE CASCADE,
  commission_id INTEGER NOT NULL REFERENCES commissions_calculees(id) ON DELETE CASCADE,
  montant_inclus REAL NOT NULL DEFAULT 0,  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(demande_id, commission_id)
);
CREATE TABLE IF NOT EXISTS demandes_attribution_marque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tranche_id INTEGER NOT NULL REFERENCES tranches_attribution(id) ON DELETE CASCADE,
  marque_choisie_id INTEGER NOT NULL REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  motif TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente', 
  validateur_id INTEGER REFERENCES users(id),
  date_decision DATETIME,
  notes_validateur TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS demandes_paiement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  
  montant_demande REAL NOT NULL,           
  montant_propre REAL NOT NULL DEFAULT 0,  
  montant_portefeuille REAL NOT NULL DEFAULT 0, 
  montant_n1 REAL NOT NULL DEFAULT 0,      
  montant_n2 REAL NOT NULL DEFAULT 0,      

  
  
  detail_json TEXT,

  
  statut TEXT NOT NULL DEFAULT 'en_attente',
    
    
    
    
    
  motif_rejet TEXT,
  notes_agent TEXT,                        
  notes_admin TEXT,                        

  
  date_demande DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_traitement DATETIME,                
  date_paiement DATETIME,                  
  superadmin_id INTEGER REFERENCES users(id),
  paiement_id INTEGER REFERENCES paiements(id), 

  
  methode_paiement TEXT,                   
  reference_paiement TEXT,                 

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS derogations_100pct (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  
  marque_id INTEGER,
  restaurant_id INTEGER,

  
  
  
  agent_id INTEGER NOT NULL,

  
  date_debut TEXT NOT NULL,         
  date_fin TEXT,                    

  
  motif TEXT NOT NULL,              
  cree_par_admin_id INTEGER NOT NULL,
  cree_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  
  cloturee_par_admin_id INTEGER,
  cloturee_at DATETIME,
  motif_cloture TEXT,

  
  
  statut TEXT NOT NULL DEFAULT 'active',

  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (cree_par_admin_id) REFERENCES users(id),
  FOREIGN KEY (cloturee_par_admin_id) REFERENCES users(id),

  
  CHECK (
    (marque_id IS NOT NULL AND restaurant_id IS NULL) OR
    (marque_id IS NULL AND restaurant_id IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS facture_compteurs (
  prefixe TEXT NOT NULL,                 
  dernier_numero INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefixe)
);
CREATE TABLE IF NOT EXISTS facture_envois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  evenement TEXT NOT NULL,
    
  destinataire_email TEXT NOT NULL,
  destinataire_nom TEXT,
  sujet TEXT,
  statut TEXT NOT NULL DEFAULT 'pending',
    
  message_id TEXT,                       
  error_message TEXT,                    
  envoye_par INTEGER REFERENCES users(id),
  envoye_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS facture_lignes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL DEFAULT 0,
  libelle TEXT NOT NULL,                 
  description TEXT,                      
  categorie TEXT,                        
  
  marque_id INTEGER REFERENCES marques_virtuelles(id),
  restaurant_id INTEGER REFERENCES restaurants(id),
  agent_concerne_id INTEGER REFERENCES users(id), 
  quantite REAL DEFAULT 1,               
  prix_unitaire REAL NOT NULL DEFAULT 0,
  montant_ht REAL NOT NULL DEFAULT 0,
  taux_tva REAL DEFAULT 0,
  montant_tva REAL DEFAULT 0,
  montant_ttc REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS factures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE NOT NULL,           
  type TEXT NOT NULL,                    
  
  emetteur_user_id INTEGER NOT NULL REFERENCES users(id),
  emetteur_snapshot TEXT NOT NULL,       
  
  dest_user_id INTEGER REFERENCES users(id),       
  dest_restaurant_id INTEGER REFERENCES restaurants(id), 
  dest_snapshot TEXT NOT NULL,           
  
  periode_annee INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  date_emission DATE NOT NULL,
  date_echeance DATE NOT NULL,           
  montant_ht REAL NOT NULL DEFAULT 0,
  montant_tva REAL NOT NULL DEFAULT 0,
  taux_tva REAL NOT NULL DEFAULT 0,
  montant_ttc REAL NOT NULL DEFAULT 0,
  devise TEXT NOT NULL DEFAULT 'EUR',    
  
  statut TEXT NOT NULL DEFAULT 'brouillon',
    
    
    
    
    
    
  motif_refus TEXT,
  envoyee_at DATETIME,
  validee_at DATETIME,
  validee_par INTEGER REFERENCES users(id),
  payee_at DATETIME,
  reference_paiement TEXT,               
  
  pdf_url TEXT,                          
  pdf_genere_at DATETIME,
  
  mentions_legales TEXT,                 
  notes_internes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, dest_email TEXT, derniere_notif_at DATETIME, nb_envois_email INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS imports_csv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL,
  uploader_user_id INTEGER, 
  nom_fichier TEXT,
  periode_debut DATE,
  periode_fin DATE,
  nb_lignes INTEGER DEFAULT 0,
  nb_lignes_importees INTEGER DEFAULT 0,
  nb_doublons INTEGER DEFAULT 0,
  montant_total REAL DEFAULT 0,
  statut TEXT DEFAULT 'complete',
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, validation_statut TEXT
  NOT NULL DEFAULT 'valide'
  CHECK (validation_statut IN ('en_attente_validation','valide','rejete')), validation_par INTEGER REFERENCES users(id) ON DELETE SET NULL, validation_at DATETIME, validation_notes TEXT, pour_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL, source_upload TEXT NOT NULL DEFAULT 'admin'
  CHECK (source_upload IN ('agent','admin','admin_pour_agent')),
  FOREIGN KEY (marque_id) REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS invitations_agent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,            
  parent_id INTEGER NOT NULL,           
  niveau_cible INTEGER NOT NULL,        
  email_pre_rempli TEXT,                
  utilisee INTEGER DEFAULT 0,
  user_cree_id INTEGER,                 
  expire_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  FOREIGN KEY (parent_id) REFERENCES users(id),
  FOREIGN KEY (user_cree_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS marque_plateformes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marque_id INTEGER NOT NULL REFERENCES marques_virtuelles(id) ON DELETE CASCADE,
  plateforme TEXT NOT NULL, 
  url_publique TEXT, 
  url_courte_id INTEGER REFERENCES url_courtes(id),
  store_id_externe TEXT, 
  actif INTEGER DEFAULT 1,
  date_lancement DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(marque_id, plateforme)
);
CREATE TABLE IF NOT EXISTS marques_virtuelles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  nom TEXT NOT NULL,
  uber_store_id TEXT, 
  plateforme TEXT DEFAULT 'uber_eats', 
  rang_creation INTEGER, 
  is_portefeuille_proprietaire INTEGER DEFAULT 0, 
  date_lancement DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, heritee_de_resto_id INTEGER REFERENCES restaurants(id), exclue_tranche INTEGER DEFAULT 0, date_signature_portefeuille DATE, uber_manager_email TEXT, uber_manager_password TEXT, uber_manager_url TEXT, uber_orders_email TEXT, uber_orders_password TEXT, uber_orders_url TEXT, tablette_fournie INTEGER DEFAULT 0, tablette_serial TEXT, tablette_notes TEXT, commission_info TEXT, acces_operationnels TEXT, statut_marque TEXT DEFAULT 'en_creation', heritee_portefeuille INTEGER DEFAULT 0, exclue_mlm INTEGER DEFAULT 0, tranche_source_id INTEGER REFERENCES tranches_attribution(id), date_heritage DATETIME,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinataire_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, 
  titre TEXT NOT NULL,
  message TEXT,
  lien TEXT, 
  lu INTEGER DEFAULT 0,
  metadata TEXT, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  periode_mois INTEGER NOT NULL,
  periode_annee INTEGER NOT NULL,
  montant REAL NOT NULL,
  statut TEXT DEFAULT 'en_attente',
  date_paiement DATE,
  methode TEXT,
  reference TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS paliers_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  seuil_min REAL NOT NULL DEFAULT 0,
  seuil_max REAL, 
  montant_par_commande REAL NOT NULL, 
  ordre INTEGER NOT NULL DEFAULT 0,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profils_societe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_societe TEXT NOT NULL DEFAULT 'auto_entrepreneur',
    
  raison_sociale TEXT NOT NULL,
  nom_commercial TEXT,
  forme_juridique TEXT,                  
  capital REAL,                          
  siret TEXT,                            
  siren TEXT,                            
  numero_tva TEXT,                       
  rcs TEXT,                              
  ape_naf TEXT,                          
  company_number TEXT,                   
  vat_uk TEXT,                           
  adresse_rue TEXT,
  adresse_complement TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'France',            
  telephone TEXT,
  email_facturation TEXT,
  iban TEXT,
  bic TEXT,
  banque_nom TEXT,
  
  regime_tva TEXT DEFAULT 'franchise_base',
    
    
    
    
    
  taux_tva REAL DEFAULT 0,               
  signature_url TEXT,                    
  logo_url TEXT,
  mentions_legales_extra TEXT,           
  date_creation_entreprise DATE,
  numero_assurance_pro TEXT,
  validated_at DATETIME,                 
  validated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prospect_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prospect_id INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type_action TEXT NOT NULL, 
  description TEXT,
  ancien_statut TEXT,
  nouveau_statut TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom_etablissement TEXT NOT NULL,
  contact_nom TEXT,
  contact_prenom TEXT,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  type_cuisine TEXT, 
  source TEXT, 
  statut TEXT NOT NULL DEFAULT 'a_contacter',
  
  score INTEGER DEFAULT 50, 
  agent_assigne_id INTEGER REFERENCES users(id),
  cree_par_id INTEGER REFERENCES users(id),
  prochaine_relance DATE,
  derniere_action_at DATETIME,
  notes TEXT,
  
  restaurant_cree_id INTEGER REFERENCES restaurants(id),
  date_conversion DATETIME,
  
  archive INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS restaurant_checklist (
  restaurant_id INTEGER NOT NULL,
  type_document TEXT NOT NULL,
  requis INTEGER DEFAULT 1,             
  fourni INTEGER DEFAULT 0,
  document_id INTEGER,                   
  date_demande DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_fourniture DATETIME,
  notes TEXT,
  PRIMARY KEY (restaurant_id, type_document),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES restaurant_documents(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS restaurant_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  type_document TEXT NOT NULL,          
  nom_fichier TEXT NOT NULL,
  taille_octets INTEGER,
  mime_type TEXT,
  contenu_base64 TEXT,                   
  url_externe TEXT,                      
  date_emission DATE,                    
  date_expiration DATE,                  
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente', 'valide', 'rejete', 'expire')),
  uploaded_by INTEGER,                   
  validated_by INTEGER,                  
  date_validation DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  FOREIGN KEY (validated_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  raison_sociale TEXT,
  siret TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT DEFAULT 'France',
  telephone TEXT,
  email TEXT,
  contact_nom TEXT,
  agent_id INTEGER, 
  rang_apport INTEGER, 
  is_portefeuille_proprietaire INTEGER DEFAULT 0, 
  tablette_sr_shop INTEGER DEFAULT 0, 
  date_signature DATE,
  date_lancement DATE,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, compte_active INTEGER DEFAULT 0, date_activation DATETIME, active_par_id INTEGER REFERENCES users(id), menu_url TEXT, date_signature_portefeuille DATE, gerant_nom TEXT, gerant_prenom TEXT, gerant_telephone TEXT, gerant_email TEXT, rib_titulaire TEXT, rib_iban TEXT, rib_bic TEXT, rib_banque_nom TEXT, rib_references TEXT, statut_portefeuille_client INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, 
  user_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "tranche_elements" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tranche_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque')),  
  element_id INTEGER NOT NULL,
  position_dans_tranche INTEGER NOT NULL,
  date_qualification DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_attribution INTEGER DEFAULT 0,
  notes TEXT,
  is_challenge INTEGER NOT NULL DEFAULT 0,
  hooked_resto_id INTEGER,   
  FOREIGN KEY (tranche_id) REFERENCES tranches_attribution(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  UNIQUE(agent_id, type, element_id)
);
CREATE TABLE IF NOT EXISTS "tranches_attribution" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('client', 'marque', 'unifiee')),
  numero_tranche INTEGER NOT NULL,
  date_ouverture DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_cloture DATETIME,
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK(statut IN ('ouverte', 'cloturee')),
  element_attribue_id INTEGER,
  element_attribue_kind TEXT CHECK(element_attribue_kind IN ('client','marque') OR element_attribue_kind IS NULL),
  validation_ecrite INTEGER DEFAULT 0,
  date_validation DATETIME,
  validateur_user_id INTEGER,
  notes TEXT,
  FOREIGN KEY (agent_id) REFERENCES users(id),
  FOREIGN KEY (validateur_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS tranches_recalcul_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  before_snapshot TEXT,
  after_snapshot TEXT,
  executed_by INTEGER,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS url_courtes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL, 
  url_originale TEXT NOT NULL,
  libelle TEXT, 
  cree_par_id INTEGER REFERENCES users(id),
  restaurant_id INTEGER REFERENCES restaurants(id) ON DELETE SET NULL,
  marque_id INTEGER REFERENCES marques_virtuelles(id) ON DELETE SET NULL,
  nb_clics INTEGER DEFAULT 0,
  derniere_visite DATETIME,
  expire_at DATETIME,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent', 
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  niveau INTEGER, 
  parent_id INTEGER, 
  iban TEXT,
  actif INTEGER DEFAULT 1,
  notes TEXT,
  derniere_connexion DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, parent_visible_par_enfant INTEGER DEFAULT 1, masque_par_admin INTEGER DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_prospect ON prospect_actions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_chal_el_agent ON challenge_elements(agent_id);
CREATE INDEX IF NOT EXISTS idx_chal_el_participation ON challenge_elements(participation_id);
CREATE INDEX IF NOT EXISTS idx_chal_part_agent ON challenge_participations(agent_id);
CREATE INDEX IF NOT EXISTS idx_chal_part_challenge ON challenge_participations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_chal_part_statut ON challenge_participations(statut);
CREATE INDEX IF NOT EXISTS idx_challenges_actif ON challenges(actif);
CREATE INDEX IF NOT EXISTS idx_challenges_periode ON challenges(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_checklist_resto ON checklist_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cmd_derogation ON commandes(derogation_id);
CREATE INDEX IF NOT EXISTS idx_codes_user ON codes_acces(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_calc_agent ON commissions_calculees(agent_id);
CREATE INDEX IF NOT EXISTS idx_comm_calc_periode ON commissions_calculees(periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_commandes_date ON commandes(date_commande);
CREATE INDEX IF NOT EXISTS idx_commandes_import ON commandes(import_id);
CREATE INDEX IF NOT EXISTS idx_commandes_marque ON commandes(marque_id);
CREATE INDEX IF NOT EXISTS idx_commandes_marque_date ON commandes(marque_id, date_commande);
CREATE INDEX IF NOT EXISTS idx_commandes_palier ON commandes(palier_applique_id);
CREATE INDEX IF NOT EXISTS idx_commandes_palier_agent   ON commandes(palier_agent_id);
CREATE INDEX IF NOT EXISTS idx_commandes_palier_facture ON commandes(palier_facture_id);
CREATE INDEX IF NOT EXISTS idx_commandes_uber_id ON commandes(uber_order_id);
CREATE INDEX IF NOT EXISTS idx_commandes_uuid ON commandes(uber_uuid);
CREATE INDEX IF NOT EXISTS idx_commandes_validation_statut ON commandes(validation_statut);
CREATE INDEX IF NOT EXISTS idx_commissions_demande ON commissions_calculees(demande_paiement_id);
CREATE INDEX IF NOT EXISTS idx_commissions_statut_paiement ON commissions_calculees(statut_paiement);
CREATE INDEX IF NOT EXISTS idx_comptes_marque ON comptes_plateformes(marque_id);
CREATE INDEX IF NOT EXISTS idx_comptes_plateforme ON comptes_plateformes(plateforme);
CREATE INDEX IF NOT EXISTS idx_comptes_resto ON comptes_plateformes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_connexions_user ON connexions_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demandes_agent ON demandes_attribution_marque(agent_id);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_agent ON demandes_paiement(agent_id);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_date ON demandes_paiement(date_demande);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_statut ON demandes_paiement(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes_attribution_marque(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_tranche ON demandes_attribution_marque(tranche_id);
CREATE INDEX IF NOT EXISTS idx_derog_agent ON derogations_100pct(agent_id, statut);
CREATE INDEX IF NOT EXISTS idx_derog_dates ON derogations_100pct(date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_derog_marque ON derogations_100pct(marque_id, statut);
CREATE INDEX IF NOT EXISTS idx_derog_resto ON derogations_100pct(restaurant_id, statut);
CREATE INDEX IF NOT EXISTS idx_doc_restaurant ON restaurant_documents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_doc_statut ON restaurant_documents(statut);
CREATE INDEX IF NOT EXISTS idx_doc_type ON restaurant_documents(type_document);
CREATE INDEX IF NOT EXISTS idx_dpc_commission ON demande_paiement_commissions(commission_id);
CREATE INDEX IF NOT EXISTS idx_dpc_demande ON demande_paiement_commissions(demande_id);
CREATE INDEX IF NOT EXISTS idx_facture_envois_evt ON facture_envois(evenement);
CREATE INDEX IF NOT EXISTS idx_facture_envois_facture ON facture_envois(facture_id);
CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id);
CREATE INDEX IF NOT EXISTS idx_factures_dest_resto ON factures(dest_restaurant_id);
CREATE INDEX IF NOT EXISTS idx_factures_dest_user ON factures(dest_user_id);
CREATE INDEX IF NOT EXISTS idx_factures_emetteur  ON factures(emetteur_user_id);
CREATE INDEX IF NOT EXISTS idx_factures_periode   ON factures(periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_factures_statut    ON factures(statut);
CREATE INDEX IF NOT EXISTS idx_factures_type      ON factures(type);
CREATE INDEX IF NOT EXISTS idx_imports_pour_agent ON imports_csv(pour_agent_id);
CREATE INDEX IF NOT EXISTS idx_imports_validation_statut ON imports_csv(validation_statut);
CREATE INDEX IF NOT EXISTS idx_inv_code ON invitations_agent(code);
CREATE INDEX IF NOT EXISTS idx_inv_parent ON invitations_agent(parent_id);
CREATE INDEX IF NOT EXISTS idx_marques_date_sign_porte ON marques_virtuelles(date_signature_portefeuille);
CREATE INDEX IF NOT EXISTS idx_marques_portefeuille ON marques_virtuelles(is_portefeuille_proprietaire);
CREATE INDEX IF NOT EXISTS idx_marques_restaurant ON marques_virtuelles(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_mqplat_marque ON marque_plateformes(marque_id);
CREATE INDEX IF NOT EXISTS idx_mqplat_plateforme ON marque_plateformes(plateforme);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(destinataire_id, lu);
CREATE INDEX IF NOT EXISTS idx_notifications_destinataire_lu ON notifications(destinataire_id, lu);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_paiements_agent ON paiements(agent_id);
CREATE INDEX IF NOT EXISTS idx_paiements_periode ON paiements(periode_annee, periode_mois);
CREATE INDEX IF NOT EXISTS idx_paliers_type ON paliers_commissions(type);
CREATE INDEX IF NOT EXISTS idx_profils_societe_user ON profils_societe(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_agent ON prospects(agent_assigne_id);
CREATE INDEX IF NOT EXISTS idx_prospects_relance ON prospects(prochaine_relance);
CREATE INDEX IF NOT EXISTS idx_prospects_statut ON prospects(statut);
CREATE INDEX IF NOT EXISTS idx_recalcul_agent ON tranches_recalcul_log(agent_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_restaurants_agent ON restaurants(agent_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_portefeuille ON restaurants(is_portefeuille_proprietaire);
CREATE INDEX IF NOT EXISTS idx_restaurants_portefeuille_client
  ON restaurants(statut_portefeuille_client);
CREATE INDEX IF NOT EXISTS idx_restos_date_sign_porte ON restaurants(date_signature_portefeuille);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_agent_date ON tranche_elements(agent_id, date_qualification);
CREATE INDEX IF NOT EXISTS idx_tranche_elements_tranche ON tranche_elements(tranche_id);
CREATE INDEX IF NOT EXISTS idx_tranches_attribution_agent_statut ON tranches_attribution(agent_id, statut);
CREATE INDEX IF NOT EXISTS idx_url_code ON url_courtes(code);
CREATE INDEX IF NOT EXISTS idx_url_resto ON url_courtes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
