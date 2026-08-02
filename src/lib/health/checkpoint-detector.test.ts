import { describe, expect, it } from "vitest";
import { detectCheckpoint } from "./checkpoint-detector";

const PROFILE_URL = "https://old.reddit.com/user/ai_do/";

describe("detectCheckpoint", () => {
  it("trang profile bình thường thì không báo gì", () => {
    expect(
      detectCheckpoint({ url: PROFILE_URL, html: '<div id="siteTable">bài viết</div>' }),
    ).toBeNull();
  });

  it("bắt tài khoản bị treo và quy về phía NICK", () => {
    const signal = detectCheckpoint({
      url: PROFILE_URL,
      html: "<p>This account has been suspended</p>",
    });
    expect(signal?.scope).toBe("ACCOUNT");
  });

  it("bắt đường dẫn checkpoint và quy về phía NICK", () => {
    const signal = detectCheckpoint({ url: "https://www.reddit.com/checkpoint/", html: "" });
    expect(signal?.scope).toBe("ACCOUNT");
  });

  /**
   * Nhánh quan trọng nhất của cả file: captcha là tin về PROXY quan sát viên, không phải tin
   * về nick. Quy nhầm sang ACCOUNT là mỗi lần Reddit bóp proxy thì cả đàn nick khỏe bị cách ly.
   */
  it("captcha quy về phía BỘ DÒ chứ không phải nick", () => {
    const signal = detectCheckpoint({
      url: PROFILE_URL,
      html: '<iframe src="https://client-api.arkoselabs.com/x"></iframe>',
    });
    expect(signal?.scope).toBe("PROBE");
  });

  it("bị chặn vì gọi quá nhiều cũng quy về phía BỘ DÒ", () => {
    const signal = detectCheckpoint({ url: PROFILE_URL, html: "<h1>Too Many Requests</h1>" });
    expect(signal?.scope).toBe("PROBE");
  });

  /**
   * Hồi quy cho lỗi đo được trên Reddit thật 03/08/2026: mọi trang old.reddit.com đều nhúng
   * script reCAPTCHA cho ô đăng nhập ở sidebar. Bản đầu bắt cụm "recaptcha" nên báo "bị captcha"
   * cho MỌI nick ở MỌI lần dò — bộ dò mù hoàn toàn mà nhìn vẫn như đang chạy.
   */
  it("script reCAPTCHA của ô đăng nhập KHÔNG bị coi là bị chặn", () => {
    const normalPage =
      '<div id="siteTable">bài viết</div>' +
      '<script src="https://www.google.com/recaptcha/api.js"></script>' +
      '<div class="g-recaptcha" data-sitekey="abc"></div>';
    expect(detectCheckpoint({ url: PROFILE_URL, html: normalPage })).toBeNull();
  });

  it("so không phân biệt hoa thường", () => {
    expect(
      detectCheckpoint({ url: PROFILE_URL, html: "<p>THIS ACCOUNT HAS BEEN SUSPENDED</p>" }),
    ).not.toBeNull();
  });

  it("URL rác không làm hàm ném lỗi, vẫn soi được nội dung", () => {
    const signal = detectCheckpoint({ url: "khong-phai-url", html: "verify you are human" });
    expect(signal?.scope).toBe("PROBE");
  });
});
