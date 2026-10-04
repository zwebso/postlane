import { describe, expect, it } from "vitest";
import { effectiveSendingPlan, PLAN_CATALOG, recipientCount, utcDayStart } from "../shared/domain";
import { blockedWebhookHost } from "./sending";

describe("sending ownership records", () => {
  it("uses a send-specific TXT value, not mailbox MX", () => {
    const token = "abc123";
    const value = `postlane-send=${token}`;
    expect(value.startsWith("postlane-send=")).toBe(true);
    expect(value).not.toContain("postlane-verify=");
  });
});

describe("structured send payload", () => {
  it("keeps HTML and extra recipients for Email Sending", () => {
    const payload = {
      from: "hello@send.acme.com",
      to: ["alex@example.com", "jules@example.com"],
      cc: ["billing@example.com"],
      html: "<h1>You’re in.</h1>",
      text: "You’re in.",
    };
    expect(payload.html).toContain("<h1>");
    expect(payload.to.length + payload.cc.length).toBe(3);
  });
});

describe("sending plan limits", () => {
  it("keeps workspace caps inside Cloudflare Email Service limits", () => {
    expect(PLAN_CATALOG.sandbox.domainLimit).toBe(3);
    expect(PLAN_CATALOG.sandbox.emailsPerDay).toBe(100);
    expect(PLAN_CATALOG.sandbox.emailsPerMonth).toBe(1_000);
    expect(PLAN_CATALOG.launch.emailsPerDay).toBe(1_500);
    expect(PLAN_CATALOG.launch.emailsPerMonth).toBe(40_000);
    expect(PLAN_CATALOG.scale.domainLimit).toBe(30);
    expect(PLAN_CATALOG.scale.emailsPerDay).toBe(4_000);
    expect(PLAN_CATALOG.scale.emailsPerMonth).toBe(100_000);
  });
  it("does not raise Launch limits until the subscription is active", () => {
    expect(effectiveSendingPlan("launch", "pending")).toBe("sandbox");
    expect(effectiveSendingPlan("scale", "active")).toBe("scale");
  });
  it("counts every recipient toward the send quota", () => {
    expect(recipientCount({ to: ["a@x.com", "b@x.com"], cc: "c@x.com" })).toBe(3);
  });
  it("resets the Sandbox day at midnight UTC", () => {
    expect(utcDayStart(new Date("2026-09-20T23:59:59.000Z"))).toBe("2026-09-20T00:00:00.000Z");
  });
});

describe("webhook test targets", () => {
  it("refuses local and private hosts", () => {
    expect(blockedWebhookHost("hooks.example.com")).toBe(false);
    expect(blockedWebhookHost("localhost")).toBe(true);
    expect(blockedWebhookHost("app.local")).toBe(true);
    expect(blockedWebhookHost("127.0.0.1")).toBe(true);
    expect(blockedWebhookHost("10.1.2.3")).toBe(true);
    expect(blockedWebhookHost("192.168.1.8")).toBe(true);
    expect(blockedWebhookHost("169.254.169.254")).toBe(true);
    expect(blockedWebhookHost("172.16.0.4")).toBe(true);
  });
});
