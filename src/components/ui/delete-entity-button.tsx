"use client";

/**
 * Nút xóa có bước xác nhận, dùng chung cho mọi bản ghi trong kho danh tính.
 *
 * Xác nhận bằng hai lần bấm chứ không bằng `confirm()` của trình duyệt: hộp thoại gốc chặn
 * cả tiến trình và không hiện được lý do dài. Ở đây lần bấm thứ hai đổi hẳn chữ để không ai
 * bấm nhầm theo quán tính.
 *
 * Bản thân việc chặn xóa nằm ở server (xem reference-guard.ts) — nút này chỉ lo phần hỏi lại.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";

export function DeleteEntityButton({
  action,
  label,
  redirectTo,
}: {
  action: () => Promise<ActionResult>;
  /** Tên bản ghi, hiện trong câu hỏi xác nhận. */
  label: string;
  /** Xóa xong thì về đâu. Bỏ trống là ở lại và hiện thông báo. */
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  function remove() {
    startTransition(async () => {
      try {
        const outcome = await action();
        setResult(outcome);
        setArmed(false);
        // Ở lại trang vừa xóa là gặp 404 — chuyển về danh sách khi thành công.
        if (outcome.ok && redirectTo) window.location.href = redirectTo;
      } catch {
        setResult({ ok: false, message: "Could not delete this record. Check the development server log." });
        setArmed(false);
      }
    });
  }

  return (
    <div className="space-y-2">
      {armed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-red-700 dark:text-red-400">Delete {label}? This cannot be undone.</span>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setResult(null);
            setArmed(true);
          }}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete
        </button>
      )}

      {result ? (
        <p
          className={
            result.ok
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
