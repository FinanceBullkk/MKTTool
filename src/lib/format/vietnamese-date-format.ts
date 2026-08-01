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
