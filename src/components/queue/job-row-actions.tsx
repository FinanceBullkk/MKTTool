"use client";

/**
 * Nút thao tác trên từng dòng hàng đợi: đánh dấu đã đăng, bỏ qua, chạy lại bộ luật.
 *
 * "Kiểm tra lại" tồn tại vì bối cảnh đổi sau lúc xếp lịch — nick tụt karma, nick khác vừa đăng
 * cùng sub, hoặc vừa có job trùng nội dung. Job hết an toàn thì phải đổi sang BỊ CHẶN, không
 * được im lặng để đó rồi tới giờ cứ thế đăng.
 *
 * Phần "Đã đăng" nằm ở mark-posted-control.tsx vì trang Hôm nay cũng cần đúng nút đó.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import { markJobSkipped, recheckJob } from "@/lib/queue/post-job-status-actions";
import { FacebookPublishButton } from "./facebook-publish-button";
import { MarkPostedControl } from "./mark-posted-control";

export function JobRowActions({
  jobId,
  status,
  targetPlatform,
}: {
  jobId: string;
  status: string;
  targetPlatform: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch {
        // Không có nhánh này thì lỗi phía server thành promise reject không ai bắt,
        // và dòng job đứng im như thể chưa bấm gì.
        setResult({ ok: false, message: "Thao tác hỏng. Xem log của dev server." });
      }
    });
  }

  const open = status === "PENDING" || status === "BLOCKED";

  return (
    <div className="space-y-1">
      {/* items-start: ô dán link mở ra thì rơi xuống dưới nút "Đã đăng", hai nút kia đứng yên. */}
      <div className="flex flex-wrap items-start gap-1">
        {open ? (
          <>
            <MarkPostedControl jobId={jobId} />
            <button
              type="button"
              className={SMALL_BUTTON_CLASS}
              disabled={pending}
              onClick={() => run(() => recheckJob(jobId))}
            >
              Kiểm tra lại
            </button>
            <button
              type="button"
              className={SMALL_BUTTON_CLASS}
              disabled={pending}
              onClick={() => run(() => markJobSkipped(jobId))}
            >
              Bỏ qua
            </button>
          </>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        )}
      </div>

      {targetPlatform === "FACEBOOK_PAGE" && status === "PENDING" ? (
        <FacebookPublishButton jobId={jobId} />
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
