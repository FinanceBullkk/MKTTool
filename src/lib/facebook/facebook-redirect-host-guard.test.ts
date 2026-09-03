import { describe, expect, it } from "vitest";
import { describeRedirectHostMismatch } from "./facebook-redirect-host-guard";

/**
 * Bẫy thật đã suýt dính: app bind `-H 127.0.0.1` còn redirect URI mặc định ghi `localhost`.
 * Hai host khác nhau với cookie, nên `state` không tới được callback và lỗi hiện ra là
 * "Chuỗi state không khớp" — chỉ sai chỗ hoàn toàn.
 */
const CALLBACK = "http://localhost:3000/api/facebook/oauth/callback";

describe("describeRedirectHostMismatch", () => {
  it("allows a host that matches the redirect URI", () => {
    expect(describeRedirectHostMismatch("localhost:3000", CALLBACK)).toBeNull();
  });

  it("blocks 127.0.0.1 when the redirect URI uses localhost", () => {
    const message = describeRedirectHostMismatch("127.0.0.1:3000", CALLBACK);
    expect(message).toContain("127.0.0.1:3000");
    expect(message).toContain("localhost:3000");
  });

  it("blocks the same host on a different port", () => {
    expect(describeRedirectHostMismatch("localhost:3001", CALLBACK)).not.toBeNull();
  });

  it("explains when FACEBOOK_REDIRECT_URI is not a URL", () => {
    const message = describeRedirectHostMismatch("localhost:3000", "localhost:3000/callback");
    expect(message).toContain("FACEBOOK_REDIRECT_URI");
  });

  // Không có gì để đối chiếu thì đừng chặn — bước kiểm `state` ở callback vẫn còn nguyên.
  it("allows a request without a Host header", () => {
    expect(describeRedirectHostMismatch(null, CALLBACK)).toBeNull();
  });
});
