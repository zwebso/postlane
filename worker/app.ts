import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  activationGates,
  canActivateMailbox,
  MAILBOX_RE,
  MIN_PASSWORD,
  normalizeDomain,
  normalizeEmail,
  normalizePlan,
  placeholderPriceCents,
  PLACEHOLDER_QUOTA_MB,
  PLAN_CATALOG,
  slugify,
} from "../shared/domain";
import { checkRequirement, expectedRecords, inspectExistingMail } from "./dns";
import {
  ApiError,
  type AppEnv,
  type AuthedUser,
  audit,
  correlationId,
  hashPassword,
  id,
  isDev,
  jsonError,
  nowIso,
  notify,
  rawToken,
  sha256,
} from "./lib";
import { listMailboxMessages } from "./mail-store";
import { getMailProvider, providerStatus } from "./provider";
import { SYSTEM_MAIL_FROM } from "./providers/spec";
import {
  exchangeGoogleCode,
  googleAuthUrl,
  googleCallbackPath,
  googleConfigured,
  upsertGoogleUser,
} from "./google-auth";
import { ensureSchema } from "./schema";
import { ensureCloudflareOAuthClient, oauthPopupHtml, oauthSetupHtml, saveCloudflareOAuthApp } from "./cloudflare-oauth";
import { ensureDomainConnectPublicKey, sendingTemplate } from "./domain-connect";
import { changeWorkspacePlan, registerSendingRoutes, saveCloudflareToken, workspaceEntitlement } from "./sending";
import { applyStripeEvent, stripeConfigured, stripePortal, verifyStripeSignature, type StripeEvent } from "./stripe";

const SESSION = "postlane_session";
const STAFF = "postlane_staff";
const OAUTH = "postlane_oauth";

type Variables = { cid: string; user?: AuthedUser; staff?: AuthedUser };

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="64" viewBox="0 0 280 64" role="img" aria-label="Postlane"><g fill="#d65a33" transform="translate(8 34) skewX(-16)"><rect x="0" y="-18" width="8" height="28" rx="2"/><rect x="13" y="-13" width="8" height="22" rx="2"/><rect x="26" y="-7" width="8" height="16" rx="2"/></g><text x="64" y="42" fill="#252522" font-family="Manrope, Arial, sans-serif" font-size="32" font-weight="800" letter-spacing="-1.2">postlane</text></svg>`;

app.on(["GET", "HEAD"], "/logo.svg", (c) =>
  c.body(LOGO_SVG, 200, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=86400",
  }),
);

let schemaReady = false;

app.use("*", async (c, next) => {
  c.set("cid", c.req.header("x-correlation-id") || correlationId());
  if (!schemaReady) {
    await ensureSchema(c.env.DB);
    schemaReady = true;
  }
  await next();
});

app.onError((err, c) => {
  const cid = c.get("cid") || correlationId();
  if (err instanceof ApiError) return jsonError(c, err, cid);
  const detail = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ cid, error: detail, stack: err instanceof Error ? err.stack : undefined }));
  return jsonError(c, new ApiError(500, "INTERNAL", "Something went wrong. Try again shortly."), cid);
});

function cookieOpts(c: { req: { url: string } }) {
  const secure = new URL(c.req.url).protocol === "https:";
  return { httpOnly: true, sameSite: "Lax" as const, path: "/", maxAge: 60 * 60 * 24 * 14, secure };
}

type Ctx = import("hono").Context<{ Bindings: Env; Variables: Variables }>;

async function readUser(c: Ctx, kind: "customer" | "staff") {
  const token = getCookie(c, kind === "staff" ? STAFF : SESSION);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.account_status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.kind = ? AND s.expires_at > ?`,
  )
    .bind(hash, kind, nowIso())
    .first<AuthedUser>();
  return row ?? null;
}

async function requireUser(c: Ctx) {
  const user = await readUser(c, "customer");
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  c.set("user", user);
  return user;
}

async function requireStaff(c: Ctx) {
  const staff = await readUser(c, "staff");
  if (!staff) throw new ApiError(401, "UNAUTHENTICATED", "Staff sign-in required.");
  c.set("staff", staff);
  return staff;
}

async function membership(db: D1Database, workspaceId: string, userId: string) {
  const row = await db
    .prepare(
      `SELECT m.workspace_id, m.role, w.slug, w.name
       FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.workspace_id = ? AND m.user_id = ?`,
    )
    .bind(workspaceId, userId)
    .first<{ workspace_id: string; role: string; slug: string; name: string }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Workspace not found.");
  return row;
}

async function workspaceBySlug(db: D1Database, slug: string, userId: string) {
  const row = await db
    .prepare(
      `SELECT w.id, w.slug, w.name, w.recovery_email, w.contact_email, w.timezone, m.role
       FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
       WHERE w.slug = ? AND m.user_id = ?`,
    )
    .bind(slug, userId)
    .first<{
      id: string;
      slug: string;
      name: string;
      recovery_email: string | null;
      contact_email: string | null;
      timezone: string;
      role: string;
    }>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Workspace not found.");
  return row;
}

function requireRole(role: string, allowed: string[]) {
  if (!allowed.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "You don’t have access to this action.");
  }
}

async function createSession(env: Env, userId: string, kind: "customer" | "staff", ua: string | undefined) {
  const token = rawToken();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, kind, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id(), userId, await sha256(token), kind, ua ?? null, new Date(Date.now() + 14 * 864e5).toISOString(), nowIso())
    .run();
  return token;
}

async function createEmailToken(db: D1Database, userId: string, purpose: string) {
  const token = rawToken();
  await db
    .prepare(
      `INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id(), userId, purpose, await sha256(token), new Date(Date.now() + 24 * 864e5).toISOString(), nowIso())
    .run();
  return token;
}

function publicUser(user: AuthedUser) {
  return { id: user.id, name: user.name, email: user.email, accountStatus: user.account_status };
}

function appOrigin(env: Env) {
  return (env.APP_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
}

function authOrigin(c: Ctx) {
  const origin = new URL(c.req.url).origin;
  const allowed = new Set([appOrigin(c.env), "https://www.postlane.email", "https://postlane.email", "http://localhost:5173"]);
  return allowed.has(origin) ? origin : appOrigin(c.env);
}

async function sendAccountMail(
  env: Env,
  input: { to: string; subject: string; text: string; path: string; purpose: "verify" | "reset" | "invite" },
) {
  const provider = getMailProvider(env);
  const status = providerStatus(env);
  const result = await provider.sendTransactional({
    to: input.to,
    subject: input.subject,
    text: input.text,
    purpose: input.purpose,
  });
  return {
    provider,
    status,
    result,
    sent: result.ok,
    mock: provider.mock,
    url: provider.mock || (!result.ok && isDev(env)) ? input.path : undefined,
    message: result.ok
      ? `Check ${input.to} for a message from ${env.SYSTEM_MAIL_FROM || SYSTEM_MAIL_FROM}.`
      : provider.mock
        ? "No email was sent. A mail provider is not configured."
        : result.message,
  };
}

app.get("/api/health", async (c) => {
  let db = "unknown";
  try {
    const row = await c.env.DB.prepare("SELECT COUNT(*) as n FROM users").first<{ n: number }>();
    db = `ok:${row?.n ?? 0}`;
  } catch (err) {
    db = err instanceof Error ? err.message : "db-failed";
  }
  return c.json({
    ok: true,
    provider: providerStatus(c.env),
    environment: c.env.ENVIRONMENT,
    db,
  });
});

app.get("/api/session", async (c) => {
  const user = await readUser(c, "customer");
  if (!user) return c.json({ user: null, workspaces: [], provider: providerStatus(c.env) });
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.slug, w.name, m.role
     FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = ? ORDER BY w.created_at`,
  )
    .bind(user.id)
    .all();
  return c.json({
    user: publicUser(user),
    workspaces: results,
    provider: providerStatus(c.env),
    googleAuth: googleConfigured(c.env),
  });
});

