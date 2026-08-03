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
  minutesElapsed,
  accountCount,
}: {
  running: boolean;
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
          {pending ? "Đang khởi động…" : `Dò cả đàn (${accountCount} nick)`}
        </button>

        {running ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Đang chạy — bắt đầu {minutesElapsed} phút trước. Tải lại trang để xem bảng đầy dần.
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
        Lượt đầy đủ nghỉ ngẫu nhiên 30-90 giây giữa các nick nên mất gần mười phút — chủ ý, vì
        tám lượt xem profile bắn ra trong ba giây từ một IP là hành vi của máy, và chính bộ dò
        sẽ bị chặn trước tiên. Chạy nền ở tiến trình riêng, đóng tab không ảnh hưởng.
      </p>
    </div>
  );
}
