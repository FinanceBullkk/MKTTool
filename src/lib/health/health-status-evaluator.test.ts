import { describe, expect, it } from "vitest";
import { type HealthEvaluationInput, evaluateHealth } from "./health-status-evaluator";
import { statusForcedBy } from "./health-verdict";

function input(overrides: Partial<HealthEvaluationInput> = {}): HealthEvaluationInput {
  return {
    checkpoint: null,
    profile: { kind: "OK", karma: 100, posts: [], commentCount: 0 },
    navigationError: null,
    expectedPosts: 4,
    visiblePosts: 4,
    windowDays: 7,
    ...overrides,
  };
}

describe("evaluateHealth", () => {
  it("reports healthy when every recorded post is visible", () => {
    expect(evaluateHealth(input()).verdict).toBe("HEALTHY");
  });

  it("quarantines a missing profile even when the exact cause is unknown", () => {
    // Vẫn CÁCH LY ở cả hai nhánh, có chủ ý: cách ly nhầm một nick khỏe thì ồn ào và sửa được
    // bằng tay, còn để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.
    const result = evaluateHealth(input({ profile: { kind: "MISSING" } }));
    expect(result.verdict).toBe("SHADOWBANNED");
    expect(result.shadowbanned).toBe(true);
  });

  it("mentions a possible username error when the profile has never been seen", () => {
    // Lượt dò thật đầu tiên (04/08/2026) cách ly nhầm một nick khỏe vì username trong kho là
    // nhãn tự đặt. Reddit trả CÙNG một trang cho bốn nguyên nhân — khẳng định "shadowban toàn
    // cục" ở đây là nói chắc hơn thứ đo được.
    const result = evaluateHealth(
      input({ profile: { kind: "MISSING" }, profileSeenBefore: false }),
    );

    expect(result.detail).toContain("username spelling");
    expect(result.detail).not.toContain("globally shadowbanned or deleted");
  });

  it("uses stronger wording when an earlier check saw the profile", () => {
    // Có lượt dò cũ đọc được trang thì loại trừ được khả năng gõ sai username.
    const result = evaluateHealth(input({ profile: { kind: "MISSING" }, profileSeenBefore: true }));

    expect(result.detail).toContain("an earlier check could read it");
    expect(result.detail).not.toContain("username spelling");
  });

  it("reports shadowbanned when recorded posts are all hidden", () => {
    expect(evaluateHealth(input({ expectedPosts: 3, visiblePosts: 0 })).verdict).toBe(
      "SHADOWBANNED",
    );
  });

  it("warns when fewer than half of recorded posts are visible", () => {
    expect(evaluateHealth(input({ expectedPosts: 10, visiblePosts: 3 })).verdict).toBe("WARN");
  });

  it("does not warn at exactly half visible", () => {
    expect(evaluateHealth(input({ expectedPosts: 10, visiblePosts: 5 })).verdict).toBe("HEALTHY");
  });

  // ── Ba nhánh dưới đây là lý do file này tồn tại: bộ dò mù thì phải nói là mù ──

  it("reports an error when profile navigation fails", () => {
    const result = evaluateHealth(input({ navigationError: "Timed out." }));
    expect(result.verdict).toBe("ERROR");
    expect(result.shadowbanned).toBe(false);
  });

  it("reports an error when the profile HTML cannot be parsed", () => {
    const result = evaluateHealth(
      input({ profile: { kind: "UNPARSEABLE", reason: "Reddit changed its HTML." } }),
    );
    expect(result.verdict).toBe("ERROR");
  });

  it("treats observer CAPTCHA as a checker error, not a nick checkpoint", () => {
    const result = evaluateHealth(
      input({ checkpoint: { scope: "PROBE", reason: "Blocked by CAPTCHA." } }),
    );
    expect(result.verdict).toBe("ERROR");
  });

  it("reports a nick checkpoint as CHECKPOINT", () => {
    const result = evaluateHealth(
      input({ checkpoint: { scope: "ACCOUNT", reason: "The account is suspended." } }),
    );
    expect(result.verdict).toBe("CHECKPOINT");
  });

  it("checks blocking signals before profile contents", () => {
    const result = evaluateHealth(
      input({
        checkpoint: { scope: "ACCOUNT", reason: "The account is suspended." },
        profile: { kind: "OK", karma: 1, posts: [], commentCount: 0 },
        visiblePosts: 4,
      }),
    );
    expect(result.verdict).toBe("CHECKPOINT");
  });

  it("does not report healthy when no posts were marked as posted", () => {
    const result = evaluateHealth(input({ expectedPosts: 0, visiblePosts: 0 }));
    expect(result.verdict).toBe("NO_BASELINE");
    expect(result.shadowbanned).toBe(false);
    expect(result.detail).toContain("no comparison baseline");
  });

  it("reports unrecorded posts instead of no baseline when public posts exist", () => {
    // Từng trả NO_BASELINE với lý do "số bài thấy được không chứng minh bài MÌNH đăng có hiện
    // ra". Đúng cho câu hỏi shadowban, nhưng nó bỏ qua một câu hỏi khác và nghiêm trọng hơn:
    // ba bài đó KHÔNG có trong kho, nên bốn luật giữ nhịp đang đếm thiếu.
    const result = evaluateHealth(input({ expectedPosts: 0, visiblePosts: 3 }));

    expect(result.verdict).toBe("UNTRACKED_POSTS");
    expect(result.shadowbanned).toBe(false);
  });

  it("names unrecorded posts when thread keys are available", () => {
    const result = evaluateHealth(
      input({ expectedPosts: 1, visiblePosts: 2, untrackedPostKeys: ["reddit:1veg99o"] }),
    );

    expect(result.verdict).toBe("UNTRACKED_POSTS");
    expect(result.detail).toContain("reddit:1veg99o");
  });

  it("uses the post counts when thread keys are unavailable", () => {
    // Nếu chỉ dựa vào khóa thì nick nào bộ dò không đọc được data-permalink sẽ im lặng trở lại.
    const result = evaluateHealth(input({ expectedPosts: 1, visiblePosts: 3 }));
    expect(result.verdict).toBe("UNTRACKED_POSTS");
  });

  it("does not force a nick status for unrecorded posts", () => {
    expect(statusForcedBy("UNTRACKED_POSTS")).toBeNull();
  });

  it("names missing recorded posts in a warning", () => {
    const result = evaluateHealth(
      input({ expectedPosts: 10, visiblePosts: 3, missingPostKeys: ["reddit:abc123"] }),
    );

    expect(result.verdict).toBe("WARN");
    expect(result.detail).toContain("reddit:abc123");
  });

  it("does not force a nick status when there is no baseline", () => {
    expect(statusForcedBy("NO_BASELINE")).toBeNull();
  });

  it("reports an error when the profile loads but the post list cannot be read", () => {
    const result = evaluateHealth(input({ expectedPosts: 3, visiblePosts: null }));
    expect(result.verdict).toBe("ERROR");
  });
});
