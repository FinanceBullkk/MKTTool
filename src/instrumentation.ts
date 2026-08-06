/**
 * Việc chạy một lần lúc máy chủ khởi động.
 *
 * Next.js gọi `register()` đúng một lần cho mỗi tiến trình máy chủ. Đây là chỗ duy nhất trong
 * một app Next có thể bật một việc chạy nền mà không cần dựng thêm một tiến trình thứ hai — và
 * đó chính là thứ bộ lịch dò cần (xem `daily-health-check-scheduler.ts` để biết vì sao không
 * dùng cron của hãng).
 *
 * Hai chốt chặn dưới đây, cả hai đều là để bộ lịch KHÔNG chạy ở nơi không nên chạy:
 *
 * - `NEXT_RUNTIME` — file này cũng được nạp cho runtime edge, nơi không có `setInterval` dài hạn,
 *   không có `child_process`, và không có Prisma. Bật ở đó là lỗi ngay lúc nạp module.
 * - `NEXT_PHASE` — `next build` có nạp instrumentation ở vài đường. Bắn một lượt dò trong lúc
 *   build ảnh Docker là chuyện vô nghĩa, và trong ảnh đó thì còn chẳng có database để nói chuyện.
 *
 * Ngoài hai chốt này, bộ lịch còn tự tắt khi thiếu `HEALTH_CHECK_DAILY_AT` — nên máy dev không
 * bao giờ tự bắn một lượt dò tiêu quota proxy quan sát viên.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startDailyHealthCheckScheduler } = await import(
    "./lib/health/daily-health-check-scheduler"
  );
  startDailyHealthCheckScheduler();

  const { startDailyBackupScheduler } = await import("./lib/backup/daily-backup-scheduler");
  startDailyBackupScheduler();
}
