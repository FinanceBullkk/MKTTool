"use client";

/**
 * Nút đăng thẳng lên Fanpage bằng Graph API — chỉ hiện với job có đích FACEBOOK_PAGE.
 *
 * Reddit và Facebook Group không có nút này và sẽ không có: Reddit phải đi qua trình duyệt
 * antidetect (Phase 05), Group thì Meta đã gỡ quyền tự đăng từ 04/2024.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { publishJobToPage } from "@/lib/facebook/facebook-publish-action";

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
          {pending ? "Publishing..." : "Publish to Page"}
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={() => setExpanded((open) => !open)}>
          + Image
        </button>
      </div>

      {expanded ? (
        <input
          className="min-h-11 w-full max-w-sm rounded-xl border border-white/[0.1] bg-black/20 px-3 text-base text-white outline-none placeholder:text-neutral-600 focus:border-amber-400/50 sm:text-xs"
          placeholder="Image URL (leave blank = post text)"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
      ) : null}

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
