/**
 * Postlane mail provider contract.
 *
 * Postlane owns accounts, workspaces, DNS checks, and activation gates.
 * A provider owns delivery, message bytes, spam handling, and reputation.
 * We do not implement SMTP or IMAP servers.
 *
 * Swap adapters with MAIL_PROVIDER=mock|cloudflare|vendor.
 */

export const SYSTEM_MAIL_DOMAIN = "postlane.email";
export const SYSTEM_MAIL_FROM = "noreply@postlane.email";
export const SYSTEM_INBOUND = ["hello@postlane.email", "support@postlane.email"] as const;

export const CLOUDFLARE_MAIL_DNS = {
  mxHosts: ["isaac.mx.cloudflare.net", "linda.mx.cloudflare.net", "amir.mx.cloudflare.net"] as const,
  mxMatch: "mx.cloudflare.net",
  spf: "v=spf1 include:_spf.mx.cloudflare.net ~all",
  dkimHost: "cf2024-1._domainkey",
  dkimMatch: "v=DKIM1",
  dmarc: "v=DMARC1; p=none",
};

export const CLOUDFLARE_SENDING_DNS = {
  bounceHost: "cf-bounce",
  dkimHost: "cf-bounce._domainkey",
  mxHosts: ["isaac.mx.cloudflare.net", "linda.mx.cloudflare.net", "amir.mx.cloudflare.net"] as const,
  mxMatch: "mx.cloudflare.net",
  spf: "v=spf1 include:_spf.mx.cloudflare.net ~all",
  spfInclude: "include:_spf.mx.cloudflare.net",
  dkimMatch: "v=DKIM1",
  dmarc: "v=DMARC1; p=none",
};

export const PROVIDER_SPECS = {
  mock: {
    id: "mock",
    label: "Mock adapter",
    mock: true,
    api: ["provisionMailbox", "deleteMailbox", "provisionAlias", "runDeliveryCheck", "sendTransactional", "getWebmailHandoff"],
    webmail: "Postlane preview only. No provider inbox.",
    dns: "Placeholder values must not be used for cutover.",
    region: "None. No message bytes are stored with a mail provider.",
    credentials: "None.",
    quotas: "None.",
    terms: "Development only. Never claim send, charge, or activation.",
    message: "No mail provider is configured. Postlane will not send mail, charge cards, or mark mailboxes live.",
  },
  cloudflare: {
    id: "cloudflare",
    label: "Cloudflare Email Routing",
    mock: false,
    api: ["Email Routing enable", "catch-all Worker", "SendEmail binding", "R2 raw MIME store"],
    webmail: "Postlane preview over R2/D1. Not a provider-hosted webmail SSO.",
    dns: "MX *.mx.cloudflare.net · SPF include:_spf.mx.cloudflare.net · DKIM cf2024-1._domainkey (v=DKIM1) · DMARC p=none",
    region: "Cloudflare edge receive; message bytes in the bound R2 bucket jurisdiction.",
    credentials: "SendEmail binding + Cloudflare API token for zone Email Routing. Never log tokens.",
    quotas: "25 MiB inbound · SendEmail transactional only · no attachments · ~100/min free · 200 routing rules per zone (use catch-all).",
    terms: "Cloudflare Terms of Service and Email Routing rules. Not a mailbox SLA. Inbox placement is not guaranteed.",
    message: "Cloudflare handles system mail and webmail-only mailboxes. IMAP, Outlook, and attachments on send are not available.",
  },
  vendor: {
    id: "vendor",
    label: "Licensed mailbox vendor",
    mock: true,
    api: ["Not licensed"],
    webmail: "Vendor-hosted webmail / SSO when a vendor is contracted.",
    dns: "Vendor MX/SPF/DKIM/DMARC — unknown until licensed.",
    region: "Vendor region — unknown until licensed.",
    credentials: "Vendor API key / OAuth — not configured.",
    quotas: "Unknown until licensed.",
    terms: "Requires a signed DPA, retention policy, and commercial terms before implementation.",
    message: "A licensed mailbox vendor is not configured. Apple Mail / Outlook / attachments need this adapter later.",
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_SPECS;
