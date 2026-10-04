import { describe, expect, it } from "vitest";
import { oauthPopupHtml, oauthSetupHtml } from "./cloudflare-oauth";

describe("Cloudflare OAuth popup", () => {
  it("posts success to the opener and never echoes a raw domain into JS unsafely", () => {
    const html = oauthPopupHtml(true, "decoratevillage.com", "https://www.postlane.email");
    expect(html).toContain('type: "postlane-cloudflare"');
    expect(html).toContain("window.opener.postMessage");
    expect(html).toContain("postlane-cf-oauth");
    expect(html).toContain("decoratevillage.com");
    expect(html).not.toContain("<script>alert");
  });

  it("asks for a one-time Cloudflare OAuth client, not an API token", () => {
    const html = oauthSetupHtml("https://www.postlane.email", "decoratevillage.com");
    expect(html).toContain("https://www.postlane.email/api/auth/cloudflare/callback");
    expect(html).toContain("oauth-clients");
    expect(html).not.toContain("API token");
  });
});
