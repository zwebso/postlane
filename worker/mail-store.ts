import { id, nowIso } from "./lib";

export type StoredMessage = {
  id: string;
  workspace_id: string | null;
  mailbox_id: string | null;
  direction: string;
  from_address: string | null;
  to_address: string;
  subject: string | null;
  r2_key: string | null;
  correlation_token: string | null;
  created_at: string;
};

export async function storeRawMessage(
  env: Env,
  input: {
    workspaceId?: string | null;
    mailboxId?: string | null;
    direction: "inbound" | "outbound" | "system";
    from: string;
    to: string;
    subject?: string;
    raw: ArrayBuffer | string;
    correlationToken?: string;
  },
): Promise<StoredMessage> {
  const messageId = id();
  const key = `mail/${input.direction}/${input.to}/${messageId}.eml`;
  if (env.MAIL) {
    const body = typeof input.raw === "string" ? new TextEncoder().encode(input.raw) : input.raw;
    await env.MAIL.put(key, body);
  }
  await env.DB.prepare(
    `INSERT INTO stored_messages
      (id, workspace_id, mailbox_id, direction, from_address, to_address, subject, r2_key, correlation_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      messageId,
      input.workspaceId ?? null,
      input.mailboxId ?? null,
      input.direction,
      input.from,
      input.to,
      input.subject ?? null,
      env.MAIL ? key : null,
      input.correlationToken ?? null,
      nowIso(),
    )
    .run();
  return {
    id: messageId,
    workspace_id: input.workspaceId ?? null,
    mailbox_id: input.mailboxId ?? null,
    direction: input.direction,
    from_address: input.from,
    to_address: input.to,
    subject: input.subject ?? null,
    r2_key: env.MAIL ? key : null,
    correlation_token: input.correlationToken ?? null,
    created_at: nowIso(),
  };
}

export async function listMailboxMessages(db: D1Database, mailboxId: string, workspaceId: string) {
  const { results } = await db
    .prepare(
      `SELECT id, direction, from_address, to_address, subject, created_at
       FROM stored_messages
       WHERE mailbox_id = ? AND workspace_id = ?
       ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(mailboxId, workspaceId)
    .all<StoredMessage>();
  return results;
}

export async function inboundCount(db: D1Database, mailboxId: string) {
  const row = await db
    .prepare(`SELECT COUNT(*) as n FROM stored_messages WHERE mailbox_id = ? AND direction = 'inbound'`)
    .bind(mailboxId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