app.post("/api/signup", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; password?: string; consent?: boolean }>();
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Enter your name.";
  if (!email.includes("@")) fieldErrors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) fieldErrors.password = `Use at least ${MIN_PASSWORD} characters.`;
  if (!body.consent) fieldErrors.consent = "Agree to the terms before continuing.";
  if (Object.keys(fieldErrors).length) {
    throw new ApiError(400, "VALIDATION", "Check the highlighted fields.", { fieldErrors, retryable: false });
  }
  const normalized = normalizeEmail(email);
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email_normalized = ?").bind(normalized).first();
  if (existing) {
    throw new ApiError(409, "ACCOUNT_EXISTS", "An account with this email already exists. Sign in instead.", {
      retryable: false,
    });
  }
  const secret = await hashPassword(password);
  const userId = id();
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, email_normalized, password_hash, password_salt, account_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'unverified', ?, ?)`,
  )
    .bind(userId, name, email, normalized, secret.hash, secret.salt, nowIso(), nowIso())
    .run();
  const verifyToken = await createEmailToken(c.env.DB, userId, "verify");
  const path = `/verify-email?token=${verifyToken}`;
  const mail = await sendAccountMail(c.env, {
    to: email,
    subject: "Verify your Postlane account",
    text: `Confirm this address to continue setup. This does not activate a mailbox.\n\n${appOrigin(c.env)}${path}\n`,
    path,
    purpose: "verify",
  });
  await audit(c.env.DB, {
    actorUserId: userId,
    event: "user.signup",
    result: "success",
    correlationId: c.get("cid"),
  });
  return c.json({
    user: { id: userId, name, email, accountStatus: "unverified" },
    verification: {
      sent: mail.sent,
      mock: mail.mock,
      message: mail.mock
        ? "No email was sent. Use this single-use link to verify."
        : mail.message,
      url: mail.url,
    },
  });
});

app.post("/api/verify-email", async (c) => {
  const body = await c.req.json<{ token?: string }>();
  if (!body.token) throw new ApiError(400, "VALIDATION", "Verification token is required.", { retryable: false });
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'verify'`,
  )
    .bind(await sha256(body.token))
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();
  if (!row) throw new ApiError(400, "INVALID_TOKEN", "This verification link is invalid.", { retryable: false });
  if (row.used_at) throw new ApiError(400, "TOKEN_USED", "This verification link was already used.", { retryable: false });
  if (row.expires_at < nowIso()) throw new ApiError(400, "TOKEN_EXPIRED", "This verification link has expired.", { retryable: false });
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").bind(nowIso(), row.id),
    c.env.DB.prepare("UPDATE users SET account_status = 'verified', updated_at = ? WHERE id = ?").bind(nowIso(), row.user_id),
  ]);
  const user = await c.env.DB.prepare("SELECT id, name, email, account_status FROM users WHERE id = ?")
    .bind(row.user_id)
    .first<AuthedUser>();
  const token = await createSession(c.env, row.user_id, "customer", c.req.header("user-agent"));
  setCookie(c, SESSION, token, cookieOpts(c));
  await audit(c.env.DB, {
    actorUserId: row.user_id,
    event: "user.verified",
    result: "success",
    correlationId: c.get("cid"),
  });
  return c.json({ user: user ? publicUser(user) : null });
});

app.post("/api/resend-verification", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => ({ email: "" }));
  const email = normalizeEmail(body.email ?? "");
  const generic = {
    ok: true,
    message: "If that account is waiting for verification, a new link is on the way.",
  };
  if (!email.includes("@")) return c.json(generic);
  const user = await c.env.DB.prepare("SELECT id, account_status FROM users WHERE email_normalized = ?")
    .bind(email)
    .first<{ id: string; account_status: string }>();
  if (!user || user.account_status === "verified" || user.account_status === "locked") return c.json(generic);
  const token = await createEmailToken(c.env.DB, user.id, "verify");
  const path = `/verify-email?token=${token}`;
  const mail = await sendAccountMail(c.env, {
    to: body.email ?? email,
    subject: "Verify your Postlane account",
    text: `Use this single-use link to verify your account.\n\n${appOrigin(c.env)}${path}\n`,
    path,
    purpose: "verify",
  });
  return c.json({
    ok: true,
    message: mail.mock ? "No email was sent. Use this single-use link to verify." : mail.message,
    url: mail.url,
  });
});

app.post("/api/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const user = await c.env.DB.prepare(
    "SELECT id, name, email, account_status, password_hash, password_salt, auth_provider FROM users WHERE email_normalized = ?",
  )
    .bind(normalizeEmail(body.email ?? ""))
    .first<AuthedUser & { password_hash: string; password_salt: string; auth_provider: string | null }>();
  const invalid = new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.", { retryable: false });
  if (!user) throw invalid;
  const check = await hashPassword(body.password ?? "", user.password_salt);
  if (check.hash !== user.password_hash) {
    if (user.auth_provider === "google") {
      throw new ApiError(401, "GOOGLE_ACCOUNT", "This account uses Google. Continue with Google to sign in.", {
        retryable: false,
      });
    }
    throw invalid;
  }
  if (user.account_status === "locked") {
    throw new ApiError(403, "ACCOUNT_LOCKED", "This account is locked. Contact support.", { retryable: false });
  }
  const token = await createSession(c.env, user.id, "customer", c.req.header("user-agent"));
  setCookie(c, SESSION, token, cookieOpts(c));
  return c.json({ user: publicUser(user) });
});

app.get("/api/auth/google", async (c) => {
  const intent = c.req.query("intent") === "login" ? "login" : "signup";
  const origin = authOrigin(c);
  const back = `${origin}/${intent === "login" ? "login" : "signup"}`;
  if (!googleConfigured(c.env)) {
    return c.redirect(`${back}?auth_error=not_configured`);
  }
  const state = rawToken();
  setCookie(c, OAUTH, `${state}.${intent}`, { ...cookieOpts(c), maxAge: 600 });
  return c.redirect(googleAuthUrl(c.env, state, googleCallbackPath(origin)));
});

app.get("/api/auth/google/callback", async (c) => {
  const origin = authOrigin(c);
  const stored = getCookie(c, OAUTH) || "";
  deleteCookie(c, OAUTH, { path: "/" });
  const [expected, intentRaw] = stored.split(".");
  const intent = intentRaw === "login" ? "login" : "signup";
  const back = `${origin}/${intent}`;
  const fail = (code: string) => c.redirect(`${back}?auth_error=${code}`);
  if (c.req.query("error") === "access_denied") return fail("denied");
  const code = c.req.query("code") || "";
  const state = c.req.query("state") || "";
  if (!code || !state || !expected || state !== expected) return fail("failed");
  try {
    const profile = await exchangeGoogleCode(c.env, code, googleCallbackPath(origin));
    const result = await upsertGoogleUser(c.env.DB, profile);
    if ("error" in result) return fail(result.error);
    if (result.user.account_status === "locked") return fail("failed");
    const token = await createSession(c.env, result.user.id, "customer", c.req.header("user-agent"));
    setCookie(c, SESSION, token, cookieOpts(c));
    await audit(c.env.DB, {
      actorUserId: result.user.id,
      event: result.user.auth_provider === "google" ? "user.google" : "user.google_linked",
      result: "success",
      correlationId: c.get("cid"),
    });
    return c.redirect(`${origin}/app/setup`);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error(JSON.stringify({ cid: c.get("cid"), error: err instanceof Error ? err.message : String(err) }));
    return fail("failed");
  }
});

