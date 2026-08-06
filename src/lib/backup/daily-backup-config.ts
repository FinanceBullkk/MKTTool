/**
 * Hai hằng của lịch sao lưu, tách khỏi bộ lịch để khay cảnh báo dùng mà không kéo theo cả nó.
 *
 * Cùng lý do với `daily-health-check-config.ts`: khay cảnh báo vận hành vẽ trên MỌI trang và cố ý
 * giữ mình nhẹ — nó chỉ cần đọc một cái tên biến, không cần `pg_dump`, Prisma hay tầng mạng.
 */

/** Tên việc trong bảng `ScheduledJobRun`. Đổi nó là mất lịch sử của lịch cũ. */
export const DAILY_BACKUP_JOB_KEY = "daily-backup";

/** Biến môi trường khai giờ hẹn, dạng `HH:MM` theo `TEAM_TIMEZONE`. Vắng mặt = tắt lịch. */
export const DAILY_BACKUP_ENV = "BACKUP_DAILY_AT";
