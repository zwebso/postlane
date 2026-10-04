import { normalizeEmail } from "../shared/domain";
import { storeRawMessage } from "./mail-store";
import { SYSTEM_INBOUND, SYSTEM_MAIL_DOMAIN } from "./providers/spec";
import { ensureSchema } from "./schema";

export type InboundEmail = {
  from: string;
  to: string;
  headers: { get(name: string): string | null };
  raw: ReadableStream;
  rawSize: number;
  setReject(reason: string): void;
};

const MAX_INBOUND_BYTES = 25 * 1024 * 1024;

function header(headers: InboundEmail["headers"], name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase());
}

export async function handleInboundEmail(message: InboundEmail, env: Env) {
  await ensureSchema(env.DB);
  if (message.rawSize > MAX_INBOUND_BYTES) {
    message.setReject("Message exceeds the 25 MiB inbound limit.");
    return;
  }

  const to = normalizeEmail(message.to);
  const from = message.from;
  const subject = header(message.headers, "Subject") ?? "";
  const correlation = header(message.headers, "X-Postlane-Check") ?? undefined;
  const raw = await new Response(message.raw).arrayBuffer();

  if (SYSTEM_INBOUND.includes(to as (typeof SYSTEM_INBOUND)[number]) || to.endsWith(`@${SYSTEM_MAIL_DOMAIN}`)) {
    await storeRawMessage(env, {
      direction: "inbound",
      from,
      to,
      subject,
      raw,
      correlationToken: correlation,
    });
    return;
  }

  const mailbox = await env.DB.prepare(
    `SELECT id, workspace_id, status FROM mailboxes
     WHERE address_normalized = ? AND status != 'deleted'`,
  )
    .bind(to)
    .first<{ id: string; workspace_id: string; status: string }>();

  if (mailbox) {
    await storeRawMessage(env, {
      workspaceId: mailbox.workspace_id,
      mailboxId: mailbox.id,
      direction: "inbound",
      from,
      to,
      subject,
      raw,
      correlationToken: correlation,
    });
    return;
  }

  const alias = await env.DB.prepare(
    `SELECT destination_mailbox_id, workspace_id FROM aliases
     WHERE address_normalized = ? AND status = 'enabled'`,
  )
    .bind(to)
    .first<{ destination_mailbox_id: string; workspace_id: string }>();

  if (alias?.destination_mailbox_id) {
    await storeRawMessage(env, {
      workspaceId: alias.workspace_id,
      mailboxId: alias.destination_mailbox_id,
      direction: "inbound",
      from,
      to,
      subject,
      raw,
      correlationToken: correlation,
    });
    return;
  }

  message.setReject("Address unknown.");
}
