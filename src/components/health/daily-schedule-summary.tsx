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
  if (outcome === "LAUNCHED") return "đã bắn lượt dò";
  if (outcome === "SKIPPED") return "bỏ qua";
  // "CLAIMED" còn đọng lại nghĩa là tiến trình chết ngay giữa lúc quyết. Nói thẳng ra, đừng dịch
  // thành một câu nghe như bình thường.
  return "quyết dở rồi mất tiến trình";
}

export function DailyScheduleSummary({ schedule }: { schedule: DailyHealthCheckScheduleView }) {
  const { at, configError, lastRun } = schedule;

  if (configError) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">
        Lịch dò <strong>không chạy</strong>: {configError} Sửa <code>{DAILY_HEALTH_CHECK_ENV}</code>{" "}
        trong biến môi trường của máy chủ rồi khởi động lại.
      </p>
    );
  }

  if (!at) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        Lịch dò đang <strong>tắt</strong> — bộ dò chỉ chạy khi có người bấm nút. Bật bằng cách khai{" "}
        <code>{DAILY_HEALTH_CHECK_ENV}=&quot;09:00&quot;</code> (giờ team) trong biến môi trường
        của máy chủ rồi khởi động lại.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        Tự chạy <strong>{formatTimeOfDay(at)}</strong> mỗi ngày theo giờ team.
      </p>

      {lastRun ? (
        <p className="text-xs text-neutral-500">
          Lượt gần nhất: {formatDayMonthTime(lastRun.lastRunAt)} —{" "}
          {describeOutcome(lastRun.outcome)} (máy {lastRun.host}).
          {lastRun.detail ? ` ${lastRun.detail}` : ""}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Chưa có lượt tự động nào — mốc hẹn đầu tiên chưa tới, hoặc máy chủ vừa bật lịch.
        </p>
      )}
    </div>
  );
}
