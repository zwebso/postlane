import { describe, expect, it } from "vitest";
import {
  activationGates,
  canActivateMailbox,
  effectiveSendingPlan,
  formatQuota,
  knownMailMx,
  mailboxQuotaMb,
  normalizeDomain,
  normalizePlan,
  placeholderPriceCents,
  PLAN_CATALOG,
  PLACEHOLDER_QUOTA_MB,
  recipientCount,
  slugify,
  utcDayStart,
  utcMonthStart,
} from "./domain";

describe("normalizeDomain", () => {
  it("strips protocol and www", () => {
    expect(normalizeDomain("https://www.Northstar.Studio/path")).toBe("northstar.studio");
  });
  it("rejects empty input", () => {
    expect(() => normalizeDomain("")).toThrow();
  });
});

describe("activation gates", () => {
  const ready = {
    accountVerified: true,
    entitlementActive: true,
    ownershipVerified: true,
    preparedMailboxes: 1,
    mxValid: true,
    spfValid: true,
    dkimValid: true,
    inboundPassed: true,
    outboundPassed: true,
  };
  it("requires every gate", () => {
    expect(canActivateMailbox(ready)).toBe(true);
    expect(canActivateMailbox({ ...ready, entitlementActive: false })).toBe(false);
    expect(canActivateMailbox({ ...ready, inboundPassed: false })).toBe(false);
    expect(activationGates({ ...ready, mxValid: false }).find((g) => g.id === "dns_routing")?.ok).toBe(false);
  });
});

describe("knownMailMx", () => {
  it("detects google and microsoft", () => {
    expect(knownMailMx(["aspmx.l.google.com"])).toBe("google");
    expect(knownMailMx(["northstar-studio.mail.protection.outlook.com"])).toBe("microsoft");
    expect(knownMailMx([])).toBeNull();
    expect(knownMailMx(["isaac.mx.cloudflare.net"])).toBe("cloudflare");
  });
});

describe("slugify", () => {
  it("creates a stable slug", () => {
    expect(slugify("Northstar Studio")).toBe("northstar-studio");
  });
});

describe("normalizePlan", () => {
  it("maps legacy names and defaults unknown values to Sandbox", () => {
    expect(normalizePlan(undefined)).toBe("sandbox");
    expect(normalizePlan("enterprise")).toBe("sandbox");
    expect(normalizePlan("free")).toBe("sandbox");
    expect(normalizePlan("starter")).toBe("launch");
    expect(normalizePlan("business")).toBe("scale");
    expect(normalizePlan("Launch")).toBe("launch");
  });
});

describe("effectiveSendingPlan", () => {
  it("keeps Sandbox always, and paid plans only when active", () => {
    expect(effectiveSendingPlan("launch", "pending")).toBe("sandbox");
    expect(effectiveSendingPlan("launch", "active")).toBe("launch");
    expect(effectiveSendingPlan("scale", "active")).toBe("scale");
    expect(effectiveSendingPlan("sandbox", "pending")).toBe("sandbox");
  });
});

describe("placeholderPriceCents", () => {
  it("prices each sending workspace, not per mailbox", () => {
    expect(placeholderPriceCents("sandbox", 8)).toBe(0);
    expect(placeholderPriceCents("launch", 3)).toBe(2_000);
    expect(placeholderPriceCents("scale", 5)).toBe(6_000);
    expect(placeholderPriceCents("free", 1)).toBe(0);
  });
});

describe("plan quotas", () => {
  it("stores sending caps and leftover mailbox storage", () => {
    expect(PLAN_CATALOG.sandbox.domainLimit).toBe(3);
    expect(PLAN_CATALOG.launch.domainLimit).toBe(10);
    expect(PLAN_CATALOG.scale.domainLimit).toBe(30);
    expect(PLAN_CATALOG.sandbox.emailsPerDay).toBe(100);
    expect(PLAN_CATALOG.launch.emailsPerDay).toBe(1_500);
    expect(PLAN_CATALOG.scale.emailsPerDay).toBe(4_000);
    expect(PLAN_CATALOG.sandbox.emailsPerMonth).toBe(1_000);
    expect(PLAN_CATALOG.launch.emailsPerMonth).toBe(40_000);
    expect(PLAN_CATALOG.scale.emailsPerMonth).toBe(100_000);
    expect(PLAN_CATALOG.sandbox.quotaMb).toBe(200);
    expect(PLACEHOLDER_QUOTA_MB.sandbox).toBe(200);
    expect(formatQuota(PLAN_CATALOG.sandbox.quotaMb)).toBe("200 MB");
    expect(formatQuota(PLAN_CATALOG.launch.quotaMb)).toBe("20 GB");
    expect(formatQuota(PLAN_CATALOG.scale.quotaMb)).toBe("50 GB");
  });
  it("prefers quota_mb over legacy quota_gb", () => {
    expect(mailboxQuotaMb({ quota_mb: 200, quota_gb: 5 })).toBe(200);
    expect(mailboxQuotaMb({ quota_gb: 20 })).toBe(20_000);
  });
});

describe("quota windows", () => {
  it("uses UTC calendar day and month, not a rolling 24 hours", () => {
    const late = new Date("2026-09-20T23:30:00.000Z");
    expect(utcDayStart(late)).toBe("2026-09-20T00:00:00.000Z");
    expect(utcMonthStart(late)).toBe("2026-09-01T00:00:00.000Z");
    const next = new Date("2026-09-21T00:00:00.000Z");
    expect(utcDayStart(next)).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("recipientCount", () => {
  it("counts each To, CC, and BCC address", () => {
    expect(recipientCount({ to: "alex@example.com" })).toBe(1);
    expect(recipientCount({ to: ["a@x.com", "b@x.com"], cc: "c@x.com", bcc: ["d@x.com"] })).toBe(4);
    expect(recipientCount({})).toBe(0);
  });
});
