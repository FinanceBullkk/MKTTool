import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REQUIRED_SCOPES, isFacebookAppConfigured } from "./facebook-app-config";
import { buildAuthorizeUrl } from "./facebook-oauth-flow";

const ENV_KEYS = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_REDIRECT_URI"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.FACEBOOK_APP_ID = "111222333";
  process.env.FACEBOOK_APP_SECRET = "app-secret";
  process.env.FACEBOOK_REDIRECT_URI = "http://localhost:3000/api/facebook/oauth/callback";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isFacebookAppConfigured", () => {
  it("is configured when both the app ID and secret are present", () => {
    expect(isFacebookAppConfigured()).toBe(true);
  });

  it("is not configured without a secret while the rest of the app remains available", () => {
    delete process.env.FACEBOOK_APP_SECRET;
    expect(isFacebookAppConfigured()).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds the dialog URL with every required parameter", () => {
    const url = new URL(buildAuthorizeUrl("state-value"));

    // Dialog OAuth nằm ở www.facebook.com, KHÔNG phải graph.facebook.com.
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toContain("/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("111222333");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/facebook/oauth/callback",
    );
  });

  it("requests exactly the three required permissions", () => {
    // Xin thừa quyền là tự chuốc App Review — chế độ Development đủ cho Page mình sở hữu.
    const url = new URL(buildAuthorizeUrl("state"));
    expect(url.searchParams.get("scope")).toBe(REQUIRED_SCOPES.join(","));
  });

  it("does not expose the app secret in the user-visible URL", () => {
    expect(buildAuthorizeUrl("state")).not.toContain("app-secret");
  });

  it("gives actionable guidance when the app is not configured", () => {
    delete process.env.FACEBOOK_APP_ID;
    expect(() => buildAuthorizeUrl("state")).toThrow(/FACEBOOK_APP_ID/);
  });
});
