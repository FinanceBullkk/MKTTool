import { describe, expect, it } from "vitest";
import { detectCheckpoint } from "./checkpoint-detector";

const PROFILE_URL = "https://old.reddit.com/user/ai_do/";

describe("detectCheckpoint", () => {
  it("returns null for a normal profile page", () => {
    expect(
      detectCheckpoint({ url: PROFILE_URL, html: '<div id="siteTable">posts</div>' }),
    ).toBeNull();
  });

  it("classifies a suspended account as an account checkpoint", () => {
    const signal = detectCheckpoint({
      url: PROFILE_URL,
      html: "<p>This account has been suspended</p>",
    });
    expect(signal?.scope).toBe("ACCOUNT");
  });

  it("classifies a checkpoint URL as an account checkpoint", () => {
    const signal = detectCheckpoint({ url: "https://www.reddit.com/checkpoint/", html: "" });
    expect(signal?.scope).toBe("ACCOUNT");
  });

  /**
   * Nhánh quan trọng nhất của cả file: captcha là tin về PROXY quan sát viên, không phải tin
   * về nick. Quy nhầm sang ACCOUNT là mỗi lần Reddit bóp proxy thì cả đàn nick khỏe bị cách ly.
   */
  it("classifies CAPTCHA as a checker problem, not a nick problem", () => {
    const signal = detectCheckpoint({
      url: PROFILE_URL,
      html: '<iframe src="https://client-api.arkoselabs.com/x"></iframe>',
    });
    expect(signal?.scope).toBe("PROBE");
  });

  it("classifies rate limiting as a checker problem", () => {
    const signal = detectCheckpoint({ url: PROFILE_URL, html: "<h1>Too Many Requests</h1>" });
    expect(signal?.scope).toBe("PROBE");
  });

  /**
   * Hồi quy cho lỗi đo được trên Reddit thật 03/08/2026: mọi trang old.reddit.com đều nhúng
   * script reCAPTCHA cho ô đăng nhập ở sidebar. Bản đầu bắt cụm "recaptcha" nên báo "bị captcha"
   * cho MỌI nick ở MỌI lần dò — bộ dò mù hoàn toàn mà nhìn vẫn như đang chạy.
   */
  it("ignores the normal reCAPTCHA script in the sign-in sidebar", () => {
    const normalPage =
      '<div id="siteTable">posts</div>' +
      '<script src="https://www.google.com/recaptcha/api.js"></script>' +
      '<div class="g-recaptcha" data-sitekey="abc"></div>';
    expect(detectCheckpoint({ url: PROFILE_URL, html: normalPage })).toBeNull();
  });

  it("matches checkpoint text case-insensitively", () => {
    expect(
      detectCheckpoint({ url: PROFILE_URL, html: "<p>THIS ACCOUNT HAS BEEN SUSPENDED</p>" }),
    ).not.toBeNull();
  });

  it("still checks page contents when the URL is invalid", () => {
    const signal = detectCheckpoint({ url: "not-a-url", html: "verify you are human" });
    expect(signal?.scope).toBe("PROBE");
  });
});
