import { describe, expect, it } from "vitest";
import { evaluateBackupFreshness } from "./backup-freshness-warning";

const NOW = new Date("2026-08-06T03:00:00Z");
const base = {
  enabled: true,
  lastRunAt: NOW,
  lastOutcome: "LAUNCHED",
  lastDetail: "Đã tải lên R2: mkttool/2026-08/…",
  now: NOW,
};

describe("evaluateBackupFreshness", () => {
  it("im lặng khi tính năng đang tắt — người vận hành không đổi được biến máy chủ", () => {
    expect(evaluateBackupFreshness({ ...base, enabled: false, lastRunAt: null })).toBeNull();
  });

  it("im lặng khi vừa sao lưu xong", () => {
    expect(evaluateBackupFreshness(base)).toBeNull();
  });

  it("bật rồi mà chưa chạy lượt nào thì báo VÀNG", () => {
    const w = evaluateBackupFreshness({ ...base, lastRunAt: null, lastOutcome: null });

    expect(w?.kind).toBe("NEVER_RAN");
    expect(w?.tone).toBe("amber");
  });

  /**
   * Lượt hỏng là tin xấu NGAY, không đợi tới ngưỡng cũ — vì nó nói ra được lý do, mà lý do mới là
   * thứ sửa được. Đợi hai ngày rồi mới kêu là vứt đi thông tin duy nhất có ích.
   */
  it("lượt gần nhất hỏng thì báo ĐỎ ngay, kèm nguyên lý do", () => {
    const w = evaluateBackupFreshness({
      ...base,
      lastOutcome: "SKIPPED",
      lastDetail: "R2 từ chối (HTTP 403): SignatureDoesNotMatch",
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
  it("lượt cuối thành công nhưng đã cũ thì vẫn báo ĐỎ", () => {
    const w = evaluateBackupFreshness({
      ...base,
      lastRunAt: new Date("2026-08-03T03:00:00Z"),
    });

    expect(w?.kind).toBe("STALE");
    expect(w?.tone).toBe("red");
    expect(w?.message).toContain("3 ngày");
  });

  it("mới một ngày thì chưa kêu — lịch chạy mỗi ngày, trễ vài tiếng là bình thường", () => {
    expect(
      evaluateBackupFreshness({ ...base, lastRunAt: new Date("2026-08-05T03:00:00Z") }),
    ).toBeNull();
  });
});
