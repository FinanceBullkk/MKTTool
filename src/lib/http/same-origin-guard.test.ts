import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin-guard";

/**
 * `url` cố ý luôn là localhost:3000 còn `host` đổi được — đúng cách Next hành xử:
 * `request.url` bị chuẩn hóa về host của dev server, chỉ header `Host` phản ánh
 * địa chỉ trình duyệt thật sự đang mở.
 */
function post(options: { origin?: string; host?: string }): Request {
  const headers: Record<string, string> = {};
  if (options.origin) headers.origin = options.origin;
  if (options.host) headers.host = options.host;

  return new Request("http://localhost:3000/api/x", { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("allows a request when Origin matches the Host header", () => {
    expect(isSameOrigin(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(
      true,
    );
  });

  // Đây là bug đã sửa: dùng new URL(request.url).host thì Next luôn báo localhost:3000,
  // nên mở app bằng 127.0.0.1 — đúng địa chỉ README hướng dẫn — bị chặn nhầm.
  it("allows 127.0.0.1 even when request.url reports localhost", () => {
    expect(isSameOrigin(post({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(
      true,
    );
  });

  it("blocks another website", () => {
    expect(isSameOrigin(post({ origin: "https://other-site.com", host: "127.0.0.1:3000" }))).toBe(
      false,
    );
  });

  it("blocks the same host on a different port", () => {
    expect(isSameOrigin(post({ origin: "http://127.0.0.1:8080", host: "127.0.0.1:3000" }))).toBe(
      false,
    );
  });

  it("blocks a POST request with no Origin header", () => {
    expect(isSameOrigin(post({ host: "127.0.0.1:3000" }))).toBe(false);
  });

  it("returns false rather than throwing for an invalid Origin", () => {
    expect(isSameOrigin(post({ origin: "not-a-url", host: "127.0.0.1:3000" }))).toBe(false);
  });
});
