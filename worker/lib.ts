import type { Context } from "hono";

export type AppEnv = { Bindings: Env; Variables: { cid: string } };

export type ApiErrorBody = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  resourceId?: string;
  retryable: boolean;
  retryAfter?: number;
  correlationId: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extras: Partial<ApiErrorBody> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function correlationId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(): string {
  return crypto.randomUUID();
}

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: hex(bits), salt: hex(salt) };
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(digest);
}

export function rawToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(24)));
}

export function isDev(env: Env): boolean {
  return env.ENVIRONMENT !== "production";
}

export function jsonError(c: Context<AppEnv>, err: ApiError, cid: string) {
  const body: ApiErrorBody = {
    code: err.code,
    message: err.message,
    retryable: err.extras.retryable ?? err.status >= 500,
    correlationId: cid,
    ...err.extras,
  };
  return c.json(body, err.status as 400);
}

export async function audit(
  db: D1Database,
  input: {
    workspaceId?: string | null;
    actorUserId?: string | null;
    event: string;
    resource?: string;
    result: string;
    correlationId: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, workspace_id, actor_user_id, event, resource, result, correlation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id(),
      input.workspaceId ?? null,
      input.actorUserId ?? null,
      input.event,
      input.resource ?? null,
      input.result,
      input.correlationId,
      nowIso(),
    )
    .run();
}

export async function notify(
  db: D1Database,
  input: {
    workspaceId?: string | null;
    userId?: string | null;
    eventKey: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
    actionUrl?: string;
  },
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO notifications
        (id, workspace_id, user_id, event_key, title, body, severity, unread, action_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id(),
      input.workspaceId ?? null,
      input.userId ?? null,
      input.eventKey,
      input.title,
      input.body,
      input.severity,
      input.actionUrl ?? null,
      nowIso(),
    )
    .run();
}

export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  account_status: string;
};

export type Membership = {
  workspace_id: string;
  role: string;
  slug: string;
  name: string;
};
