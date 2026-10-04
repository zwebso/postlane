import { describe, expect, it } from "vitest";
import { canApplyDeliveryStatus, readDeliveryUpdate } from "./email-events";

describe("Cloudflare delivery events", () => {
  it("reads a delivered event", () => {
    const update = readDeliveryUpdate({
      type: "cf.email.sending.message.delivered",
      payload: { eventId: "evt_1", messageId: "msg_1", recipient: "Zwebso@Gmail.com", delivery: { status: "delivered" } },
    });
    expect(update).toMatchObject({ eventId: "evt_1", messageId: "msg_1", recipient: "zwebso@gmail.com", status: "delivered" });
  });

  it("keeps the bounce reason", () => {
    const update = readDeliveryUpdate({
      type: "cf.email.sending.message.bounced",
      payload: {
        messageId: "msg_2",
        recipient: "missing@decoratevillage.com",
        bounce: { reason: "550 5.1.1 User unknown" },
      },
    });
    expect(update?.status).toBe("bounced");
    expect(update?.detail).toBe("550 5.1.1 User unknown");
  });

  it("ignores events that are not delivery updates", () => {
    expect(readDeliveryUpdate({ type: "cf.email.sending.message.queued", payload: { messageId: "x", recipient: "a@b.com" } })).toBeNull();
  });

  it("lets a queued message move to delivered, then only to a complaint", () => {
    expect(canApplyDeliveryStatus("queued", "delivered")).toBe(true);
    expect(canApplyDeliveryStatus("queued", "bounced")).toBe(true);
    expect(canApplyDeliveryStatus("deferred", "delivered")).toBe(true);
    expect(canApplyDeliveryStatus("delivered", "complained")).toBe(true);
    expect(canApplyDeliveryStatus("delivered", "bounced")).toBe(false);
    expect(canApplyDeliveryStatus("bounced", "delivered")).toBe(false);
  });
});
