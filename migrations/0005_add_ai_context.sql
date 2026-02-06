-- Migration number: 0005 	 2026-02-03T08:30:00Z
CREATE TABLE IF NOT EXISTS ai_contexts (
    user_key TEXT PRIMARY KEY,
    summary TEXT DEFAULT '',
    recent_history TEXT DEFAULT '[]',
    last_updated INTEGER
);
