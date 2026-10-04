import { ApiError, notify } from "./lib";

export const SENDING_REVIEW_CONTACT = "info@tmdspace.com";

export const SENDING_HOLD_MESSAGE = `Sending is paused. Too many messages bounced, failed, or were reported as spam. Contact ${SENDING_REVIEW_CONTACT} so we can review this workspace before sending resumes.`;

export type SendingHealth = {
  dayFinished: number;
  dayBad: number;
  dayComplaints: number;
  hourFinished: number;
  hourBad: number;
};

export function isOperator(env: { OPERATOR_EMAILS?: string }, email: string) {
  const configured = (env.OPERATOR_EMAILS || "zwebso@gmail.com")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(email.trim().toLowerCase());
}

const FINISHED = `s.status IN ('delivered', 'bounced', 'failed', 'complained') OR (s.status = 'rejected' AND s.provider_id IS NOT NULL)`;
const BAD = `s.status IN ('bounced', 'failed', 'complained') OR (s.status = 'rejected' AND s.provider_id IS NOT NULL)`;

export type WorkspaceHealth = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  hold: string | null;
  reason: string | null;
  heldAt: string | null;
  dayFinished: number;
  dayBad: number;
  dayComplaints: number;
  hourFinished: number;
  hourBad: number;
};

export async function listSendingHealth(db: D1Database): Promise<WorkspaceHealth[]> {
  const now = Date.now();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourStart = new Date(now - 60 * 60 * 1000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT w.id, w.name, w.slug, w.sending_hold, w.sending_hold_reason, w.sending_hold_at,
         (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id AND m.role = 'owner' LIMIT 1) AS owner_email,
         SUM(CASE WHEN s.updated_at >= ? AND (${FINISHED}) THEN 1 ELSE 0 END) AS day_finished,
         SUM(CASE WHEN s.updated_at >= ? AND (${BAD}) THEN 1 ELSE 0 END) AS day_bad,
         SUM(CASE WHEN s.updated_at >= ? AND s.status = 'complained' THEN 1 ELSE 0 END) AS day_complaints,
         SUM(CASE WHEN s.updated_at >= ? AND (${FINISHED}) THEN 1 ELSE 0 END) AS hour_finished,
         SUM(CASE WHEN s.updated_at >= ? AND (${BAD}) THEN 1 ELSE 0 END) AS hour_bad
       FROM workspaces w
       LEFT JOIN send_requests s ON s.workspace_id = w.id AND s.updated_at >= ?
       GROUP BY w.id
       HAVING day_finished > 0 OR w.sending_hold IS NOT NULL
       ORDER BY w.sending_hold IS NULL, day_bad DESC, w.name`,
    )
    .bind(dayStart, dayStart, dayStart, hourStart, hourStart, dayStart)
    .all<{
      id: string;
      name: string;
      slug: string;
      sending_hold: string | null;
      sending_hold_reason: string | null;
      sending_hold_at: string | null;
      owner_email: string | null;
      day_finished: number | null;
      day_bad: number | null;
      day_complaints: number | null;
      hour_finished: number | null;
      hour_bad: number | null;
    }>();
  return (results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerEmail: row.owner_email,
    hold: row.sending_hold,
    reason: row.sending_hold_reason,
    heldAt: row.sending_hold_at,
    dayFinished: Number(row.day_finished ?? 0),
    dayBad: Number(row.day_bad ?? 0),
    dayComplaints: Number(row.day_complaints ?? 0),
    hourFinished: Number(row.hour_finished ?? 0),
    hourBad: Number(row.hour_bad ?? 0),
  }));
}

export async function releaseSendingHold(db: D1Database, workspaceId: string) {
  const now = new Date().toISOString();
  const result = await db
    .prepare("UPDATE workspaces SET sending_hold = NULL, sending_hold_reason = NULL, sending_hold_at = NULL, updated_at = ? WHERE id = ? AND sending_hold IS NOT NULL")
    .bind(now, workspaceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export function sendingHoldReason(health: SendingHealth) {
  if (health.dayComplaints >= 3) {
    return "Recipients reported these messages as spam.";
  }
  if (health.hourFinished >= 20 && health.hourBad >= 15 && health.hourBad / health.hourFinished >= 0.25) {
    return "A burst of messages bounced or failed.";
  }
  if (health.dayFinished >= 50 && health.dayBad / health.dayFinished >= 0.1) {
    return "At least 10% of recent messages bounced or failed.";
  }
  return null;
}

type HealthRow = {
  day_finished: number | null;
  day_bad: number | null;
  day_complaints: number | null;
  hour_finished: number | null;
  hour_bad: number | null;
};

export async function reviewSendingHold(db: D1Database, workspaceId: string, env?: Env) {
  const held = await db
    .prepare("SELECT sending_hold FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ sending_hold: string | null }>();
  if (held?.sending_hold) return;
  const now = Date.now();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourStart = new Date(now - 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN updated_at >= ? AND (status IN ('delivered', 'bounced', 'failed', 'complained') OR (status = 'rejected' AND provider_id IS NOT NULL)) THEN 1 ELSE 0 END) AS day_finished,
         SUM(CASE WHEN updated_at >= ? AND (status IN ('bounced', 'failed', 'complained') OR (status = 'rejected' AND provider_id IS NOT NULL)) THEN 1 ELSE 0 END) AS day_bad,
         SUM(CASE WHEN updated_at >= ? AND status = 'complained' THEN 1 ELSE 0 END) AS day_complaints,
         SUM(CASE WHEN updated_at >= ? AND (status IN ('delivered', 'bounced', 'failed', 'complained') OR (status = 'rejected' AND provider_id IS NOT NULL)) THEN 1 ELSE 0 END) AS hour_finished,
         SUM(CASE WHEN updated_at >= ? AND (status IN ('bounced', 'failed', 'complained') OR (status = 'rejected' AND provider_id IS NOT NULL)) THEN 1 ELSE 0 END) AS hour_bad
       FROM send_requests WHERE workspace_id = ?`,
    )
    .bind(dayStart, dayStart, dayStart, hourStart, hourStart, workspaceId)
    .first<HealthRow>();
  const reason = sendingHoldReason({
    dayFinished: Number(row?.day_finished ?? 0),
    dayBad: Number(row?.day_bad ?? 0),
    dayComplaints: Number(row?.day_complaints ?? 0),
    hourFinished: Number(row?.hour_finished ?? 0),
    hourBad: Number(row?.hour_bad ?? 0),
  });
  if (!reason) return;
  const updated = await db
    .prepare("UPDATE workspaces SET sending_hold = 'review', sending_hold_reason = ?, sending_hold_at = ?, updated_at = ? WHERE id = ? AND sending_hold IS NULL")
    .bind(reason, new Date(now).toISOString(), new Date(now).toISOString(), workspaceId)
    .run();
  if ((updated.meta.changes ?? 0) === 0) return;
  await notify(db, {
    workspaceId,
    eventKey: "sending.paused",
    title: "Sending is paused",
    body: SENDING_HOLD_MESSAGE,
    severity: "critical",
    actionUrl: "/contact",
  });
  await alertOperator(env, db, workspaceId, reason).catch(() => undefined);
}

