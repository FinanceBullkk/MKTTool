/**
 * Định dạng ngày giờ kiểu Việt Nam, và cắt ranh giới ngày.
 *
 * Mọi hàm ở đây đọc giờ theo `TEAM_TIMEZONE` — múi giờ chung của cả team — chứ KHÔNG theo
 * giờ của máy đang chạy. Lý do và cách hoạt động: xem [team-timezone.ts](./team-timezone.ts).
 *
 * Chuỗi sinh ở server rồi mới gửi xuống client, nên không gây lệch hydrate. Và vì cả hai
 * phía cùng đọc một múi giờ cố định, chuỗi cũng không đổi theo máy người xem.
 */

import { instantFromWallClock, loadTeamTimezone, wallClockIn } from "./team-timezone";

// Tự ghép chuỗi thay vì để Intl định dạng: các chuỗi này nằm trong lý do chặn của bộ luật,
// phải đọc giống hệt nhau ở mọi máy. Intl vi-VN đổi cả dấu phân cách lẫn thứ tự ngày/giờ
// tùy bản ICU. Intl chỉ được dùng để ĐỔI MÚI GIỜ, ở team-timezone.ts.
const pad = (value: number) => String(value).padStart(2, "0");

/** 28/07 */
export function formatDayMonth(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return `${pad(wall.day)}/${pad(wall.month)}`;
}

/** 28/07 14:30 */
export function formatDayMonthTime(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return `${pad(wall.day)}/${pad(wall.month)} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** 28/07/2026 */
export function formatFullDate(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return `${pad(wall.day)}/${pad(wall.month)}/${wall.year}`;
}

/** 28/07/2026 14:30 */
export function formatFullDateTime(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return `${pad(wall.day)}/${pad(wall.month)}/${wall.year} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** `20260802-190530` — dùng đặt tên file, xếp theo tên là xếp theo thời gian. */
export function formatTimestampForFileName(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return (
    `${wall.year}${pad(wall.month)}${pad(wall.day)}` +
    `-${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`
  );
}

/**
 * `2026-07-28` — khóa gom nhóm theo ngày, theo múi giờ team.
 *
 * KHÔNG dùng chuỗi hiển thị `28/07` làm khóa: nó không có năm, nên bài của hai năm khác nhau
 * rơi vào cùng một nhóm và số đếm của nhóm đó sai.
 */
export function localDayKey(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** Giá trị cho `<input type="datetime-local">`, theo múi giờ team. */
export function toDateTimeInputValue(date: Date): string {
  const wall = wallClockIn(date, loadTeamTimezone());
  return (
    `${wall.year}-${pad(wall.month)}-${pad(wall.day)}` +
    `T${pad(wall.hour)}:${pad(wall.minute)}`
  );
}

/**
 * Đọc chuỗi `YYYY-MM-DD` của `<input type="date">` thành nửa đêm THEO MÚI GIỜ TEAM.
 *
 * `new Date("2026-08-16")` cho nửa đêm UTC, tức 07:00 ở giờ Việt Nam — lệch hẳn một buổi
 * so với phần còn lại của app vốn cắt ngày bằng `startOfLocalDay`. Chuỗi có kèm giờ
 * (`datetime-local`) thì do `parseDateTimeInput` lo, trả nguyên về cho zod xử lý.
 */
export function parseLocalDateInput(value: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const timeZone = loadTeamTimezone();
  const parsed = instantFromWallClock(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );

  // `Date.UTC(2026, 12, 45)` KHÔNG ném lỗi — nó cuộn sang 14/02/2027, một Date hợp lệ mà
  // zod vui vẻ nhận. Đối chiếu ngược để ngày rác quay về dạng chuỗi và bị zod chặn,
  // đúng như `z.coerce.date()` vẫn làm trước khi có hàm này.
  const roundTrip = wallClockIn(parsed, timeZone);
  const roundTrips =
    roundTrip.year === year && roundTrip.month === month && roundTrip.day === day;

  return roundTrips ? parsed : value;
}

/**
 * Đọc chuỗi `YYYY-MM-DDTHH:mm` của `<input type="datetime-local">` theo MÚI GIỜ TEAM.
 *
 * Chuỗi này không mang múi giờ. Để `new Date()` tự đọc là đọc theo giờ máy chủ — nghĩa là
 * người dùng gõ "9 giờ sáng" thì job được xếp vào 9 giờ sáng của máy chủ, không phải của họ.
 */
export function parseDateTimeInput(value: string): Date | string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return value;

  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = match[6] ? Number(match[6]) : 0;

  const timeZone = loadTeamTimezone();
  const parsed = instantFromWallClock({ year, month, day, hour, minute, second }, timeZone);

  const roundTrip = wallClockIn(parsed, timeZone);
  const roundTrips =
    roundTrip.year === year &&
    roundTrip.month === month &&
    roundTrip.day === day &&
    roundTrip.hour === hour &&
    roundTrip.minute === minute;

  return roundTrips ? parsed : value;
}

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/** Nửa đêm theo MÚI GIỜ TEAM — "hôm nay" của cả team, giống nhau ở mọi máy. */
export function startOfLocalDay(date: Date): Date {
  const timeZone = loadTeamTimezone();
  const wall = wallClockIn(date, timeZone);
  return instantFromWallClock(
    { year: wall.year, month: wall.month, day: wall.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

/**
 * Đầu giờ kế tiếp — giờ mặc định của form xếp lịch.
 *
 * `Date.UTC` tự cuộn nên 23 giờ + 1 ra 0 giờ ngày hôm sau, không cần xử lý riêng.
 */
export function startOfNextHour(date: Date): Date {
  const timeZone = loadTeamTimezone();
  const wall = wallClockIn(date, timeZone);
  return instantFromWallClock({ ...wall, hour: wall.hour + 1, minute: 0, second: 0 }, timeZone);
}

/** Nửa đêm của ngày kế tiếp. `Date.UTC` tự cuộn nên ngày 31 + 1 ra mùng 1 tháng sau. */
export function endOfLocalDay(date: Date): Date {
  const timeZone = loadTeamTimezone();
  const wall = wallClockIn(date, timeZone);
  return instantFromWallClock(
    { year: wall.year, month: wall.month, day: wall.day + 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}
