import { describe, expect, it } from "vitest";
import { CloudflareMailProvider, MockMailProvider, VendorMailboxProvider, getMailProvider, providerStatus } from "./provider";
import { PROVIDER_SPECS } from "./providers/spec";

function env(provider: string): Env {
  return {
    MAIL_PROVIDER: provider,
    APP_ORIGIN: "http://localhost:5173",
    ENVIRONMENT: "development",
  } as Env;
}

describe("mail provider factory", () => {
  it("defaults to mock until env says otherwise", () => {
    expect(getMailProvider(env("mock"))).toBeInstanceOf(MockMailProvider);
    expect(providerStatus(env("mock")).configured).toBe(false);
    expect(providerStatus(env("mock")).message).toBe(PROVIDER_SPECS.mock.message);
  });

  it("selects Cloudflare without claiming a licensed vendor", () => {
    const provider = getMailProvider(env("cloudflare"));
    expect(provider).toBeInstanceOf(CloudflareMailProvider);
    expect(provider.mock).toBe(false);
    expect(providerStatus(env("cloudflare")).configured).toBe(true);
    expect(providerStatus(env("cloudflare")).quotas).toContain("25 MiB");
  });

  it("leaves the vendor adapter as a licensed stub", async () => {
    const provider = getMailProvider(env("vendor"));
    expect(provider).toBeInstanceOf(VendorMailboxProvider);
    const result = await provider.provisionMailbox({
      address: "ada@northstar.studio",
      displayName: "Ada",
      quotaMb: 20_000,
      idempotencyKey: "k1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_UNAVAILABLE");
    const check = await provider.runDeliveryCheck({ direction: "outbound", correlationToken: "c1" });
    expect(check.status).toBe("failed");
  });

  it("documents the contract surfaces", () => {
    expect(PROVIDER_SPECS.cloudflare.api).toContain("SendEmail binding");
    expect(PROVIDER_SPECS.mock.api).toEqual(expect.arrayContaining(["provisionMailbox", "sendTransactional", "getWebmailHandoff"]));
    expect(PROVIDER_SPECS.vendor.terms).toMatch(/DPA/);
  });
});
