"use client";

/**
 * Nút đăng thẳng lên Fanpage bằng Graph API — chỉ hiện với job có đích FACEBOOK_PAGE.
 *
 * Reddit và Facebook Group không có nút này và sẽ không có: Reddit phải đi qua trình duyệt
 * antidetect (Phase 05), Group thì Meta đã gỡ quyền tự đăng từ 04/2024.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { publishJobToPage } from "@/lib/facebook/facebook-publish-action";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function FacebookPublishButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [expanded, setExpanded] = useState(false);

  function publish() {
    startTransition(async () => setResult(await publishJobToPage(jobId, imageUrl.trim() || undefined)));
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`${BUTTON_CLASS} font-medium`}
          disabled={pending}
          onClick={publish}
        >
          {pending ? "Đang đăng…" : "Đăng lên Page"}
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={() => setExpanded((open) => !open)}>
          + ảnh
        </button>
      </div>

      {expanded ? (
        <input
          className="w-56 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
          placeholder="Link ảnh (bỏ trống = đăng text)"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
      ) : null}

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
