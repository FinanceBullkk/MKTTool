/**
 * Trạng thái lịch dò hằng ngày — server component, chỉ đọc và vẽ.
 *
 * Vì sao đáng một khối riêng trên trang: lịch tắt là kiểu hỏng **không màn hình nào tự lộ ra**.
 * Bảng sức khỏe ngay trên vẫn đầy số liệu, không ô nào đỏ — chỉ là số liệu đó mỗi ngày một cũ.
 * Khay cảnh báo vận hành có một mục cho ca này nhưng chỉ ADMIN thấy (chỉ họ đổi được biến môi
 * trường), nên người vận hành cần một chỗ tự trả lời được câu *"bộ dò có đang tự chạy không"*.
 */
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import type { DailyHealthCheckScheduleView } from "@/lib/health/daily-health-check-scheduler";
import { DAILY_HEALTH_CHECK_ENV } from "@/lib/health/daily-health-check-config";
import { formatTimeOfDay } from "@/lib/schedule/daily-run-schedule";

/** Câu người đọc hiểu được, thay cho mã trạng thái trong sổ. */
function describeOutcome(outcome: string): string {
  if (outcome === "LAUNCHED") return "started a health check";
  if (outcome === "SKIPPED") return "skipped";
  // "CLAIMED" còn đọng lại nghĩa là tiến trình chết ngay giữa lúc quyết. Nói thẳng ra, đừng dịch
  // thành một câu nghe như bình thường.
  return "claimed the run, then the process disappeared";
}

export function DailyScheduleSummary({ schedule }: { schedule: DailyHealthCheckScheduleView }) {
  const { at, configError, lastRun } = schedule;

  if (configError) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">
        Daily health checks are <strong>not running</strong>: {configError} Fix{" "}
        <code>{DAILY_HEALTH_CHECK_ENV}</code> in the server environment, then restart the app.
      </p>
    );
  }

  if (!at) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Daily health checks are <strong>disabled</strong>; checks run only when someone clicks a
        button. Set <code>{DAILY_HEALTH_CHECK_ENV}=&quot;09:00&quot;</code> in the server
        environment to enable a daily run in team time, then restart the app.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        Runs automatically at <strong>{formatTimeOfDay(at)}</strong> every day in team time.
      </p>

      {lastRun ? (
        <p className="text-xs text-neutral-500">
          Last scheduled run: {formatDayMonthTime(lastRun.lastRunAt)} -{" "}
          {describeOutcome(lastRun.outcome)} (host {lastRun.host}).
          {lastRun.detail ? ` ${lastRun.detail}` : ""}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          No scheduled run yet. The first scheduled time has not arrived, or the server has just
          enabled the schedule.
        </p>
      )}
    </div>
  );
}
