-- Add fetched_emails table and auto_push setting
-- Date: 2026-02-05

-- Table to store fetched email content locally
CREATE TABLE IF NOT EXISTS fetched_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,               -- Foreign key to email_accounts.id
  uid INTEGER NOT NULL,                   -- IMAP UID
  from_address TEXT NOT NULL,
  subject TEXT,
  content TEXT,                           -- Full email content (or preview/text body)
  received_at INTEGER,                    -- Email Date
  fetched_at INTEGER,                     -- Local fetch time
  is_pushed INTEGER DEFAULT 0,            -- 0=No, 1=Yes
  push_status TEXT DEFAULT 'pending',     -- pending, success, failed, skipped
  push_log TEXT,                          -- Error message or response
  
  -- Prevent duplicate saving of same email for same account
  UNIQUE(account_id, uid)
);

-- Add index for querying emails by account
CREATE INDEX IF NOT EXISTS idx_fetched_emails_account ON fetched_emails(account_id);
CREATE INDEX IF NOT EXISTS idx_fetched_emails_date ON fetched_emails(received_at DESC);

-- Add auto_push column to email_accounts if it doesn't exist
-- SQLite ALTER TABLE does not support IF NOT EXISTS for columns easily in one line, 
-- but we can try generic ADD COLUMN. If it fails (already exists), it might error 
-- depending on driver, but usually safe in migration scripts if managed sequentially.
-- However, since this is a new migration file, we assume it's running in order.
ALTER TABLE email_accounts ADD COLUMN auto_push INTEGER DEFAULT 1; 
