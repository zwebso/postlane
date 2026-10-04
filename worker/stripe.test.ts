import { describe, expect, it } from "vitest";
import { localSubscriptionStatus, verifyStripeSignature } from "./stripe";

describe("Stripe billing", () => {
  it("treats only an active or trialing Stripe subscription as entitled", () => {
    expect(localSubscriptionStatus("active")).toBe("active");
    expect(localSubscriptionStatus("trialing")).toBe("active");
    expect(localSubscriptionStatus("past_due")).toBe("pending");
    expect(localSubscriptionStatus("incomplete")).toBe("pending");
    expect(localSubscriptionStatus("canceled")).toBe("pending");
  });

  it("accepts a current Stripe signature and rejects a changed body", async () => {
    const secret = "whsec_test";
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const signature = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const header = `t=${timestamp},v1=${signature}`;
    expect(await verifyStripeSignature(payload, header, secret)).toBe(true);
    expect(await verifyStripeSignature(`${payload} `, header, secret)).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${timestamp - 1000},v1=${signature}`, secret)).toBe(false);
  });
});
