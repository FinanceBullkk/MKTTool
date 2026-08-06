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
  it("lấy từ x-forwarded-proto khi có", () => {
    expect(requestProtocol(get({ forwardedProto: "https" }))).toBe("https");
  });

  // Một số lớp proxy nối chuỗi: "https,http". Giá trị đầu là giao thức người dùng thật sự dùng.
  it("lấy giá trị ĐẦU khi header là chuỗi nhiều giá trị", () => {
    expect(requestProtocol(get({ forwardedProto: "https, http" }))).toBe("https");
  });

  it("thiếu header thì production đoán https", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(requestProtocol(get())).toBe("https");
  });

  it("thiếu header thì dev đoán http", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requestProtocol(get())).toBe("http");
  });
});

describe("appBaseUrl", () => {
  /**
   * Đây là lỗi đã sửa, đo trên máy chủ thật 06/08/2026: dùng `request.url` thì địa chỉ quay về
   * thành `https://localhost:3000` — giao thức của Railway ghép với host nội bộ trong container.
   */
  it("dùng header Host, KHÔNG dùng host trong request.url", () => {
    const request = get({ host: "mkttool-web-production.up.railway.app", forwardedProto: "https" });
    expect(appBaseUrl(request)).toBe("https://mkttool-web-production.up.railway.app");
    expect(appBaseUrl(request)).not.toContain("localhost");
  });

  it("giữ nguyên cổng khi mở dưới máy dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(appBaseUrl(get({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
  });

  it("thiếu header Host thì lùi về request.url thay vì ném lỗi", () => {
    expect(appBaseUrl(get())).toBe("http://localhost:3000/api/facebook/oauth/callback?code=x");
  });
});

describe("appUrl", () => {
  it("ghép đường dẫn và tham số vào đúng địa chỉ trình duyệt đang mở", () => {
    const url = appUrl(
      get({ host: "mkttool-web-production.up.railway.app", forwardedProto: "https" }),
      "/facebook",
      { connected: 'Đã kết nối "Anh Hao" với 1 Fanpage.' },
    );

    expect(url.origin).toBe("https://mkttool-web-production.up.railway.app");
    expect(url.pathname).toBe("/facebook");
    expect(url.searchParams.get("connected")).toBe('Đã kết nối "Anh Hao" với 1 Fanpage.');
  });

  it("không có tham số thì ra địa chỉ trần", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(appUrl(get({ host: "localhost:3000" }), "/facebook").toString()).toBe(
      "http://localhost:3000/facebook",
    );
  });
});
