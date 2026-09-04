"use client";

/**
 * Nút "Dò cả đàn" + trạng thái lượt đang chạy.
 *
 * Không hiện thanh tiến độ vì không có kênh nào truyền tiến độ về: tiến trình dò chạy tách
 * rời và ghi thẳng vào database. Đổi lại, bảng sức khỏe ngay dưới đây tự đầy dần mỗi lần tải
 * lại trang — đó mới là thứ người dùng thật sự muốn nhìn.
 */
import { useState, useTransition } from "react";
import { LoaderCircle, Play, Timer } from "lucide-react";
import { Disclosure, PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { startHerdHealthCheck } from "@/lib/health/health-check-run-actions";

export function HerdHealthCheckControls({
  running,
  host,
  minutesElapsed,
  accountCount,
}: {
  running: boolean;
  /**
   * Máy đang giữ khóa.
   *
   * Từ lúc khóa nằm trong database thay vì trong file, "đang chạy" có thể là cron trên máy chủ,
   * là người khác vừa bấm nút, hoặc là chính terminal của mình. Ba tình huống đó dẫn tới ba
   * việc phải làm khác nhau — nên câu trả lời thiếu tên máy là câu trả lời chưa xong.
   */
  host: string | null;
  minutesElapsed: number | null;
  accountCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          disabled={pending || running || accountCount === 0}
          onClick={() => startTransition(async () => setResult(await startHerdHealthCheck()))}
        >
          {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
          {pending ? "Starting..." : `Check all nicks (${accountCount} nick)`}
        </button>

        {running ? (
          <span className="inline-flex items-center gap-2 text-xs text-amber-300">
            <LoaderCircle size={14} className="animate-spin" /> Running on {host} · {minutesElapsed} min
          </span>
        ) : null}
      </div>

      {result ? (
        <p
          role="status"
          className={
            result.ok
              ? "text-xs text-emerald-700 dark:text-emerald-400"
              : "text-xs text-red-700 dark:text-red-400"
          }
        >
          {result.message}
        </p>
      ) : null}

      <Disclosure summary="Run timing" icon={Timer}>
        <p className="text-xs leading-5">
          A full run waits 30-90 seconds between nicks and continues if this tab closes. Reload to
          see new rows as they arrive.
        </p>
      </Disclosure>
    </div>
  );
}
