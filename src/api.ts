import type { ApiError, ProviderStatus, SessionUser, SetupSnapshot, WorkspaceRef } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok) {
    const err = new Error(data.message || "Request failed") as Error & ApiError;
    Object.assign(err, data);
    throw err;
  }
  return data;
}

export const api = {
  health: () => request<{ provider: ProviderStatus }>("/api/health"),
  session: () =>
    request<{ user: SessionUser | null; workspaces: WorkspaceRef[]; provider: ProviderStatus }>(
      "/api/session",
    ),
  signup: (body: { name: string; email: string; password: string; consent: boolean }) =>
    request<{ user: SessionUser; verification: { url?: string; message: string; mock: boolean } }>("/api/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyEmail: (token: string) => request<{ user: SessionUser }>("/api/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: SessionUser }>("/api/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{ message: string; url?: string; mock?: boolean }>("/api/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request("/api/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  createWorkspace: (body: { name: string; recoveryEmail: string }) =>
    request<{ workspace: WorkspaceRef }>("/api/workspaces", { method: "POST", body: JSON.stringify(body) }),
  setup: (slug: string) => request<SetupSnapshot>(`/api/workspaces/${slug}/setup`),
  patchWorkspace: (slug: string, body: Record<string, string>) =>
    request(`/api/workspaces/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  billingPortal: (slug: string) =>
    request<{ url: string }>(`/api/workspaces/${slug}/billing/portal`, { method: "POST" }),
  checkout: (slug: string, plan: "sandbox" | "launch" | "scale") =>
    request<{ status: string; message: string; amountCents: number; mock: boolean; url?: string }>(`/api/workspaces/${slug}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  addDomain: (slug: string, body: { domain: string; dnsProvider?: string; existingMail?: boolean }) =>
    request<{
      domainId: string;
      name: string;
      warning: string | null;
      existingMail: { existingProvider: string | null; multipleSpf: boolean; mxHosts: string[] };
    }>(`/api/workspaces/${slug}/domains`, { method: "POST", body: JSON.stringify(body) }),
  checkDns: (slug: string, domainId: string) =>
    request<{ jobId: string }>(`/api/workspaces/${slug}/domains/${domainId}/checks`, { method: "POST" }),
  createMailbox: (slug: string, body: { localPart: string; displayName: string }) =>
    request<{ mailboxId: string; address: string; status: string }>(`/api/workspaces/${slug}/mailboxes`, {
      method: "POST",
      body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() }),
    }),
  mailboxes: (slug: string) => request<{ mailboxes: SetupSnapshot["mailboxes"] }>(`/api/workspaces/${slug}/mailboxes`),
  patchMailbox: (slug: string, id: string, displayName: string) =>
    request(`/api/workspaces/${slug}/mailboxes/${id}`, { method: "PATCH", body: JSON.stringify({ displayName }) }),
  deleteMailbox: (slug: string, id: string, confirm: string) =>
    request(`/api/workspaces/${slug}/mailboxes/${id}?confirm=${encodeURIComponent(confirm)}`, { method: "DELETE" }),
  deliveryChecks: (slug: string, mailboxId: string) =>
    request<{ inbound: { status: string; evidence: string }; outbound: { status: string; evidence: string }; activated: boolean; message: string }>(
      `/api/workspaces/${slug}/mailboxes/${mailboxId}/delivery-checks`,
      { method: "POST" },
    ),
  aliases: (slug: string) => request<{ aliases: Array<Record<string, string>> }>(`/api/workspaces/${slug}/aliases`),
  createAlias: (slug: string, body: { localPart: string; destination: string }) =>
    request(`/api/workspaces/${slug}/aliases`, { method: "POST", body: JSON.stringify(body) }),
  team: (slug: string) =>
    request<{ members: Array<Record<string, string>>; invitations: Array<Record<string, string>>; note: string }>(
      `/api/workspaces/${slug}/team`,
    ),
  invite: (slug: string, body: { email: string; role: string }) =>
    request<{ url?: string; message: string; mock?: boolean; sent?: boolean }>(`/api/workspaces/${slug}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  mailboxMessages: (slug: string, mailboxId: string) =>
    request<{
      mailbox: { id: string; address: string; status: string };
      messages: Array<{ id: string; direction: string; from_address: string | null; to_address: string; subject: string | null; created_at: string }>;
      compose: { attachments: boolean; note: string };
    }>(`/api/workspaces/${slug}/mailboxes/${mailboxId}/messages`),
  composeMessage: (slug: string, mailboxId: string, body: { to: string; subject: string; text: string }) =>
    request<{ ok: boolean; message: string }>(`/api/workspaces/${slug}/mailboxes/${mailboxId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  invitation: (token: string) => request<{ workspace: string; role: string; email: string; slug: string }>(`/api/invitations/${token}`),
  acceptInvite: (token: string) => request(`/api/invitations/${token}/accept`, { method: "POST" }),
  notifications: (slug: string) =>
    request<{ notifications: Array<Record<string, string | number>>; prefs: Record<string, number> }>(
      `/api/workspaces/${slug}/notifications`,
    ),
  readNotifications: (slug: string) => request(`/api/workspaces/${slug}/notifications/read`, { method: "POST" }),
  saveNotifPrefs: (slug: string, prefs: Record<string, number>) =>
    request(`/api/workspaces/${slug}/notifications/prefs`, { method: "PATCH", body: JSON.stringify(prefs) }),
  activity: (slug: string) => request<{ events: Array<Record<string, string>> }>(`/api/workspaces/${slug}/activity`),
  billing: (slug: string) =>
    request<{ subscription: Record<string, string | number> | null; invoices: unknown[]; message: string }>(
      `/api/workspaces/${slug}/billing`,
    ),
  migrations: (slug: string) => request<{ migrations: Array<Record<string, string>> }>(`/api/workspaces/${slug}/migrations`),
  createMigration: (slug: string, body: Record<string, string>) =>
    request(`/api/workspaces/${slug}/migrations`, { method: "POST", body: JSON.stringify(body) }),
  support: (slug: string, body: { subject: string; body: string }) =>
    request<{ ticketId: string }>(`/api/workspaces/${slug}/support`, { method: "POST", body: JSON.stringify(body) }),
  security: () =>
    request<{ sessions: Array<Record<string, string>>; mfa: { enabled: boolean; message: string } }>("/api/account/security"),
  revokeSession: (id: string) => request(`/api/account/sessions/${id}`, { method: "DELETE" }),
  staffLogin: () => request("/api/staff/login", { method: "POST", body: JSON.stringify({}) }),
  ops: () => request<{ jobs: Array<Record<string, string>>; incidents: unknown[]; abuse: unknown[] }>("/api/ops/summary"),
};
