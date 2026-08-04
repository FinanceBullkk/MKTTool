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
  it("thấy đủ bài thì khỏe", () => {
    expect(evaluateHealth(input()).verdict).toBe("HEALTHY");
  });

  it("Reddit không tìm thấy trang profile thì cách ly nick, dù chưa rõ nguyên nhân", () => {
    // Vẫn CÁCH LY ở cả hai nhánh, có chủ ý: cách ly nhầm một nick khỏe thì ồn ào và sửa được
    // bằng tay, còn để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.
    const result = evaluateHealth(input({ profile: { kind: "MISSING" } }));
    expect(result.verdict).toBe("SHADOWBANNED");
    expect(result.shadowbanned).toBe(true);
  });

  it("chưa từng thấy profile thì câu chữ phải nêu khả năng username khai sai", () => {
    // Lượt dò thật đầu tiên (04/08/2026) cách ly nhầm một nick khỏe vì username trong kho là
    // nhãn tự đặt. Reddit trả CÙNG một trang cho bốn nguyên nhân — khẳng định "shadowban toàn
    // cục" ở đây là nói chắc hơn thứ đo được.
    const result = evaluateHealth(
      input({ profile: { kind: "MISSING" }, profileSeenBefore: false }),
    );

    expect(result.detail).toContain("USERNAME");
    expect(result.detail).not.toContain("shadowban toàn cục");
  });

  it("từng thấy profile rồi mà giờ mất thì mới nói chắc", () => {
    // Có lượt dò cũ đọc được trang thì loại trừ được khả năng gõ sai username.
    const result = evaluateHealth(input({ profile: { kind: "MISSING" }, profileSeenBefore: true }));

    expect(result.detail).toContain("lần dò trước");
    expect(result.detail).not.toContain("USERNAME");
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
        profile: { kind: "OK", karma: 1, posts: [], commentCount: 0 },
        visiblePosts: 4,
      }),
    );
    expect(result.verdict).toBe("CHECKPOINT");
  });

  it("chưa bài nào đánh dấu đã đăng thì KHÔNG được nói khỏe", () => {
    const result = evaluateHealth(input({ expectedPosts: 0, visiblePosts: 0 }));
    expect(result.verdict).toBe("NO_BASELINE");
    expect(result.shadowbanned).toBe(false);
    expect(result.detail).toContain("chưa phải");
  });

  it("thấy bài mà kho chưa ghi bài nào là CÓ BÀI CHƯA GHI, không phải 'chưa đối chiếu được'", () => {
    // Từng trả NO_BASELINE với lý do "số bài thấy được không chứng minh bài MÌNH đăng có hiện
    // ra". Đúng cho câu hỏi shadowban, nhưng nó bỏ qua một câu hỏi khác và nghiêm trọng hơn:
    // ba bài đó KHÔNG có trong kho, nên bốn luật giữ nhịp đang đếm thiếu.
    const result = evaluateHealth(input({ expectedPosts: 0, visiblePosts: 3 }));

    expect(result.verdict).toBe("UNTRACKED_POSTS");
    expect(result.shadowbanned).toBe(false);
  });

  it("có khóa bài thì chỉ đích danh bài chưa ghi", () => {
    const result = evaluateHealth(
      input({ expectedPosts: 1, visiblePosts: 2, untrackedPostKeys: ["reddit:1veg99o"] }),
    );

    expect(result.verdict).toBe("UNTRACKED_POSTS");
    expect(result.detail).toContain("reddit:1veg99o");
  });

  it("không đọc được khóa nào thì vẫn kết luận được bằng số lượng", () => {
    // Nếu chỉ dựa vào khóa thì nick nào bộ dò không đọc được data-permalink sẽ im lặng trở lại.
    const result = evaluateHealth(input({ expectedPosts: 1, visiblePosts: 3 }));
    expect(result.verdict).toBe("UNTRACKED_POSTS");
  });

  it("CÓ BÀI CHƯA GHI không được ép đổi trạng thái nick — hỏng là sổ sách, không phải nick", () => {
    expect(statusForcedBy("UNTRACKED_POSTS")).toBeNull();
  });

  it("job không thấy bài tương ứng thì WARN nói rõ link nào", () => {
    const result = evaluateHealth(
      input({ expectedPosts: 10, visiblePosts: 3, missingPostKeys: ["reddit:abc123"] }),
    );

    expect(result.verdict).toBe("WARN");
    expect(result.detail).toContain("reddit:abc123");
  });

  it("NO_BASELINE không được ép đổi trạng thái nick", () => {
    expect(statusForcedBy("NO_BASELINE")).toBeNull();
  });

  it("đọc được profile nhưng không đọc được danh sách bài là ERROR", () => {
    const result = evaluateHealth(input({ expectedPosts: 3, visiblePosts: null }));
    expect(result.verdict).toBe("ERROR");
  });
});
