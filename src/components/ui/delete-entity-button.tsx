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
import { ShieldAlert, Trash2, X } from "lucide-react";
import type { ActionResult } from "@/lib/actions/action-result";
import { DANGER_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui/page-section";

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
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3">
          <span className="flex items-center gap-2 text-sm font-medium text-red-200">
            <ShieldAlert size={16} aria-hidden="true" />
            Delete {label}? This cannot be undone.
          </span>
          <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className={DANGER_BUTTON_CLASS}
          >
            <Trash2 size={15} aria-hidden="true" />
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className={SECONDARY_BUTTON_CLASS}
          >
            <X size={15} aria-hidden="true" />
            Cancel
          </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setResult(null);
            setArmed(true);
          }}
          className={DANGER_BUTTON_CLASS}
        >
          <Trash2 size={15} aria-hidden="true" />
          Delete
        </button>
      )}

      {result ? (
        <p
          className={
            result.ok
              ? "text-sm text-emerald-300"
              : "text-sm text-red-300"
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
