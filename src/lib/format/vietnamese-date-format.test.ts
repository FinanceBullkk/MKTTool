import { describe, expect, it } from "vitest";
import { formatDayMonth, localDayKey, parseLocalDateInput } from "./vietnamese-date-format";

describe("localDayKey", () => {
  it("có năm trong khóa — cùng ngày/tháng khác năm phải ra hai nhóm", () => {
    const thisYear = new Date(2026, 7, 2, 9, 0);
    const nextYear = new Date(2027, 7, 2, 9, 0);

    // Chuỗi hiển thị giống hệt nhau, đó chính là lý do không được dùng nó làm khóa.
    expect(formatDayMonth(thisYear)).toBe(formatDayMonth(nextYear));
    expect(localDayKey(thisYear)).not.toBe(localDayKey(nextYear));
  });

  it("hai giờ khác nhau trong cùng một ngày cho cùng một khóa", () => {
    expect(localDayKey(new Date(2026, 7, 2, 0, 5))).toBe(localDayKey(new Date(2026, 7, 2, 23, 55)));
  });

  it("đệm 0 cho tháng và ngày một chữ số", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseLocalDateInput", () => {
  it("đọc YYYY-MM-DD thành nửa đêm theo giờ máy, không phải UTC", () => {
    const parsed = parseLocalDateInput("2026-08-16");

    expect(parsed).toBeInstanceOf(Date);
    const date = parsed as Date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(16);
    expect(date.getHours()).toBe(0);
  });

  it("chuỗi có kèm giờ thì trả nguyên về cho zod — datetime-local vốn đã đúng giờ máy", () => {
    expect(parseLocalDateInput("2026-08-16T21:30")).toBe("2026-08-16T21:30");
  });

  it("chuỗi không phải ngày thì trả nguyên về, để zod báo lỗi cho đúng chỗ", () => {
    expect(parseLocalDateInput("hôm nào đó")).toBe("hôm nào đó");
  });

  // `new Date(2026, 12, 45)` không ném lỗi mà cuộn sang 14/02/2027 — một Date hợp lệ,
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
