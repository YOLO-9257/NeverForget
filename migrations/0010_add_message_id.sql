-- Add message_id to fetched_emails and unique constraint
-- Date: 2026-02-05

-- SQLite doesn't support adding UNIQUE constraints easily via ALTER TABLE.
-- We'll add the column first.
ALTER TABLE fetched_emails ADD COLUMN message_id TEXT;

-- Create a unique index on (account_id, message_id) to prevent duplicates based on Message-ID.
-- We use WHERE message_id IS NOT NULL to allow older records (if any) to coexist until backfilled.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fetched_emails_message_id 
ON fetched_emails(account_id, message_id) 
WHERE message_id IS NOT NULL;