app.get("/api/auth/cloudflare", async (c) => {
  const user = await readUser(c, "customer");
  const origin = authOrigin(c);
  const popup = c.req.query("popup") === "1";
  const domain = (c.req.query("domain") || "").toLowerCase();
  const fail = (reason: string) =>
    popup
      ? c.html(oauthPopupHtml(false, domain, origin, reason), 400)
      : c.redirect(`${origin}/app/domains?cf=failed${domain ? `&domain=${encodeURIComponent(domain)}` : ""}`);
  if (!user) {
    return popup
      ? c.html(oauthPopupHtml(false, domain, origin, "Sign in to Postlane first."), 401)
      : c.redirect(`${origin}/login?auth_error=signin`);
  }
  const started = await ensureCloudflareOAuthClient(c.env);
  if (!started.app) {
    return popup
      ? c.html(oauthPopupHtml(false, domain, origin, "Cloudflare authorization is not configured yet."), 400)
      : c.redirect(`${origin}/app/domains?cf=failed${domain ? `&domain=${encodeURIComponent(domain)}` : ""}`);
  }
  const state = rawToken();
  const verifier = rawToken() + rawToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  setCookie(c, "postlane_cf_oauth", `${state}|${verifier}|${domain}|${popup ? "1" : "0"}`, { ...cookieOpts(c), maxAge: 600 });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: started.app.id,
    redirect_uri: `${origin}/api/auth/cloudflare/callback`,
    scope: "offline_access zone.read dns.write",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return c.redirect(`https://dash.cloudflare.com/oauth2/auth?${params}`);
});

app.get("/v2/domainTemplates/providers/postlane.email/services/sending", async (c) => {
  await ensureDomainConnectPublicKey(c.env).catch(() => undefined);
  return c.json(sendingTemplate());
});

app.get("/api/domain-connect/callback", (c) => {
  const origin = authOrigin(c);
  const domain = (c.req.query("domain") || "").toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const error = (c.req.query("error_description") || c.req.query("error") || "").slice(0, 180);
  const ok = !c.req.query("error");
  const next = `${origin}/app/domains?cf=${ok ? "connected" : "failed"}${domain ? `&domain=${encodeURIComponent(domain)}` : ""}`;
  return c.html(`<!doctype html><html><body><p>Returning to Postlane…</p><script>
    const payload = { type: "postlane-domain-connect", ok: ${ok ? "true" : "false"}, domain: ${JSON.stringify(domain)}, error: ${JSON.stringify(error)}, t: Date.now() };
    try { localStorage.setItem("postlane-dc", JSON.stringify(payload)); } catch (e) {}
    try { if (window.opener) window.opener.postMessage(payload, ${JSON.stringify(origin)}); } catch (e) {}
    if (window.opener && !window.opener.closed) window.close();
    else location.replace(${JSON.stringify(next)});
  </script></body></html>`);
});

app.post("/api/auth/cloudflare/setup", async (c) => {
  const user = await readUser(c, "customer");
  const origin = authOrigin(c);
  if (!user) return c.html(oauthPopupHtml(false, "", origin, "Sign in to Postlane first."), 401);
  const body = await c.req.parseBody();
  const clientId = String(body.client_id || "").trim();
  const clientSecret = String(body.client_secret || "").trim();
  const domain = String(body.domain || "").toLowerCase();
  if (clientId.length < 8 || clientSecret.length < 8) {
    return c.html(oauthSetupHtml(origin, domain), 400);
  }
  await saveCloudflareOAuthApp(c.env, clientId, clientSecret);
  return c.redirect(`${origin}/api/auth/cloudflare?domain=${encodeURIComponent(domain)}&popup=1`);
});

