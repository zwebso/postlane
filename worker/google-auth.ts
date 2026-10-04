import { normalizeEmail } from "../shared/domain";
import { hashPassword, id, nowIso, rawToken } from "./lib";

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};

export type GoogleAccountAction = "create" | "login" | "link" | "conflict" | "unverified";

export type GoogleUserRow = {
  id: string;
  name: string;
  email: string;
  email_normalized: string;
  account_status: string;
  google_sub: string | null;
  auth_provider: string | null;
};

const AUTH_ERRORS: Record<string, string> = {
  not_configured: "Google sign-in is not configured yet.",
  denied: "Google sign-in was cancelled.",
  unverified: "Google did not verify that email address.",
  conflict: "This email is already linked to a different Google account. Sign in with email instead.",
  failed: "Google sign-in failed. Try again.",
};

export function googleConfigured(env: Env) {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleAuthErrorMessage(code: string | null | undefined) {
  return AUTH_ERRORS[code ?? ""] || AUTH_ERRORS.failed;
}

export function googleCallbackPath(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function googleAuthUrl(env: Env, state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID?.trim() || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function googleAccountDecision(
  profile: GoogleProfile,
  existing: Pick<GoogleUserRow, "google_sub"> | null,
): GoogleAccountAction {
  if (!profile.email_verified || !profile.sub || !profile.email.includes("@")) return "unverified";
  if (!existing) return "create";
  if (existing.google_sub && existing.google_sub !== profile.sub) return "conflict";
  if (existing.google_sub === profile.sub) return "login";
  return "link";
}

export function displayNameFromGoogle(profile: GoogleProfile) {
  const name = profile.name?.trim() || "";
  if (name.length >= 2) return name;
  const local = profile.email.split("@")[0]?.trim() || "";
  return local.length >= 2 ? local : "Google user";
}

export function parseGoogleProfile(data: unknown): GoogleProfile | null {
  if (!data || typeof data !== "object") return null;
  const row = data as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
  };
  if (typeof row.sub !== "string" || !row.sub) return null;
  if (typeof row.email !== "string" || !row.email.includes("@")) return null;
  return {
    sub: row.sub,
    email: row.email,
    email_verified: row.email_verified === true || row.email_verified === "true",
    name: typeof row.name === "string" ? row.name : undefined,
  };
}

export async function exchangeGoogleCode(env: Env, code: string, redirectUri: string): Promise<GoogleProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID?.trim() || "",
      client_secret: env.GOOGLE_CLIENT_SECRET?.trim() || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new Error(tokenBody.error || "Google token exchange failed.");
  }
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const profile = parseGoogleProfile(await profileRes.json().catch(() => null));
  if (!profileRes.ok || !profile) {
    throw new Error("Google profile lookup failed.");
  }
  return profile;
}

export async function upsertGoogleUser(
  db: D1Database,
  profile: GoogleProfile,
): Promise<{ user: GoogleUserRow } | { error: "unverified" | "conflict" }> {
  const action = googleAccountDecision(profile, null);
  if (action === "unverified") return { error: "unverified" };

  const normalized = normalizeEmail(profile.email);
  const existing = await db
    .prepare(
      `SELECT id, name, email, email_normalized, account_status, google_sub, auth_provider
       FROM users WHERE google_sub = ? OR email_normalized = ?
       ORDER BY CASE WHEN google_sub = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .bind(profile.sub, normalized, profile.sub)
    .first<GoogleUserRow>();

  const decided = googleAccountDecision(profile, existing);
  if (decided === "unverified") return { error: "unverified" };
  if (decided === "conflict") return { error: "conflict" };

  if (existing && (decided === "login" || decided === "link")) {
    const provider = existing.auth_provider === "password" || !existing.auth_provider ? "both" : existing.auth_provider;
    await db
      .prepare(
        `UPDATE users
         SET google_sub = ?, auth_provider = ?, account_status = 'verified', updated_at = ?
         WHERE id = ?`,
      )
      .bind(profile.sub, existing.auth_provider === "google" ? "google" : provider, nowIso(), existing.id)
      .run();
    return {
      user: {
        ...existing,
        google_sub: profile.sub,
        auth_provider: existing.auth_provider === "google" ? "google" : provider,
        account_status: "verified",
      },
    };
  }

  const secret = await hashPassword(rawToken());
  const user: GoogleUserRow = {
    id: id(),
    name: displayNameFromGoogle(profile),
    email: profile.email,
    email_normalized: normalized,
    account_status: "verified",
    google_sub: profile.sub,
    auth_provider: "google",
  };
  await db
    .prepare(
      `INSERT INTO users (id, name, email, email_normalized, password_hash, password_salt, account_status, google_sub, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, 'google', ?, ?)`,
    )
    .bind(user.id, user.name, user.email, user.email_normalized, secret.hash, secret.salt, user.google_sub, nowIso(), nowIso())
    .run();
  return { user };
}
