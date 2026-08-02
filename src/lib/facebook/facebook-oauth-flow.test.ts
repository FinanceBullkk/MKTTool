import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REQUIRED_SCOPES, isFacebookAppConfigured } from "./facebook-app-config";
import { buildAuthorizeUrl } from "./facebook-oauth-flow";

const ENV_KEYS = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "FACEBOOK_REDIRECT_URI"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.FACEBOOK_APP_ID = "111222333";
  process.env.FACEBOOK_APP_SECRET = "secret-cua-app";
  process.env.FACEBOOK_REDIRECT_URI = "http://localhost:3000/api/facebook/oauth/callback";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isFacebookAppConfigured", () => {
  it("đủ app id và secret thì coi là đã cấu hình", () => {
    expect(isFacebookAppConfigured()).toBe(true);
  });

  it("thiếu secret thì chưa cấu hình — app vẫn chạy, chỉ là chưa đăng Fanpage được", () => {
    delete process.env.FACEBOOK_APP_SECRET;
    expect(isFacebookAppConfigured()).toBe(false);
  });
});

describe("buildAuthorizeUrl", () => {
  it("dựng URL dialog kèm đủ tham số bắt buộc", () => {
    const url = new URL(buildAuthorizeUrl("chuoi-state"));

    // Dialog OAuth nằm ở www.facebook.com, KHÔNG phải graph.facebook.com.
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toContain("/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("111222333");
    expect(url.searchParams.get("state")).toBe("chuoi-state");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/facebook/oauth/callback",
    );
  });

  it("xin đúng 3 quyền cần thiết, không xin thừa", () => {
    // Xin thừa quyền là tự chuốc App Review — chế độ Development đủ cho Page mình sở hữu.
    const url = new URL(buildAuthorizeUrl("state"));
    expect(url.searchParams.get("scope")).toBe(REQUIRED_SCOPES.join(","));
  });

  it("không nhét app secret vào URL người dùng nhìn thấy", () => {
    expect(buildAuthorizeUrl("state")).not.toContain("secret-cua-app");
  });

  it("chưa cấu hình app thì báo lỗi nói rõ phải làm gì", () => {
    delete process.env.FACEBOOK_APP_ID;
    expect(() => buildAuthorizeUrl("state")).toThrow(/FACEBOOK_APP_ID/);
  });
});
