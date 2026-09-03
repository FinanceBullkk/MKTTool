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
  it("does not warn when there are no Reddit nicks", () => {
    const warning = evaluateHealthSetup(
      input({ redditAccountCount: 0, activeObserverProxyCount: 0, neverCheckedCount: 0 }),
    );
    expect(warning).toBeNull();
  });

  it("reports the missing observer proxy instead of suggesting another check", () => {
    // Đây là lỗi mà phase này sinh ra để sửa: câu cũ gợi ý "chạy lại đi" trong khi sự thật là
    // KHÔNG THỂ chạy, nên dải cảnh báo không bao giờ tắt được.
    const warning = evaluateHealthSetup(
      input({ activeObserverProxyCount: 0, neverCheckedCount: 2 }),
    );

    expect(warning?.kind).toBe("NO_OBSERVER_PROXY");
    expect(warning?.href).toBe("/proxies");
    expect(warning?.tone).toBe("red");
  });

  it("treats all disabled observer proxies as missing", () => {
    const warning = evaluateHealthSetup(input({ activeObserverProxyCount: 0 }));
    expect(warning?.kind).toBe("NO_OBSERVER_PROXY");
  });

  it("links to Nick health when nicks have never been checked", () => {
    const warning = evaluateHealthSetup(input({ neverCheckedCount: 2 }));

    expect(warning?.kind).toBe("NEVER_CHECKED");
    expect(warning?.href).toBe("/health");
    expect(warning?.message).toContain("2 nick");
  });

  it("prioritizes never-checked nicks over stale checks", () => {
    // Hai chuyện khác nhau và cần hai việc khác nhau; gộp lại là mất thông tin.
    const warning = evaluateHealthSetup(input({ neverCheckedCount: 1, staleCount: 3 }));
    expect(warning?.kind).toBe("NEVER_CHECKED");
  });

  it("warns when every nick was checked but the results are stale", () => {
    const warning = evaluateHealthSetup(input({ staleCount: 3 }));

    expect(warning?.kind).toBe("STALE");
    expect(warning?.tone).toBe("amber");
  });

  it("returns no warning when setup and checks are current", () => {
    expect(evaluateHealthSetup(input())).toBeNull();
  });
});
