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
  it("cho qua khi Origin trùng header Host", () => {
    expect(isSameOrigin(post({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(
      true,
    );
  });

  // Đây là bug đã sửa: dùng new URL(request.url).host thì Next luôn báo localhost:3000,
  // nên mở app bằng 127.0.0.1 — đúng địa chỉ README hướng dẫn — bị chặn nhầm.
  it("cho qua khi mở app bằng 127.0.0.1 dù request.url báo localhost", () => {
    expect(isSameOrigin(post({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(
      true,
    );
  });

  it("chặn trang web khác — đây là đường tấn công thật vì app không có đăng nhập", () => {
    expect(isSameOrigin(post({ origin: "https://trang-la.com", host: "127.0.0.1:3000" }))).toBe(
      false,
    );
  });

  it("chặn khi cùng host nhưng khác cổng", () => {
    expect(isSameOrigin(post({ origin: "http://127.0.0.1:8080", host: "127.0.0.1:3000" }))).toBe(
      false,
    );
  });

  it("thiếu Origin thì chặn — trình duyệt luôn gửi header này cho POST", () => {
    expect(isSameOrigin(post({ host: "127.0.0.1:3000" }))).toBe(false);
  });

  it("Origin rác không làm hàm ném lỗi", () => {
    expect(isSameOrigin(post({ origin: "khong-phai-url", host: "127.0.0.1:3000" }))).toBe(false);
  });
});
