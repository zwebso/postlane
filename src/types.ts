export type ProviderStatus = {
  configured: boolean;
  id: string;
  label: string;
  mock: boolean;
  message: string;
  webmail?: string;
  dns?: string;
  region?: string;
  credentials?: string;
  quotas?: string;
  terms?: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  accountStatus: string;
};

export type WorkspaceRef = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

export type Gate = { id: string; ok: boolean; label: string };

export type DnsRow = {
  component: string;
  record_type: string;
  host: string;
  full_hostname: string;
  expected_value: string;
  ttl?: string | null;
  mx_priority?: number | null;
  required: number;
  status?: string | null;
  detected_value?: string | null;
  error_code?: string | null;
  checked_at?: string | null;
  next_check_at?: string | null;
};

export type Mailbox = {
  id: string;
  local_part: string;
  address_normalized: string;
  display_name: string | null;
  status: string;
  quota_mb?: number;
  quota_gb?: number;
  storage_bytes: number;
};

export type SetupSnapshot = {
  version: number;
  workspace: {
    id: string;
    slug: string;
    name: string;
    recovery_email: string | null;
    contact_email: string | null;
    timezone: string;
  } | null;
  subscription: {
    plan: string;
    status: string;
    seat_count: number;
  } | null;
  domain: {
    id: string;
    name: string;
    name_normalized: string;
    ownership_status: string;
    has_existing_mail: number;
    verify_token: string;
  } | null;
  mailboxes: Mailbox[];
  dns: DnsRow[];
  delivery: {
    inbound: { status: string; evidence?: string } | null;
    outbound: { status: string; evidence?: string } | null;
  };
  gates: Gate[];
  activationAllowed: boolean;
  nextStep: string;
  provider: ProviderStatus;
  pricingNote: string;
};

export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  correlationId: string;
};

export const SETUP_STEPS = ["workspace", "plan", "domain", "mailboxes", "dns", "delivery"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