async function alertOperator(env: Env | undefined, db: D1Database, workspaceId: string, reason: string) {
  if (!env?.EMAIL) return;
  const workspace = await db
    .prepare(
      `SELECT w.name,
         (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = w.id AND m.role = 'owner' LIMIT 1) AS owner_email
       FROM workspaces w WHERE w.id = ?`,
    )
    .bind(workspaceId)
    .first<{ name: string; owner_email: string | null }>();
  const from = env.SYSTEM_MAIL_FROM || "noreply@postlane.email";
  await env.EMAIL.send({
    from,
    to: SENDING_REVIEW_CONTACT,
    subject: `Postlane paused sending for ${workspace?.name || "a workspace"}`,
    text: [
      "A workspace crossed the bounce and failure line. Sending is paused until you release it.",
      "",
      `Workspace: ${workspace?.name || workspaceId}`,
      `Owner: ${workspace?.owner_email || "unknown"}`,
      `Reason: ${reason}`,
      "",
      "Open Operations in Postlane to review the counts and release sending after you talk with them.",
    ].join("\n"),
  });
}

export async function assertSendingOpen(db: D1Database, workspaceId: string) {
  const row = await db
    .prepare("SELECT sending_hold FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ sending_hold: string | null }>();
  if (row?.sending_hold) {
    throw new ApiError(403, "sending_paused", SENDING_HOLD_MESSAGE, { retryable: false });
  }
}
