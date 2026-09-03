"use client";

/**
 * Nút đo băng thông một proxy.
 *
 * Nhãn nút ghi thẳng "1 MB" chứ không phải chỉ "Đo tốc độ": lượt bấm này tiêu quota trả tiền
 * của proxy, nên cái giá phải nằm ngay trên nút, không nằm trong một dòng chú thích ở đâu đó
 * mà người dùng đọc một lần rồi quên.
 *
 * Không có bản "đo cả kho" — xem `proxy-bandwidth-actions.ts`.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { measureOneProxySpeed } from "@/lib/proxies/proxy-bandwidth-actions";

export function MeasureProxySpeedButton({ proxyId }: { proxyId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={pending}
        title="Download a 1 MB test file through this exact proxy to measure download speed. This uses 1 MB of the proxy quota."
        onClick={() => startTransition(async () => setResult(await measureOneProxySpeed(proxyId)))}
      >
        {pending ? "Measuring..." : "Measure speed (1 MB)"}
      </button>
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
    </div>
  );
}
