"use client";

/**
 * Thao tác trên một dòng Fanpage: gán nick quản trị, gỡ Page khỏi công cụ.
 *
 * Gán nick quản trị chỉ để tra ngược "mất nick nào thì mất Page nào" — công cụ đăng bằng
 * Page token chứ không mượn nick. Nhưng khi nick admin bị khóa thì Page cũng ngừng đăng
 * được, nên phải biết cặp nào đi với cặp nào trước lúc chuyện đó xảy ra.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { assignPageAdmin, disconnectPage } from "@/lib/facebook/facebook-page-actions";

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
        className="min-h-11 w-44 rounded-xl border border-white/[0.1] bg-black/20 px-3 text-base text-white outline-none focus:border-amber-400/50 disabled:opacity-40 sm:text-xs"
        defaultValue={adminAccountId ?? ""}
        disabled={pending || adminOptions.length === 0}
        onChange={(event) => run(() => assignPageAdmin(pageId, event.target.value))}
      >
        <option value="">— no administrator nick —</option>
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
            Remove &quot;{pageName}&quot;?
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(true)}>
          Remove Page
        </button>
      )}

      {result ? (
        <p
          className={
            result.ok
              ? "text-xs text-emerald-300"
              : "text-xs text-red-300"
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
