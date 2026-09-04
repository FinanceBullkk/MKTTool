"use client";

/**
 * Nút thao tác trên từng dòng hàng đợi: đánh dấu đã đăng, bỏ qua, chạy lại bộ luật.
 *
 * "Kiểm tra lại" tồn tại vì bối cảnh đổi sau lúc xếp lịch — nick tụt karma, nick khác vừa đăng
 * cùng sub, hoặc vừa có job trùng nội dung. Job hết an toàn thì phải đổi sang BỊ CHẶN, không
 * được im lặng để đó rồi tới giờ cứ thế đăng.
 *
 * Phần "Đã đăng" nằm ở mark-posted-control.tsx vì trang Hôm nay cũng cần đúng nút đó.
 * Job đã chốt thì đổi sang nút trả về chờ đăng (revert-to-pending-control.tsx) — trước đây chỗ
 * đó chỉ có dấu "—", nên mọi lần bấm nhầm đều phải sửa bằng Prisma Studio.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import { HealthCheckNowButton } from "@/components/health/health-check-now-button";
import { markJobSkipped, recheckJob } from "@/lib/queue/post-job-status-actions";
import { FacebookPublishButton } from "./facebook-publish-button";
import { MarkPostedControl } from "./mark-posted-control";
import { RevertToPendingControl } from "./revert-to-pending-control";

export function JobRowActions({
  jobId,
  accountId,
  status,
  targetPlatform,
}: {
  jobId: string;
  accountId: string;
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
        setResult({ ok: false, message: "Action failed. Check the development server logs and try again." });
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
              Check again
            </button>
            <button
              type="button"
              className={SMALL_BUTTON_CLASS}
              disabled={pending}
              onClick={() => run(() => markJobSkipped(jobId))}
            >
              Skip
            </button>
          </>
        ) : (
          // Job đã chốt vẫn phải sửa được: bấm "Đã đăng" nhầm job, hoặc dán nhầm link của bài
          // khác, là chuyện đã xảy ra thật — và cái sai đó nuôi thẳng vào bộ luật.
          <RevertToPendingControl jobId={jobId} />
        )}
      </div>

      {targetPlatform === "FACEBOOK_PAGE" && status === "PENDING" ? (
        <FacebookPublishButton jobId={jobId} />
      ) : null}

      {/* Đăng tay xong thì đây là đường ngắn nhất để kho biết: bộ dò đọc profile công khai,
          thấy bài vừa lên và tự gán link vào job này — không phải copy link dán lại.
          Chỉ Reddit, và chỉ khi job còn mở: job đã chốt thì không còn gì để gán. */}
      {targetPlatform === "REDDIT" && open ? (
        <HealthCheckNowButton accountId={accountId} label="Check and attach link" />
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
