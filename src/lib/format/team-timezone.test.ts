import { afterEach, describe, expect, it } from "vitest";
import {
  instantFromWallClock,
  loadTeamTimezone,
  parseTeamTimezone,
  resetTeamTimezoneCache,
  TeamTimezoneError,
  wallClockIn,
} from "./team-timezone";

const SAIGON = "Asia/Ho_Chi_Minh";

afterEach(() => {
  resetTeamTimezoneCache();
});

describe("parseTeamTimezone", () => {
  it("nhận tên múi giờ IANA hợp lệ", () => {
    expect(parseTeamTimezone(SAIGON)).toBe(SAIGON);
    expect(parseTeamTimezone("  UTC  ")).toBe("UTC");
  });

  // Thiếu biến thì phải DỪNG, không được lặng lẽ lùi về giờ máy: lùi về im lặng đúng là
  // kiểu hỏng mà cả module này sinh ra để diệt.
  it("thiếu biến thì ném lỗi, không trả về giá trị mặc định", () => {
    expect(() => parseTeamTimezone(undefined)).toThrow(TeamTimezoneError);
    expect(() => parseTeamTimezone("   ")).toThrow(TeamTimezoneError);
  });

  it("thông báo lỗi nói rõ phải làm gì", () => {
    expect(() => parseTeamTimezone(undefined)).toThrow(/TEAM_TIMEZONE/);
    expect(() => parseTeamTimezone(undefined)).toThrow(/Asia\/Ho_Chi_Minh/);
  });

  it("tên múi giờ bịa thì ném lỗi chứ không âm thầm nhận", () => {
    expect(() => parseTeamTimezone("Asia/Saigon_Khong_Co_That")).toThrow(TeamTimezoneError);
    expect(() => parseTeamTimezone("GMT+7")).toThrow(TeamTimezoneError);
  });
});

describe("loadTeamTimezone", () => {
  it("đọc từ process.env và nhớ lại cho lần sau", () => {
    expect(loadTeamTimezone()).toBe(SAIGON);
    expect(loadTeamTimezone()).toBe(SAIGON);
  });
});

describe("wallClockIn", () => {
  // 16/08/2026 17:30 UTC = 17:30 + 7 = 00:30 ngày 17/08 ở Việt Nam.
  // Chọn đúng mốc vắt qua nửa đêm vì đó là chỗ mọi phép cắt ngày sai thì lộ ra.
  const at = new Date(Date.UTC(2026, 7, 16, 17, 30, 45));

  it("đọc giờ treo tường theo múi giờ đã cho, không theo giờ máy", () => {
    expect(wallClockIn(at, SAIGON)).toEqual({
      year: 2026,
      month: 8,
      day: 17,
      hour: 0,
      minute: 30,
      second: 45,
    });
  });

  it("cùng một mốc, hai múi giờ cho hai ngày khác nhau", () => {
    expect(wallClockIn(at, "UTC").day).toBe(16);
    expect(wallClockIn(at, SAIGON).day).toBe(17);
  });

  // hourCycle h23: nửa đêm phải là 0, không phải 24 — 24 giờ thì mọi phép so sánh sau đó
  // lệch nguyên một ngày.
  it("nửa đêm ra giờ 0, không phải giờ 24", () => {
    expect(wallClockIn(new Date(Date.UTC(2026, 7, 16, 17, 0, 0)), SAIGON).hour).toBe(0);
  });
});

describe("instantFromWallClock", () => {
  it("là phép ngược của wallClockIn", () => {
    const wall = { year: 2026, month: 8, day: 17, hour: 0, minute: 30, second: 45 };
    const instant = instantFromWallClock(wall, SAIGON);

    expect(instant.toISOString()).toBe("2026-08-16T17:30:45.000Z");
    expect(wallClockIn(instant, SAIGON)).toEqual(wall);
  });

  it("cuộn đúng khi giờ hoặc ngày tràn", () => {
    const nextDay = instantFromWallClock(
      { year: 2026, month: 8, day: 16, hour: 24, minute: 0, second: 0 },
      SAIGON,
    );
    expect(wallClockIn(nextDay, SAIGON)).toMatchObject({ month: 8, day: 17, hour: 0 });

    const nextMonth = instantFromWallClock(
      { year: 2026, month: 8, day: 32, hour: 0, minute: 0, second: 0 },
      SAIGON,
    );
    expect(wallClockIn(nextMonth, SAIGON)).toMatchObject({ month: 9, day: 1 });
  });

  /**
   * Múi giờ có đổi giờ mùa hè là chỗ phép "đoán rồi hiệu chỉnh" phải chứng minh mình đúng.
   * Asia/Ho_Chi_Minh không đổi giờ nên nếu chỉ đo bằng nó thì một cách làm sai vẫn xanh.
   *
   * New York: 08/03/2026 lúc 02:00 nhảy thẳng lên 03:00. Trước đó lệch -05:00, sau đó -04:00.
   */
  it("đúng ở cả hai phía của một lần đổi giờ mùa hè", () => {
    const truoc = instantFromWallClock(
      { year: 2026, month: 3, day: 8, hour: 1, minute: 0, second: 0 },
      "America/New_York",
    );
    expect(truoc.toISOString()).toBe("2026-03-08T06:00:00.000Z");

    const sau = instantFromWallClock(
      { year: 2026, month: 3, day: 8, hour: 4, minute: 0, second: 0 },
      "America/New_York",
    );
    expect(sau.toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });
});
