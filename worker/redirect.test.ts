import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN, redirectApexToWww } from "./redirect";

function request(url: string, host?: string) {
  return new Request(url, host ? { headers: { Host: host } } : undefined);
}

describe("redirectApexToWww", () => {
  it("redirects apex to www and keeps path and query", () => {
    const res = redirectApexToWww(request("https://postlane.email/pricing?plan=free"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    expect(res!.headers.get("Location")).toBe(`${CANONICAL_ORIGIN}/pricing?plan=free`);
  });

  it("does not redirect www back to apex", () => {
    expect(redirectApexToWww(request("https://www.postlane.email/pricing?plan=free"))).toBeNull();
  });

  it("skips workers.dev and localhost", () => {
    expect(redirectApexToWww(request("https://postlane.none.workers.dev/"))).toBeNull();
    expect(redirectApexToWww(request("http://localhost:5173/"))).toBeNull();
  });

  it("matches Host even when the request URL is workers.dev", () => {
    const res = redirectApexToWww(request("https://postlane.workers.dev/login", "postlane.email"));
    expect(res!.status).toBe(308);
    expect(res!.headers.get("Location")).toBe(`${CANONICAL_ORIGIN}/login`);
  });
});