app.get("/api/auth/cloudflare/callback", async (c) => {
  const origin = authOrigin(c);
  const stored = getCookie(c, "postlane_cf_oauth") || "";
  deleteCookie(c, "postlane_cf_oauth", { path: "/" });
  const [expected, verifier, domain, popupFlag] = stored.split("|");
  const popup = popupFlag === "1";
  const fail = (reason = "Cloudflare authorization did not complete.") =>
    popup ? c.html(oauthPopupHtml(false, domain || "", origin, reason)) : c.redirect(`${origin}/app/domains?cf=failed`);
  const user = await readUser(c, "customer");
  if (!user) {
    return popup
      ? c.html(oauthPopupHtml(false, domain || "", origin, "Sign in to Postlane first."), 401)
      : c.redirect(`${origin}/login?auth_error=signin`);
  }
  const code = c.req.query("code") || "";
  const state = c.req.query("state") || "";
  if (!code || !state || !expected || state !== expected) return fail();
  const started = await ensureCloudflareOAuthClient(c.env);
  if (!started.app) return fail(started.error || "Cloudflare login could not start.");
  const tokenRes = await fetch("https://dash.cloudflare.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: started.app.id,
      client_secret: started.app.secret,
      redirect_uri: `${origin}/api/auth/cloudflare/callback`,
      code,
      code_verifier: verifier,
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string };
  if (!tokenRes.ok || !tokenBody.access_token) return fail("Cloudflare did not return access.");
  const workspace = await c.env.DB.prepare(
    `SELECT w.id FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? ORDER BY w.created_at LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: string }>();
  if (!workspace) return fail();
  await saveCloudflareToken(c.env.DB, workspace.id, tokenBody.access_token, tokenBody.refresh_token);
  await audit(c.env.DB, {
    actorUserId: user.id,
    workspaceId: workspace.id,
    event: "cloudflare.connected",
    result: "success",
    correlationId: c.get("cid"),
  });
  if (popup) return c.html(oauthPopupHtml(true, domain || "", origin));
  const next = domain ? `${origin}/app/domains?cf=connected&domain=${encodeURIComponent(domain)}` : `${origin}/app/domains?cf=connected`;
  return c.redirect(next);
});

app.post("/api/logout", async (c) => {
  const token = getCookie(c, SESSION);
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  deleteCookie(c, SESSION, { path: "/" });
  return c.json({ ok: true });
});

app.post("/api/forgot-password", async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = normalizeEmail(body.email ?? "");
  const generic = {
    message: "If an account exists, a reset link will be sent when mail is configured.",
    mock: getMailProvider(c.env).mock,
  };
  const user = await c.env.DB.prepare("SELECT id FROM users WHERE email_normalized = ?").bind(email).first<{ id: string }>();
  if (!user) return c.json(generic);
  const token = await createEmailToken(c.env.DB, user.id, "reset");
  const path = `/reset-password?token=${token}`;
  const mail = await sendAccountMail(c.env, {
    to: body.email ?? email,
    subject: "Reset your Postlane password",
    text: `Use this single-use link to choose a new password.\n\n${appOrigin(c.env)}${path}\n`,
    path,
    purpose: "reset",
  });
  return c.json({
    message: mail.mock ? generic.message : mail.message,
    mock: mail.mock,
    url: mail.url,
  });
});

app.post("/api/reset-password", async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>();
  if ((body.password ?? "").length < MIN_PASSWORD) {
    throw new ApiError(400, "VALIDATION", `Use at least ${MIN_PASSWORD} characters.`, { retryable: false });
  }
  const row = await c.env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'`,
  )
    .bind(await sha256(body.token ?? ""))
    .first<{ id: string; user_id: string; expires_at: string; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at < nowIso()) {
    throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or expired.", { retryable: false });
  }
  const secret = await hashPassword(body.password!);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE email_tokens SET used_at = ? WHERE id = ?").bind(nowIso(), row.id),
    c.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?,
           auth_provider = CASE WHEN auth_provider = 'google' THEN 'both' ELSE COALESCE(auth_provider, 'password') END,
           updated_at = ?
       WHERE id = ?`,
    ).bind(secret.hash, secret.salt, nowIso(), row.user_id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);
  return c.json({ ok: true });
});

app.post("/api/workspaces", async (c) => {
  const user = await requireUser(c);
  if (user.account_status !== "verified") {
    throw new ApiError(403, "ACCOUNT_UNVERIFIED", "Verify your recovery email before creating a workspace.", {
      retryable: false,
    });
  }
  const body = await c.req.json<{ name?: string; recoveryEmail?: string }>();
  const name = body.name?.trim() ?? "";
  const recovery = normalizeEmail(body.recoveryEmail ?? "");
  if (name.length < 2) throw new ApiError(400, "VALIDATION", "Enter a workspace name.", { retryable: false });
  if (!recovery.includes("@")) throw new ApiError(400, "VALIDATION", "Enter a valid recovery email.", { retryable: false });
  let slug = slugify(name);
  const clash = await c.env.DB.prepare("SELECT id FROM workspaces WHERE slug = ?").bind(slug).first();
  if (clash) slug = `${slug}-${id().slice(0, 6)}`;
  const workspaceId = id();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO workspaces (id, slug, name, recovery_email, contact_email, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'UTC', ?, ?)`,
    ).bind(workspaceId, slug, name, recovery, recovery, nowIso(), nowIso()),
    c.env.DB.prepare(
      `INSERT INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(id(), workspaceId, user.id, nowIso()),
    c.env.DB.prepare(
      `INSERT INTO subscriptions (id, workspace_id, plan, status, interval, seat_count, provider, created_at, updated_at)
       VALUES (?, ?, 'sandbox', 'active', 'monthly', 1, 'mock', ?, ?)`,
    ).bind(id(), workspaceId, nowIso(), nowIso()),
  ]);
  await audit(c.env.DB, {
    workspaceId,
    actorUserId: user.id,
    event: "workspace.created",
    resource: slug,
    result: "success",
    correlationId: c.get("cid"),
  });
  await notify(c.env.DB, {
    workspaceId,
    userId: user.id,
    eventKey: `welcome:${workspaceId}`,
    title: "Welcome to Postlane",
    body: "Your setup progress is saved. Return whenever you’re ready.",
    severity: "info",
    actionUrl: `/w/${slug}/setup/workspace`,
  });
  return c.json({ workspace: { id: workspaceId, slug, name, role: "owner" } });
});

async function setupSnapshot(env: Env, workspaceId: string, user: AuthedUser) {
  const db = env.DB;
  const workspace = await db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<Record<string, string>>();
  const subscription = await db
    .prepare("SELECT * FROM subscriptions WHERE workspace_id = ?")
    .bind(workspaceId)
    .first<Record<string, string | number>>();
  const domain = await db
    .prepare("SELECT * FROM domains WHERE workspace_id = ? ORDER BY created_at LIMIT 1")
    .bind(workspaceId)
    .first<Record<string, string | number>>();
  const { results: mailboxes } = await db
    .prepare("SELECT * FROM mailboxes WHERE workspace_id = ? AND status != 'deleted' ORDER BY created_at")
    .bind(workspaceId)
    .all<Record<string, string | number>>();
  const observations = domain
    ? (
        await db
          .prepare(
            `SELECT r.component, r.record_type, r.host, r.full_hostname, r.expected_value, r.ttl, r.mx_priority, r.required,
                    o.status, o.detected_value, o.error_code, o.checked_at, o.next_check_at, o.resolver
             FROM dns_requirements r
             LEFT JOIN dns_observations o ON o.domain_id = r.domain_id AND o.component = r.component
             WHERE r.domain_id = ?`,
          )
          .bind(domain.id)
          .all<Record<string, string | number | null>>()
      ).results
    : [];
  const checks = mailboxes[0]
    ? (
        await db
          .prepare("SELECT direction, status, evidence, created_at FROM delivery_checks WHERE mailbox_id = ? ORDER BY created_at DESC")
          .bind(mailboxes[0].id)
          .all<Record<string, string>>()
      ).results
    : [];
  const latest = (dir: string) => checks.find((row) => row.direction === dir);
  const obs = (component: string) => observations.find((row) => row.component === component);
  const gates = activationGates({
    accountVerified: user.account_status === "verified",
    entitlementActive: subscription?.status === "active",
    ownershipVerified: domain?.ownership_status === "verified",
    preparedMailboxes: mailboxes.filter((m) => ["prepared", "active"].includes(String(m.status))).length,
    mxValid: obs("mx")?.status === "valid",
    spfValid: obs("spf")?.status === "valid",
    dkimValid: obs("dkim")?.status === "valid",
    inboundPassed: latest("inbound")?.status === "passed",
    outboundPassed: latest("outbound")?.status === "passed",
  });
  const ready = canActivateMailbox({
    accountVerified: user.account_status === "verified",
    entitlementActive: subscription?.status === "active",
    ownershipVerified: domain?.ownership_status === "verified",
    preparedMailboxes: mailboxes.filter((m) => ["prepared", "active"].includes(String(m.status))).length,
    mxValid: obs("mx")?.status === "valid",
    spfValid: obs("spf")?.status === "valid",
    dkimValid: obs("dkim")?.status === "valid",
    inboundPassed: latest("inbound")?.status === "passed",
    outboundPassed: latest("outbound")?.status === "passed",
  });
  const next =
    !workspace?.recovery_email
      ? "workspace"
      : subscription?.status === "pending"
        ? "plan"
        : !domain
          ? "domain"
          : mailboxes.length === 0
            ? "mailboxes"
            : obs("mx")?.status !== "valid" || obs("spf")?.status !== "valid"
              ? "dns"
              : "delivery";
  return {
    version: Number(domain?.version ?? 1),
    workspace,
    subscription,
    domain,
    mailboxes,
    dns: observations,
    delivery: { inbound: latest("inbound") ?? null, outbound: latest("outbound") ?? null },
    gates,
    activationAllowed: ready,
    nextStep: next,
    provider: providerStatus(env),
    pricingNote: "Sandbox is free. Launch and Scale are billed monthly through Stripe.",
  };
}

app.get("/api/workspaces/:slug/setup", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  return c.json(await setupSnapshot(c.env, ws.id, user));
});

app.patch("/api/workspaces/:slug", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{ name?: string; recoveryEmail?: string; contactEmail?: string; timezone?: string }>();
  await c.env.DB.prepare(
    `UPDATE workspaces SET name = ?, recovery_email = ?, contact_email = ?, timezone = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      body.name?.trim() || ws.name,
      body.recoveryEmail || ws.recovery_email,
      body.contactEmail || ws.contact_email,
      body.timezone || ws.timezone,
      nowIso(),
      ws.id,
    )
    .run();
  return c.json({ ok: true });
});

app.post("/api/workspaces/:slug/billing/checkout", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin", "billing"]);
  const body = await c.req.json<{ plan?: string }>();
  const plan = normalizePlan(body.plan);
  const result = await changeWorkspacePlan(c.env, c.env.DB, {
    workspaceId: ws.id,
    email: user.email,
    plan,
    origin: (c.env.APP_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, ""),
  });
  await audit(c.env.DB, {
    workspaceId: ws.id,
    actorUserId: user.id,
    event: plan === "sandbox" ? "billing.sandbox_plan_selected" : "billing.checkout_started",
    result: result.status,
    correlationId: c.get("cid"),
  });
  return c.json({
    status: result.status,
    code: plan === "sandbox" ? "SANDBOX_PLAN" : "STRIPE_CHECKOUT",
    hosted: Boolean(result.url),
    mock: false,
    plan: result.plan,
    url: result.url,
    amountCents: placeholderPriceCents(plan, 1),
    message: result.message,
  });
});

app.post("/api/workspaces/:slug/billing/portal", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin", "billing"]);
  if (!stripeConfigured(c.env)) throw new ApiError(503, "BILLING_UNAVAILABLE", "Stripe is not configured yet.", { retryable: false });
  const row = await c.env.DB.prepare("SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = ?")
    .bind(ws.id)
    .first<{ stripe_customer_id: string | null }>();
  if (!row?.stripe_customer_id) throw new ApiError(409, "BILLING_REQUIRED", "Subscribe before managing a payment method.", { retryable: false });
  let portal: { url: string };
  try {
    portal = await stripePortal(c.env, row.stripe_customer_id, (c.env.APP_ORIGIN || new URL(c.req.url).origin).replace(/\/$/, ""));
  } catch (err) {
    throw new ApiError(502, "BILLING_FAILED", err instanceof Error ? err.message : "Stripe could not open billing.", { retryable: true });
  }
  return c.json({ url: portal.url });
});

app.post("/api/webhooks/stripe", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new ApiError(503, "BILLING_UNAVAILABLE", "Stripe webhooks are not configured.", { retryable: false });
  const payload = await c.req.text();
  const valid = await verifyStripeSignature(payload, c.req.header("stripe-signature") || "", secret);
  if (!valid) throw new ApiError(401, "INVALID_SIGNATURE", "Stripe signature rejected.", { retryable: false });
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new ApiError(400, "VALIDATION", "Stripe event was not valid JSON.", { retryable: false });
  }
  await applyStripeEvent(c.env.DB, event);
  return c.json({ received: true });
});

