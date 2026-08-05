"use client";

/**
 * Nút thu hồi một chiếc máy, có bước hỏi lại.
 *
 * ## Vì sao không dùng lại `DeleteEntityButton`
 *
 * Hình dạng giống hệt — hai lần bấm, một câu hỏi lại — nhưng **câu hỏi lại mới là nội dung của
 * component này**, và câu của nút xóa nói sai chuyện ở đây theo cả hai chiều:
 *
 * - *"Không hoàn tác được"* — đúng, nhưng ở đây nó quan trọng theo kiểu khác: thu hồi nhầm thì
 *   không bật lại được, phải cài lại cầu nối trên máy đó để sinh cặp khóa mới.
 * - Nút xóa không nói được vế ngược lại, vế mà người bấm dễ hiểu sai nhất: thu hồi **không**
 *   với tới được thứ chiếc máy đó đã lấy về từ trước. Ai bấm xong mà tưởng đã an toàn thì sẽ
 *   không xoay `VAULT_KEY_OPERATOR` — và đó chính là việc còn lại phải làm.
 *
 * Gộp hai nút làm một là ép câu hỏi lại thành câu chung chung cho cả hai, tức bỏ mất đúng thứ
 * cần nói ra ở lần bấm cuối cùng.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";

export function RelayDeviceRevokeButton({
  action,
  deviceName,
}: {
  action: () => Promise<ActionResult>;
  deviceName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  function revoke() {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch {
        setResult({ ok: false, message: "Không thu hồi được. Xem log của dev server." });
      }
      setArmed(false);
    });
  }

  if (armed) {
    return (
      <div className="space-y-2 text-right">
        <p className="text-xs text-red-700 dark:text-red-400">
          Thu hồi máy &quot;{deviceName}&quot;? Máy này sẽ không nhận được vé mới. Bật lại không
          được — muốn dùng lại phải cài lại cầu nối để sinh cặp khóa mới.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={revoke}
            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Đang thu hồi…" : "Thu hồi thật"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Thôi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          setArmed(true);
        }}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Thu hồi
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
