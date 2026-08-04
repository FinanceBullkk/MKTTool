"use client";

/**
 * Nút trả job đã chốt về "Chờ đăng".
 *
 * Trước đây job ĐÃ ĐĂNG / BỎ QUA / LỖI chỉ hiện một dấu "—": bấm nhầm "Đã đăng" hay dán nhầm
 * link là hết đường sửa trên giao diện, phải mở Prisma Studio. Sổ sách sai để nguyên thì bộ
 * luật đếm sai, nên phải có lối gỡ ngay tại dòng job.
 *
 * Hỏi lại bằng hai lần bấm như delete-entity-button.tsx: lần bấm thứ hai đổi hẳn chữ, và câu
 * hỏi nói rõ điều kiện — chỉ trả về khi bài CHƯA thật sự lên. Trả về một bài đã lên thật là
 * mời chính mình đăng nó lần thứ hai.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import { revertJobToPending } from "@/lib/queue/post-job-status-actions";

export function RevertToPendingControl({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  function revert() {
    startTransition(async () => {
      try {
        setResult(await revertJobToPending(jobId));
      } catch {
        // Không có nhánh này thì lỗi phía server thành promise reject không ai bắt,
        // và dòng job đứng im như thể chưa bấm gì.
        setResult({ ok: false, message: "Thao tác hỏng. Xem log của dev server." });
      }
      setArmed(false);
    });
  }

  return (
    <div className="space-y-1">
      {armed ? (
        <div className="space-y-1">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Chỉ trả về khi bài CHƯA thật sự lên. Link và dấu vết đụng thread sẽ bị xóa.
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={SMALL_BUTTON_CLASS} disabled={pending} onClick={revert}>
              {pending ? "Đang trả…" : "Trả về thật"}
            </button>
            <button
              type="button"
              className={SMALL_BUTTON_CLASS}
              disabled={pending}
              onClick={() => setArmed(false)}
            >
              Thôi
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={SMALL_BUTTON_CLASS}
          disabled={pending}
          onClick={() => {
            setResult(null);
            setArmed(true);
          }}
        >
          Trả về chờ đăng
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
