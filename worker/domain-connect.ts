import { findSendingZone } from "./email-sending";

export const DOMAIN_CONNECT_PROVIDER = "postlane.email";
export const DOMAIN_CONNECT_SERVICE = "sending";
export const DOMAIN_CONNECT_KEY_HOST = "_dcpubkeyv1";
export const DOMAIN_CONNECT_PUBLIC_SPKI =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvrFSJDZYBaM+ewLqlfcZOEs0QgKNep+tJHPhGZyVD4bXvN3mTxEZm5vD6jQjQV3TjL1a7FGkjlFoJ2L8n7w4qw4fHNfnHKAL2G5/HzRti0CWs6v49TA6BZNPTG1zyHglThtAFPzmxh/hcFsCUswbYCw0wJEAZxtuwOeS0Q73WpuI2Dbg98HOFA6fRTZ9baoPGyS1uR8mgJdVS6pKeOdnJQHBzSWLjSPwUecRKPDEeHoFCVlCir0O8CrbElgUm8xwVbrc/BGDP+MA0mGVK5I+CWNqzrx0bHhZGUbjQOiY7MrbBw68KannKy8fLKNhNFjN7KkVafLe1cPizYOKKK7qrwIDAQAB";

let publishedKey = "";

export function sendingTemplate() {
  return {
    providerId: DOMAIN_CONNECT_PROVIDER,
    providerName: "Postlane",
    serviceId: DOMAIN_CONNECT_SERVICE,
    serviceName: "Transactional email",
    version: 1,
    syncBlock: false,
    syncPubKeyDomain: "postlane.email",
    syncRedirectDomain: "www.postlane.email",
    logoUrl: "https://www.postlane.email/favicon.png",
    description: "Authorize DNS records so Postlane can send transactional email from this domain.",
    variableDescription: "%token%: ownership token Postlane issued for this domain",
    records: [
      {
        groupId: "ownership",
        type: "TXT",
        host: "_postlane",
        ttl: 3600,
        data: "postlane-send=%token%",
        txtConflictMatchingMode: "Prefix",
        txtConflictMatchingPrefix: "postlane-send=",
      },
      { groupId: "outbound", type: "MX", host: "cf-bounce", pointsTo: "isaac.mx.cloudflare.net", ttl: 3600, priority: 10 },
      { groupId: "outbound", type: "MX", host: "cf-bounce", pointsTo: "linda.mx.cloudflare.net", ttl: 3600, priority: 20 },
      { groupId: "outbound", type: "MX", host: "cf-bounce", pointsTo: "amir.mx.cloudflare.net", ttl: 3600, priority: 30 },
      {
        groupId: "outbound",
        type: "SPFM",
        host: "cf-bounce",
        ttl: 3600,
        spfRules: "include:_spf.mx.cloudflare.net",
      },
    ],
  };
}

export function domainConnectLive(env: { DOMAIN_CONNECT_LIVE?: string }) {
  return env.DOMAIN_CONNECT_LIVE === "1";
}

export function domainConnectQuery(origin: string, domain: string, token: string) {
  const redirect = `${origin.replace(/\/$/, "")}/api/domain-connect/callback?domain=${encodeURIComponent(domain)}`;
  return [
    `domain=${encodeURIComponent(domain)}`,
    `token=${encodeURIComponent(token)}`,
    `groupId=${encodeURIComponent("ownership")}`,
    `redirect_uri=${encodeURIComponent(redirect)}`,
  ].join("&");
}

export function domainConnectApplyPath() {
  return `/domainconnect/v2/domainTemplates/providers/${DOMAIN_CONNECT_PROVIDER}/services/${DOMAIN_CONNECT_SERVICE}/apply`;
}

export async function signDomainConnectQuery(privateKeyPem: string, query: string) {
  const der = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(query));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function domainConnectApplyUrl(origin: string, domain: string, token: string, privateKeyPem?: string) {
  const query = domainConnectQuery(origin, domain, token);
  const base = `https://dash.cloudflare.com${domainConnectApplyPath()}?${query}`;
  if (!privateKeyPem) return base;
  const sig = await signDomainConnectQuery(privateKeyPem, query);
  return `${base}&key=${DOMAIN_CONNECT_KEY_HOST}&sig=${encodeURIComponent(sig)}`;
}

export function publicKeyFragments(spki = DOMAIN_CONNECT_PUBLIC_SPKI) {
  return (spki.match(/.{1,180}/g) || []).map((chunk: string, index: number) => `p=${index + 1},a=RS256,d=${chunk}`);
}

export async function ensureDomainConnectPublicKey(env: Env) {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) return;
  const fragments = publicKeyFragments();
  const stamp = fragments.join("|");
  if (publishedKey === stamp) return;
  const zone = await findSendingZone(env, "postlane.email");
  if (!zone) return;
  const listed = await cfApi<{ id: string; content: string }[]>(
    token,
    `/zones/${zone}/dns_records?type=TXT&name=${DOMAIN_CONNECT_KEY_HOST}.postlane.email`,
  );
  const have = new Set((listed || []).map((row) => row.content.replace(/^"|"$/g, "")));
  const want = new Set(fragments);
  for (const row of listed || []) {
    const content = row.content.replace(/^"|"$/g, "");
    if (!want.has(content)) {
      await cfApi(token, `/zones/${zone}/dns_records/${row.id}`, { method: "DELETE" });
    }
  }
  for (const content of fragments) {
    if (have.has(content)) continue;
    await cfApi(token, `/zones/${zone}/dns_records`, {
      method: "POST",
      body: JSON.stringify({ type: "TXT", name: DOMAIN_CONNECT_KEY_HOST, content, ttl: 3600 }),
    });
  }
  publishedKey = stamp;
}

async function cfApi<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean; result?: T } | null;
  return data?.success ? (data.result ?? null) : null;
}

function pemToArrayBuffer(pem: string) {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
