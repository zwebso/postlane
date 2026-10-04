import { describe, expect, it } from "vitest";
import { isCloudflareNameserver, labelDnsHost, recordsToWrites } from "./cloudflare-dns";

describe("Cloudflare DNS apply", () => {
  it("names the DNS host from nameservers", () => {
    expect(isCloudflareNameserver("ada.ns.cloudflare.com")).toBe(true);
    expect(labelDnsHost(["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"])).toEqual({
      provider: "cloudflare",
      label: "Cloudflare",
    });
    expect(labelDnsHost(["cs86.hostneverdie.com", "cs86.hostingberry.com"])).toEqual({
      provider: "other",
      label: "HostNeverDie",
    });
  });

  it("expands MX and skips a placeholder DKIM key", () => {
    const writes = recordsToWrites([
      { type: "TXT", name: "_postlane", value: "postlane-send=abc", purpose: "", hostname: "_postlane.acme.com", required: true },
      {
        type: "MX",
        name: "cf-bounce",
        value: "10 isaac.mx.cloudflare.net · 20 linda.mx.cloudflare.net",
        purpose: "",
        hostname: "cf-bounce.acme.com",
        required: true,
      },
      { type: "TXT", name: "cf-bounce._domainkey", value: "Waiting for the real signing key", purpose: "", hostname: "cf-bounce._domainkey.acme.com", required: true },
      { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none", purpose: "", hostname: "_dmarc.acme.com", required: false },
    ]);
    expect(writes.map((row) => `${row.type} ${row.name}`)).toEqual([
      "TXT _postlane.acme.com",
      "MX cf-bounce.acme.com",
      "MX cf-bounce.acme.com",
      "TXT _dmarc.acme.com",
    ]);
    expect(writes.find((row) => row.type === "MX")?.priority).toBe(10);
    expect(writes.find((row) => row.name.includes("_dmarc"))?.overwrite).toBe(false);
  });
});
