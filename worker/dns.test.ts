import { describe, expect, it } from "vitest";
import { expectedRecords } from "./dns";
import { CLOUDFLARE_MAIL_DNS } from "./providers/spec";

describe("expectedRecords", () => {
  it("uses live Cloudflare Email Routing targets", () => {
    const rows = expectedRecords("northstar.studio", "token");
    expect(rows.find((r) => r.component === "mx")?.expected_value).toContain("isaac.mx.cloudflare.net");
    expect(rows.find((r) => r.component === "mx")?.expected_value).toContain(CLOUDFLARE_MAIL_DNS.mxMatch);
    expect(rows.find((r) => r.component === "spf")?.expected_value).toBe(CLOUDFLARE_MAIL_DNS.spf);
    expect(rows.find((r) => r.component === "dkim")?.host).toBe(CLOUDFLARE_MAIL_DNS.dkimHost);
    expect(rows.find((r) => r.component === "dkim")?.record_type).toBe("TXT");
    expect(rows.every((r) => !String(r.expected_value).includes("postlane.example"))).toBe(true);
  });
});
