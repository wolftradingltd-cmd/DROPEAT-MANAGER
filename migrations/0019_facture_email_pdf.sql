-- ============================================================
-- Migration 0019 : Facture PDF + Email notifications
-- ============================================================
-- Ajoute :
--   1) Colonnes email sur factures (destinataire email, dernière notification)
--   2) Table facture_envois (historique des envois email)
--   3) Paramètres applicatifs (clé/valeur) pour configurer Resend API
-- ============================================================

-- 1) Colonnes additionnelles sur factures
ALTER TABLE factures ADD COLUMN dest_email TEXT;
ALTER TABLE factures ADD COLUMN derniere_notif_at DATETIME;
ALTER TABLE factures ADD COLUMN nb_envois_email INTEGER NOT NULL DEFAULT 0;

-- 2) Historique d'envoi des emails liés à une facture
CREATE TABLE IF NOT EXISTS facture_envois (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  evenement TEXT NOT NULL,
    -- 'creee' | 'envoyee' | 'validee' | 'refusee' | 'payee' | 'rappel' | 'manuel'
  destinataire_email TEXT NOT NULL,
  destinataire_nom TEXT,
  sujet TEXT,
  statut TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sent' | 'failed'
  message_id TEXT,                       -- ID retourné par le provider (Resend)
  error_message TEXT,                    -- erreur si échec
  envoye_par INTEGER REFERENCES users(id),
  envoye_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_facture_envois_facture ON facture_envois(facture_id);
CREATE INDEX IF NOT EXISTS idx_facture_envois_evt ON facture_envois(evenement);

-- 3) Table de paramètres applicatifs key-value
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

-- Paramètres email par défaut
INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
  ('email_provider', 'resend', 'Provider email (resend | smtp)'),
  ('email_api_key', '', 'Clé API Resend (à configurer en production via secret)'),
  ('email_from_address', 'no-reply@dropeat.com', 'Adresse expéditeur des emails de notification'),
  ('email_from_name', 'DropEat™', 'Nom expéditeur des emails'),
  ('email_reply_to', '', 'Adresse de réponse (optionnel)'),
  ('email_enabled', '0', '1 pour activer l''envoi réel, 0 pour désactiver (mode log)'),
  ('app_base_url', 'https://webapp.pages.dev', 'URL publique de l''application (utilisée dans les emails)');

-- Migration log
INSERT INTO _migration_log (migration) VALUES ('0019_facture_email_pdf');
