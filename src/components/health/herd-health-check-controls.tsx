"use client";

/**
 * Nút "Dò cả đàn" + trạng thái lượt đang chạy.
 *
 * Không hiện thanh tiến độ vì không có kênh nào truyền tiến độ về: tiến trình dò chạy tách
 * rời và ghi thẳng vào database. Đổi lại, bảng sức khỏe ngay dưới đây tự đầy dần mỗi lần tải
 * lại trang — đó mới là thứ người dùng thật sự muốn nhìn.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
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
          className={BUTTON_CLASS}
          disabled={pending || running || accountCount === 0}
          onClick={() => startTransition(async () => setResult(await startHerdHealthCheck()))}
        >
          {pending ? "Starting..." : `Check all nicks (${accountCount} nick)`}
        </button>

        {running ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Running on host {host}; started {minutesElapsed} minutes ago. Reload the page to watch
            the table fill in.
          </span>
        ) : null}
      </div>

      {result ? (
        <p
          className={
            result.ok
              ? "text-xs text-emerald-700 dark:text-emerald-400"
              : "text-xs text-red-700 dark:text-red-400"
          }
        >
          {result.message}
        </p>
      ) : null}

      <p className="text-xs text-neutral-500">
        A full run waits a random 30-90 seconds between nicks, so it takes almost ten minutes. This
        prevents a burst of profile views from one IP from looking automated and getting the
        observer proxy blocked. The run continues in a separate process if this tab closes.
      </p>
    </div>
  );
}
