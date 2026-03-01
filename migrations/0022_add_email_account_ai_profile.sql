-- Bind AI profile to email account
-- Date: 2026-02-09

ALTER TABLE email_accounts ADD COLUMN ai_profile_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_accounts_ai_profile_id ON email_accounts(ai_profile_id);
