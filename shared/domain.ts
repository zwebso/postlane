export const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
export const MAILBOX_RE = /^[a-z0-9][a-z0-9._-]*$/i;
export const MIN_PASSWORD = 12;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";
  if (!value) throw new Error("Enter a domain such as northstar.studio.");
  const hostname = value.split(":")[0] ?? "";
  if (!DOMAIN_RE.test(hostname) && !hostname.includes("xn--")) {
    throw new Error("Enter a valid domain such as northstar.studio.");
  }
  return hostname;
}

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "workspace";
}

export function knownMailMx(hosts: string[]): "google" | "microsoft" | "cloudflare" | "other" | null {
  const joined = hosts.join(" ").toLowerCase();
  if (!joined) return null;
  if (joined.includes("google") || joined.includes("aspmx") || joined.includes("googlemail")) return "google";
  if (joined.includes("outlook") || joined.includes("protection.outlook") || joined.includes("microsoft")) {
    return "microsoft";
  }
  if (joined.includes("mx.cloudflare.net")) return "cloudflare";
  return "other";
}

export type GateId =
  | "account_verified"
  | "entitlement_active"
  | "ownership_verified"
  | "mailboxes_prepared"
  | "dns_routing"
  | "dns_authentication"
  | "inbound_passed"
  | "outbound_passed";

export type GateInput = {
  accountVerified: boolean;
  entitlementActive: boolean;
  ownershipVerified: boolean;
  preparedMailboxes: number;
  mxValid: boolean;
  spfValid: boolean;
  dkimValid: boolean;
  inboundPassed: boolean;
  outboundPassed: boolean;
};

export function activationGates(input: GateInput): { id: GateId; ok: boolean; label: string }[] {
  return [
    { id: "account_verified", ok: input.accountVerified, label: "Account verified" },
    { id: "entitlement_active", ok: input.entitlementActive, label: "Subscription confirmed" },
    { id: "ownership_verified", ok: input.ownershipVerified, label: "Domain ownership verified" },
    { id: "mailboxes_prepared", ok: input.preparedMailboxes > 0, label: "Mailboxes prepared" },
    { id: "dns_routing", ok: input.mxValid, label: "Mail routing configured" },
    { id: "dns_authentication", ok: input.spfValid && input.dkimValid, label: "Sender authentication configured" },
    { id: "inbound_passed", ok: input.inboundPassed, label: "Inbound delivery verified" },
    { id: "outbound_passed", ok: input.outboundPassed, label: "Outbound delivery verified" },
  ];
}

export function canActivateMailbox(input: GateInput): boolean {
  return activationGates(input).every((gate) => gate.ok);
}

export type PlanId = "sandbox" | "launch" | "scale";

const PLAN_ALIASES: Record<string, PlanId> = {
  free: "sandbox",
  starter: "launch",
  business: "scale",
};