app.post("/api/webhooks/billing", async (c) => {
  const secret = c.env.BILLING_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Billing webhooks are not configured.", { retryable: false });
  const signature = c.req.header("x-webhook-signature") ?? "";
  const expected = await sha256(`${secret}.${await c.req.text()}`);
  if (signature !== expected) throw new ApiError(401, "INVALID_SIGNATURE", "Webhook signature rejected.", { retryable: false });
  return c.json({ ok: true });
});

app.post("/api/workspaces/:slug/domains", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{ domain?: string; dnsProvider?: string; existingMail?: boolean }>();
  let name: string;
  try {
    name = normalizeDomain(body.domain ?? "");
  } catch (err) {
    throw new ApiError(400, "VALIDATION", err instanceof Error ? err.message : "Invalid domain.", { retryable: false });
  }
  const claimed = await c.env.DB.prepare("SELECT workspace_id FROM domains WHERE name_normalized = ?")
    .bind(name)
    .first<{ workspace_id: string }>();
  if (claimed && claimed.workspace_id !== ws.id) {
    throw new ApiError(409, "DOMAIN_CLAIM_CONFLICT", "This domain cannot be added. Request an ownership review if you believe this is a mistake.", {
      retryable: false,
    });
  }
  const inspection = await inspectExistingMail(name);
  const verifyToken = rawToken().slice(0, 20);
  const domainId = claimed ? (await c.env.DB.prepare("SELECT id FROM domains WHERE name_normalized = ?").bind(name).first<{ id: string }>())!.id : id();
  if (!claimed) {
    await c.env.DB.prepare(
      `INSERT INTO domains (id, workspace_id, name, name_normalized, ownership_status, verify_token, dns_provider, has_existing_mail, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'unverified', ?, ?, ?, ?, ?)`,
    )
      .bind(domainId, ws.id, name, name, verifyToken, body.dnsProvider ?? null, body.existingMail ? 1 : 0, nowIso(), nowIso())
      .run();
    const reqs = expectedRecords(name, verifyToken);
    for (const req of reqs) {
      await c.env.DB.prepare(
        `INSERT INTO dns_requirements (id, domain_id, component, record_type, host, full_hostname, expected_value, ttl, mx_priority, required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(id(), domainId, req.component, req.record_type, req.host, req.full_hostname, req.expected_value, req.ttl, req.mx_priority, req.required)
        .run();
    }
  }
  await audit(c.env.DB, {
    workspaceId: ws.id,
    actorUserId: user.id,
    event: "domain.added",
    resource: name,
    result: "success",
    correlationId: c.get("cid"),
  });
  return c.json({
    domainId,
    name,
    existingMail: inspection,
    warning:
      inspection.existingProvider === "google" || inspection.existingProvider === "microsoft"
        ? "Switching mail here will stop Gmail/Outlook from receiving new messages. Prepare mailboxes and migration first."
        : inspection.existingProvider
          ? "Existing mail records were found. Prepare recipients before changing MX."
          : null,
    ownership: expectedRecords(name, verifyToken)[0],
  });
});

app.post("/api/workspaces/:slug/domains/:domainId/checks", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const domain = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("domainId"), ws.id)
    .first<Record<string, string>>();
  if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.");
  const jobId = id();
  const corr = c.get("cid");
  await c.env.DB.prepare(
    `INSERT INTO jobs (id, workspace_id, type, idempotency_key, status, attempts, resource_type, resource_id, correlation_id, created_at, updated_at)
     VALUES (?, ?, 'dns_check', ?, 'running', 1, 'domain', ?, ?, ?, ?)`,
  )
    .bind(jobId, ws.id, `dns:${domain.id}:${new Date().toISOString().slice(0, 16)}`, domain.id, corr, nowIso(), nowIso())
    .run();

  const { results: reqs } = await c.env.DB.prepare("SELECT * FROM dns_requirements WHERE domain_id = ?").bind(domain.id).all<Record<string, string>>();
  const next = new Date(Date.now() + 5 * 60_000).toISOString();
  for (const req of reqs) {
    const result = await checkRequirement({
      component: req.component as "ownership",
      record_type: req.record_type,
      full_hostname: req.full_hostname,
      expected_value: req.expected_value,
    });
    await c.env.DB.prepare("DELETE FROM dns_observations WHERE domain_id = ? AND component = ?")
      .bind(domain.id, req.component)
      .run();
    await c.env.DB.prepare(
      `INSERT INTO dns_observations (id, domain_id, component, status, detected_value, resolver, error_code, checked_at, next_check_at)
       VALUES (?, ?, ?, ?, ?, 'cloudflare-dns.com', ?, ?, ?)`,
    )
      .bind(id(), domain.id, req.component, result.status, result.detectedValue, result.errorCode, nowIso(), next)
      .run();
  }
  const ownership = await c.env.DB.prepare(
    "SELECT status FROM dns_observations WHERE domain_id = ? AND component = 'ownership'",
  )
    .bind(domain.id)
    .first<{ status: string }>();
  if (ownership?.status === "valid") {
    await c.env.DB.prepare("UPDATE domains SET ownership_status = 'verified', updated_at = ? WHERE id = ?")
      .bind(nowIso(), domain.id)
      .run();
    await notify(c.env.DB, {
      workspaceId: ws.id,
      userId: user.id,
      eventKey: `domain.verified:${domain.id}`,
      title: "Your domain is verified",
      body: `Ownership of ${domain.name} is confirmed.`,
      severity: "info",
      actionUrl: `/w/${ws.slug}/setup/dns`,
    });
  }
  await c.env.DB.prepare("UPDATE jobs SET status = 'succeeded', updated_at = ? WHERE id = ?").bind(nowIso(), jobId).run();
  return c.json({ jobId, status: "succeeded" }, 202);
});

app.get("/api/workspaces/:slug/domains/:domainId/dns", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const domain = await c.env.DB.prepare("SELECT * FROM domains WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("domainId"), ws.id)
    .first();
  if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found.");
  const { results } = await c.env.DB.prepare(
    `SELECT r.component, r.record_type, r.host, r.full_hostname, r.expected_value, r.ttl, r.mx_priority, r.required,
            o.status, o.detected_value, o.error_code, o.checked_at, o.next_check_at, o.resolver
     FROM dns_requirements r
     LEFT JOIN dns_observations o ON o.domain_id = r.domain_id AND o.component = r.component
     WHERE r.domain_id = ?`,
  )
    .bind(c.req.param("domainId"))
    .all();
  return c.json({ records: results, domain });
});

app.post("/api/workspaces/:slug/mailboxes", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{
    localPart?: string;
    displayName?: string;
    domainId?: string;
    idempotencyKey?: string;
  }>();
  const local = (body.localPart ?? "").trim().toLowerCase();
  if (!MAILBOX_RE.test(local)) {
    throw new ApiError(400, "VALIDATION", "Use a username with letters, numbers, dots, or hyphens.", { retryable: false });
  }
  const domain = await c.env.DB.prepare("SELECT * FROM domains WHERE workspace_id = ? ORDER BY created_at LIMIT 1")
    .bind(ws.id)
    .first<Record<string, string>>();
  if (!domain) throw new ApiError(400, "VALIDATION", "Add a domain before creating a mailbox.", { retryable: false });
  const address = `${local}@${domain.name_normalized}`;
  const existing = await c.env.DB.prepare(
    "SELECT id FROM mailboxes WHERE address_normalized = ? AND status != 'deleted' UNION SELECT id FROM aliases WHERE address_normalized = ?",
  )
    .bind(address, address)
    .first();
  if (existing) throw new ApiError(409, "DUPLICATE_ADDRESS", "This address already exists.", { retryable: false });
  const sub = await c.env.DB.prepare("SELECT plan, status FROM subscriptions WHERE workspace_id = ?")
    .bind(ws.id)
    .first<{ plan: string; status: string }>();
  const plan = normalizePlan(sub?.plan);
  const spec = PLAN_CATALOG[plan];
  const existingCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM mailboxes WHERE workspace_id = ? AND status != 'deleted'",
  )
    .bind(ws.id)
    .first<{ n: number }>();
  if ((existingCount?.n ?? 0) >= spec.maxMailboxes) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      plan === "sandbox"
        ? "Sandbox includes one mailbox. Choose Launch or Scale to add more."
        : `This plan allows up to ${spec.maxMailboxes} mailboxes.`,
      { retryable: false },
    );
  }
  const quotaMb = PLACEHOLDER_QUOTA_MB[plan];
  const mailboxId = id();
  const key = body.idempotencyKey || `mbx:${ws.id}:${address}`;
  const prior = await c.env.DB.prepare("SELECT id, status, resource_id FROM jobs WHERE idempotency_key = ?")
    .bind(key)
    .first<{ id: string; status: string; resource_id: string }>();
  if (prior?.resource_id) {
    return c.json({ mailboxId: prior.resource_id, jobId: prior.id, status: prior.status }, 202);
  }
  const jobId = id();
  await c.env.DB.prepare(
    `INSERT INTO mailboxes (id, workspace_id, domain_id, local_part, address_normalized, display_name, status, quota_gb, quota_mb, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'provisioning', ?, ?, ?, ?, ?)`,
  )
    .bind(mailboxId, ws.id, domain.id, local, address, body.displayName ?? local, quotaMb / 1000, quotaMb, getMailProvider(c.env).id, nowIso(), nowIso())
    .run();
  await c.env.DB.prepare(
    `INSERT INTO jobs (id, workspace_id, type, idempotency_key, status, attempts, resource_type, resource_id, correlation_id, created_at, updated_at)
     VALUES (?, ?, 'provision_mailbox', ?, 'running', 1, 'mailbox', ?, ?, ?, ?)`,
  )
    .bind(jobId, ws.id, key, mailboxId, c.get("cid"), nowIso(), nowIso())
    .run();
  const provider = getMailProvider(c.env);
  const result = await provider.provisionMailbox({
    address,
    displayName: body.displayName ?? local,
    quotaMb: quotaMb,
    idempotencyKey: key,
  });
  if (!result.ok) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE mailboxes SET status = 'failed', updated_at = ? WHERE id = ?").bind(nowIso(), mailboxId),
      c.env.DB.prepare("UPDATE jobs SET status = 'failed', sanitized_error = ?, updated_at = ? WHERE id = ?").bind(
        result.message,
        nowIso(),
        jobId,
      ),
    ]);
    throw new ApiError(502, "PROVISIONING_FAILED", result.message, { retryable: result.retryable, resourceId: mailboxId });
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE mailboxes SET status = 'prepared', provider_id = ?, updated_at = ? WHERE id = ?").bind(
      result.mailbox.providerId,
      nowIso(),
      mailboxId,
    ),
    c.env.DB.prepare("UPDATE jobs SET status = 'succeeded', provider_ref = ?, updated_at = ? WHERE id = ?").bind(
      result.mailbox.providerId,
      nowIso(),
      jobId,
    ),
  ]);
  await notify(c.env.DB, {
    workspaceId: ws.id,
    userId: user.id,
    eventKey: `mailbox.prepared:${mailboxId}`,
    title: "Mailbox prepared",
    body: `${address} is reserved. Delivery stays inactive until every activation gate passes.`,
    severity: "info",
    actionUrl: `/w/${ws.slug}/mailboxes/${mailboxId}`,
  });
  return c.json({ mailboxId, jobId, status: "prepared", address, provider: providerStatus(c.env) }, 202);
});

app.get("/api/workspaces/:slug/mailboxes", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM mailboxes WHERE workspace_id = ? AND status != 'deleted' ORDER BY created_at",
  )
    .bind(ws.id)
    .all();
  return c.json({ mailboxes: results });
});

app.patch("/api/workspaces/:slug/mailboxes/:mailboxId", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{ displayName?: string }>();
  const mailbox = await c.env.DB.prepare("SELECT id FROM mailboxes WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("mailboxId"), ws.id)
    .first();
  if (!mailbox) throw new ApiError(404, "NOT_FOUND", "Mailbox not found.");
  await c.env.DB.prepare("UPDATE mailboxes SET display_name = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .bind(body.displayName ?? "", nowIso(), c.req.param("mailboxId"), ws.id)
    .run();
  return c.json({ ok: true });
});

app.delete("/api/workspaces/:slug/mailboxes/:mailboxId", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner"]);
  const mailbox = await c.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("mailboxId"), ws.id)
    .first<Record<string, string>>();
  if (!mailbox) throw new ApiError(404, "NOT_FOUND", "Mailbox not found.");
  const confirm = c.req.query("confirm");
  if (confirm !== mailbox.local_part) {
    throw new ApiError(400, "VALIDATION", "Type the mailbox username to confirm deletion.", { retryable: false });
  }
  await getMailProvider(c.env).deleteMailbox(mailbox.provider_id);
  await c.env.DB.prepare("UPDATE mailboxes SET status = 'deleted', updated_at = ? WHERE id = ? AND workspace_id = ?")
    .bind(nowIso(), mailbox.id, ws.id)
    .run();
  return c.json({ ok: true, retention: "Retention policy is not configured. No live mailbox was removed from a mail server." });
});

app.post("/api/workspaces/:slug/mailboxes/:mailboxId/delivery-checks", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const mailbox = await c.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("mailboxId"), ws.id)
    .first<Record<string, string>>();
  if (!mailbox) throw new ApiError(404, "NOT_FOUND", "Mailbox not found.");
  const provider = getMailProvider(c.env);
  const token = c.get("cid");
  const inbound = await provider.runDeliveryCheck({
    direction: "inbound",
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address_normalized,
    recoveryEmail: ws.recovery_email ?? undefined,
    correlationToken: token,
  });
  const outbound = await provider.runDeliveryCheck({
    direction: "outbound",
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address_normalized,
    recoveryEmail: ws.recovery_email ?? undefined,
    correlationToken: token,
  });
  for (const [direction, result] of [
    ["inbound", inbound],
    ["outbound", outbound],
  ] as const) {
    await c.env.DB.prepare(
      `INSERT INTO delivery_checks (id, workspace_id, mailbox_id, direction, status, correlation_token, evidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id(), ws.id, mailbox.id, direction, result.status, token, result.evidence, nowIso())
      .run();
  }
  const snap = await setupSnapshot(c.env, ws.id, user);
  if (snap.activationAllowed) {
    await c.env.DB.prepare("UPDATE mailboxes SET status = 'active', updated_at = ? WHERE id = ? AND workspace_id = ?")
      .bind(nowIso(), mailbox.id, ws.id)
      .run();
  }
  return c.json({
    inbound,
    outbound,
    activated: snap.activationAllowed,
    message: snap.activationAllowed
      ? "Every activation gate passed. This mailbox is live for webmail-only send and receive."
      : "Delivery checks did not unlock activation. A mailbox is never marked live from DNS or SendEmail alone.",
  });
});

app.get("/api/workspaces/:slug/mailboxes/:mailboxId/messages", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const mailbox = await c.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("mailboxId"), ws.id)
    .first<Record<string, string>>();
  if (!mailbox) throw new ApiError(404, "NOT_FOUND", "Mailbox not found.");
  const messages = await listMailboxMessages(c.env.DB, mailbox.id, ws.id);
  return c.json({
    mailbox: { id: mailbox.id, address: mailbox.address_normalized, status: mailbox.status },
    messages,
    handoff: getMailProvider(c.env).getWebmailHandoff({
      workspaceSlug: ws.slug,
      mailboxAddress: mailbox.address_normalized,
    }),
    compose: {
      attachments: false,
      note: "SendEmail is text-only. Attachments are not available on send.",
    },
  });
});

