import { afterEach, describe, expect, it, vi } from "vitest";
import { appBaseUrl, appUrl, requestProtocol } from "./request-base-url";

/**
 * `url` cố ý luôn là `localhost:3000` còn `host` đổi được — đúng cách Next hành xử: `request.url`
 * bị chuẩn hóa về host của chính máy chủ, chỉ header `Host` phản ánh địa chỉ trình duyệt đang mở.
 */
function get(options: { host?: string; forwardedProto?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.host) headers.host = options.host;
  if (options.forwardedProto) headers["x-forwarded-proto"] = options.forwardedProto;

  return new Request("http://localhost:3000/api/facebook/oauth/callback?code=x", { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestProtocol", () => {
  it("reads x-forwarded-proto when present", () => {
    expect(requestProtocol(get({ forwardedProto: "https" }))).toBe("https");
  });

  // Một số lớp proxy nối chuỗi: "https,http". Giá trị đầu là giao thức người dùng thật sự dùng.
  it("uses the FIRST value from a multi-value header", () => {
    expect(requestProtocol(get({ forwardedProto: "https, http" }))).toBe("https");
  });

  it("defaults to https in production when the header is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(requestProtocol(get())).toBe("https");
  });

  it("defaults to http in development when the header is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requestProtocol(get())).toBe("http");
  });
});

describe("appBaseUrl", () => {
  /**
   * Đây là lỗi đã sửa, đo trên máy chủ thật 06/08/2026: dùng `request.url` thì địa chỉ quay về
   * thành `https://localhost:3000` — giao thức của Railway ghép với host nội bộ trong container.
   */
  it("uses the Host header rather than the host in request.url", () => {
    const request = get({ host: "mkttool-web-production.up.railway.app", forwardedProto: "https" });
    expect(appBaseUrl(request)).toBe("https://mkttool-web-production.up.railway.app");
    expect(appBaseUrl(request)).not.toContain("localhost");
  });

  it("preserves the port in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(appBaseUrl(get({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
  });

  it("falls back to request.url when Host is missing instead of throwing", () => {
    expect(appBaseUrl(get())).toBe("http://localhost:3000/api/facebook/oauth/callback?code=x");
  });
});

describe("appUrl", () => {
  it("joins the path and parameters to the browser-visible address", () => {
    const url = appUrl(
      get({ host: "mkttool-web-production.up.railway.app", forwardedProto: "https" }),
      "/facebook",
      { connected: 'Connected "Anh Hao" to 1 Facebook Page.' },
    );

    expect(url.origin).toBe("https://mkttool-web-production.up.railway.app");
    expect(url.pathname).toBe("/facebook");
    expect(url.searchParams.get("connected")).toBe('Connected "Anh Hao" to 1 Facebook Page.');
  });

  it("returns the plain address when no parameters are provided", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(appUrl(get({ host: "localhost:3000" }), "/facebook").toString()).toBe(
      "http://localhost:3000/facebook",
    );
  });
});
