import { describe, expect, it } from "vitest";
import { describeGraphError, isTokenError, isTransientError } from "./facebook-graph-error-messages";

describe("isTokenError", () => {
  it("nhận diện token hết hạn theo mã phụ", () => {
    expect(isTokenError({ code: 190, error_subcode: 463 })).toBe(true);
  });

  it("nhận diện mọi OAuthException kể cả mã lạ", () => {
    expect(isTokenError({ type: "OAuthException", code: 999 })).toBe(true);
  });

  it("không nhầm lỗi thiếu quyền thành lỗi token", () => {
    // Mã 200 là thiếu quyền — kết nối lại không chữa được, phải sửa quyền của app.
    expect(isTokenError({ code: 200 })).toBe(false);
  });

  it("không có payload thì không kết luận", () => {
    expect(isTokenError(null)).toBe(false);
  });
});

describe("isTransientError", () => {
  it("mã giới hạn tần suất là lỗi tạm thời", () => {
    expect(isTransientError({ code: 4 })).toBe(true);
    expect(isTransientError({ code: 613 })).toBe(true);
  });

  it("token hỏng không phải lỗi tạm thời — thử lại vô ích", () => {
    expect(isTransientError({ code: 190 })).toBe(false);
  });
});

describe("describeGraphError", () => {
  it("nói rõ phải làm gì khi token hết hạn", () => {
    const message = describeGraphError({ code: 190, error_subcode: 463 }, "lỗi chung");
    expect(message).toContain("hết hạn");
    expect(message).toContain("/facebook");
  });

  it("giữ nguyên văn của Facebook và mã để tra cứu", () => {
    const message = describeGraphError(
      { code: 200, message: "Permissions error", error_subcode: 33 },
      "lỗi chung",
    );
    expect(message).toContain("Permissions error");
    expect(message).toContain("mã 200");
    expect(message).toContain("mã phụ 33");
  });

  it("cảnh báo dừng lại khi Facebook khóa thao tác vì vi phạm chính sách", () => {
    expect(describeGraphError({ code: 368 }, "lỗi chung")).toContain("DỪNG");
  });

  it("dùng câu dự phòng khi mã lạ hoàn toàn", () => {
    expect(describeGraphError({ code: 987654 }, "Graph API trả về HTTP 500.")).toContain(
      "Graph API trả về HTTP 500.",
    );
  });

  it("không có payload thì trả đúng câu dự phòng", () => {
    expect(describeGraphError(null, "mất mạng")).toBe("mất mạng");
  });
});
