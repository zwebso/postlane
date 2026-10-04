import type { SendingRecord } from "./email-sending";

export type DnsWrite = {
  type: "TXT" | "MX";
  name: string;
  content: string;
  priority?: number;
  overwrite: boolean;
};

export type ApplyRow = {
  type: string;
  name: string;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
};

type CfEnvelope<T> = {
  success?: boolean;
  errors?: { message?: string }[];
  result?: T;
};

type CfRecord = { id: string; type: string; name: string; content: string; priority?: number };

export type DnsHostInfo = {
  provider: "cloudflare" | "other";
  label: string;
  nameservers: string[];
  zone: string;
};

const HOST_HINTS: [string, string][] = [
  ["ns.cloudflare.com", "Cloudflare"],
  ["cloudflare.com", "Cloudflare"],
  ["hostneverdie.com", "HostNeverDie"],
  ["hostingberry.com", "HostNeverDie"],
  ["domaincontrol.com", "GoDaddy"],
  ["googledomains.com", "Google Domains"],
  ["registrar-servers.com", "Namecheap"],
  ["namecheaphosting.com", "Namecheap"],
  ["awsdns", "Amazon Route 53"],
  ["azure-dns", "Azure DNS"],
  ["dnsmadeeasy.com", "DNS Made Easy"],
  ["nsone.net", "NS1"],
  ["digitalocean.com", "DigitalOcean"],
  ["ovh.net", "OVH"],
  ["siteground.net", "SiteGround"],
  ["bluehost.com", "Bluehost"],
  ["hostgator.com", "HostGator"],
  ["hostinger.com", "Hostinger"],
  ["dns.hostinger", "Hostinger"],
  ["porkbun.com", "Porkbun"],
  ["gandi.net", "Gandi"],
  ["squarespacedns.com", "Squarespace"],
  ["vercel-dns.com", "Vercel"],
  ["wixdns.net", "Wix"],
  ["ui-dns", "IONOS"],
  ["ionos.com", "IONOS"],
  ["dreamhost.com", "DreamHost"],
  ["hover.com", "Hover"],
  ["dynadot.com", "Dynadot"],
  ["worldnic.com", "Network Solutions"],
  ["name.com", "Name.com"],
];

export function isCloudflareNameserver(value: string) {
  return value.toLowerCase().includes("cloudflare.com") || value.toLowerCase().includes(".ns.cloudflare.");
}

export function labelDnsHost(nameservers: string[]): Pick<DnsHostInfo, "provider" | "label"> {
  const joined = nameservers.join(" ").toLowerCase();
  for (const [needle, label] of HOST_HINTS) {
    if (joined.includes(needle)) {
      return { provider: label === "Cloudflare" ? "cloudflare" : "other", label };
    }
  }
  const first = (nameservers[0] || "").replace(/\.$/, "");
  const parts = first.split(".").filter(Boolean);
  return { provider: "other", label: parts.slice(-2).join(".") || "your DNS host" };
}

export function recordsToWrites(records: SendingRecord[]): DnsWrite[] {
  const writes: DnsWrite[] = [];
  for (const record of records) {
    if (record.type === "TXT" && record.name.includes("_domainkey") && !/p=[A-Za-z0-9+/]/.test(record.value)) continue;
    if (record.type === "MX") {
      const parts = record.value.includes(" · ") ? record.value.split(" · ") : [record.value];
      for (const part of parts) {
        const match = part.trim().match(/^(\d+)\s+(.+)$/);
        writes.push({
          type: "MX",
          name: record.hostname,
          content: match ? match[2] : part.trim(),
          priority: match ? Number(match[1]) : 10,
          overwrite: true,
        });
      }
      continue;
    }
    if (record.type !== "TXT") continue;
    writes.push({
      type: "TXT",
      name: record.hostname,
      content: record.value,
      overwrite: record.name !== "_dmarc",
    });
  }
  return writes;
}