app.post("/api/workspaces/:slug/mailboxes/:mailboxId/messages", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin", "member"]);
  const mailbox = await c.env.DB.prepare("SELECT * FROM mailboxes WHERE id = ? AND workspace_id = ?")
    .bind(c.req.param("mailboxId"), ws.id)
    .first<Record<string, string>>();
  if (!mailbox) throw new ApiError(404, "NOT_FOUND", "Mailbox not found.");
  if (mailbox.status !== "active") {
    throw new ApiError(403, "MAILBOX_INACTIVE", "Compose is available after every activation gate passes.", {
      retryable: false,
    });
  }
  const body = await c.req.json<{ to?: string; subject?: string; text?: string; attachments?: unknown[] }>();
  if (body.attachments?.length) {
    throw new ApiError(400, "ATTACHMENTS_UNSUPPORTED", "Attachments cannot be sent yet. Share an R2 link instead.", {
      retryable: false,
    });
  }
  const to = normalizeEmail(body.to ?? "");
  if (!to.includes("@")) throw new ApiError(400, "VALIDATION", "Enter a recipient address.", { retryable: false });
  const subject = (body.subject ?? "").trim() || "(no subject)";
  const text = (body.text ?? "").trim();
  if (!text) throw new ApiError(400, "VALIDATION", "Write a message.", { retryable: false });
  const sent = await getMailProvider(c.env).sendTransactional({
    from: mailbox.address_normalized,
    to,
    subject,
    text,
    purpose: "compose",
    mailboxId: mailbox.id,
    workspaceId: ws.id,
  });
  if (!sent.ok) {
    throw new ApiError(502, sent.code, sent.message, { retryable: sent.retryable });
  }
  return c.json({ ok: true, message: "SendEmail accepted this text-only message. Inbox placement is not guaranteed." });
});

