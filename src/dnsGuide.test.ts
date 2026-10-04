import { describe, expect, it } from "vitest";
import { dnsCards, previewDnsRecords } from "./DnsGuide";

describe("DNS setup cards", () => {
  it("splits the bounce MX list into three copyable servers", () => {
    const mx = dnsCards(previewDnsRecords("decoratevillage.com")).find((card) => card.title.includes("bounce"));
    expect(mx?.fields.map((field) => field.label)).toEqual([
      "Type",
      "Host / Name",
      "Mail server · priority 10",
      "Mail server · priority 20",
      "Mail server · priority 30",
    ]);
    expect(mx?.fields.find((field) => field.label === "Host / Name")?.value).toBe("cf-bounce");
  });

  it("marks the signing key as waiting until a real p= value exists", () => {
    const dkim = dnsCards(previewDnsRecords("decoratevillage.com")).find((card) => card.check === "dkim");
    expect(dkim?.placeholder).toBe(true);
    expect(dnsCards([{ ...previewDnsRecords("x.com")[3], value: "v=DKIM1; p=ABC123" }])[0].placeholder).toBe(false);
  });
});
