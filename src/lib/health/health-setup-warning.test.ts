import { describe, expect, it } from "vitest";
import { type HealthSetupInput, evaluateHealthSetup } from "./health-setup-warning";

function input(overrides: Partial<HealthSetupInput> = {}): HealthSetupInput {
  return {
    redditAccountCount: 2,
    activeObserverProxyCount: 1,
    neverCheckedCount: 0,
    staleCount: 0,
    ...overrides,
  };
}

describe("evaluateHealthSetup", () => {
  it("chưa có nick Reddit thì không cảnh báo gì — đó là cài đặt mới, không phải lỗi", () => {
    const warning = evaluateHealthSetup(
      input({ redditAccountCount: 0, activeObserverProxyCount: 0, neverCheckedCount: 0 }),
    );
    expect(warning).toBeNull();
  });

  it("thiếu proxy quan sát viên thì nói ĐÚNG nguyên nhân đó, không nói 'chưa dò gần đây'", () => {
    // Đây là lỗi mà phase này sinh ra để sửa: câu cũ gợi ý "chạy lại đi" trong khi sự thật là
    // KHÔNG THỂ chạy, nên dải cảnh báo không bao giờ tắt được.
    const warning = evaluateHealthSetup(
      input({ activeObserverProxyCount: 0, neverCheckedCount: 2 }),
    );

    expect(warning?.kind).toBe("NO_OBSERVER_PROXY");
    expect(warning?.href).toBe("/proxies");
    expect(warning?.tone).toBe("red");
  });

  it("proxy quan sát viên bị TẮT hết cũng tính như không có", () => {
    const warning = evaluateHealthSetup(input({ activeObserverProxyCount: 0 }));
    expect(warning?.kind).toBe("NO_OBSERVER_PROXY");
  });

  it("có proxy rồi mà chưa nick nào được dò thì trỏ về trang Sức khỏe", () => {
    const warning = evaluateHealthSetup(input({ neverCheckedCount: 2 }));

    expect(warning?.kind).toBe("NEVER_CHECKED");
    expect(warning?.href).toBe("/health");
    expect(warning?.message).toContain("2 nick");
  });

  it("chưa dò lần nào được ưu tiên hơn dò-lâu-rồi", () => {
    // Hai chuyện khác nhau và cần hai việc khác nhau; gộp lại là mất thông tin.
    const warning = evaluateHealthSetup(input({ neverCheckedCount: 1, staleCount: 3 }));
    expect(warning?.kind).toBe("NEVER_CHECKED");
  });

  it("đã dò hết nhưng lâu rồi thì giữ câu cũ", () => {
    const warning = evaluateHealthSetup(input({ staleCount: 3 }));

    expect(warning?.kind).toBe("STALE");
    expect(warning?.tone).toBe("amber");
  });

  it("mọi thứ đủ và mới thì im lặng", () => {
    expect(evaluateHealthSetup(input())).toBeNull();
  });
});