app.get("/api/workspaces/:slug/aliases", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const { results } = await c.env.DB.prepare("SELECT * FROM aliases WHERE workspace_id = ?").bind(ws.id).all();
  return c.json({ aliases: results });
});

app.post("/api/workspaces/:slug/aliases", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{ localPart?: string; destination?: string }>();
  const domain = await c.env.DB.prepare("SELECT * FROM domains WHERE workspace_id = ? ORDER BY created_at LIMIT 1")
    .bind(ws.id)
    .first<Record<string, string>>();
  if (!domain) throw new ApiError(400, "VALIDATION", "Add a domain first.", { retryable: false });
  const local = (body.localPart ?? "").trim().toLowerCase();
  if (!MAILBOX_RE.test(local)) throw new ApiError(400, "VALIDATION", "Enter a valid alias username.", { retryable: false });
  const address = `${local}@${domain.name_normalized}`;
  const dest = (body.destination ?? "").trim().toLowerCase();
  const destBox = await c.env.DB.prepare(
    "SELECT id FROM mailboxes WHERE workspace_id = ? AND address_normalized = ? AND status != 'deleted'",
  )
    .bind(ws.id, dest)
    .first<{ id: string }>();
  if (!destBox) throw new ApiError(400, "VALIDATION", "Destination must be a mailbox in this workspace.", { retryable: false });
  if (dest === address) throw new ApiError(400, "VALIDATION", "An alias cannot deliver to itself.", { retryable: false });
  const clash = await c.env.DB.prepare(
    "SELECT id FROM mailboxes WHERE address_normalized = ? UNION SELECT id FROM aliases WHERE address_normalized = ?",
  )
    .bind(address, address)
    .first();
  if (clash) throw new ApiError(409, "DUPLICATE_ADDRESS", "This address already exists.", { retryable: false });
  const sub = await c.env.DB.prepare("SELECT plan FROM subscriptions WHERE workspace_id = ?")
    .bind(ws.id)
    .first<{ plan: string }>();
  const plan = normalizePlan(sub?.plan);
  const spec = PLAN_CATALOG[plan];
  const aliasCount = await c.env.DB.prepare("SELECT COUNT(*) as n FROM aliases WHERE workspace_id = ?")
    .bind(ws.id)
    .first<{ n: number }>();
  if ((aliasCount?.n ?? 0) >= spec.maxAliases) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      plan === "sandbox"
        ? "Sandbox includes one alias. Choose Launch or Scale to add more."
        : `This plan allows up to ${spec.maxAliases} aliases.`,
      { retryable: false },
    );
  }
  const aliasResult = await getMailProvider(c.env).provisionAlias({ address, destination: dest });
  if (!aliasResult.ok) {
    throw new ApiError(502, aliasResult.code, aliasResult.message, { retryable: aliasResult.retryable });
  }
  await c.env.DB.prepare(
    `INSERT INTO aliases (id, workspace_id, domain_id, local_part, address_normalized, destination_mailbox_id, destination_address, type, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'local', 'enabled', ?)`,
  )
    .bind(id(), ws.id, domain.id, local, address, destBox.id, dest, nowIso())
    .run();
  return c.json({ ok: true, address });
});

app.get("/api/workspaces/:slug/team", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const members = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?`,
  )
    .bind(ws.id)
    .all();
  const invites = await c.env.DB.prepare(
    `SELECT id, email, role, status, expires_at FROM invitations WHERE workspace_id = ? AND status = 'pending'`,
  )
    .bind(ws.id)
    .all();
  return c.json({ members: members.results, invitations: invites.results, note: "Workspace roles do not grant mailbox message access." });
});

app.post("/api/workspaces/:slug/invitations", async (c) => {
  const user = await requireUser(c);
  if (user.account_status !== "verified") {
    throw new ApiError(403, "ACCOUNT_UNVERIFIED", "Verify your email before inviting teammates.", { retryable: false });
  }
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const entitlement = await workspaceEntitlement(c.env.DB, ws.id);
  if (!entitlement.spec.teamRoles) {
    throw new ApiError(403, "PLAN_LIMIT", "Team roles ship with Scale. Sandbox and Launch stay owner-only.", {
      retryable: false,
    });
  }
  const body = await c.req.json<{ email?: string; role?: string }>();
  const email = normalizeEmail(body.email ?? "");
  if (!email.includes("@")) throw new ApiError(400, "VALIDATION", "Enter a valid email address.", { retryable: false });
  const role = ["admin", "billing", "member", "developer"].includes(body.role ?? "") ? body.role! : "member";
  const pending = await c.env.DB.prepare(
    "SELECT id FROM invitations WHERE workspace_id = ? AND email_normalized = ? AND status = 'pending'",
  )
    .bind(ws.id, email)
    .first();
  if (pending) {
    throw new ApiError(409, "DUPLICATE", "This address already has a pending invitation.", { retryable: false });
  }
  const token = rawToken();
  const invitationId = id();
  await c.env.DB.prepare(
    `INSERT INTO invitations (id, workspace_id, email, email_normalized, role, token_hash, status, invited_by, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  )
    .bind(invitationId, ws.id, body.email, email, role, await sha256(token), user.id, new Date(Date.now() + 7 * 864e5).toISOString(), nowIso())
    .run();
  const path = `/invitations/${token}`;
  const mail = await sendAccountMail(c.env, {
    to: body.email ?? email,
    subject: `Join ${ws.name} on Postlane`,
    text: `${user.name} invited you to ${ws.name} as ${role}.\n\n${appOrigin(c.env)}${path}\n`,
    path,
    purpose: "invite",
  });
  return c.json({
    invitationId,
    sent: mail.sent,
    mock: mail.mock,
    url: mail.url,
    message: mail.mock ? "No invitation email was sent." : mail.message,
  });
});

