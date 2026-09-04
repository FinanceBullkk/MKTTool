/**
 * Trạng thái lịch dò hằng ngày — server component, chỉ đọc và vẽ.
 *
 * Vì sao đáng một khối riêng trên trang: lịch tắt là kiểu hỏng **không màn hình nào tự lộ ra**.
 * Bảng sức khỏe ngay trên vẫn đầy số liệu, không ô nào đỏ — chỉ là số liệu đó mỗi ngày một cũ.
 * Khay cảnh báo vận hành có một mục cho ca này nhưng chỉ ADMIN thấy (chỉ họ đổi được biến môi
 * trường), nên người vận hành cần một chỗ tự trả lời được câu *"bộ dò có đang tự chạy không"*.
 */
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { CalendarClock, CircleOff, TriangleAlert } from "lucide-react";
import { Disclosure, StatusBadge } from "@/components/ui/page-section";
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
      <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-red-200">
        <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Schedule broken</p>
          <p className="mt-1 text-xs leading-5 text-red-100/75">{configError}</p>
        </div>
      </div>
    );
  }

  if (!at) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
          <CircleOff size={17} className="shrink-0 text-amber-300" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-100">Daily schedule disabled</p>
            <p className="text-xs text-neutral-400">Health checks run only when started manually.</p>
          </div>
          <StatusBadge label="Manual" className="bg-amber-400/10 text-amber-300" />
        </div>
        <Disclosure summary="Administrator setup">
          Set <code>{DAILY_HEALTH_CHECK_ENV}=&quot;09:00&quot;</code> in the server environment and restart the app.
        </Disclosure>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] p-3">
      <CalendarClock size={18} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">Every day at {formatTimeOfDay(at)}</p>

      {lastRun ? (
        <p className="mt-1 text-xs leading-5 text-neutral-400">
          Last: {formatDayMonthTime(lastRun.lastRunAt)} · {describeOutcome(lastRun.outcome)} · {lastRun.host}
          {lastRun.detail ? ` ${lastRun.detail}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-neutral-400">
          Waiting for the first scheduled run.
        </p>
      )}
      </div>
      <StatusBadge label="Automatic" className="bg-emerald-400/10 text-emerald-300" />
    </div>
  );
}
