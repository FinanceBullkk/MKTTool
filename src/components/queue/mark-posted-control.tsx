"use client";

/**
 * Nút "Đã đăng" kèm ô dán link — dùng chung cho hàng đợi và thẻ nhắc việc ở trang Hôm nay.
 *
 * Tách ra khỏi job-row-actions.tsx vì đây là bước dễ quên nhất của cả quy trình: đăng xong mà
 * không bấm thì bộ luật không thấy bài đó — luật chặn đụng độ thread không có gì để so, tỷ lệ
 * promo đếm thiếu. Bắt người dùng đổi trang chỉ để bấm một nút là tự tạo chỗ để quên, nên nút
 * này phải có mặt ngay nơi họ vừa đăng xong.
 *
 * Một component cho cả hai chỗ, không nhân bản: cùng `markJobPosted`, cùng cách báo lỗi.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import { markJobPosted } from "@/lib/queue/post-job-status-actions";

export function MarkPostedControl({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [postedUrl, setPostedUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  function save() {
    startTransition(async () => {
      try {
        const outcome = await markJobPosted(jobId, postedUrl);
        setResult(outcome);
        // Ghi xong thì thu ô nhập lại, để dòng job không còn mời bấm thêm lần nữa.
        if (outcome.ok) setShowUrlInput(false);
      } catch {
        // Không có nhánh này thì lỗi phía server thành promise reject không ai bắt,
        // và màn hình đứng im như thể chưa bấm gì.
        setResult({ ok: false, message: "Action failed. Check the development server logs and try again." });
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={SMALL_BUTTON_CLASS}
        disabled={pending}
        onClick={() => setShowUrlInput((visible) => !visible)}
      >
        Posted
      </button>

      {showUrlInput ? (
        <div className="flex flex-wrap items-center gap-1">
          <input
            className="min-h-11 w-full max-w-sm rounded-xl border border-white/[0.1] bg-black/20 px-3 text-base text-white outline-none placeholder:text-neutral-600 focus:border-amber-400/50 sm:text-xs"
            placeholder="Paste the URL of the post you just published"
            value={postedUrl}
            onChange={(event) => setPostedUrl(event.target.value)}
          />
          <button
            type="button"
            className={SMALL_BUTTON_CLASS}
            disabled={pending || postedUrl.trim() === ""}
            onClick={save}
          >
            Save
          </button>
        </div>
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
