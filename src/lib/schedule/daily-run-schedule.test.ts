import { describe, expect, it } from "vitest";
import {
  DailyScheduleError,
  decideDailyRun,
  formatTimeOfDay,
  readDailyScheduleTime,
  scheduledInstantFor,
} from "./daily-run-schedule";

/**
 * Múi giờ team thật của dự án — UTC+7, không đổi giờ. Mọi mốc dưới đây viết bằng UTC để đọc
 * được bằng mắt: 02:00Z = 09:00 giờ team.
 */
const TZ = "Asia/Ho_Chi_Minh";
const AT_9 = { hour: 9, minute: 0 };

describe("readDailyScheduleTime", () => {
  it("treats missing or blank values as a DISABLED schedule rather than an error", () => {
    expect(readDailyScheduleTime(undefined)).toBeNull();
    expect(readDailyScheduleTime("")).toBeNull();
    expect(readDailyScheduleTime("   ")).toBeNull();
  });

  it("reads HH:MM and accepts a one-digit hour", () => {
    expect(readDailyScheduleTime("09:00")).toEqual({ hour: 9, minute: 0 });
    expect(readDailyScheduleTime("9:05")).toEqual({ hour: 9, minute: 5 });
    expect(readDailyScheduleTime(" 23:59 ")).toEqual({ hour: 23, minute: 59 });
    expect(readDailyScheduleTime("00:00")).toEqual({ hour: 0, minute: 0 });
  });

  /**
   * Nhánh đáng giá nhất của cả file. Khai sai mà lặng lẽ coi như "tắt" là để người vừa cố ý bật
   * lịch tin rằng nó đang chạy — chính xác kiểu hỏng mà bộ lịch này sinh ra để tránh.
   */
  it("THROWS for invalid formats instead of silently treating them as disabled", () => {
    for (const bad of ["9h00", "09:00:00", "9", "morning", "09;00", "0900"]) {
      expect(() => readDailyScheduleTime(bad)).toThrow(DailyScheduleError);
    }
  });

  it("rejects hours or minutes outside a valid day", () => {
    expect(() => readDailyScheduleTime("24:00")).toThrow(/outside a valid day/);
    expect(() => readDailyScheduleTime("09:60")).toThrow(/outside a valid day/);
  });
});

describe("formatTimeOfDay", () => {
  it("always uses two digits", () => {
    expect(formatTimeOfDay({ hour: 9, minute: 5 })).toBe("09:05");
    expect(formatTimeOfDay({ hour: 0, minute: 0 })).toBe("00:00");
  });
});

describe("scheduledInstantFor", () => {
  it("uses the TEAM TIME-ZONE DATE rather than the UTC date", () => {
    // 20:00Z ngày 05/08 = 03:00 sáng ngày 06/08 giờ team. Mốc hẹn phải là 09:00 ngày 06/08 giờ
    // team (= 02:00Z ngày 06/08), chứ không phải ngày 05/08 theo lịch UTC.
    const now = new Date("2026-08-05T20:00:00Z");
    expect(scheduledInstantFor(now, TZ, AT_9)).toEqual(new Date("2026-08-06T02:00:00Z"));
  });

  it("returns one scheduled instant throughout the same team-time day", () => {
    const morning = scheduledInstantFor(new Date("2026-08-06T01:00:00Z"), TZ, AT_9);
    const evening = scheduledInstantFor(new Date("2026-08-06T15:00:00Z"), TZ, AT_9);
    expect(morning).toEqual(evening);
  });
});

describe("decideDailyRun", () => {
  const scheduledFor = new Date("2026-08-06T02:00:00Z"); // 09:00 giờ team

  it("waits before the scheduled time", () => {
    const decision = decideDailyRun({
      now: new Date("2026-08-06T01:59:00Z"),
      timeZone: TZ,
      at: AT_9,
      lastRunAt: null,
    });

    expect(decision.verdict).toBe("TOO_EARLY");
    expect(decision.scheduledFor).toEqual(scheduledFor);
  });

  it("RUNS at the scheduled time when no earlier run exists", () => {
    expect(
      decideDailyRun({ now: scheduledFor, timeZone: TZ, at: AT_9, lastRunAt: null }).verdict,
    ).toBe("RUN");
  });

  it("runs today when the latest run was YESTERDAY", () => {
    const decision = decideDailyRun({
      now: new Date("2026-08-06T02:00:30Z"),
      timeZone: TZ,
      at: AT_9,
      lastRunAt: new Date("2026-08-05T02:00:10Z"),
    });

    expect(decision.verdict).toBe("RUN");
  });

  it("does not run again when the latest run was TODAY", () => {
    const decision = decideDailyRun({
      now: new Date("2026-08-06T02:01:00Z"),
      timeZone: TZ,
      at: AT_9,
      lastRunAt: new Date("2026-08-06T02:00:05Z"),
    });

    expect(decision.verdict).toBe("ALREADY_DECIDED");
  });

  /**
   * Bắt kịp lượt đã lỡ. App tắt suốt buổi sáng, bật lại lúc 21:00 giờ team — một lượt dò trễ vẫn
   * trả lời được câu "bài của nick còn hiện với người ngoài không", bỏ hẳn ngày đó thì không.
   */
  it("catches up a missed run when the app starts after the scheduled time", () => {
    const decision = decideDailyRun({
      now: new Date("2026-08-06T14:00:00Z"), // 21:00 giờ team
      timeZone: TZ,
      at: AT_9,
      lastRunAt: new Date("2026-08-04T02:00:00Z"), // lượt gần nhất từ hai ngày trước
    });

    expect(decision.verdict).toBe("RUN");
  });

  /**
   * Và chỉ bắt kịp MỘT lượt. Sau khi lượt bù chạy xong, `lastRunAt` đã vượt mốc hẹn hôm nay nên
   * nó không đuổi tiếp cho hai ngày đã lỡ — dò bù ba lượt liền là đúng thứ đẩy proxy quan sát
   * viên vào diện bị chặn.
   */
  it("catches up only ONE run after missing multiple days", () => {
    const decision = decideDailyRun({
      now: new Date("2026-08-06T14:01:00Z"),
      timeZone: TZ,
      at: AT_9,
      lastRunAt: new Date("2026-08-06T14:00:00Z"),
    });

    expect(decision.verdict).toBe("ALREADY_DECIDED");
  });

  /**
   * Nửa đêm giờ team là chỗ dễ lệch một ngày nhất: 17:00Z hôm trước đã là 00:00 hôm sau ở UTC+7.
   */
  it("uses the team time zone to divide days for a 00:00 schedule", () => {
    const at = { hour: 0, minute: 0 };
    const justBefore = new Date("2026-08-05T16:59:00Z"); // 23:59 ngày 05/08 giờ team
    const justAfter = new Date("2026-08-05T17:00:00Z"); // 00:00 ngày 06/08 giờ team

    expect(decideDailyRun({ now: justBefore, timeZone: TZ, at, lastRunAt: null }).verdict).toBe(
      "RUN", // mốc hẹn 00:00 ngày 05/08 đã qua từ lâu, và chưa chạy lần nào
    );
    expect(
      decideDailyRun({
        now: justAfter,
        timeZone: TZ,
        at,
        lastRunAt: new Date("2026-08-05T16:59:30Z"),
      }).verdict,
    ).toBe("RUN"); // đã sang ngày mới giờ team, mốc hẹn mới
  });
});