export const PLAN_CATALOG = {
  sandbox: {
    id: "sandbox" as const,
    label: "Sandbox",
    tagline: "Try the API before you pay",
    blurb: "One product, a staging domain, and a spare. No card.",
    priceCents: 0,
    quotaMb: 200,
    maxMailboxes: 1,
    billed: "No card required",
    maxAliases: 1,
    domainLimit: 3,
    emailsPerDay: 100,
    emailsPerMonth: 1_000,
    apiKeyLimit: 2,
    webhookLimit: 1,
    eventRetentionDays: 7,
    rateLimitPerSecond: 5,
    teamRoles: false,
    features: [
      "3 sending domains — app, staging, and a spare",
      "100 emails each UTC day, 1,000 each month",
      "2 API keys so preview stays off production",
      "1 webhook to wire delivered and bounced",
      "7-day event history for debugging",
    ],
  },
  launch: {
    id: "launch" as const,
    label: "Launch",
    tagline: "Send your first production emails",
    blurb: "A live product: welcome, confirm, billing, and shipping.",
    priceCents: 2_000,
    quotaMb: 20_000,
    maxMailboxes: 10,
    billed: "Billed monthly",
    maxAliases: 2_000,
    domainLimit: 10,
    emailsPerDay: 1_500,
    emailsPerMonth: 40_000,
    apiKeyLimit: 10,
    webhookLimit: 5,
    eventRetentionDays: 30,
    rateLimitPerSecond: 10,
    teamRoles: false,
    features: [
      "10 sending domains for product, brand, and clients",
      "1,500 emails each UTC day, 40,000 each month",
      "10 scoped API keys, one per app or environment",
      "5 webhook endpoints for prod, staging, and workers",
      "30-day event history",
    ],
  },
  scale: {
    id: "scale" as const,
    label: "Scale",
    tagline: "Many apps or client domains",
    blurb: "Agencies and multi-brand products. One workspace, many From domains.",
    priceCents: 6_000,
    quotaMb: 50_000,
    maxMailboxes: 50,
    billed: "Billed monthly",
    maxAliases: 2_000,
    domainLimit: 30,
    emailsPerDay: 4_000,
    emailsPerMonth: 100_000,
    apiKeyLimit: 25,
    webhookLimit: 10,
    eventRetentionDays: 30,
    rateLimitPerSecond: 25,
    teamRoles: true,
    features: [
      "30 sending domains in one workspace",
      "4,000 emails each UTC day, 100,000 each month",
      "25 scoped API keys, one per client or service",
      "10 webhook endpoints and team roles",
      "25 requests per second for concurrent apps",
    ],
  },
} as const;

export type PlanSpec = (typeof PLAN_CATALOG)[PlanId];

/** Hard limits from Cloudflare Email Service. They apply on every plan. */
export const PROVIDER_LIMITS = {
  recipientsPerMessage: 50,
  messageBytes: 5 * 1024 * 1024,
} as const;

export const PLAN_IDS = Object.keys(PLAN_CATALOG) as PlanId[];

export function normalizePlan(plan?: string | null): PlanId {
  const value = plan?.trim().toLowerCase() ?? "";
  if (value === "sandbox" || value === "launch" || value === "scale") return value;
  return PLAN_ALIASES[value] ?? "sandbox";
}

export function isFreePlan(plan?: string | null): boolean {
  return normalizePlan(plan) === "sandbox";
}

export function effectiveSendingPlan(plan?: string | null, status?: string | null): PlanId {
  const id = normalizePlan(plan);
  if (id === "sandbox" || status === "active") return id;
  return "sandbox";
}

export function placeholderPriceCents(plan: string, _seats = 1): number {
  return PLAN_CATALOG[normalizePlan(plan)].priceCents;
}

export function utcDayStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function utcMonthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function recipientCount(input: { to?: string | string[]; cc?: string | string[]; bcc?: string | string[] }): number {
  const list = (value?: string | string[]) => (Array.isArray(value) ? value : value ? [value] : []);
  return [...list(input.to), ...list(input.cc), ...list(input.bcc)].map((item) => item.trim()).filter(Boolean).length;
}

export const PLACEHOLDER_QUOTA_MB = {
  sandbox: PLAN_CATALOG.sandbox.quotaMb,
  launch: PLAN_CATALOG.launch.quotaMb,
  scale: PLAN_CATALOG.scale.quotaMb,
} as const;

export function formatQuota(quotaMb: number): string {
  if (quotaMb >= 1000 && quotaMb % 1000 === 0) return `${quotaMb / 1000} GB`;
  return `${quotaMb} MB`;
}

export function mailboxQuotaMb(box: { quota_mb?: number | null; quota_gb?: number | null }): number {
  if (typeof box.quota_mb === "number" && box.quota_mb > 0) return box.quota_mb;
  if (typeof box.quota_gb === "number" && box.quota_gb > 0) return Math.round(box.quota_gb * 1000);
  return 0;
}
