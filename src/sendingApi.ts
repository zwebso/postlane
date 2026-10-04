import type { MailTemplate } from "../shared/templates";

export type { MailTemplate };
export type SendingEmail = { id: string; to: string; subject: string; status: string; time: string; detail?: string | null };
export type SendingActivity = { date: string; accepted: number; attention: number };
export type SendingDomain = {
  name: string;
  status: string;
  host?: string;
  provider?: "cloudflare" | "other";
  nameservers?: string[];
};

export const CLOUDFLARE_TOKEN_CREATE =
  "https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=" +
  encodeURIComponent(JSON.stringify([{ key: "zone", type: "read" }, { key: "dns", type: "edit" }])) +
  "&name=Postlane%20DNS";
export type SendingKey = { name: string; scope: string; tail: string };
export type SendingHook = { id?: string; url: string; status: string };
export type SendingRecord = { type: string; name: string; value: string; purpose: string; hostname: string; required: boolean };
export type DomainHost = {
  provider: "cloudflare" | "other";
  label?: string;
  nameservers?: string[];
  zone?: string;
  connected: boolean;
  canApply: boolean;
  oauth?: boolean;
  domainConnect?: boolean;
};
export type SendingPlan = {
  id: string;
  label: string;
  requested: string;
  status: string;
  entitled: string;
};
export type SendingLimits = {
  domains: number;
  emailsPerDay: number | null;
  emailsPerMonth: number;
  apiKeys: number;
  webhooks: number;
  eventRetentionDays: number;
  rateLimitPerSecond: number;
  teamRoles: boolean;
};
export type SendingUsage = {
  domains: number;
  emailsToday: number;
  emailsMonth: number;
  apiKeys: number;
  webhooks: number;
};

export type SendingHealthRow = {
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

export type SendingWorkspace = {
  product: "sending";
  operator?: boolean;
  user: { id: string; name: string; email: string; accountStatus: string };
  workspace: { id: string; slug: string; name: string; role: string; sendingHold?: string | null };
  live: boolean;
  plan: SendingPlan;
  billing?: { provider: string; manage: boolean };
  limits: SendingLimits;
  usage: SendingUsage;
  domains: SendingDomain[];
  keys: SendingKey[];
  hooks: SendingHook[];
  emails: SendingEmail[];
  activity?: SendingActivity[];
  suppressions: string[];
  templates?: MailTemplate[];
  notifications?: { title: string; body: string; actionUrl?: string | null }[];
  members?: { name: string; email: string; role: string }[];
  invitations?: { email: string; role: string; status: string }[];
};

export class SendingError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    throw new SendingError(data.error?.message || data.message || "Request failed.", res.status, data.error?.code || data.code);
  }
  return data as T;
}

export const sendingApi = {
  session: () => request<{ user: { name: string; email: string; accountStatus: string } | null }>("/api/session"),
  signup: (body: { name: string; email: string; password: string; consent: boolean }) =>
    request<{ verification: { url?: string; mock: boolean; message: string } }>("/api/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) => request("/api/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request("/api/logout", { method: "POST" }),
  verify: (token: string) => request("/api/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  forgot: (email: string) => request<{ message: string; url?: string }>("/api/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) =>
    request("/api/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  resendVerification: (email: string) =>
    request<{ message: string; url?: string }>("/api/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
  workspace: () => request<SendingWorkspace>("/api/sending/workspace"),
  operations: () => request<{ workspaces: SendingHealthRow[] }>("/api/sending/operations"),
  releaseHold: (workspaceId: string) =>
    request<{ ok: boolean }>(`/api/sending/operations/${encodeURIComponent(workspaceId)}/release`, { method: "POST" }),
  rename: (name: string) => request("/api/sending/workspace", { method: "PATCH", body: JSON.stringify({ name }) }),
  addDomain: (name: string) =>
    request<{ name: string; status: string; records: SendingRecord[]; host?: DomainHost }>("/api/sending/domains", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  domain: (name: string) =>
    request<{
      name: string;
      status: string;
      records: SendingRecord[];
      lastCheck: { checks?: Record<string, { status?: string; detectedValue?: string | null }>; checkedAt?: string } | null;
      host?: DomainHost;
    }>(`/api/sending/domains/${encodeURIComponent(name)}`),
  verifyDomain: (name: string) =>
    request<{
      name: string;
      status: string;
      records: SendingRecord[];
      checks?: Record<string, { status: string; detectedValue: string | null }>;
      check: { status: string; detectedValue: string | null };
    }>(`/api/sending/domains/${encodeURIComponent(name)}/verify`, { method: "POST" }),
  connectCloudflare: (token: string) => request<{ connected: boolean }>("/api/sending/cloudflare", { method: "POST", body: JSON.stringify({ token }) }),
  domainConnect: (name: string) =>
    request<{ url: string; available: boolean }>(`/api/sending/domains/${encodeURIComponent(name)}/domain-connect`),
  applyDns: (name: string) =>
    request<{ ok: boolean; zone?: string; message: string; results?: { type: string; name: string; action: string; error?: string }[] }>(
      `/api/sending/domains/${encodeURIComponent(name)}/apply-dns`,
      { method: "POST" },
    ),
  createKey: (name: string, scope: string) =>
    request<{ name: string; scope: string; tail: string; secret: string }>("/api/sending/api-keys", { method: "POST", body: JSON.stringify({ name, scope }) }),
  revokeKey: (tail: string) => request(`/api/sending/api-keys/${encodeURIComponent(tail)}`, { method: "DELETE" }),
  addSuppression: (email: string) => request("/api/sending/suppressions", { method: "POST", body: JSON.stringify({ email }) }),
  removeSuppression: (email: string) => request(`/api/sending/suppressions/${encodeURIComponent(email)}`, { method: "DELETE" }),
  send: (body: { to: string; subject: string; html?: string; text?: string }) =>
    request<{ id: string; status: string; message?: string }>("/api/sending/emails", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(body),
    }),
  deleteDomain: (name: string) => request(`/api/sending/domains/${encodeURIComponent(name)}`, { method: "DELETE" }),
  addWebhook: (url: string) =>
    request<SendingHook>("/api/sending/webhooks", { method: "POST", body: JSON.stringify({ url }) }),
  deleteWebhook: (id: string) => request(`/api/sending/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testWebhook: (id: string) =>
    request<{ ok: boolean; status: number }>(`/api/sending/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" }),
  saveTemplate: (body: { id?: string | null; name: string; subject: string; html: string; text: string }) =>
    request<MailTemplate>("/api/sending/templates", { method: "POST", body: JSON.stringify(body) }),
  deleteTemplate: (id: string) =>
    request<{ restored: MailTemplate | null }>(`/api/sending/templates/${encodeURIComponent(id)}`, { method: "DELETE" }),
  invite: (slug: string, email: string) =>
    request<{ message: string; url?: string }>(`/api/workspaces/${encodeURIComponent(slug)}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role: "developer" }),
    }),
  invitation: (token: string) =>
    request<{ workspace: string; slug: string; role: string; email: string }>(`/api/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) => request(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  selectPlan: (plan: string) =>
    request<{ plan: string; status: string; entitled: string; message: string; url?: string }>("/api/sending/plan", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  billingPortal: () => request<{ url: string }>("/api/sending/billing/portal", { method: "POST" }),
};
