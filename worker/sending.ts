import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  effectiveSendingPlan,
  normalizeDomain,
  normalizeEmail,
  normalizePlan,
  PLAN_CATALOG,
  PROVIDER_LIMITS,
  recipientCount,
  slugify,
  utcDayStart,
  utcMonthStart,
  type PlanId,
} from "../shared/domain";
import {
  escapeHtml,
  readTemplateVariables,
  renderTemplate,
  STARTER_TEMPLATES,
  unsafeTemplateHtml,
  type MailTemplate,
} from "../shared/templates";
import {
  applySendingDns,
  findZoneForDomain,
  inspectDnsHost,
  verifyCloudflareToken,
} from "./cloudflare-dns";
import { domainConnectApplyUrl, domainConnectLive, ensureDomainConnectPublicKey } from "./domain-connect";
import { mergeSendingRecords, onboardSendingDomain, verifySendingDns, type ProviderOnboard } from "./email-sending";
import { ApiError, audit, type AuthedUser, id, notify, nowIso, rawToken, sha256 } from "./lib";
import { getMailProvider, providerStatus } from "./provider";
import { assertSendingOpen, isOperator, listSendingHealth, releaseSendingHold, SENDING_HOLD_MESSAGE } from "./sending-hold";
import { paidPlan, stripeCancelAtPeriodEnd, stripeChangePlan, stripeCheckout, stripeConfigured, stripePortal } from "./stripe";

const SESSION = "postlane_session";
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

type Variables = { cid: string; user?: AuthedUser; staff?: AuthedUser };

type Ctx = import("hono").Context<{ Bindings: Env; Variables: Variables }>;

type SessionUser = { id: string; name: string; email: string; account_status: string };
type WorkspaceRow = { id: string; slug: string; name: string; role: string };

function v1Error(c: Ctx, status: number, code: string, message: string, retryable = false) {
  return c.json(
    { error: { code, message, request_id: c.get("cid"), retryable } },
    status as 400,
  );
}

function mapScope(scope: string) {
  if (scope === "Read activity" || scope === "read") return "read";
  if (scope === "Full access" || scope === "full") return "full";
  return "send";
}

function scopeLabel(scope: string) {
  if (scope === "read") return "Read activity";
  if (scope === "full") return "Full access";
  return "Send emails";
}

function canSend(scope: string) {
  return scope === "send" || scope === "full";
}

async function sessionUser(c: Ctx) {
  const token = getCookie(c, SESSION);
  if (!token) return null;
  return c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.account_status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.kind = 'customer' AND s.expires_at > ?`,
  )
    .bind(await sha256(token), nowIso())
    .first<SessionUser>();
}

async function requireSession(c: Ctx, verified = false) {
  const user = await sessionUser(c);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  if (verified && user.account_status !== "verified") {
    throw new ApiError(403, "ACCOUNT_UNVERIFIED", "Verify your email before changing sending settings.", {
      retryable: false,
    });
  }
  return user;
}

async function ensureWorkspace(db: D1Database, user: SessionUser): Promise<WorkspaceRow> {
  const existing = await db
    .prepare(
      `SELECT w.id, w.slug, w.name, m.role
       FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? ORDER BY w.created_at LIMIT 1`,
    )
    .bind(user.id)
    .first<WorkspaceRow>();
  if (existing) {
    await ensureSubscription(db, existing.id);
    return existing;
  }
  const name = `${user.name.split(" ")[0] || "Postlane"} workspace`;
  let slug = slugify(name);
  const clash = await db.prepare("SELECT id FROM workspaces WHERE slug = ?").bind(slug).first();
  if (clash) slug = `${slug}-${id().slice(0, 6)}`;
  const workspaceId = id();
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO workspaces (id, slug, name, recovery_email, contact_email, timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'UTC', ?, ?)`,
      )
      .bind(workspaceId, slug, name, user.email, user.email, now, now),
    db.prepare(`INSERT INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`).bind(
      id(),
      workspaceId,
      user.id,
      now,
    ),
    db
      .prepare(
        `INSERT INTO subscriptions (id, workspace_id, plan, status, interval, seat_count, provider, created_at, updated_at)
         VALUES (?, ?, 'sandbox', 'active', 'monthly', 1, 'mock', ?, ?)`,
      )
      .bind(id(), workspaceId, now, now),
  ]);
  return { id: workspaceId, slug, name, role: "owner" };
}

async function ensureSubscription(db: D1Database, workspaceId: string) {
  const existing = await db
    .prepare("SELECT plan, status FROM subscriptions WHERE workspace_id = ?")
    .bind(workspaceId)
    .first<{ plan: string; status: string }>();
  if (existing) {
    return { requested: normalizePlan(existing.plan), status: existing.status };
  }
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO subscriptions (id, workspace_id, plan, status, interval, seat_count, provider, created_at, updated_at)
       VALUES (?, ?, 'sandbox', 'active', 'monthly', 1, 'mock', ?, ?)`,
    )
    .bind(id(), workspaceId, now, now)
    .run();
  return { requested: "sandbox" as PlanId, status: "active" };
}

export async function workspaceEntitlement(db: D1Database, workspaceId: string) {
  const sub = await ensureSubscription(db, workspaceId);
  const entitled = effectiveSendingPlan(sub.requested, sub.status);
  return { ...sub, entitled, spec: PLAN_CATALOG[entitled] };
}

async function countSendsSince(db: D1Database, workspaceId: string, since: string) {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(quota_units), 0) as n FROM send_requests WHERE workspace_id = ? AND created_at >= ? AND status != 'rejected'",
    )
    .bind(workspaceId, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function assertCanSend(db: D1Database, workspaceId: string, units: number) {
  await assertSendingOpen(db, workspaceId);
  const { spec } = await workspaceEntitlement(db, workspaceId);
  const now = new Date();
  const recent = await db
    .prepare("SELECT COUNT(*) as n FROM send_requests WHERE workspace_id = ? AND created_at > ?")
    .bind(workspaceId, new Date(now.getTime() - 1000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= spec.rateLimitPerSecond) {
    throw new ApiError(
      429,
      "rate_limited",
      `This plan allows ${spec.rateLimitPerSecond} send requests per second. Wait a moment and retry with the same Idempotency-Key.`,
      { retryable: true },
    );
  }
  if (spec.emailsPerDay != null) {
    const used = await countSendsSince(db, workspaceId, utcDayStart(now));
    if (used + units > spec.emailsPerDay) {
      throw new ApiError(
        429,
        "quota_exceeded",
        `${spec.label} can send ${spec.emailsPerDay.toLocaleString()} emails each UTC calendar day. The count resets at 00:00 UTC.`,
        { retryable: true },
      );
    }
  }
  const monthUsed = await countSendsSince(db, workspaceId, utcMonthStart(now));
  if (monthUsed + units > spec.emailsPerMonth) {
    throw new ApiError(
      429,
      "quota_exceeded",
      `${spec.label} includes ${spec.emailsPerMonth.toLocaleString()} emails each month.`,
      { retryable: true },
    );
  }
}

async function addEvent(db: D1Database, workspaceId: string, sendId: string, type: string, detail: string) {
  await db
    .prepare(
      `INSERT INTO send_events (id, send_request_id, workspace_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id(), sendId, workspaceId, type, detail, nowIso())
    .run();
}

