CREATE TABLE IF NOT EXISTS sending_domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  verify_token TEXT NOT NULL,
  last_check_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS sending_api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  key_tail TEXT NOT NULL,
  scope TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sending_suppressions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  reason TEXT NOT NULL,
  provenance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, email_normalized)
);

CREATE TABLE IF NOT EXISTS send_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT,
  text_body TEXT,
  provider_id TEXT,
  sanitized_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS send_events (
  id TEXT PRIMARY KEY,
  send_request_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