export async function inspectDnsHost(domain: string): Promise<DnsHostInfo> {
  const labels = domain.split(".");
  while (labels.length >= 2) {
    const zone = labels.join(".");
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(zone)}&type=NS`;
    try {
      const res = await fetch(url, { headers: { accept: "application/dns-json" } });
      const data = (await res.json()) as { Answer?: { data?: string }[] };
      const nameservers = (data.Answer ?? [])
        .map((row) => (row.data || "").replace(/\.$/, ""))
        .filter(Boolean);
      if (nameservers.length) {
        return { ...labelDnsHost(nameservers), nameservers, zone };
      }
    } catch {
      break;
    }
    labels.shift();
  }
  return { provider: "other", label: "your DNS host", nameservers: [], zone: domain };
}

export async function detectCloudflareHost(domain: string): Promise<boolean> {
  return (await inspectDnsHost(domain)).provider === "cloudflare";
}

export async function cfApi<T>(token: string, path: string, init?: RequestInit): Promise<CfEnvelope<T>> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return (await res.json().catch(() => ({
    success: false,
    errors: [{ message: "Cloudflare API returned an unreadable response." }],
  }))) as CfEnvelope<T>;
}

export async function verifyCloudflareToken(token: string) {
  const data = await cfApi<{ status?: string }>(token, "/user/tokens/verify");
  if (data.success) return true;
  const zones = await cfApi<unknown[]>(token, "/zones?per_page=1");
  return Boolean(zones.success);
}

export async function findZoneForDomain(token: string, domain: string): Promise<{ id: string; name: string } | null> {
  const labels = domain.split(".");
  while (labels.length >= 2) {
    const name = labels.join(".");
    const data = await cfApi<{ id: string; name: string }[]>(token, `/zones?name=${encodeURIComponent(name)}&status=active`);
    const zone = data.result?.[0];
    if (zone?.id) return { id: zone.id, name: zone.name };
    labels.shift();
  }
  return null;
}

async function existingRecord(token: string, zoneId: string, write: DnsWrite): Promise<CfRecord | null> {
  const params = new URLSearchParams({ type: write.type, name: write.name, per_page: "50" });
  const data = await cfApi<CfRecord[]>(token, `/zones/${zoneId}/dns_records?${params}`);
  const rows = data.result ?? [];
  if (write.type === "MX" && write.priority != null) {
    return rows.find((row) => row.priority === write.priority) || rows[0] || null;
  }
  return rows[0] || null;
}

export async function applyDnsWrites(
  token: string,
  zoneId: string,
  writes: DnsWrite[],
): Promise<ApplyRow[]> {
  const results: ApplyRow[] = [];
  for (const write of writes) {
    const found = await existingRecord(token, zoneId, write);
    const same =
      found &&
      found.content.replace(/^\u0022|\u0022$/g, "") === write.content &&
      (write.priority == null || found.priority === write.priority);
    if (found && same) {
      results.push({ type: write.type, name: write.name, action: "skipped" });
      continue;
    }
    if (found && !write.overwrite) {
      results.push({ type: write.type, name: write.name, action: "skipped" });
      continue;
    }
    const body = {
      type: write.type,
      name: write.name,
      content: write.content,
      ttl: 1,
      proxied: false,
      ...(write.priority != null ? { priority: write.priority } : {}),
    };
    const saved = found
      ? await cfApi<CfRecord>(token, `/zones/${zoneId}/dns_records/${found.id}`, { method: "PUT", body: JSON.stringify(body) })
      : await cfApi<CfRecord>(token, `/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(body) });
    if (!saved.success) {
      results.push({
        type: write.type,
        name: write.name,
        action: "failed",
        error: saved.errors?.[0]?.message || "Cloudflare could not save this record.",
      });
      continue;
    }
    results.push({ type: write.type, name: write.name, action: found ? "updated" : "created" });
  }
  return results;
}

export async function applySendingDns(token: string, domain: string, records: SendingRecord[]) {
  const zone = await findZoneForDomain(token, domain);
  if (!zone) {
    return {
      ok: false as const,
      message: "That Cloudflare account does not include this domain. Connect the account that hosts the zone.",
    };
  }
  const results = await applyDnsWrites(token, zone.id, recordsToWrites(records));
  const failed = results.filter((row) => row.action === "failed");
  return {
    ok: failed.length === 0,
    zone: zone.name,
    results,
    message:
      failed.length === 0
        ? `Added the sending records in Cloudflare for ${zone.name}.`
        : failed[0].error || "Some records could not be added.",
  };
}
