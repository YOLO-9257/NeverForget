
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  user_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Index for username lookup
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
