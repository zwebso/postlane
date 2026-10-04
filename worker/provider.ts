import { CloudflareMailProvider } from "./providers/cloudflare";
import { MockMailProvider } from "./providers/mock";
import { PROVIDER_SPECS, type ProviderId } from "./providers/spec";
import type { MailProvider, ProviderStatus } from "./providers/types";
import { VendorMailboxProvider } from "./providers/vendor";

export type { MailProvider, ProviderMailbox, ProviderResult, ProviderStatus } from "./providers/types";
export { MockMailProvider } from "./providers/mock";
export { CloudflareMailProvider } from "./providers/cloudflare";
export { VendorMailboxProvider } from "./providers/vendor";
export { PROVIDER_SPECS, SYSTEM_MAIL_DOMAIN, SYSTEM_MAIL_FROM, SYSTEM_INBOUND, CLOUDFLARE_MAIL_DNS, CLOUDFLARE_SENDING_DNS } from "./providers/spec";

export function providerIdFromEnv(env: Env): ProviderId {
  const raw = (env.MAIL_PROVIDER || "mock").toLowerCase();
  if (raw === "cloudflare" || raw === "vendor") return raw;
  return "mock";
}

export function getMailProvider(env: Env): MailProvider {
  const id = providerIdFromEnv(env);
  if (id === "cloudflare") return new CloudflareMailProvider(env);
  if (id === "vendor") return new VendorMailboxProvider();
  return new MockMailProvider();
}

export function providerStatus(env: Env): ProviderStatus {
  const provider = getMailProvider(env);
  const spec = PROVIDER_SPECS[provider.id as ProviderId] ?? PROVIDER_SPECS.mock;
  return {
    configured: provider.id === "cloudflare",
    id: spec.id,
    label: spec.label,
    mock: provider.mock,
    message: spec.message,
    webmail: spec.webmail,
    dns: spec.dns,
    region: spec.region,
    credentials: spec.credentials,
    quotas: spec.quotas,
    terms: spec.terms,
  };
}

/** @deprecated Use providerStatus(env). Kept so existing imports typecheck during the swap. */
export const PROVIDER_STATUS = {
  configured: false,
  id: "mock",
  label: PROVIDER_SPECS.mock.label,
  mock: true,
  message: PROVIDER_SPECS.mock.message,
  webmail: PROVIDER_SPECS.mock.webmail,
  dns: PROVIDER_SPECS.mock.dns,
  region: PROVIDER_SPECS.mock.region,
  credentials: PROVIDER_SPECS.mock.credentials,
  quotas: PROVIDER_SPECS.mock.quotas,
  terms: PROVIDER_SPECS.mock.terms,
} satisfies ProviderStatus;
