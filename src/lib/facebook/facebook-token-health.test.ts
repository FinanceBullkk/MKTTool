import { describe, expect, it } from "vitest";
import { TOKEN_WARN_DAYS, evaluateTokenHealth } from "./facebook-token-health";

const NOW = new Date("2026-08-02T10:00:00Z");

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("evaluateTokenHealth", () => {
  it("keeps a long-lived token usable", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(45), tokenValid: true }, NOW);
    expect(health.level).toBe("OK");
    expect(health.daysRemaining).toBe(45);
    expect(health.usable).toBe(true);
  });

  it("treats a token without an expiry as valid", () => {
    // Page token sinh từ user token long-lived không có expires_in — đó là chuyện bình thường.
    const health = evaluateTokenHealth({ expiresAt: null, tokenValid: true }, NOW);
    expect(health.level).toBe("OK");
    expect(health.daysRemaining).toBeNull();
    expect(health.usable).toBe(true);
  });

  it("warns at the exact threshold", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(TOKEN_WARN_DAYS), tokenValid: true }, NOW);
    expect(health.level).toBe("WARN");
    // Vẫn đăng được — cảnh báo là để kịp kết nối lại, không phải để chặn.
    expect(health.usable).toBe(true);
  });

  it("blocks posting after expiry", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(-1), tokenValid: true }, NOW);
    expect(health.level).toBe("EXPIRED");
    expect(health.usable).toBe(false);
  });

  it("blocks a Facebook-rejected token even when its expiry is far away", () => {
    // Nick admin đổi mật khẩu hoặc gỡ app: token chết trước hạn ghi trong DB.
    const health = evaluateTokenHealth(
      { expiresAt: inDays(50), tokenValid: false, tokenNote: "code 190" },
      NOW,
    );
    expect(health.level).toBe("INVALID");
    expect(health.usable).toBe(false);
    expect(health.message).toContain("code 190");
  });

  it("provides guidance when a rejected token has no recorded reason", () => {
    const health = evaluateTokenHealth({ expiresAt: null, tokenValid: false }, NOW);
    expect(health.level).toBe("INVALID");
    expect(health.message).toContain("Reconnect");
  });
});
