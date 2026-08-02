import { describe, expect, it } from "vitest";
import { TOKEN_WARN_DAYS, evaluateTokenHealth } from "./facebook-token-health";

const NOW = new Date("2026-08-02T10:00:00Z");

function inDays(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("evaluateTokenHealth", () => {
  it("token còn dài ngày thì dùng được", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(45), tokenValid: true }, NOW);
    expect(health.level).toBe("OK");
    expect(health.daysRemaining).toBe(45);
    expect(health.usable).toBe(true);
  });

  it("không có hạn thì coi là tốt, không phải là hỏng", () => {
    // Page token sinh từ user token long-lived không có expires_in — đó là chuyện bình thường.
    const health = evaluateTokenHealth({ expiresAt: null, tokenValid: true }, NOW);
    expect(health.level).toBe("OK");
    expect(health.daysRemaining).toBeNull();
    expect(health.usable).toBe(true);
  });

  it("cảnh báo khi còn đúng ngưỡng", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(TOKEN_WARN_DAYS), tokenValid: true }, NOW);
    expect(health.level).toBe("WARN");
    // Vẫn đăng được — cảnh báo là để kịp kết nối lại, không phải để chặn.
    expect(health.usable).toBe(true);
  });

  it("hết hạn thì chặn đăng", () => {
    const health = evaluateTokenHealth({ expiresAt: inDays(-1), tokenValid: true }, NOW);
    expect(health.level).toBe("EXPIRED");
    expect(health.usable).toBe(false);
  });

  it("Facebook đã từ chối thì chặn, kể cả khi hạn còn dài", () => {
    // Nick admin đổi mật khẩu hoặc gỡ app: token chết trước hạn ghi trong DB.
    const health = evaluateTokenHealth(
      { expiresAt: inDays(50), tokenValid: false, tokenNote: "mã 190" },
      NOW,
    );
    expect(health.level).toBe("INVALID");
    expect(health.usable).toBe(false);
    expect(health.message).toContain("mã 190");
  });

  it("token bị từ chối mà không ghi lý do vẫn báo được", () => {
    const health = evaluateTokenHealth({ expiresAt: null, tokenValid: false }, NOW);
    expect(health.level).toBe("INVALID");
    expect(health.message).toContain("Kết nối lại");
  });
});