app.get("/api/invitations/:token", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT i.*, w.name as workspace_name, w.slug
     FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
     WHERE i.token_hash = ?`,
  )
    .bind(await sha256(c.req.param("token")))
    .first<Record<string, string>>();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Invitation not found.");
  if (row.status !== "pending") throw new ApiError(400, "INVITE_USED", "This invitation is no longer available.", { retryable: false });
  if (row.expires_at < nowIso()) throw new ApiError(400, "TOKEN_EXPIRED", "This invitation has expired.", { retryable: false });
  return c.json({
    workspace: row.workspace_name,
    slug: row.slug,
    role: row.role,
    email: row.email,
  });
});

app.post("/api/invitations/:token/accept", async (c) => {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare("SELECT * FROM invitations WHERE token_hash = ?")
    .bind(await sha256(c.req.param("token")))
    .first<Record<string, string>>();
  if (!row || row.status !== "pending") throw new ApiError(400, "INVITE_USED", "This invitation is no longer available.", { retryable: false });
  if (normalizeEmail(user.email) !== row.email_normalized) {
    throw new ApiError(403, "WRONG_RECIPIENT", "Sign in with the invited email address.", { retryable: false });
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE invitations SET status = 'accepted' WHERE id = ?").bind(row.id),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO memberships (id, workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(id(), row.workspace_id, user.id, row.role, nowIso()),
  ]);
  return c.json({ ok: true });
});

app.get("/api/workspaces/:slug/notifications", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(ws.id)
    .all();
  const prefs = await c.env.DB.prepare(
    "SELECT setup_dns, billing, product FROM notification_prefs WHERE user_id = ? AND workspace_id = ?",
  )
    .bind(user.id, ws.id)
    .first();
  return c.json({ notifications: results, prefs: prefs ?? { setup_dns: 1, billing: 1, product: 0 } });
});

app.post("/api/workspaces/:slug/notifications/read", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  await c.env.DB.prepare("UPDATE notifications SET unread = 0 WHERE workspace_id = ?").bind(ws.id).run();
  return c.json({ ok: true });
});

app.patch("/api/workspaces/:slug/notifications/prefs", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const body = await c.req.json<{ setup_dns?: number; billing?: number; product?: number }>();
  await c.env.DB.prepare(
    `INSERT INTO notification_prefs (user_id, workspace_id, setup_dns, billing, product)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, workspace_id) DO UPDATE SET setup_dns = excluded.setup_dns, billing = excluded.billing, product = excluded.product`,
  )
    .bind(user.id, ws.id, body.setup_dns ?? 1, body.billing ?? 1, body.product ?? 0)
    .run();
  return c.json({ ok: true });
});

app.get("/api/workspaces/:slug/activity", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const { results } = await c.env.DB.prepare(
    "SELECT id, event, resource, result, correlation_id, created_at, actor_user_id FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 80",
  )
    .bind(ws.id)
    .all();
  return c.json({ events: results });
});

app.get("/api/workspaces/:slug/billing", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const subscription = await c.env.DB.prepare("SELECT * FROM subscriptions WHERE workspace_id = ?").bind(ws.id).first();
  const invoices = await c.env.DB.prepare("SELECT * FROM invoices WHERE workspace_id = ?").bind(ws.id).all();
  return c.json({
    subscription,
    invoices: invoices.results,
    placeholder: false,
    message: "Launch and Scale are billed monthly through Stripe. Sandbox does not require a card.",
  });
});

app.get("/api/workspaces/:slug/migrations", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const { results } = await c.env.DB.prepare("SELECT * FROM migrations WHERE workspace_id = ?").bind(ws.id).all();
  return c.json({ migrations: results });
});

app.post("/api/workspaces/:slug/migrations", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  requireRole(ws.role, ["owner", "admin"]);
  const body = await c.req.json<{ sourceProvider?: string; sourceHost?: string; mapping?: unknown }>();
  const migrationId = id();
  await c.env.DB.prepare(
    `INSERT INTO migrations (id, workspace_id, status, source_provider, source_host, mapping_json, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)`,
  )
    .bind(migrationId, ws.id, body.sourceProvider ?? "imap", body.sourceHost ?? "", JSON.stringify(body.mapping ?? []), nowIso(), nowIso())
    .run();
  return c.json({
    migrationId,
    status: "draft",
    message: "Connection credentials are not stored. Authorize a provider before any copy job can start.",
  });
});

app.post("/api/workspaces/:slug/support", async (c) => {
  const user = await requireUser(c);
  const ws = await workspaceBySlug(c.env.DB, c.req.param("slug"), user.id);
  const body = await c.req.json<{ subject?: string; body?: string }>();
  if (!body.subject?.trim() || !body.body?.trim()) {
    throw new ApiError(400, "VALIDATION", "Describe what happened.", { retryable: false });
  }
  const ticketId = id();
  await c.env.DB.prepare(
    `INSERT INTO support_tickets (id, workspace_id, user_id, subject, body, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)`,
  )
    .bind(ticketId, ws.id, user.id, body.subject.trim(), body.body.trim(), nowIso())
    .run();
  return c.json({ ticketId, status: "open" });
});

app.get("/api/account/security", async (c) => {
  const user = await requireUser(c);
  const { results } = await c.env.DB.prepare(
    "SELECT id, user_agent, created_at, expires_at FROM sessions WHERE user_id = ? AND kind = 'customer'",
  )
    .bind(user.id)
    .all();
  return c.json({
    user: publicUser(user),
    sessions: results,
    mfa: { enabled: false, message: "Authenticator enrollment is specified, not connected to a provider yet." },
  });
});

app.delete("/api/account/sessions/:id", async (c) => {
  const user = await requireUser(c);
  await c.env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(c.req.param("id"), user.id).run();
  return c.json({ ok: true });
});

app.get("/api/jobs/:id", async (c) => {
  const user = await requireUser(c);
  const job = await c.env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(c.req.param("id")).first<Record<string, string>>();
  if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found.");
  await membership(c.env.DB, job.workspace_id, user.id);
  return c.json({
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    sanitizedError: job.sanitized_error,
    correlationId: job.correlation_id,
  });
});

app.post("/api/staff/login", async (c) => {
  if (!isDev(c.env)) throw new ApiError(404, "NOT_FOUND", "Not found.");
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = normalizeEmail(body.email ?? "ops@postlane.example");
  const password = body.password || "postlane-ops-local";
  let row = await c.env.DB.prepare("SELECT * FROM staff_users WHERE email_normalized = ?").bind(email).first<Record<string, string>>();
  if (!row) {
    const secret = await hashPassword(password);
    const staffId = id();
    await c.env.DB.prepare(
      `INSERT INTO staff_users (id, email_normalized, name, password_hash, password_salt, created_at)
       VALUES (?, ?, 'Local operator', ?, ?, ?)`,
    )
      .bind(staffId, email, secret.hash, secret.salt, nowIso())
      .run();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, email_normalized, password_hash, password_salt, account_status, created_at, updated_at)
       VALUES (?, 'Local operator', ?, ?, ?, ?, 'verified', ?, ?)`,
    )
      .bind(staffId, email, email, secret.hash, secret.salt, nowIso(), nowIso())
      .run();
    row = { id: staffId, email_normalized: email, name: "Local operator", password_hash: secret.hash, password_salt: secret.salt };
  } else {
    const check = await hashPassword(password, row.password_salt);
    if (check.hash !== row.password_hash) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Staff credentials are incorrect.", { retryable: false });
    }
  }
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, email_normalized, password_hash, password_salt, account_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?)`,
  )
    .bind(row.id, row.name, row.email_normalized, row.email_normalized, row.password_hash, row.password_salt, nowIso(), nowIso())
    .run();
  const token = await createSession(c.env, row.id, "staff", c.req.header("user-agent"));
  setCookie(c, STAFF, token, cookieOpts(c));
  return c.json({ staff: { email: row.email_normalized }, mock: true });
});

app.get("/api/ops/summary", async (c) => {
  await requireStaff(c);
  const jobs = await c.env.DB.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 40").all();
  const incidents = await c.env.DB.prepare("SELECT * FROM incidents ORDER BY created_at DESC LIMIT 20").all();
  const abuse = await c.env.DB.prepare("SELECT * FROM abuse_cases ORDER BY created_at DESC LIMIT 20").all();
  return c.json({
    jobs: jobs.results,
    incidents: incidents.results,
    abuse: abuse.results,
    provider: providerStatus(c.env),
  });
});

app.get("/api/ops/jobs/:id", async (c) => {
  await requireStaff(c);
  const job = await c.env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(c.req.param("id")).first();
  if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found.");
  return c.json({ job });
});

registerSendingRoutes(app);

export { app };
