import { describe, expect, it } from "vitest";
import { type HealthEvaluationInput, evaluateHealth } from "./health-status-evaluator";

function input(overrides: Partial<HealthEvaluationInput> = {}): HealthEvaluationInput {
  return {
    checkpoint: null,
    profile: { kind: "OK", karma: 100, postTimestamps: [], commentCount: 0 },
    navigationError: null,
    expectedPosts: 4,
    visiblePosts: 4,
    windowDays: 7,
    ...overrides,
  };
}

describe("evaluateHealth", () => {
  it("thấy đủ bài thì khỏe", () => {
    expect(evaluateHealth(input()).verdict).toBe("HEALTHY");
  });

  it("Reddit không biết nick này = shadowban toàn cục", () => {
    const result = evaluateHealth(input({ profile: { kind: "MISSING" } }));
    expect(result.verdict).toBe("SHADOWBANNED");
    expect(result.shadowbanned).toBe(true);
  });

  it("đã đăng nhưng không thấy bài nào = bị ẩn từng bài", () => {
    expect(evaluateHealth(input({ expectedPosts: 3, visiblePosts: 0 })).verdict).toBe(
      "SHADOWBANNED",
    );
  });

  it("thấy dưới một nửa số bài thì cảnh báo, chưa kết luận", () => {
    expect(evaluateHealth(input({ expectedPosts: 10, visiblePosts: 3 })).verdict).toBe("WARN");
  });

  it("đúng một nửa thì chưa cảnh báo", () => {
    expect(evaluateHealth(input({ expectedPosts: 10, visiblePosts: 5 })).verdict).toBe("HEALTHY");
  });

  // ── Ba nhánh dưới đây là lý do file này tồn tại: bộ dò mù thì phải nói là mù ──

  it("lỗi mở trang là ERROR, không phải HEALTHY", () => {
    const result = evaluateHealth(input({ navigationError: "hết giờ chờ." }));
    expect(result.verdict).toBe("ERROR");
    expect(result.shadowbanned).toBe(false);
  });

  it("HTML không đọc được là ERROR", () => {
    const result = evaluateHealth(
      input({ profile: { kind: "UNPARSEABLE", reason: "Reddit đổi HTML." } }),
    );
    expect(result.verdict).toBe("ERROR");
  });

  it("captcha phía bộ dò là ERROR — KHÔNG được cách ly nick vì proxy bị bóp", () => {
    const result = evaluateHealth(
      input({ checkpoint: { scope: "PROBE", reason: "Bị chắn bằng captcha." } }),
    );
    expect(result.verdict).toBe("ERROR");
  });

  it("checkpoint phía nick mới là CHECKPOINT", () => {
    const result = evaluateHealth(
      input({ checkpoint: { scope: "ACCOUNT", reason: "Tài khoản bị treo." } }),
    );
    expect(result.verdict).toBe("CHECKPOINT");
  });

  it("chặn đường được xét trước nội dung trang", () => {
    const result = evaluateHealth(
      input({
        checkpoint: { scope: "ACCOUNT", reason: "Tài khoản bị treo." },
        profile: { kind: "OK", karma: 1, postTimestamps: [], commentCount: 0 },
        visiblePosts: 4,
      }),
    );
    expect(result.verdict).toBe("CHECKPOINT");
  });

  it("chưa đăng bài nào thì khỏe, nhưng lý do nói rõ chưa đối chiếu được", () => {
    const result = evaluateHealth(input({ expectedPosts: 0, visiblePosts: 0 }));
    expect(result.verdict).toBe("HEALTHY");
    expect(result.detail).toContain("chưa phải");
  });

  it("đọc được profile nhưng không đọc được danh sách bài là ERROR", () => {
    const result = evaluateHealth(input({ expectedPosts: 3, visiblePosts: null }));
    expect(result.verdict).toBe("ERROR");
  });
});
