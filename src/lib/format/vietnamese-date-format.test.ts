import { describe, expect, it } from "vitest";
import { wallClockIn } from "./team-timezone";
import {
  endOfLocalDay,
  formatDayMonth,
  formatDayMonthTime,
  formatFullDateTime,
  formatTimestampForFileName,
  localDayKey,
  parseDateTimeInput,
  parseLocalDateInput,
  startOfLocalDay,
  startOfNextHour,
  toDateTimeInputValue,
} from "./vietnamese-date-format";

/**
 * Mọi mốc trong file này dựng bằng `Date.UTC`, cố ý.
 *
 * `new Date(2026, 7, 2, 9, 0)` dựng theo giờ CỦA MÁY CHẠY TEST — nên bộ test sẽ xanh trên máy
 * dev ở Việt Nam và đỏ (hoặc tệ hơn: xanh vì lý do sai) trên CI chạy giờ UTC. Đó đúng là kiểu
 * phụ thuộc máy mà cả phase này sinh ra để diệt, nên test cũng không được phép mắc.
 *
 * TEAM_TIMEZONE của test đặt cứng `Asia/Ho_Chi_Minh` (UTC+7) trong vitest.config.mts.
 */
const SAIGON = "Asia/Ho_Chi_Minh";

/** 16/08/2026 17:30 UTC = 00:30 ngày 17/08 giờ Việt Nam — cố tình vắt qua nửa đêm. */
const QUA_NUA_DEM = new Date(Date.UTC(2026, 7, 16, 17, 30, 45));

/** 16/08/2026 02:15 UTC = 09:15 cùng ngày giờ Việt Nam. */
const GIUA_TRUA = new Date(Date.UTC(2026, 7, 16, 2, 15, 0));

describe("đọc ngày theo múi giờ team, không theo giờ máy", () => {
  it("mốc vắt qua nửa đêm được tính sang ngày hôm sau", () => {
    // Cùng một mốc: ở UTC vẫn là 16/08, ở giờ Việt Nam đã sang 17/08.
    expect(QUA_NUA_DEM.getUTCDate()).toBe(16);
    expect(formatDayMonth(QUA_NUA_DEM)).toBe("17/08");
    expect(localDayKey(QUA_NUA_DEM)).toBe("2026-08-17");
  });

  it("formatDayMonthTime cho giờ Việt Nam", () => {
    expect(formatDayMonthTime(QUA_NUA_DEM)).toBe("17/08 00:30");
    expect(formatDayMonthTime(GIUA_TRUA)).toBe("16/08 09:15");
  });

  it("formatFullDateTime có năm", () => {
    expect(formatFullDateTime(GIUA_TRUA)).toBe("16/08/2026 09:15");
  });

  it("tên file sao lưu theo giờ team", () => {
    expect(formatTimestampForFileName(GIUA_TRUA)).toBe("20260816-091500");
  });
});

describe("localDayKey", () => {
  it("có năm trong khóa — cùng ngày/tháng khác năm phải ra hai nhóm", () => {
    const namNay = new Date(Date.UTC(2026, 7, 2, 2, 0));
    const namSau = new Date(Date.UTC(2027, 7, 2, 2, 0));

    // Chuỗi hiển thị giống hệt nhau, đó chính là lý do không được dùng nó làm khóa.
    expect(formatDayMonth(namNay)).toBe(formatDayMonth(namSau));
    expect(localDayKey(namNay)).not.toBe(localDayKey(namSau));
  });

  it("hai giờ khác nhau trong cùng một ngày cho cùng một khóa", () => {
    // 17:05 và 16:55 UTC hôm trước = 00:05 và 23:55 cùng ngày giờ Việt Nam.
    const dauNgay = new Date(Date.UTC(2026, 7, 1, 17, 5));
    const cuoiNgay = new Date(Date.UTC(2026, 7, 2, 16, 55));
    expect(localDayKey(dauNgay)).toBe(localDayKey(cuoiNgay));
  });

  it("đệm 0 cho tháng và ngày một chữ số", () => {
    expect(localDayKey(new Date(Date.UTC(2026, 0, 4, 20, 0)))).toBe("2026-01-05");
  });
});

