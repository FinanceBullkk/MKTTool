/**
 * Định dạng ngày giờ kiểu Việt Nam.
 *
 * Dùng trong lý do chặn của bộ luật (chuỗi sinh ở server rồi mới gửi xuống), nên không
 * gây lệch hydrate giữa server và client.
 */

// Tự ghép chuỗi thay vì dùng Intl: các chuỗi này nằm trong lý do chặn của bộ luật, phải đọc
// giống hệt nhau ở mọi máy. Intl vi-VN đổi cả dấu phân cách lẫn thứ tự ngày/giờ tùy bản ICU.
const pad = (value: number) => String(value).padStart(2, "0");

/** 28/07 */
export function formatDayMonth(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** 28/07 14:30 */
export function formatDayMonthTime(date: Date): string {
  return `${formatDayMonth(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `2026-07-28` — khóa gom nhóm theo ngày, theo giờ máy.
 *
 * KHÔNG dùng chuỗi hiển thị `28/07` làm khóa: nó không có năm, nên bài của hai năm khác nhau
 * rơi vào cùng một nhóm và số đếm của nhóm đó sai.
 */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Đọc chuỗi `YYYY-MM-DD` của `<input type="date">` thành nửa đêm THEO GIỜ MÁY.
 *
 * `new Date("2026-08-16")` cho nửa đêm UTC, tức 07:00 ở giờ Việt Nam — lệch hẳn một buổi
 * so với phần còn lại của app vốn tính ngày bằng `startOfLocalDay`. Chuỗi có kèm giờ
 * (`datetime-local`) thì đã đúng giờ máy sẵn, trả nguyên về cho zod xử lý.
 */
export function parseLocalDateInput(value: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  // `new Date(2026, 12, 45)` KHÔNG ném lỗi — nó cuộn sang 14/02/2027, một Date hợp lệ mà
  // zod vui vẻ nhận. Đối chiếu ngược để ngày rác quay về dạng chuỗi và bị zod chặn,
  // đúng như `z.coerce.date()` vẫn làm trước khi có hàm này.
  const roundTrips =
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;

  return roundTrips ? parsed : value;
}

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** Nửa đêm theo giờ máy — "hôm nay" của bạn MKT, không phải nửa đêm UTC. */
export function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function endOfLocalDay(date: Date): Date {
  const end = startOfLocalDay(date);
  end.setDate(end.getDate() + 1);
  return end;
}
