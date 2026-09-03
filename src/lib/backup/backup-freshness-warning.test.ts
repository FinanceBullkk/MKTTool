import { describe, expect, it } from "vitest";
import { evaluateBackupFreshness } from "./backup-freshness-warning";

const NOW = new Date("2026-08-06T03:00:00Z");
const base = {
  enabled: true,
  lastRunAt: NOW,
  lastOutcome: "LAUNCHED",
  lastDetail: "Uploaded to R2: mkttool/2026-08/...",
  now: NOW,
};

describe("evaluateBackupFreshness", () => {
  it("stays silent when the feature is disabled because operators cannot change server variables", () => {
    expect(evaluateBackupFreshness({ ...base, enabled: false, lastRunAt: null })).toBeNull();
  });

  it("stays silent immediately after a successful backup", () => {
    expect(evaluateBackupFreshness(base)).toBeNull();
  });

  it("returns an AMBER warning when enabled but never run", () => {
    const w = evaluateBackupFreshness({ ...base, lastRunAt: null, lastOutcome: null });

    expect(w?.kind).toBe("NEVER_RAN");
    expect(w?.tone).toBe("amber");
  });

  /**
   * Lượt hỏng là tin xấu NGAY, không đợi tới ngưỡng cũ — vì nó nói ra được lý do, mà lý do mới là
   * thứ sửa được. Đợi hai ngày rồi mới kêu là vứt đi thông tin duy nhất có ích.
   */
  it("returns a RED warning immediately after the latest failure and includes its reason", () => {
    const w = evaluateBackupFreshness({
      ...base,
      lastOutcome: "SKIPPED",
      lastDetail: "R2 rejected the request (HTTP 403): SignatureDoesNotMatch",
    });

    expect(w?.kind).toBe("LAST_FAILED");
    expect(w?.tone).toBe("red");
    expect(w?.message).toContain("SignatureDoesNotMatch");
  });

  /**
   * Nhánh khó thấy nhất: sổ ghi THÀNH CÔNG nhưng mốc đã cũ. Nghĩa là bộ lịch không chạy nữa —
   * app chết, biến bị gỡ, tiến trình treo. Không có lỗi nào để đọc, nên nếu chỗ này im thì không
   * còn chỗ nào kêu.
   */
  it("returns a RED warning when the latest successful backup is stale", () => {
    const w = evaluateBackupFreshness({
      ...base,
      lastRunAt: new Date("2026-08-03T03:00:00Z"),
    });

    expect(w?.kind).toBe("STALE");
    expect(w?.tone).toBe("red");
    expect(w?.message).toContain("3 days");
  });

  it("does not warn after only one day because a few hours of delay is normal", () => {
    expect(
      evaluateBackupFreshness({ ...base, lastRunAt: new Date("2026-08-05T03:00:00Z") }),
    ).toBeNull();
  });
});
