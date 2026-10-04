import { describe, expect, it } from "vitest";
import {
  displayNameFromGoogle,
  googleAccountDecision,
  googleAuthErrorMessage,
  googleAuthUrl,
  googleCallbackPath,
  parseGoogleProfile,
} from "./google-auth";

const profile = {
  sub: "google-123",
  email: "jamie@example.com",
  email_verified: true,
  name: "Jamie Davis",
};

describe("Google auth helpers", () => {
  it("builds the Google authorization URL", () => {
    const url = new URL(
      googleAuthUrl(
        { GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com" } as Env,
        "state-1",
        "https://www.postlane.email/api/auth/google/callback",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client.apps.googleusercontent.com");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("redirect_uri")).toBe("https://www.postlane.email/api/auth/google/callback");
  });

  it("keeps the callback on the same origin", () => {
    expect(googleCallbackPath("https://www.postlane.email/")).toBe(
      "https://www.postlane.email/api/auth/google/callback",
    );
  });

  it("creates, links, logs in, or rejects the Google account", () => {
    expect(googleAccountDecision({ ...profile, email_verified: false }, null)).toBe("unverified");
    expect(googleAccountDecision(profile, null)).toBe("create");
    expect(googleAccountDecision(profile, { google_sub: "google-123" })).toBe("login");
    expect(googleAccountDecision(profile, { google_sub: null })).toBe("link");
    expect(googleAccountDecision(profile, { google_sub: "other" })).toBe("conflict");
  });

  it("reads a verified Google profile and a fallback name", () => {
    expect(parseGoogleProfile({ sub: "1", email: "ada@acme.com", email_verified: "true", name: "Ada" })).toEqual({
      sub: "1",
      email: "ada@acme.com",
      email_verified: true,
      name: "Ada",
    });
    expect(parseGoogleProfile({ email: "ada@acme.com" })).toBeNull();
    expect(displayNameFromGoogle({ ...profile, name: " " })).toBe("jamie");
  });

  it("maps callback errors for the signup form", () => {
    expect(googleAuthErrorMessage("denied")).toMatch(/cancelled/);
    expect(googleAuthErrorMessage("not_configured")).toMatch(/not configured/);
    expect(googleAuthErrorMessage("nope")).toMatch(/failed/);
  });
});
