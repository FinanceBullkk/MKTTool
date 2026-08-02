"use client";

/**
 * Nút thao tác trên từng dòng hàng đợi: đánh dấu đã đăng, bỏ qua, chạy lại bộ luật.
 *
 * "Kiểm tra lại" tồn tại vì bối cảnh đổi sau lúc xếp lịch — nick tụt karma, nick khác vừa đăng
 * cùng sub, hoặc vừa có job trùng nội dung. Job hết an toàn thì phải đổi sang BỊ CHẶN, không
 * được im lặng để đó rồi tới giờ cứ thế đăng.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { markJobPosted, markJobSkipped, recheckJob } from "@/lib/queue/post-job-status-actions";
import { FacebookPublishButton } from "./facebook-publish-button";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

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
  const [postedUrl, setPostedUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

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
      <div className="flex flex-wrap items-center gap-1">
        {open ? (
          <>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={pending}
              onClick={() => setShowUrlInput((visible) => !visible)}
            >
              Đã đăng
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
              disabled={pending}
              onClick={() => run(() => recheckJob(jobId))}
            >
              Kiểm tra lại
            </button>
            <button
              type="button"
              className={BUTTON_CLASS}
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

      {showUrlInput && open ? (
        <div className="flex flex-wrap items-center gap-1">
          <input
            className="w-56 rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="Dán link bài vừa đăng"
            value={postedUrl}
            onChange={(event) => setPostedUrl(event.target.value)}
          />
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={pending || postedUrl.trim() === ""}
            onClick={() => run(() => markJobPosted(jobId, postedUrl))}
          >
            Lưu
          </button>
        </div>
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
