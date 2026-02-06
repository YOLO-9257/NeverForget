-- Add Email Blacklist and Rules tables
-- Date: 2026-02-05

CREATE TABLE IF NOT EXISTS email_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER, -- Foreign Key to email_accounts.id (can be NULL for global blacklist)
    email_address TEXT NOT NULL,
    created_at INTEGER,
    UNIQUE(account_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_account ON email_blacklist(account_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_email ON email_blacklist(email_address);

CREATE TABLE IF NOT EXISTS email_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER, -- Foreign Key to email_accounts.id
    name TEXT NOT NULL,
    conditions TEXT NOT NULL, -- JSON Array: [{ field: 'from'|'subject'|'content', operator: 'contains'|'equals'|'starts_with', value: '' }]
    action TEXT NOT NULL,     -- JSON Object: { type: 'block' | 'tag' | 'skip', value: '' }
    is_enabled INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,
    created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_email_rules_account ON email_rules(account_id);

-- Add AI Spam Filter toggle to email_accounts
ALTER TABLE email_accounts ADD COLUMN enable_ai_spam_filter INTEGER DEFAULT 0;
