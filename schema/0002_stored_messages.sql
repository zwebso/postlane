CREATE TABLE IF NOT EXISTS stored_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  mailbox_id TEXT,
  direction TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT NOT NULL,
  subject TEXT,
  r2_key TEXT,
  correlation_token TEXT,
  created_at TEXT NOT NULL
);
