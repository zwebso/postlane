export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, email_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, account_status TEXT NOT NULL DEFAULT 'unverified',
    google_sub TEXT, auth_provider TEXT NOT NULL DEFAULT 'password',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'customer',
    user_agent TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS email_tokens (
    id TEXT PRIMARY KEY, user_id TEXT, invitation_id TEXT, purpose TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, recovery_email TEXT, contact_email TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC', sending_hold TEXT, sending_hold_reason TEXT, sending_hold_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (workspace_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, email_normalized TEXT NOT NULL, role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', invited_by TEXT NOT NULL,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL UNIQUE, plan TEXT NOT NULL, status TEXT NOT NULL,
    interval TEXT NOT NULL DEFAULT 'monthly', seat_count INTEGER NOT NULL DEFAULT 1, provider TEXT NOT NULL DEFAULT 'mock',
    external_ref TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS billing_events (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, external_event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, number TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL, issued_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, name_normalized TEXT NOT NULL UNIQUE,
    ownership_status TEXT NOT NULL, verify_token TEXT NOT NULL, dns_provider TEXT, has_existing_mail INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dns_requirements (
    id TEXT PRIMARY KEY, domain_id TEXT NOT NULL, component TEXT NOT NULL, record_type TEXT NOT NULL, host TEXT NOT NULL,
    full_hostname TEXT NOT NULL, expected_value TEXT NOT NULL, ttl TEXT, mx_priority INTEGER, required INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS dns_observations (
    id TEXT PRIMARY KEY, domain_id TEXT NOT NULL, component TEXT NOT NULL, status TEXT NOT NULL, detected_value TEXT,
    resolver TEXT, error_code TEXT, checked_at TEXT NOT NULL, next_check_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS mailboxes (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, local_part TEXT NOT NULL,
    address_normalized TEXT NOT NULL UNIQUE, display_name TEXT, status TEXT NOT NULL, quota_gb REAL NOT NULL, quota_mb INTEGER NOT NULL,
    storage_bytes INTEGER NOT NULL DEFAULT 0, provider TEXT NOT NULL DEFAULT 'mock', provider_id TEXT,
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS aliases (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, domain_id TEXT NOT NULL, local_part TEXT NOT NULL,
    address_normalized TEXT NOT NULL UNIQUE, destination_mailbox_id TEXT, destination_address TEXT NOT NULL,
    type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, type TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, resource_type TEXT, resource_id TEXT, provider_ref TEXT,
    sanitized_error TEXT, correlation_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS delivery_checks (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, mailbox_id TEXT NOT NULL, direction TEXT NOT NULL, status TEXT NOT NULL,
    correlation_token TEXT, evidence TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, status TEXT NOT NULL, source_provider TEXT, source_host TEXT,
    mapping_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, event_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    severity TEXT NOT NULL, unread INTEGER NOT NULL DEFAULT 1, action_url TEXT, created_at TEXT NOT NULL,
    UNIQUE (event_key, workspace_id))`,
  `CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, setup_dns INTEGER NOT NULL DEFAULT 1, billing INTEGER NOT NULL DEFAULT 1,
    product INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, workspace_id))`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, workspace_id TEXT, actor_user_id TEXT, event TEXT NOT NULL, resource TEXT, result TEXT NOT NULL,
    correlation_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS abuse_cases (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, components TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff_users (
    id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS processed_webhooks (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, external_event_id TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (source, external_event_id))`,
  `CREATE TABLE IF NOT EXISTS stored_messages (
    id TEXT PRIMARY KEY, workspace_id TEXT, mailbox_id TEXT, direction TEXT NOT NULL,
    from_address TEXT, to_address TEXT NOT NULL, subject TEXT, r2_key TEXT, correlation_token TEXT,
    created_at TEXT NOT NULL)`,
];

export const SENDING_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sending_domains (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, name_normalized TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL, verify_token TEXT NOT NULL, last_check_json TEXT, provider_json TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, verified_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sending_api_keys (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, key_tail TEXT NOT NULL, scope TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sending_suppressions (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email_normalized TEXT NOT NULL, reason TEXT NOT NULL,
    provenance TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (workspace_id, email_normalized))`,
  `CREATE TABLE IF NOT EXISTS send_requests (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL,
    from_address TEXT NOT NULL, to_address TEXT NOT NULL, subject TEXT NOT NULL, html TEXT, text_body TEXT,
    provider_id TEXT, sanitized_error TEXT, quota_units INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (workspace_id, idempotency_key))`,
  `CREATE TABLE IF NOT EXISTS send_events (
    id TEXT PRIMARY KEY, send_request_id TEXT NOT NULL, workspace_id TEXT NOT NULL, type TEXT NOT NULL,
    detail TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sending_webhooks (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, UNIQUE (workspace_id, url))`,
  `CREATE TABLE IF NOT EXISTS sending_templates (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL,
    html TEXT NOT NULL DEFAULT '', text_body TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL, UNIQUE (workspace_id, name))`,
  `CREATE TABLE IF NOT EXISTS workspace_integrations (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, access_token TEXT NOT NULL,
    refresh_token TEXT, meta_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (workspace_id, provider))`,
];

export async function ensureSchema(db: D1Database) {
  const check = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
  if (!check) {
    for (const statement of [...SCHEMA_STATEMENTS, ...SENDING_SCHEMA_STATEMENTS]) {
      await db.prepare(statement).run();
    }
    await db.prepare("CREATE INDEX IF NOT EXISTS send_requests_provider_id ON send_requests(provider_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS send_requests_workspace_updated ON send_requests(workspace_id, updated_at)").run();
    return;
  }
  for (const statement of SENDING_SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }
  const sendTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='send_requests'").first();
  if (sendTable) {
    const sendCols = await db.prepare("PRAGMA table_info(send_requests)").all<{ name: string }>();
    if (!(sendCols.results ?? []).some((col) => col.name === "quota_units")) {
      await db.prepare("ALTER TABLE send_requests ADD COLUMN quota_units INTEGER NOT NULL DEFAULT 1").run();
    }
    await db.prepare("CREATE INDEX IF NOT EXISTS send_requests_provider_id ON send_requests(provider_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS send_requests_workspace_updated ON send_requests(workspace_id, updated_at)").run();
  }
  const templateTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sending_templates'").first();
  if (templateTable) {
    const templateCols = await db.prepare("PRAGMA table_info(sending_templates)").all<{ name: string }>();
    const templateNames = new Set((templateCols.results ?? []).map((col) => col.name));
    if (!templateNames.has("html")) {
      await db.prepare("ALTER TABLE sending_templates ADD COLUMN html TEXT NOT NULL DEFAULT ''").run();
    }
    if (!templateNames.has("text_body")) {
      await db.prepare("ALTER TABLE sending_templates ADD COLUMN text_body TEXT NOT NULL DEFAULT ''").run();
    }
  }
  const domainTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sending_domains'").first();
  if (domainTable) {
    const domainCols = await db.prepare("PRAGMA table_info(sending_domains)").all<{ name: string }>();
    if (!(domainCols.results ?? []).some((col) => col.name === "provider_json")) {
      await db.prepare("ALTER TABLE sending_domains ADD COLUMN provider_json TEXT").run();
    }
  }
  const subs = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'").first();
  if (subs) {
    await db.prepare("UPDATE subscriptions SET plan = 'sandbox' WHERE plan IN ('free', 'Free')").run();
    await db.prepare("UPDATE subscriptions SET plan = 'launch' WHERE plan IN ('starter', 'Starter')").run();
    await db.prepare("UPDATE subscriptions SET plan = 'scale' WHERE plan IN ('business', 'Business')").run();
    const subCols = await db.prepare("PRAGMA table_info(subscriptions)").all<{ name: string }>();
    const subNames = new Set((subCols.results ?? []).map((col) => col.name));
    if (!subNames.has("stripe_customer_id")) {
      await db.prepare("ALTER TABLE subscriptions ADD COLUMN stripe_customer_id TEXT").run();
    }
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, event_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        severity TEXT NOT NULL, unread INTEGER NOT NULL DEFAULT 1, action_url TEXT, created_at TEXT NOT NULL,
        UNIQUE (event_key, workspace_id))`,
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS stored_messages (
        id TEXT PRIMARY KEY, workspace_id TEXT, mailbox_id TEXT, direction TEXT NOT NULL,
        from_address TEXT, to_address TEXT NOT NULL, subject TEXT, r2_key TEXT, correlation_token TEXT,
        created_at TEXT NOT NULL)`,
    )
    .run();
  const userCols = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const userNames = new Set((userCols.results ?? []).map((col) => col.name));
  if (!userNames.has("google_sub")) {
    await db.prepare("ALTER TABLE users ADD COLUMN google_sub TEXT").run();
  }
  if (!userNames.has("auth_provider")) {
    await db.prepare("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'").run();
  }
  const workspaceCols = await db.prepare("PRAGMA table_info(workspaces)").all<{ name: string }>();
  const workspaceNames = new Set((workspaceCols.results ?? []).map((col) => col.name));
  if (!workspaceNames.has("sending_hold")) {
    await db.prepare("ALTER TABLE workspaces ADD COLUMN sending_hold TEXT").run();
    await db.prepare("ALTER TABLE workspaces ADD COLUMN sending_hold_reason TEXT").run();
    await db.prepare("ALTER TABLE workspaces ADD COLUMN sending_hold_at TEXT").run();
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL").run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS workspace_integrations (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, access_token TEXT NOT NULL,
        refresh_token TEXT, meta_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, provider))`,
    )
    .run();
  const mailboxCols = await db.prepare("PRAGMA table_info(mailboxes)").all<{ name: string }>();
  const names = new Set((mailboxCols.results ?? []).map((col) => col.name));
  if (names.has("quota_gb") && !names.has("quota_mb")) {
    await db.prepare("ALTER TABLE mailboxes ADD COLUMN quota_mb INTEGER NOT NULL DEFAULT 0").run();
    await db.prepare("UPDATE mailboxes SET quota_mb = CAST(quota_gb * 1000 AS INTEGER) WHERE quota_mb = 0 AND quota_gb > 0").run();
  }
}
