"use client";

/**
 * Thao tác trên một dòng Fanpage: gán nick quản trị, gỡ Page khỏi công cụ.
 *
 * Gán nick quản trị chỉ để tra ngược "mất nick nào thì mất Page nào" — công cụ đăng bằng
 * Page token chứ không mượn nick. Nhưng khi nick admin bị khóa thì Page cũng ngừng đăng
 * được, nên phải biết cặp nào đi với cặp nào trước lúc chuyện đó xảy ra.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { assignPageAdmin, disconnectPage } from "@/lib/facebook/facebook-page-actions";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export interface AdminOption {
  id: string;
  username: string;
}

export function FacebookPageRowActions({
  pageId,
  pageName,
  adminAccountId,
  adminOptions,
}: {
  pageId: string;
  pageName: string;
  adminAccountId: string | null;
  adminOptions: AdminOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => setResult(await action()));
  }

  return (
    <div className="space-y-1">
      <select
        className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        defaultValue={adminAccountId ?? ""}
        disabled={pending || adminOptions.length === 0}
        onChange={(event) => run(() => assignPageAdmin(pageId, event.target.value))}
      >
        <option value="">— chưa gán nick —</option>
        {adminOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.username}
          </option>
        ))}
      </select>

      {confirming ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={() => run(() => disconnectPage(pageId))}
          >
            Gỡ &quot;{pageName}&quot;?
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(false)}>
            Thôi
          </button>
        </div>
      ) : (
        <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(true)}>
          Gỡ Page
        </button>
      )}

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
