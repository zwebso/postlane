import { describe, expect, it } from "vitest";
import { defaultSendingRecords, mergeSendingRecords } from "./email-sending";
import { CLOUDFLARE_SENDING_DNS } from "./providers/spec";

describe("Email Sending DNS", () => {
  it("asks for ownership plus cf-bounce SPF, DKIM, and MX", () => {
    const records = defaultSendingRecords("send.acme.com", "abc123");
    expect(records.map((row) => `${row.type} ${row.hostname}`)).toEqual([
      "TXT _postlane.send.acme.com",
      "MX cf-bounce.send.acme.com",
      "TXT cf-bounce.send.acme.com",
      "TXT cf-bounce._domainkey.send.acme.com",
      "TXT _dmarc.send.acme.com",
    ]);
    expect(records[0].value).toBe("postlane-send=abc123");
    expect(records.find((row) => row.name === CLOUDFLARE_SENDING_DNS.bounceHost && row.type === "TXT")?.value).toContain(
      CLOUDFLARE_SENDING_DNS.spfInclude,
    );
    expect(records.find((row) => row.name === CLOUDFLARE_SENDING_DNS.dkimHost)?.value).toMatch(/Waiting for the real signing key|v=DKIM1/);
  });

  it("keeps ownership and prefers Cloudflare-published records when onboarded", () => {
    const records = mergeSendingRecords("send.acme.com", "abc123", {
      records: [
        {
          type: "TXT",
          name: "cf-bounce._domainkey",
          value: "v=DKIM1; p=REALKEY",
          purpose: "DKIM",
          hostname: "cf-bounce._domainkey.send.acme.com",
          required: true,
        },
      ],
    });
    expect(records[0].value).toBe("postlane-send=abc123");
    expect(records.some((row) => row.value === "v=DKIM1; p=REALKEY")).toBe(true);
  });
});
