import { checkRequirement, type DnsCheck } from "./dns";
import { CLOUDFLARE_SENDING_DNS } from "./providers/spec";

export type SendingRecord = {
  type: string;
  name: string;
  value: string;
  purpose: string;
  hostname: string;
  required: boolean;
};

export type ProviderOnboard = {
  zoneId?: string;
  tag?: string;
  enabled?: boolean;
  dkimSelector?: string;
  returnPath?: string;
  records?: SendingRecord[];
  message?: string;
  dnsApplied?: boolean;
};

type CfEnvelope<T> = {
  success?: boolean;
  errors?: { message?: string }[];
  result?: T;
};

function hostname(name: string, domain: string) {
  if (name === "@") return domain;
  return name.endsWith(`.${domain}`) || name === domain ? name : `${name}.${domain}`;
}

export function defaultSendingRecords(domain: string, token: string, dkimValue?: string): SendingRecord[] {
  return [
    {
      type: "TXT",
      name: "_postlane",
      value: `postlane-send=${token}`,
      purpose: "A token only you can publish. We look it up to confirm the domain is yours.",
      required: true,
    },
    {
      type: "MX",
      name: CLOUDFLARE_SENDING_DNS.bounceHost,
      value: CLOUDFLARE_SENDING_DNS.mxHosts.map((host, i) => `${10 + i * 10} ${host}`).join(" · "),
      purpose: "Three mail servers for bounce handling. Your website mail stays where it is.",
      required: true,
    },
    {
      type: "TXT",
      name: CLOUDFLARE_SENDING_DNS.bounceHost,
      value: CLOUDFLARE_SENDING_DNS.spf,
      purpose: "Lets receiving servers accept mail Cloudflare sends for you.",
      required: true,
    },
    {
      type: "TXT",
      name: CLOUDFLARE_SENDING_DNS.dkimHost,
      value: dkimValue || "Waiting for the real signing key. Do not invent a value.",
      purpose: "The signing key inboxes use to confirm mail came from you. Wait for a value that includes p=.",
      required: true,
    },
    {
      type: "TXT",
      name: "_dmarc",
      value: CLOUDFLARE_SENDING_DNS.dmarc,
      purpose: "Optional. Starts with a monitor-only policy you can tighten later.",
      required: false,
    },
  ].map((row) => ({ ...row, hostname: hostname(row.name, domain) }));
}

export function mergeSendingRecords(domain: string, token: string, onboard?: ProviderOnboard | null): SendingRecord[] {
  const fallback = defaultSendingRecords(domain, token);
  const fetched = onboard?.records?.length ? onboard.records : [];
  if (!fetched.length) return fallback;
  const ownership = fallback[0];
  const extras = fetched
    .filter((row) => row.name !== "_postlane" && !row.value.startsWith("postlane-send="))
    .map((row) => ({
      ...row,
      hostname: row.hostname || hostname(row.name, domain),
      required: row.required ?? true,
    }));
  return [ownership, ...extras];
}

export async function verifySendingDns(domain: string, token: string): Promise<{
  checks: Record<string, DnsCheck>;
  verified: boolean;
}> {
  const [ownership, mx, spf, dkim] = await Promise.all([
    checkRequirement({
      component: "ownership",
      record_type: "TXT",
      full_hostname: `_postlane.${domain}`,
      expected_value: `postlane-send=${token}`,
    }),
    checkRequirement({
      component: "mx",
      record_type: "MX",
      full_hostname: `${CLOUDFLARE_SENDING_DNS.bounceHost}.${domain}`,
      expected_value: CLOUDFLARE_SENDING_DNS.mxMatch,
    }),
    checkRequirement({
      component: "spf",
      record_type: "TXT",
      full_hostname: `${CLOUDFLARE_SENDING_DNS.bounceHost}.${domain}`,
      expected_value: CLOUDFLARE_SENDING_DNS.spfInclude,
    }),
    checkRequirement({
      component: "dkim",
      record_type: "TXT",
      full_hostname: `${CLOUDFLARE_SENDING_DNS.dkimHost}.${domain}`,
      expected_value: CLOUDFLARE_SENDING_DNS.dkimMatch,
    }),
  ]);
  const sendingSpf = softenSpf(spf);
  return {
    checks: { ownership, mx, spf: sendingSpf, dkim },
    verified: [ownership, mx, sendingSpf, dkim].every((check) => check.status === "valid"),
  };
}

function softenSpf(check: DnsCheck): DnsCheck {
  if (check.status === "valid") return check;
  if (check.detectedValue?.toLowerCase().includes(CLOUDFLARE_SENDING_DNS.spfInclude.toLowerCase())) {
    return { ...check, status: "valid", errorCode: null };
  }
  return check;
}

function apiToken(env: Env) {
  return env.CLOUDFLARE_API_TOKEN?.trim() || "";
}

