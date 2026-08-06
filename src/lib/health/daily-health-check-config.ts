/**
 * Hai hằng của lịch dò hằng ngày, tách khỏi bộ lịch để nơi khác dùng mà không kéo theo cả nó.
 *
 * Chỗ cần tách: khay cảnh báo vận hành (`collect-ops-alerts.ts`) phải biết tên biến môi trường
 * để nói *"chưa bật lịch dò"*, nhưng khay đó vẽ trên MỌI trang và cố ý giữ mình nhẹ — nó không
 * truy vấn database và không nên kéo theo `child_process` lẫn Prisma của bộ lịch chỉ để đọc một
 * chuỗi. Viết lại chuỗi đó ở hai nơi thì rẻ hơn một file, nhưng hai chỗ khai một cái tên là hai
 * chỗ sẽ lệch nhau.
 */

/** Tên việc trong bảng `ScheduledJobRun`. Đổi nó là mất lịch sử của lịch cũ. */
export const DAILY_HEALTH_CHECK_JOB_KEY = "daily-health-check";

/** Biến môi trường khai giờ hẹn, dạng `HH:MM` theo `TEAM_TIMEZONE`. Vắng mặt = tắt lịch. */
export const DAILY_HEALTH_CHECK_ENV = "HEALTH_CHECK_DAILY_AT";