function sendingRecords(domain: string, token: string, onboard?: ProviderOnboard | null) {
  return mergeSendingRecords(domain, token, onboard);
}

function parseOnboard(json?: string | null): ProviderOnboard | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ProviderOnboard;
  } catch {
    return null;
  }
}

async function workspaceCloudflareToken(db: D1Database, workspaceId: string) {
  const row = await db
    .prepare("SELECT access_token FROM workspace_integrations WHERE workspace_id = ? AND provider = 'cloudflare'")
    .bind(workspaceId)
    .first<{ access_token: string }>();
  return row?.access_token || "";
}

async function saveCloudflareToken(db: D1Database, workspaceId: string, token: string, refresh?: string) {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO workspace_integrations (id, workspace_id, provider, access_token, refresh_token, created_at, updated_at)
       VALUES (?, ?, 'cloudflare', ?, ?, ?, ?)
       ON CONFLICT(workspace_id, provider) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, updated_at = excluded.updated_at`,
    )
    .bind(id(), workspaceId, token, refresh || null, now, now)
    .run();
}

async function dnsApplyToken(env: Env, db: D1Database, workspaceId: string, domain: string) {
  const customer = await workspaceCloudflareToken(db, workspaceId);
  if (customer && (await findZoneForDomain(customer, domain))) return customer;
  const platform = env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (platform && (await findZoneForDomain(platform, domain))) return platform;
  return customer || "";
}

export { saveCloudflareToken, workspaceCloudflareToken };

function addressList(value?: string | string[]) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => normalizeEmail(item)).filter((item) => item.includes("@"));
}

async function acceptSend(
  env: Env,
  workspaceId: string,
  input: {
    from: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    html?: string;
    text?: string;
    idempotencyKey: string;
    cid: string;
    units?: number;
  },
) {
  const existing = await env.DB.prepare(
    "SELECT * FROM send_requests WHERE workspace_id = ? AND idempotency_key = ?",
  )
    .bind(workspaceId, input.idempotencyKey)
    .first<Record<string, string>>();
  if (existing) {
    return { id: existing.id, status: existing.status, replayed: true };
  }

  const from = input.from.trim();
  const recipients = addressList(input.to);
  const cc = addressList(input.cc);
  const bcc = addressList(input.bcc);
  const to = recipients[0] || "";
  const fromHost = from.includes("<") ? from.slice(from.indexOf("<") + 1, from.indexOf(">")) : from;
  const fromEmail = fromHost.includes("@") ? fromHost : from;
  const fromDomain = fromEmail.split("@")[1]?.toLowerCase();
  if (!fromDomain || !to.includes("@")) {
    throw new ApiError(422, "invalid_request", "from and to must be valid email addresses.", { retryable: false });
  }

  const domain = await env.DB.prepare(
    "SELECT id, status FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?",
  )
    .bind(workspaceId, fromDomain)
    .first<{ id: string; status: string }>();
  if (!domain || domain.status !== "verified") {
    throw new ApiError(403, "sender_not_verified", "Complete domain verification before sending from this address.", {
      retryable: false,
    });
  }

  const everyone = [...recipients, ...cc, ...bcc];
  if (everyone.length > PROVIDER_LIMITS.recipientsPerMessage) {
    throw new ApiError(
      422,
      "too_many_recipients",
      `A message can include ${PROVIDER_LIMITS.recipientsPerMessage} recipients across To, Cc, and Bcc.`,
      { retryable: false },
    );
  }
  const payloadBytes = new TextEncoder().encode(`${input.subject}\n${input.html ?? ""}\n${input.text ?? ""}`).byteLength;
  if (payloadBytes > PROVIDER_LIMITS.messageBytes) {
    throw new ApiError(422, "content_too_large", "This message is over 5 MiB. Reduce the body and try again.", {
      retryable: false,
    });
  }
  const suppressed = await env.DB.prepare(
    `SELECT email_normalized FROM sending_suppressions WHERE workspace_id = ? AND email_normalized IN (${everyone.map(() => "?").join(",")})`,
  )
    .bind(workspaceId, ...everyone)
    .first<{ email_normalized: string }>();
  const units = Math.max(1, input.units ?? everyone.length);
  if (!suppressed) {
    await assertCanSend(env.DB, workspaceId, units);
  }
  const sendId = `em_${id().replace(/-/g, "").slice(0, 20)}`;
  const now = nowIso();
  const status = suppressed ? "rejected" : "accepted";
  await env.DB.prepare(
    `INSERT INTO send_requests
      (id, workspace_id, idempotency_key, status, from_address, to_address, subject, html, text_body, quota_units, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(sendId, workspaceId, input.idempotencyKey, status, fromEmail, to, input.subject, input.html ?? null, input.text ?? null, units, now, now)
    .run();
  await addEvent(env.DB, workspaceId, sendId, "email.accepted", "Send intent stored.");
  if (suppressed) {
    await addEvent(env.DB, workspaceId, sendId, "email.rejected", "Recipient is on the suppression list.");
    await notify(env.DB, {
      workspaceId,
      eventKey: `email.rejected:${sendId}`,
      title: "A recipient was rejected",
      body: `${to} is on the suppression list.`,
      severity: "warning",
      actionUrl: "/app/emails",
    });
    return { id: sendId, status, replayed: false };
  }

  const provider = getMailProvider(env);
  const text = input.text || input.html?.replace(/<[^>]+>/g, " ") || input.subject;
  const result = await provider.sendTransactional({
    to: recipients,
    cc,
    bcc,
    replyTo: input.replyTo,
    subject: input.subject,
    text,
    html: input.html,
    purpose: "compose",
    from: fromEmail,
    workspaceId,
  });
  if (result.ok) {
    const queued = !provider.mock;
    if (queued) {
      await env.DB.prepare("UPDATE send_requests SET status = 'queued', provider_id = ?, updated_at = ? WHERE id = ?")
        .bind(result.messageId ?? null, nowIso(), sendId)
        .run();
    }
    await addEvent(
      env.DB,
      workspaceId,
      sendId,
      queued ? "email.queued" : "email.submitted",
      queued
        ? "Cloudflare accepted the message and is delivering it."
        : "Mock provider accepted the request. No message left this server.",
    );
    await audit(env.DB, {
      workspaceId,
      event: "sending.accepted",
      resource: sendId,
      result: "success",
      correlationId: input.cid,
    });
    return { id: sendId, status: queued ? "queued" : "accepted", replayed: false, mock: provider.mock };
  }
  await env.DB.prepare("UPDATE send_requests SET status = 'failed', sanitized_error = ?, updated_at = ? WHERE id = ?")
    .bind(result.message, nowIso(), sendId)
    .run();
  await addEvent(env.DB, workspaceId, sendId, "email.failed", result.message);
  await notify(env.DB, {
    workspaceId,
    eventKey: `email.failed:${sendId}`,
    title: "A send failed",
    body: result.message.slice(0, 180),
    severity: "warning",
    actionUrl: "/app/emails",
  });
  return { id: sendId, status: "failed", replayed: false, message: result.message, mock: provider.mock };
}

function relativeTime(iso: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const phrase = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  if (delta < 60_000) return "Just now";
  if (delta < 3600_000) return phrase(Math.floor(delta / 60_000), "minute");
  if (delta < 86400_000) return phrase(Math.floor(delta / 3600_000), "hour");
  return new Date(iso).toISOString().slice(0, 10);
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function blockedWebhookHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

type StoredTemplate = { id: string; name: string; subject: string; html: string | null; text_body: string | null };

function presentTemplates(savedByName: Map<string, StoredTemplate>): MailTemplate[] {
  const starters = STARTER_TEMPLATES.map((starter) => {
    const saved = savedByName.get(starter.name);
    if (!saved) return starter;
    return {
      id: saved.id,
      name: saved.name,
      subject: saved.subject,
      html: saved.html || starter.html,
      text: saved.text_body || starter.text,
      starter: true,
    };
  });
  const custom = [...savedByName.values()]
    .filter((row) => !STARTER_TEMPLATES.some((starter) => starter.name === row.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      subject: row.subject,
      html: row.html || "",
      text: row.text_body || "",
      starter: false,
    }));
  return [...starters, ...custom];
}

function cleanTemplateInput(body: { name?: string; subject?: string; html?: string; text?: string }) {
  const name = (body.name ?? "").trim().replace(/\s+/g, " ");
  const subject = (body.subject ?? "").trim();
  const html = (body.html ?? "").trim();
  const text = (body.text ?? "").trim();
  if (name.length < 2 || name.length > 60 || !/^[\p{L}\p{N} .,'’&+-]+$/u.test(name)) {
    throw new ApiError(400, "VALIDATION", "Name the template in 2 to 60 letters.", { retryable: false });
  }
  if (!subject || subject.length > 200) {
    throw new ApiError(400, "VALIDATION", "Enter a subject of 200 characters or fewer.", { retryable: false });
  }
  if (!html && !text) {
    throw new ApiError(400, "VALIDATION", "Add an HTML body or a plain-text body.", { retryable: false });
  }
  if (html.length > 100_000 || text.length > 20_000) {
    throw new ApiError(400, "VALIDATION", "This template is too long to store.", { retryable: false });
  }
  if (unsafeTemplateHtml(html)) {
    throw new ApiError(400, "VALIDATION", "Remove scripts and inline event handlers from the HTML.", { retryable: false });
  }
  return { name, subject, html, text };
}

async function saveTemplate(
  db: D1Database,
  workspaceId: string,
  body: { id?: string | null; name?: string; subject?: string; html?: string; text?: string },
) {
  const draft = cleanTemplateInput(body);
  const now = nowIso();
  if (body.id) {
    const existing = await db
      .prepare("SELECT id, name FROM sending_templates WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, body.id)
      .first<{ id: string; name: string }>();
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Template not found.", { retryable: false });
    const name = STARTER_TEMPLATES.some((starter) => starter.name === existing.name) ? existing.name : draft.name;
    const clash = await db
      .prepare("SELECT id FROM sending_templates WHERE workspace_id = ? AND name = ? AND id != ?")
      .bind(workspaceId, name, existing.id)
      .first();
    if (clash) throw new ApiError(409, "DUPLICATE", "A template with this name already exists.", { retryable: false });
    await db
      .prepare("UPDATE sending_templates SET name = ?, subject = ?, html = ?, text_body = ?, updated_at = ? WHERE id = ?")
      .bind(name, draft.subject, draft.html, draft.text, now, existing.id)
      .run();
    return { id: existing.id, name, subject: draft.subject, html: draft.html, text: draft.text, starter: STARTER_TEMPLATES.some((starter) => starter.name === name) };
  }
  const count = await db.prepare("SELECT COUNT(*) as n FROM sending_templates WHERE workspace_id = ?").bind(workspaceId).first<{ n: number }>();
  if ((count?.n ?? 0) >= 30) {
    throw new ApiError(403, "PLAN_LIMIT", "This workspace can store 30 templates. Remove one to add another.", { retryable: false });
  }
  const clash = await db.prepare("SELECT id FROM sending_templates WHERE workspace_id = ? AND name = ?").bind(workspaceId, draft.name).first();
  if (clash) throw new ApiError(409, "DUPLICATE", "A template with this name already exists.", { retryable: false });
  const templateId = id();
  await db
    .prepare(
      `INSERT INTO sending_templates (id, workspace_id, name, subject, html, text_body, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(templateId, workspaceId, draft.name, draft.subject, draft.html, draft.text, now)
    .run();
  return {
    id: templateId,
    name: draft.name,
    subject: draft.subject,
    html: draft.html,
    text: draft.text,
    starter: STARTER_TEMPLATES.some((starter) => starter.name === draft.name),
  };
}

async function contentFromTemplate(
  db: D1Database,
  workspaceId: string,
  body: { template?: string; variables?: unknown; subject?: string; html?: string; text?: string },
) {
  const requested = body.template?.trim();
  if (!requested) return { subject: body.subject, html: body.html, text: body.text };
  const parsed = readTemplateVariables(body.variables);
  if (!parsed.ok) throw new ApiError(422, "invalid_request", parsed.message, { retryable: false });
  const row = await db
    .prepare("SELECT name, subject, html, text_body FROM sending_templates WHERE workspace_id = ? AND name = ?")
    .bind(workspaceId, requested)
    .first<{ name: string; subject: string; html: string | null; text_body: string | null }>();
  const starter = STARTER_TEMPLATES.find((item) => item.name === requested);
  if (!row && !starter) throw new ApiError(422, "invalid_request", "That template was not found.", { retryable: false });
  const source = {
    subject: row?.subject || starter?.subject || "",
    html: row?.html || starter?.html || "",
    text: row?.text_body || starter?.text || "",
  };
  return {
    subject: body.subject || renderTemplate(source.subject, parsed.variables),
    html: body.html || renderTemplate(source.html, parsed.variables, "html") || undefined,
    text: body.text || renderTemplate(source.text, parsed.variables) || undefined,
  };
}

async function stripeCall<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    throw new ApiError(502, "BILLING_FAILED", err instanceof Error ? err.message : "Stripe could not complete that billing request.", {
      retryable: true,
    });
  }
}

function appOrigin(env: Env, requestUrl: string) {
  const configured = env.APP_ORIGIN?.trim();
  return (configured || new URL(requestUrl).origin).replace(/\/$/, "");
}

export async function changeWorkspacePlan(
  env: Env,
  db: D1Database,
  input: { workspaceId: string; email: string; plan: ReturnType<typeof normalizePlan>; origin: string },
) {
  await ensureSubscription(db, input.workspaceId);
  const row = await db
    .prepare("SELECT plan, status, external_ref, stripe_customer_id FROM subscriptions WHERE workspace_id = ?")
    .bind(input.workspaceId)
    .first<{ plan: string; status: string; external_ref: string | null; stripe_customer_id: string | null }>();
  const currentPlan = normalizePlan(row?.plan);
  const entitled = effectiveSendingPlan(currentPlan, row?.status);
  if (input.plan === "sandbox") {
    if (row?.external_ref && stripeConfigured(env)) {
      await stripeCall(() => stripeCancelAtPeriodEnd(env, row.external_ref!));
      return {
        plan: currentPlan,
        status: row.status,
        entitled,
        message: `${PLAN_CATALOG[currentPlan].label} stays active until the current Stripe period ends.`,
      };
    }
    await db
      .prepare("UPDATE subscriptions SET plan = 'sandbox', status = 'active', provider = 'mock', updated_at = ? WHERE workspace_id = ?")
      .bind(nowIso(), input.workspaceId)
      .run();
    return { plan: "sandbox", status: "active", entitled: "sandbox", message: "Sandbox is active. No payment is required." };
  }
  if (!stripeConfigured(env)) {
    throw new ApiError(503, "BILLING_UNAVAILABLE", "Stripe is not configured yet.", { retryable: false });
  }
  if (!paidPlan(input.plan)) {
    throw new ApiError(400, "VALIDATION", "Choose Sandbox, Launch, or Scale.", { retryable: false });
  }
  const paid = input.plan;
  if (row?.status === "active" && currentPlan === input.plan && row.external_ref) {
    return {
      plan: currentPlan,
      status: "active",
      entitled,
      message: `You are already on ${PLAN_CATALOG[paid].label}.`,
    };
  }
  if (row?.external_ref && row.status === "active") {
    const updated = await stripeCall(() => stripeChangePlan(env, row.external_ref!, paid));
    const status = updated.status === "active" || updated.status === "trialing" ? "active" : "pending";
    await db
      .prepare("UPDATE subscriptions SET plan = ?, status = ?, provider = 'stripe', updated_at = ? WHERE workspace_id = ?")
      .bind(paid, status, nowIso(), input.workspaceId)
      .run();
    return {
      plan: paid,
      status,
      entitled: effectiveSendingPlan(paid, status),
      message: `${PLAN_CATALOG[paid].label} is updated in Stripe. The change is prorated.`,
    };
  }
  const session = await stripeCall(() => stripeCheckout(env, {
    workspaceId: input.workspaceId,
    plan: paid,
    email: input.email,
    origin: input.origin,
    customerId: row?.stripe_customer_id,
  }));
  return {
    plan: currentPlan,
    status: row?.status || "active",
    entitled,
    url: session.url,
    message: `Continue to Stripe to subscribe to ${PLAN_CATALOG[paid].label}.`,
  };
}

export function registerSendingRoutes(app: Hono<{ Bindings: Env; Variables: Variables }>) {
  app.get("/api/sending/workspace", async (c) => {
    const user = await requireSession(c);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const entitlement = await workspaceEntitlement(c.env.DB, workspace.id);
    const retainedAfter = new Date(Date.now() - entitlement.spec.eventRetentionDays * 86_400_000).toISOString();
    const now = new Date();
    const domains = await c.env.DB.prepare(
      "SELECT name, status FROM sending_domains WHERE workspace_id = ? ORDER BY created_at",
    )
      .bind(workspace.id)
      .all<{ name: string; status: string }>();
    const keys = await c.env.DB.prepare(
      "SELECT name, scope, key_tail FROM sending_api_keys WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY created_at",
    )
      .bind(workspace.id)
      .all<{ name: string; scope: string; key_tail: string }>();
    const activitySpan = Math.min(14, Math.max(1, entitlement.spec.eventRetentionDays));
    const activitySince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (activitySpan - 1))).toISOString();
    const activityDays = Array.from({ length: activitySpan }, (_, index) => {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (activitySpan - 1 - index)));
      return day.toISOString().slice(0, 10);
    });
    const [emails, activityRows] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id, to_address, subject, status, sanitized_error, created_at FROM send_requests WHERE workspace_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50",
      )
        .bind(workspace.id, retainedAfter)
        .all<{ id: string; to_address: string; subject: string; status: string; sanitized_error: string | null; created_at: string }>(),
      c.env.DB.prepare(
        `SELECT substr(created_at, 1, 10) AS day,
           SUM(CASE WHEN status IN ('accepted', 'queued', 'delivered') THEN quota_units ELSE 0 END) AS accepted,
           SUM(CASE WHEN status NOT IN ('accepted', 'queued', 'delivered') THEN quota_units ELSE 0 END) AS attention
         FROM send_requests
         WHERE workspace_id = ? AND created_at >= ?
         GROUP BY day`,
      )
        .bind(workspace.id, activitySince)
        .all<{ day: string; accepted: number; attention: number }>(),
    ]);
    const suppressions = await c.env.DB.prepare(
      "SELECT email_normalized FROM sending_suppressions WHERE workspace_id = ? ORDER BY created_at DESC",
    )
      .bind(workspace.id)
      .all<{ email_normalized: string }>();
    const hooks = await c.env.DB.prepare(
      "SELECT id, url, status FROM sending_webhooks WHERE workspace_id = ? ORDER BY created_at",
    )
      .bind(workspace.id)
      .all<{ id: string; url: string; status: string }>();
    const [emailsToday, emailsMonth, savedTemplates, notes, members, invitations] = await Promise.all([
      countSendsSince(c.env.DB, workspace.id, utcDayStart(now)),
      countSendsSince(c.env.DB, workspace.id, utcMonthStart(now)),
      c.env.DB.prepare("SELECT id, name, subject, html, text_body FROM sending_templates WHERE workspace_id = ? ORDER BY name")
        .bind(workspace.id)
        .all<{ id: string; name: string; subject: string; html: string | null; text_body: string | null }>(),
      c.env.DB.prepare(
        "SELECT title, body, action_url FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20",
      )
        .bind(workspace.id)
        .all<{ title: string; body: string; action_url: string | null }>(),
      c.env.DB.prepare(
        `SELECT u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?`,
      )
        .bind(workspace.id)
        .all<{ name: string; email: string; role: string }>(),
      c.env.DB.prepare(
        `SELECT email, role, status FROM invitations WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at DESC`,
      )
        .bind(workspace.id)
        .all<{ email: string; role: string; status: string }>(),
    ]);
    const savedByName = new Map((savedTemplates.results ?? []).map((row) => [row.name, row]));
    return c.json({
      product: "sending",
      operator: isOperator(c.env, user.email),
      user: { id: user.id, name: user.name, email: user.email, accountStatus: user.account_status },
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        role: workspace.role,
        sendingHold: (
          await c.env.DB.prepare("SELECT sending_hold_reason FROM workspaces WHERE id = ?")
            .bind(workspace.id)
            .first<{ sending_hold_reason: string | null }>()
        )?.sending_hold_reason
          ? SENDING_HOLD_MESSAGE
          : null,
      },
      provider: providerStatus(c.env),
      live: !providerStatus(c.env).mock,
      plan: {
        id: entitlement.entitled,
        label: entitlement.spec.label,
        requested: entitlement.requested,
        status: entitlement.status,
        entitled: entitlement.entitled,
      },
      billing: {
        provider: entitlement.status === "active" && entitlement.requested !== "sandbox" ? "stripe" : "none",
        manage: Boolean(
          (
            await c.env.DB.prepare("SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = ?")
              .bind(workspace.id)
              .first<{ stripe_customer_id: string | null }>()
          )?.stripe_customer_id,
        ),
      },
      limits: {
        domains: entitlement.spec.domainLimit,
        emailsPerDay: entitlement.spec.emailsPerDay,
        emailsPerMonth: entitlement.spec.emailsPerMonth,
        apiKeys: entitlement.spec.apiKeyLimit,
        webhooks: entitlement.spec.webhookLimit,
        eventRetentionDays: entitlement.spec.eventRetentionDays,
        rateLimitPerSecond: entitlement.spec.rateLimitPerSecond,
        teamRoles: entitlement.spec.teamRoles,
      },
      usage: {
        domains: (domains.results ?? []).length,
        emailsToday,
        emailsMonth,
        apiKeys: (keys.results ?? []).length,
        webhooks: (hooks.results ?? []).length,
      },
      domains: await Promise.all(
        (domains.results ?? []).map(async (d) => {
          const host = await inspectDnsHost(d.name);
          return {
            name: d.name,
            status: d.status === "verified" ? "Verified" : d.status === "failed" ? "Failed" : "Pending",
            host: host.label,
            provider: host.provider,
            nameservers: host.nameservers,
          };
        }),
      ),
      keys: (keys.results ?? []).map((k) => ({ name: k.name, scope: scopeLabel(k.scope), tail: k.key_tail })),
      hooks: (hooks.results ?? []).map((h) => ({
        id: h.id,
        url: h.url,
        status: h.status === "active" ? "Active" : "Paused",
      })),
      emails: (emails.results ?? []).map((e) => ({
        id: e.id,
        to: e.to_address,
        subject: e.subject,
        status: statusLabel(e.status),
        time: relativeTime(e.created_at),
        detail: e.sanitized_error,
      })),
      activity: activityDays.map((date) => {
        const row = (activityRows.results ?? []).find((item) => item.day === date);
        return { date, accepted: Number(row?.accepted ?? 0), attention: Number(row?.attention ?? 0) };
      }),
      suppressions: (suppressions.results ?? []).map((s) => s.email_normalized),
      templates: presentTemplates(savedByName),
      notifications: (notes.results ?? []).map((row) => ({
        title: row.title,
        body: row.body,
        actionUrl: row.action_url,
      })),
      members: members.results ?? [],
      invitations: invitations.results ?? [],
    });
  });

  app.patch("/api/sending/workspace", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim() ?? "";
    if (name.length < 2) throw new ApiError(400, "VALIDATION", "Enter a workspace name.", { retryable: false });
    await c.env.DB.prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?").bind(name, nowIso(), workspace.id).run();
    return c.json({ ok: true, name });
  });

  app.post("/api/sending/domains", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ name?: string }>();
    let name: string;
    try {
      name = normalizeDomain(body.name ?? "");
    } catch {
      throw new ApiError(400, "VALIDATION", "Enter a domain such as send.yourcompany.com, without https://.", {
        retryable: false,
      });
    }
    if (!DOMAIN_RE.test(name)) {
      throw new ApiError(400, "VALIDATION", "Enter a domain such as send.yourcompany.com, without https://.", {
        retryable: false,
      });
    }
    const taken = await c.env.DB.prepare("SELECT workspace_id FROM sending_domains WHERE name_normalized = ?")
      .bind(name)
      .first<{ workspace_id: string }>();
    if (taken?.workspace_id === workspace.id) {
      throw new ApiError(409, "DUPLICATE", "This domain is already in your workspace.", { retryable: false });
    }
    if (taken) {
      throw new ApiError(409, "DOMAIN_OWNED", "This domain is already claimed by another workspace.", { retryable: false });
    }
    const { spec } = await workspaceEntitlement(c.env.DB, workspace.id);
    const domainCount = await c.env.DB.prepare("SELECT COUNT(*) as n FROM sending_domains WHERE workspace_id = ?")
      .bind(workspace.id)
      .first<{ n: number }>();
    if ((domainCount?.n ?? 0) >= spec.domainLimit) {
      throw new ApiError(
        403,
        "PLAN_LIMIT",
        `${spec.label} includes ${spec.domainLimit} sending domains. Remove one or upgrade to add more.`,
        { retryable: false },
      );
    }
    const token = rawToken().slice(0, 20);
    const now = nowIso();
    const onboard = await onboardSendingDomain(c.env, name).catch((err) => ({
      message: err instanceof Error ? err.message : "Could not contact Email Sending.",
    }));
    await c.env.DB.prepare(
      `INSERT INTO sending_domains (id, workspace_id, name, name_normalized, status, verify_token, provider_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    )
      .bind(id(), workspace.id, name, name, token, JSON.stringify(onboard), now, now)
      .run();
    await notify(c.env.DB, {
      workspaceId: workspace.id,
      eventKey: `domain.added:${name}`,
      title: "Domain added",
      body: `${name} needs DNS records before you can send.`,
      severity: "info",
      actionUrl: "/app/domains",
    });
    const dnsHost = await inspectDnsHost(name);
    return c.json({
      name,
      status: "Pending",
      records: sendingRecords(name, token, onboard),
      onboard,
      host: {
        provider: dnsHost.provider,
        label: dnsHost.label,
        nameservers: dnsHost.nameservers,
        zone: dnsHost.zone,
        connected: Boolean(await workspaceCloudflareToken(c.env.DB, workspace.id)),
        canApply: false,
        oauth: true,
        domainConnect: domainConnectLive(c.env),
      },
    });
  });

  app.get("/api/sending/domains/:name", async (c) => {
    const user = await requireSession(c);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const name = c.req.param("name").toLowerCase();
    const domain = await c.env.DB.prepare(
      "SELECT * FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?",
    )
      .bind(workspace.id, name)
      .first<Record<string, string>>();
    if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.", { retryable: false });
    const onboard = parseOnboard(domain.provider_json);
    const dnsHost = await inspectDnsHost(domain.name);
    const canApply = Boolean(onboard?.dnsApplied);
    return c.json({
      name: domain.name,
      status: domain.status === "verified" ? "Verified" : "Pending",
      records: sendingRecords(domain.name, domain.verify_token, onboard),
      lastCheck: domain.last_check_json ? JSON.parse(domain.last_check_json) : null,
      onboard,
      host: {
        provider: dnsHost.provider,
        label: dnsHost.label,
        nameservers: dnsHost.nameservers,
        zone: dnsHost.zone,
        connected: Boolean(await workspaceCloudflareToken(c.env.DB, workspace.id)),
        canApply,
        oauth: true,
        domainConnect: domainConnectLive(c.env),
      },
    });
  });

  app.get("/api/sending/domains/:name/domain-connect", async (c) => {
    const user = await requireSession(c);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const name = c.req.param("name").toLowerCase();
    const domain = await c.env.DB.prepare(
      "SELECT * FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?",
    )
      .bind(workspace.id, name)
      .first<Record<string, string>>();
    if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.", { retryable: false });
    const origin = (c.env.APP_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, "");
    await ensureDomainConnectPublicKey(c.env).catch(() => undefined);
    return c.json({
      available: true,
      url: await domainConnectApplyUrl(origin, domain.name, domain.verify_token, c.env.DOMAIN_CONNECT_PRIVATE_KEY),
    });
  });

  app.post("/api/sending/cloudflare", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ token?: string }>();
    const token = body.token?.trim() || "";
    if (token.length < 20) {
      throw new ApiError(400, "VALIDATION", "Paste a Cloudflare API token with Zone DNS Edit.", { retryable: false });
    }
    if (!(await verifyCloudflareToken(token))) {
      throw new ApiError(400, "INVALID_TOKEN", "Cloudflare rejected that token. Create an Edit zone DNS token and try again.", {
        retryable: false,
      });
    }
    await saveCloudflareToken(c.env.DB, workspace.id, token);
    await audit(c.env.DB, {
      actorUserId: user.id,
      workspaceId: workspace.id,
      event: "cloudflare.connected",
      result: "success",
      correlationId: c.get("cid"),
    });
    return c.json({ connected: true, oauth: Boolean(c.env.CLOUDFLARE_OAUTH_CLIENT_ID?.trim()) });
  });

  app.delete("/api/sending/cloudflare", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    await c.env.DB.prepare("DELETE FROM workspace_integrations WHERE workspace_id = ? AND provider = 'cloudflare'")
      .bind(workspace.id)
      .run();
    return c.json({ connected: false });
  });

  app.post("/api/sending/domains/:name/apply-dns", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const name = c.req.param("name").toLowerCase();
    const domain = await c.env.DB.prepare(
      "SELECT * FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?",
    )
      .bind(workspace.id, name)
      .first<Record<string, string>>();
    if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.", { retryable: false });
    const token = await dnsApplyToken(c.env, c.env.DB, workspace.id, domain.name);
    if (!token) {
      throw new ApiError(400, "CLOUDFLARE_REQUIRED", "Connect Cloudflare first so we can add the records for you.", {
        retryable: false,
      });
    }
    const onboard = parseOnboard(domain.provider_json);
    const records = sendingRecords(domain.name, domain.verify_token, onboard);
    const applied = await applySendingDns(token, domain.name, records);
    if (!applied.ok) {
      throw new ApiError(400, "DNS_APPLY_FAILED", applied.message, { retryable: false });
    }
    await c.env.DB.prepare("UPDATE sending_domains SET provider_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify({ ...onboard, dnsApplied: true }), nowIso(), domain.id)
      .run();
    await audit(c.env.DB, {
      actorUserId: user.id,
      workspaceId: workspace.id,
      event: "domain.dns_applied",
      resource: domain.name,
      result: "success",
      correlationId: c.get("cid"),
    });
    return c.json(applied);
  });

  app.post("/api/sending/domains/:name/verify", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const name = c.req.param("name").toLowerCase();
    const domain = await c.env.DB.prepare(
      "SELECT * FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?",
    )
      .bind(workspace.id, name)
      .first<Record<string, string>>();
    if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.", { retryable: false });
    const onboard = await onboardSendingDomain(c.env, domain.name).catch((err) => ({
      message: err instanceof Error ? err.message : "Could not contact Email Sending.",
      ...parseOnboard(domain.provider_json),
    }));
    const { checks, verified } = await verifySendingDns(domain.name, domain.verify_token);
    const now = nowIso();
    await c.env.DB.prepare(
      "UPDATE sending_domains SET status = ?, last_check_json = ?, provider_json = ?, verified_at = ?, updated_at = ? WHERE id = ?",
    )
      .bind(
        verified ? "verified" : "pending",
        JSON.stringify({ checks, checkedAt: now, onboard }),
        JSON.stringify(onboard),
        verified ? now : null,
        now,
        domain.id,
      )
      .run();
    const failed = Object.values(checks).some((item) => item.status === "conflict" || item.status === "error");
    return c.json({
      name: domain.name,
      status: verified ? "Verified" : failed ? "Failed" : "Pending",
      check: checks.ownership,
      checks,
      onboard,
      records: sendingRecords(domain.name, domain.verify_token, onboard),
    });
  });

  app.delete("/api/sending/domains/:name", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const name = c.req.param("name").toLowerCase();
    await c.env.DB.prepare("DELETE FROM sending_domains WHERE workspace_id = ? AND name_normalized = ?")
      .bind(workspace.id, name)
      .run();
    return c.json({ ok: true });
  });

  app.post("/api/sending/api-keys", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ name?: string; scope?: string }>();
    const name = body.name?.trim() ?? "";
    if (!name) throw new ApiError(400, "VALIDATION", "Give this key a name.", { retryable: false });
    const { spec } = await workspaceEntitlement(c.env.DB, workspace.id);
    const keyCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM sending_api_keys WHERE workspace_id = ? AND revoked_at IS NULL",
    )
      .bind(workspace.id)
      .first<{ n: number }>();
    if ((keyCount?.n ?? 0) >= spec.apiKeyLimit) {
      throw new ApiError(
        403,
        "PLAN_LIMIT",
        `${spec.label} includes ${spec.apiKeyLimit} API keys. Revoke one or upgrade to add more.`,
        { retryable: false },
      );
    }
    const secret = `pl_live_${rawToken()}`;
    const tail = secret.slice(-4);
    await c.env.DB.prepare(
      `INSERT INTO sending_api_keys (id, workspace_id, name, key_hash, key_prefix, key_tail, scope, created_at)
       VALUES (?, ?, ?, ?, 'pl_live_', ?, ?, ?)`,
    )
      .bind(id(), workspace.id, name, await sha256(secret), tail, mapScope(body.scope ?? "send"), nowIso())
      .run();
    return c.json({ name, scope: scopeLabel(mapScope(body.scope ?? "send")), tail, secret });
  });

  app.delete("/api/sending/api-keys/:tail", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    await c.env.DB.prepare(
      "UPDATE sending_api_keys SET revoked_at = ? WHERE workspace_id = ? AND key_tail = ? AND revoked_at IS NULL",
    )
      .bind(nowIso(), workspace.id, c.req.param("tail"))
      .run();
    return c.json({ ok: true });
  });

  app.post("/api/sending/plan", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ plan?: string }>();
    const plan = normalizePlan(body.plan);
    const result = await changeWorkspacePlan(c.env, c.env.DB, {
      workspaceId: workspace.id,
      email: user.email,
      plan,
      origin: appOrigin(c.env, c.req.url),
    });
    return c.json(result);
  });

  app.post("/api/sending/billing/portal", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    if (!stripeConfigured(c.env)) {
      throw new ApiError(503, "BILLING_UNAVAILABLE", "Stripe is not configured yet.", { retryable: false });
    }
    const row = await c.env.DB.prepare("SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = ?")
      .bind(workspace.id)
      .first<{ stripe_customer_id: string | null }>();
    if (!row?.stripe_customer_id) {
      throw new ApiError(409, "BILLING_REQUIRED", "Subscribe before managing a payment method.", { retryable: false });
    }
    const portal = await stripeCall(() => stripePortal(c.env, row.stripe_customer_id!, appOrigin(c.env, c.req.url)));
    return c.json({ url: portal.url });
  });

  app.post("/api/sending/webhooks", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ url?: string }>();
    let parsed: URL;
    try {
      parsed = new URL(body.url ?? "");
      if (parsed.protocol !== "https:" || blockedWebhookHost(parsed.hostname)) throw new Error("https");
    } catch {
      throw new ApiError(400, "VALIDATION", "Use a public HTTPS endpoint.", { retryable: false });
    }
    const url = parsed.toString();
    const existing = await c.env.DB.prepare("SELECT id FROM sending_webhooks WHERE workspace_id = ? AND url = ?")
      .bind(workspace.id, url)
      .first();
    if (existing) throw new ApiError(409, "DUPLICATE", "This endpoint already exists.", { retryable: false });
    const { spec } = await workspaceEntitlement(c.env.DB, workspace.id);
    const hookCount = await c.env.DB.prepare("SELECT COUNT(*) as n FROM sending_webhooks WHERE workspace_id = ?")
      .bind(workspace.id)
      .first<{ n: number }>();
    if ((hookCount?.n ?? 0) >= spec.webhookLimit) {
      throw new ApiError(
        403,
        "PLAN_LIMIT",
        `${spec.label} includes ${spec.webhookLimit} webhook endpoint${spec.webhookLimit === 1 ? "" : "s"}. Remove one or upgrade to add more.`,
        { retryable: false },
      );
    }
    const hookId = id();
    await c.env.DB.prepare("INSERT INTO sending_webhooks (id, workspace_id, url, status, created_at) VALUES (?, ?, ?, 'active', ?)")
      .bind(hookId, workspace.id, url, nowIso())
      .run();
    return c.json({ id: hookId, url, status: "Active" });
  });

  app.delete("/api/sending/webhooks/:id", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    await c.env.DB.prepare("DELETE FROM sending_webhooks WHERE workspace_id = ? AND id = ?")
      .bind(workspace.id, c.req.param("id"))
      .run();
    return c.json({ ok: true });
  });

  app.post("/api/sending/webhooks/:id/test", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const hook = await c.env.DB.prepare("SELECT id, url FROM sending_webhooks WHERE workspace_id = ? AND id = ?")
      .bind(workspace.id, c.req.param("id"))
      .first<{ id: string; url: string }>();
    if (!hook) throw new ApiError(404, "NOT_FOUND", "Webhook not found.", { retryable: false });
    let parsed: URL;
    try {
      parsed = new URL(hook.url);
    } catch {
      throw new ApiError(400, "VALIDATION", "This endpoint URL is not valid.", { retryable: false });
    }
    if (parsed.protocol !== "https:" || blockedWebhookHost(parsed.hostname)) {
      throw new ApiError(400, "VALIDATION", "Webhook tests only go to public HTTPS endpoints.", { retryable: false });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(parsed.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Postlane-Webhook-Test" },
        body: JSON.stringify({
          type: "email.delivered",
          created_at: nowIso(),
          data: { id: "em_test", to: "alex@example.com", subject: "Webhook test" },
        }),
        signal: controller.signal,
        redirect: "error",
      });
      return c.json({ ok: res.ok, status: res.status });
    } catch {
      throw new ApiError(502, "WEBHOOK_UNREACHABLE", "The endpoint did not accept the test event.", { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post("/api/sending/templates", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ id?: string | null; name?: string; subject?: string; html?: string; text?: string }>();
    const saved = await saveTemplate(c.env.DB, workspace.id, body);
    return c.json(saved);
  });

  app.delete("/api/sending/templates/:id", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const existing = await c.env.DB.prepare("SELECT name FROM sending_templates WHERE workspace_id = ? AND id = ?")
      .bind(workspace.id, c.req.param("id"))
      .first<{ name: string }>();
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Template not found.", { retryable: false });
    await c.env.DB.prepare("DELETE FROM sending_templates WHERE workspace_id = ? AND id = ?")
      .bind(workspace.id, c.req.param("id"))
      .run();
    const starter = STARTER_TEMPLATES.find((item) => item.name === existing.name);
    return c.json({ ok: true, restored: starter ?? null });
  });

  app.post("/api/sending/suppressions", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ email?: string }>();
    const email = normalizeEmail(body.email ?? "");
    if (!email.includes("@")) throw new ApiError(400, "VALIDATION", "Enter a valid email address.", { retryable: false });
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO sending_suppressions (id, workspace_id, email_normalized, reason, provenance, created_at)
       VALUES (?, ?, ?, 'manual', 'dashboard', ?)`,
    )
      .bind(id(), workspace.id, email, nowIso())
      .run();
    return c.json({ email });
  });

  app.delete("/api/sending/suppressions/:email", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    await c.env.DB.prepare("DELETE FROM sending_suppressions WHERE workspace_id = ? AND email_normalized = ?")
      .bind(workspace.id, normalizeEmail(c.req.param("email")))
      .run();
    return c.json({ ok: true });
  });

  app.post("/api/contact", async (c) => {
    const body = await c.req.json<{ name?: string; email?: string; message?: string; website?: string }>().catch(() => null);
    if (!body || body.website?.trim()) return c.json({ ok: true });
    const name = (body.name || "").trim().replace(/\s+/g, " ");
    const email = normalizeEmail(body.email || "");
    const message = (body.message || "").trim();
    if (name.length < 2 || name.length > 80) {
      throw new ApiError(400, "VALIDATION", "Enter your name.", { retryable: false });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
      throw new ApiError(400, "VALIDATION", "Enter a valid email address.", { retryable: false });
    }
    if (message.length < 5 || message.length > 4000) {
      throw new ApiError(400, "VALIDATION", "Write a short message.", { retryable: false });
    }
    const domain = await c.env.DB.prepare(
      "SELECT workspace_id FROM sending_domains WHERE name_normalized = 'pdfzavi.com' AND status = 'verified'",
    ).first<{ workspace_id: string }>();
    if (!domain) {
      throw new ApiError(503, "SENDER_NOT_READY", "This form cannot send yet.", { retryable: true });
    }
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await c.env.DB.prepare(
      "SELECT COUNT(*) as n FROM send_requests WHERE workspace_id = ? AND from_address = ? AND created_at > ?",
    )
      .bind(domain.workspace_id, "noreply@pdfzavi.com", since)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= 8) {
      throw new ApiError(429, "RATE_LIMITED", "Too many messages. Try again in a little while.", { retryable: true });
    }
    const result = await acceptSend(c.env, domain.workspace_id, {
      from: "noreply@pdfzavi.com",
      to: "info@tmdspace.com",
      replyTo: email,
      subject: `Contact form: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      idempotencyKey: id(),
      cid: c.get("cid"),
      units: 1,
    });
    if (result.status === "failed") {
      throw new ApiError(502, "SEND_FAILED", result.message || "Could not send the message.", { retryable: true });
    }
    return c.json({ ok: true, id: result.id, status: result.status });
  });

  app.post("/api/sending/emails", async (c) => {
    const user = await requireSession(c, true);
    const workspace = await ensureWorkspace(c.env.DB, user);
    const body = await c.req.json<{ to?: string; subject?: string; from?: string; html?: string; text?: string; template?: string; variables?: unknown }>();
    const content = await contentFromTemplate(c.env.DB, workspace.id, body);
    const domain = await c.env.DB.prepare(
      "SELECT name FROM sending_domains WHERE workspace_id = ? AND status = 'verified' ORDER BY verified_at DESC LIMIT 1",
    )
      .bind(workspace.id)
      .first<{ name: string }>();
    if (!domain) throw new ApiError(403, "sender_not_verified", "Verify a sending domain first.", { retryable: false });
    const key = await c.env.DB.prepare(
      "SELECT id FROM sending_api_keys WHERE workspace_id = ? AND revoked_at IS NULL LIMIT 1",
    )
      .bind(workspace.id)
      .first();
    if (!key) throw new ApiError(403, "insufficient_scope", "Create an API key before sending.", { retryable: false });
    const result = await acceptSend(c.env, workspace.id, {
      from: body.from || `hello@${domain.name}`,
      to: body.to ?? "",
      subject: content.subject || "Welcome to the good part",
      html: content.html || (body.to ? `<h1>${escapeHtml(content.subject || "Welcome to the good part")}</h1><p>This is a Postlane test send.</p>` : undefined),
      text: content.text,
      idempotencyKey: c.req.header("Idempotency-Key") || id(),
      cid: c.get("cid"),
      units: 1,
    });
    return c.json(result, 202);
  });

  app.get("/v1/emails/:id", async (c) => {
    const auth = await authorizeKey(c);
    if (auth instanceof Response) return auth;
    const row = await c.env.DB.prepare("SELECT * FROM send_requests WHERE workspace_id = ? AND id = ?")
      .bind(auth.workspaceId, c.req.param("id"))
      .first<Record<string, string>>();
    if (!row) return v1Error(c, 404, "not_found", "Email not found.");
    const events = await c.env.DB.prepare(
      "SELECT type, detail, created_at FROM send_events WHERE send_request_id = ? ORDER BY created_at",
    )
      .bind(row.id)
      .all();
    return c.json({
      id: row.id,
      status: row.status,
      from: row.from_address,
      to: row.to_address,
      subject: row.subject,
      created_at: row.created_at,
      events: events.results ?? [],
    });
  });

  app.get("/v1/emails", async (c) => {
    const auth = await authorizeKey(c);
    if (auth instanceof Response) return auth;
    if (auth.scope === "send") return v1Error(c, 403, "insufficient_scope", "This key cannot read activity.");
    const { spec } = await workspaceEntitlement(c.env.DB, auth.workspaceId);
    const retainedAfter = new Date(Date.now() - spec.eventRetentionDays * 86_400_000).toISOString();
    const { results } = await c.env.DB.prepare(
      "SELECT id, status, from_address, to_address, subject, created_at FROM send_requests WHERE workspace_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(auth.workspaceId, retainedAfter)
      .all();
    return c.json({ data: results });
  });

  app.post("/v1/emails", async (c) => {
    const auth = await authorizeKey(c);
    if (auth instanceof Response) return auth;
    if (!canSend(auth.scope)) return v1Error(c, 403, "insufficient_scope", "This key cannot send email.");
    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) return v1Error(c, 422, "invalid_request", "Idempotency-Key is required.");
    const body = await c.req.json<{
      from?: string;
      to?: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      reply_to?: string;
      replyTo?: string;
      subject?: string;
      html?: string;
      text?: string;
      template?: string;
      variables?: unknown;
    }>();
    const to = Array.isArray(body.to) ? body.to[0] : body.to;
    let content: { subject?: string; html?: string; text?: string };
    try {
      content = await contentFromTemplate(c.env.DB, auth.workspaceId, body);
    } catch (err) {
      if (err instanceof ApiError) return v1Error(c, err.status, err.code, err.message, err.extras.retryable ?? false);
      return v1Error(c, 503, "provider_unavailable", "Something went wrong. Try again shortly.", true);
    }
    if (!body.from || !to || !content.subject || (!content.html && !content.text)) {
      return v1Error(c, 422, "invalid_request", "from, to, and a subject with html or text are required. A template can supply the subject and body.");
    }
    const units = Math.max(1, recipientCount({ to: body.to, cc: body.cc, bcc: body.bcc }));
    try {
      const result = await acceptSend(c.env, auth.workspaceId, {
        from: body.from,
        to: body.to ?? to,
        cc: body.cc,
        bcc: body.bcc,
        replyTo: body.replyTo || body.reply_to,
        subject: content.subject,
        html: content.html,
        text: content.text,
        idempotencyKey,
        cid: c.get("cid"),
        units,
      });
      return c.json({ id: result.id, status: result.status }, 202);
    } catch (err) {
      if (err instanceof ApiError) {
        return v1Error(c, err.status, err.code, err.message, err.extras.retryable ?? false);
      }
      return v1Error(c, 503, "provider_unavailable", "Something went wrong. Try again shortly.", true);
    }
  });

  app.get("/api/sending/operations", async (c) => {
    const user = await requireSession(c, true);
    if (!isOperator(c.env, user.email)) throw new ApiError(403, "FORBIDDEN", "This account cannot view operations.", { retryable: false });
    return c.json({ workspaces: await listSendingHealth(c.env.DB) });
  });

  app.post("/api/sending/operations/:workspaceId/release", async (c) => {
    const user = await requireSession(c, true);
    if (!isOperator(c.env, user.email)) throw new ApiError(403, "FORBIDDEN", "This account cannot release a pause.", { retryable: false });
    const workspaceId = c.req.param("workspaceId");
    const released = await releaseSendingHold(c.env.DB, workspaceId);
    if (!released) throw new ApiError(404, "NOT_FOUND", "This workspace is not paused.", { retryable: false });
    await audit(c.env.DB, {
      workspaceId,
      actorUserId: user.id,
      event: "sending.hold_released",
      resource: workspaceId,
      result: "success",
      correlationId: c.get("cid"),
    });
    return c.json({ ok: true });
  });
}

async function authorizeKey(c: Ctx) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return v1Error(c, 401, "invalid_api_key", "A bearer API key is required.");
  const row = await c.env.DB.prepare(
    "SELECT workspace_id, scope, revoked_at FROM sending_api_keys WHERE key_hash = ?",
  )
    .bind(await sha256(token))
    .first<{ workspace_id: string; scope: string; revoked_at: string | null }>();
  if (!row || row.revoked_at) return v1Error(c, 401, "invalid_api_key", "This API key is invalid or revoked.");
  return { workspaceId: row.workspace_id, scope: row.scope };
}
