-- Add auto_push column to email_accounts
-- Date: 2026-02-05

-- Add auto_push toggle: 1 = auto push new emails, 0 = manual push only
ALTER TABLE email_accounts ADD COLUMN auto_push INTEGER DEFAULT 1;
