// Types globaux de l'application

export type Bindings = {
  DB: D1Database
}

export interface Agent {
  id: number
  nom: string
  prenom: string
  email?: string
  telephone?: string
  niveau: 1 | 2 | 3
  parent_id?: number | null
  iban?: string
  actif: number
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface Restaurant {
  id: number
  nom: string
  adresse?: string
  ville?: string
  telephone?: string
  email?: string
  agent_id?: number | null
  date_signature?: string
  actif: number
  notes?: string
}

export interface MarqueVirtuelle {
  id: number
  restaurant_id: number
  nom: string
  uber_store_id?: string
  date_lancement?: string
  actif: number
  notes?: string
}

export interface Palier {
  id: number
  type: 'entreprise' | 'agent' | 'sous_agent' | 'sous_sous_agent'
  base: 'ca' | 'commandes'
  mode: 'mensuel' | 'cumulatif'
  seuil_min: number
  seuil_max: number | null
  taux: number
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