async function cfApi<T>(env: Env, path: string, init?: RequestInit): Promise<CfEnvelope<T>> {
  const token = apiToken(env);
  if (!token) return { success: false, errors: [{ message: "Cloudflare API token is not configured." }] };
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return (await res.json().catch(() => ({ success: false, errors: [{ message: "Cloudflare API returned an unreadable response." }] }))) as CfEnvelope<T>;
}

export async function findSendingZone(env: Env, domain: string): Promise<string | null> {
  if (env.CLOUDFLARE_ZONE_ID && domain.endsWith("postlane.email")) return env.CLOUDFLARE_ZONE_ID;
  if (!apiToken(env)) return env.CLOUDFLARE_ZONE_ID || null;
  const labels = domain.split(".");
  while (labels.length >= 2) {
    const name = labels.join(".");
    const data = await cfApi<{ id: string }[]>(env, `/zones?name=${encodeURIComponent(name)}&status=active`);
    const id = data.result?.[0]?.id;
    if (id) return id;
    labels.shift();
  }
  return env.CLOUDFLARE_ZONE_ID || null;
}

function mapProviderRecords(domain: string, rows: { type?: string; name?: string; content?: string; priority?: number }[]): SendingRecord[] {
  return rows
    .filter((row) => row.type && row.content)
    .map((row) => {
      const type = (row.type || "TXT").toUpperCase();
      const full = (row.name || domain).replace(/\.$/, "");
      const name = full === domain ? "@" : full.endsWith(`.${domain}`) ? full.slice(0, -(domain.length + 1)) : full;
      return {
        type,
        name,
        value: type === "MX" && row.priority != null ? `${row.priority} ${row.content}` : row.content || "",
        purpose:
          type === "MX"
            ? "Route bounces to Cloudflare Email Sending."
            : row.content?.includes("v=DKIM1")
              ? "DKIM for Email Sending."
              : row.content?.toLowerCase().includes("v=spf1")
                ? "Authorize Cloudflare to send mail for this domain."
                : row.content?.toLowerCase().includes("v=dmarc1")
                  ? "DMARC policy."
                  : "Required by Cloudflare Email Sending.",
        hostname: full.includes(".") ? full : hostname(name, domain),
        required: true,
      };
    });
}

export async function onboardSendingDomain(env: Env, domain: string): Promise<ProviderOnboard> {
  const zoneId = await findSendingZone(env, domain);
  if (!apiToken(env)) {
    return {
      message:
        "Ownership and Email Sending DNS are checked in public DNS. Add CLOUDFLARE_API_TOKEN to create the domain in Email Sending automatically.",
    };
  }
  if (!zoneId) {
    return {
      message:
        "This domain is not a zone in the Postlane Cloudflare account. Email Sending can only send from domains onboarded on that account. Add the zone, or use a sending subdomain of a zone you already have there.",
    };
  }
  const created = await cfApi<{
    enabled?: boolean;
    name?: string;
    tag?: string;
    dkim_selector?: string;
    return_path_domain?: string;
  }>(env, `/zones/${zoneId}/email/sending/subdomains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  if (!created.success || !created.result?.tag) {
    const detail = created.errors?.[0]?.message || "Cloudflare could not onboard this sending domain.";
    return { zoneId, message: detail };
  }
  const dns = await cfApi<{ type?: string; name?: string; content?: string; priority?: number }[]>(
    env,
    `/zones/${zoneId}/email/sending/subdomains/${created.result.tag}/dns`,
  );
  await ensureDeliverySubscription(env, zoneId, domain).catch(() => undefined);
  return {
    zoneId,
    tag: created.result.tag,
    enabled: created.result.enabled,
    dkimSelector: created.result.dkim_selector,
    returnPath: created.result.return_path_domain,
    records: mapProviderRecords(domain, dns.result ?? []),
    message: created.result.enabled
      ? "Onboarded to Cloudflare Email Sending."
      : "Created in Email Sending. Finish DNS, then check again.",
  };
}

const DELIVERY_EVENTS = [
  "message.delivered",
  "message.deferred",
  "message.bounced",
  "message.failed",
  "message.rejected",
  "message.complained",
];

async function ensureDeliverySubscription(env: Env, zoneId: string, domain: string) {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!account || !apiToken(env)) return;
  const queues = await cfApi<{ queue_id?: string; queue_name?: string }[]>(env, `/accounts/${account}/queues`);
  const queue = (queues.result ?? []).find((row) => row.queue_name === "postlane-email-events" && row.queue_id);
  if (!queue?.queue_id) return;
  await cfApi(env, `/accounts/${account}/event_subscriptions/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      name: `postlane-${domain}`,
      enabled: true,
      source: { type: "email.sending", zone_id: zoneId, domain },
      destination: { type: "queues.queue", queue_id: queue.queue_id },
      events: DELIVERY_EVENTS,
    }),
  });
}
