import { describe, expect, it } from "vitest";
import { isOperator, sendingHoldReason } from "./sending-hold";

const quiet = { dayFinished: 0, dayBad: 0, dayComplaints: 0, hourFinished: 0, hourBad: 0 };

describe("sending hold", () => {
  it("leaves a small test bounce alone", () => {
    expect(sendingHoldReason({ ...quiet, dayFinished: 4, dayBad: 1 })).toBeNull();
  });

  it("pauses when 10% of a full day of finished mail failed", () => {
    expect(sendingHoldReason({ ...quiet, dayFinished: 50, dayBad: 5 })).toMatch(/10%/);
  });

  it("pauses a dirty burst before the daily sample fills", () => {
    expect(sendingHoldReason({ ...quiet, hourFinished: 20, hourBad: 15 })).toMatch(/burst/);
  });

  it("pauses after repeated spam complaints", () => {
    expect(sendingHoldReason({ ...quiet, dayFinished: 10, dayComplaints: 3 })).toMatch(/spam/);
  });

  it("treats only the configured operator addresses as operators", () => {
    expect(isOperator({ OPERATOR_EMAILS: "zwebso@gmail.com, info@tmdspace.com" }, "Zwebso@gmail.com")).toBe(true);
    expect(isOperator({}, "someone@example.com")).toBe(false);
    expect(isOperator({}, "zwebso@gmail.com")).toBe(true);
  });
});
