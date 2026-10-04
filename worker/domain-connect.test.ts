import { describe, expect, it } from "vitest";
import { domainConnectApplyUrl, domainConnectLive, publicKeyFragments, sendingTemplate } from "./domain-connect";

describe("Domain Connect", () => {
  it("builds Cloudflare's apply URL for the sending template", async () => {
    const url = new URL(
      await domainConnectApplyUrl("https://www.postlane.email", "decoratevillage.com", "abc123"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://dash.cloudflare.com/domainconnect/v2/domainTemplates/providers/postlane.email/services/sending/apply",
    );
    expect(url.searchParams.get("domain")).toBe("decoratevillage.com");
    expect(url.searchParams.get("token")).toBe("abc123");
    expect(url.searchParams.get("groupId")).toBe("ownership");
    expect(url.searchParams.get("redirect_uri")).toContain("/api/domain-connect/callback");
    expect(sendingTemplate().records.some((row) => row.host === "_postlane")).toBe(true);
    expect(sendingTemplate().records.some((row) => row.type === "SPFM" && row.host === "cf-bounce")).toBe(true);
    expect(domainConnectLive({})).toBe(false);
  });

  it("splits the RS256 public key into Domain Connect TXT fragments", () => {
    const fragments = publicKeyFragments();
    expect(fragments[0]).toMatch(/^p=1,a=RS256,d=MIIBIjAN/);
    expect(fragments.at(-1)).toMatch(/IDAQAB$/);
  });
});
