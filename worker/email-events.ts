import { id, notify, nowIso } from "./lib";
import { reviewSendingHold } from "./sending-hold";

export type DeliveryUpdate = {
  eventId: string;
  messageId: string;
  recipient: string;
  status: "delivered" | "deferred" | "bounced" | "failed" | "rejected" | "complained";
  detail: string;
};

const STATUSES = new Set<DeliveryUpdate["status"]>(["delivered", "deferred", "bounced", "failed", "rejected", "complained"]);

const FINAL = new Set(["bounced", "failed", "rejected", "complained"]);

export function canApplyDeliveryStatus(current: string, next: string) {
  if (current === next) return true;
  if (FINAL.has(current)) return false;
  if (current === "delivered") return next === "complained";
  return true;
}

export function readDeliveryUpdate(body: unknown): DeliveryUpdate | null {
  const event = unwrap(body);
  if (!event) return null;
  const type = String(event.type || "");
  const name = type.split(".").pop() || "";
  if (!STATUSES.has(name as DeliveryUpdate["status"])) return null;
  const payload = asRecord(event.payload);
  const messageId = String(payload.messageId || "").trim();
  const recipient = String(payload.recipient || "").trim().toLowerCase();
  if (!messageId || !recipient.includes("@")) return null;
  const delivery = asRecord(payload.delivery);
  const bounce = asRecord(payload.bounce);
  const failure = asRecord(payload.failure);
  const rejection = asRecord(payload.rejection);
  const detail =
    text(bounce.reason) ||
    text(failure.reason) ||
    text(rejection.detail) ||
    text(rejection.reason) ||
    text(delivery.smtpResponse) ||
    defaultDetail(name as DeliveryUpdate["status"]);
  return {
    eventId: String(payload.eventId || event.id || `${messageId}:${name}:${recipient}`),
    messageId,
    recipient,
    status: name as DeliveryUpdate["status"],
    detail: detail.slice(0, 500),
  };
}

function defaultDetail(status: DeliveryUpdate["status"]) {
  if (status === "delivered") return "The recipient server accepted the message.";
  if (status === "deferred") return "The recipient server asked for a later retry.";
  if (status === "bounced") return "The recipient server permanently refused the message.";
  if (status === "failed") return "Cloudflare could not send the message.";
  if (status === "rejected") return "Cloudflare rejected the message before delivery.";
  return "The recipient reported this message as spam.";
}

export async function applyEmailSendingEvent(db: D1Database, body: unknown, env?: Env) {
  const update = readDeliveryUpdate(body);
  if (!update) return "ignored" as const;
  const { results } = await db
    .prepare("SELECT id, workspace_id, status, to_address FROM send_requests WHERE provider_id = ?")
    .bind(update.messageId)
    .all<{ id: string; workspace_id: string; status: string; to_address: string }>();
  const rows = results ?? [];
  const match = rows.find((row) => row.to_address.toLowerCase() === update.recipient) || (rows.length === 1 ? rows[0] : undefined);
  if (!match || !canApplyDeliveryStatus(match.status, update.status)) return "unmatched" as const;
  const seen = await db
    .prepare("SELECT id FROM send_events WHERE send_request_id = ? AND type = ? AND detail = ?")
    .bind(match.id, `email.${update.status}`, `${update.eventId} ${update.detail}`)
    .first();
  if (seen) return "ignored" as const;
  const now = nowIso();
  await db
    .prepare("UPDATE send_requests SET status = ?, sanitized_error = ?, updated_at = ? WHERE id = ?")
    .bind(update.status, update.status === "delivered" ? null : update.detail, now, match.id)
    .run();
  await db
    .prepare("INSERT INTO send_events (id, send_request_id, workspace_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id(), match.id, match.workspace_id, `email.${update.status}`, `${update.eventId} ${update.detail}`, now)
    .run();
  if (update.status !== "delivered" && update.status !== "deferred") {
    await notify(db, {
      workspaceId: match.workspace_id,
      eventKey: `email.${update.status}:${match.id}`,
      title: update.status === "bounced" ? "A message bounced" : `A message was ${update.status}`,
      body: `${update.recipient}: ${update.detail}`.slice(0, 180),
      severity: "warning",
      actionUrl: "/app/emails",
    });
  }
  if (update.status === "bounced" || update.status === "failed" || update.status === "complained" || update.status === "rejected") {
    await reviewSendingHold(db, match.workspace_id, env);
  }
  return "updated" as const;
}

function unwrap(body: unknown): Record<string, unknown> | null {
  if (typeof body === "string") {
    try {
      return unwrap(JSON.parse(body));
    } catch {
      return null;
    }
  }
  const record = asRecord(body);
  if (record.type) return record;
  const nested = asRecord(record.body);
  return nested.type ? nested : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
