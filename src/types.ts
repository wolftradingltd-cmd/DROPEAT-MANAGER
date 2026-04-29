// Types globaux DropEat™

export type Bindings = {
  DB: D1Database
}

export interface User {
  id: number
  email: string
  password_hash?: string
  role: 'superadmin' | 'agent'
  nom: string
  prenom: string
  telephone?: string
  niveau: number | null // 0=Agent, 1=Sous-agent N1, 2=Sous-agent N2
  parent_id: number | null
  iban?: string
  actif: number
  notes?: string
  derniere_connexion?: string
}

export interface Restaurant {
  id: number
  nom: string
  raison_sociale?: string
  siret?: string
  adresse?: string
  code_postal?: string
  ville?: string
  pays?: string
  telephone?: string
  email?: string
  contact_nom?: string
  agent_id: number | null
  rang_apport: number | null
  is_portefeuille_proprietaire: number
  tablette_sr_shop: number
  date_signature?: string
  date_lancement?: string
  actif: number
  notes?: string
}

export interface MarqueVirtuelle {
  id: number
  restaurant_id: number
  nom: string
  uber_store_id?: string
  plateforme: string
  rang_creation: number | null
  is_portefeuille_proprietaire: number
  date_lancement?: string
  actif: number
  notes?: string
}

export interface Palier {
  id: number
  type: string
  seuil_min: number
  seuil_max: number | null
  montant_par_commande: number
  ordre: number
  actif: number
}

export interface Commande {
  id: number
  marque_id: number
  uber_order_id?: string
  date_commande: string
  montant_brut: number
  frais_uber: number
  montant_net: number
  statut: string
  paye_integralement: number
}

export interface Paiement {
  id: number
  agent_id: number
  periode_mois: number
  periode_annee: number
  montant: number
  statut: 'en_attente' | 'paye' | 'annule'
  date_paiement?: string
  methode?: string
  reference?: string
  notes?: string
}