describe("startOfLocalDay / endOfLocalDay", () => {
  it("nửa đêm theo giờ team, không phải nửa đêm UTC", () => {
    // Nửa đêm 17/08 giờ Việt Nam = 17:00 ngày 16/08 UTC.
    expect(startOfLocalDay(QUA_NUA_DEM).toISOString()).toBe("2026-08-16T17:00:00.000Z");
    expect(endOfLocalDay(QUA_NUA_DEM).toISOString()).toBe("2026-08-17T17:00:00.000Z");
  });

  it("một ngày dài đúng 24 tiếng", () => {
    const dai = endOfLocalDay(GIUA_TRUA).getTime() - startOfLocalDay(GIUA_TRUA).getTime();
    expect(dai).toBe(86_400_000);
  });

  it("mọi mốc trong cùng một ngày team cho cùng một ranh giới", () => {
    const dauNgay = new Date(Date.UTC(2026, 7, 15, 17, 0, 0));
    const cuoiNgay = new Date(Date.UTC(2026, 7, 16, 16, 59, 59));
    expect(startOfLocalDay(dauNgay).getTime()).toBe(startOfLocalDay(cuoiNgay).getTime());
  });

  it("cuộn sang tháng sau ở ngày cuối tháng", () => {
    // 31/08 giờ Việt Nam → ranh giới sau là 01/09.
    const cuoiThang = new Date(Date.UTC(2026, 7, 31, 5, 0));
    expect(wallClockIn(endOfLocalDay(cuoiThang), SAIGON)).toMatchObject({ month: 9, day: 1 });
  });
});

describe("startOfNextHour", () => {
  it("làm tròn lên đầu giờ kế tiếp theo giờ team", () => {
    expect(startOfNextHour(GIUA_TRUA).toISOString()).toBe("2026-08-16T03:00:00.000Z");
  });

  it("23 giờ thì sang 0 giờ ngày hôm sau", () => {
    // 16:30 UTC = 23:30 giờ Việt Nam.
    const gan_nua_dem = new Date(Date.UTC(2026, 7, 16, 16, 30));
    expect(wallClockIn(startOfNextHour(gan_nua_dem), SAIGON)).toMatchObject({ day: 17, hour: 0 });
  });
});

describe("parseLocalDateInput", () => {
  it("đọc YYYY-MM-DD thành nửa đêm theo giờ team, không phải UTC", () => {
    const parsed = parseLocalDateInput("2026-08-16");

    expect(parsed).toBeInstanceOf(Date);
    // Nửa đêm 16/08 giờ Việt Nam = 17:00 ngày 15/08 UTC.
    expect((parsed as Date).toISOString()).toBe("2026-08-15T17:00:00.000Z");
  });

  it("chuỗi không phải ngày thì trả nguyên về, để zod báo lỗi cho đúng chỗ", () => {
    expect(parseLocalDateInput("hôm nào đó")).toBe("hôm nào đó");
  });

  // `Date.UTC(2026, 12, 45)` không ném lỗi mà cuộn sang 14/02/2027 — một Date hợp lệ,
  // zod nhận luôn. Trả chuỗi về mới giữ được mức chặt của z.coerce.date() ban đầu.
  it("ngày rác trả về dạng chuỗi thay vì cuộn sang một ngày hợp lệ khác", () => {
    expect(parseLocalDateInput("2026-13-45")).toBe("2026-13-45");
    expect(parseLocalDateInput("2026-02-30")).toBe("2026-02-30");
    expect(parseLocalDateInput("2026-00-10")).toBe("2026-00-10");
  });

  it("ngày 29/02 năm nhuận vẫn hợp lệ", () => {
    expect(parseLocalDateInput("2028-02-29")).toBeInstanceOf(Date);
  });
});

describe("parseDateTimeInput", () => {
  /**
   * Đây là phép đo quan trọng nhất của cả phase: người dùng gõ "21:30" thì job phải rơi vào
   * 21:30 GIỜ TEAM, bất kể máy chủ đặt múi giờ nào.
   */
  it("đọc chuỗi datetime-local theo giờ team", () => {
    const parsed = parseDateTimeInput("2026-08-16T21:30");
    expect(parsed).toBeInstanceOf(Date);
    expect((parsed as Date).toISOString()).toBe("2026-08-16T14:30:00.000Z");
  });

  it("đi vòng qua ô nhập rồi đọc lại thì ra đúng chuỗi ban đầu", () => {
    const chuoi = "2026-08-16T21:30";
    const parsed = parseDateTimeInput(chuoi) as Date;
    expect(toDateTimeInputValue(parsed)).toBe(chuoi);
  });

  // Chuỗi ISO có mang múi giờ là mốc tuyệt đối — không được diễn giải lại theo giờ team,
  // nếu không thì mỗi lần lưu lại một bản ghi là nó trôi thêm 7 tiếng.
  it("chuỗi ISO kèm Z thì trả nguyên về cho zod, không diễn giải lại", () => {
    expect(parseDateTimeInput("2026-08-16T14:30:00.000Z")).toBe("2026-08-16T14:30:00.000Z");
  });

  it("giờ rác trả về dạng chuỗi", () => {
    expect(parseDateTimeInput("2026-08-16T25:30")).toBe("2026-08-16T25:30");
    expect(parseDateTimeInput("2026-02-30T10:00")).toBe("2026-02-30T10:00");
  });
});
