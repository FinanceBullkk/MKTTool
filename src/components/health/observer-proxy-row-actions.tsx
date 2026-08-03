"use client";

/**
 * Bật/tắt và xóa một proxy quan sát viên.
 *
 * Tắt chứ không xóa là cách nghỉ một proxy: xóa xong mà quên thêm cái mới thì lượt dò tiếp
 * theo dừng ngay từ đầu, và bảng sức khỏe đứng im ở số liệu cũ — trông y như mọi nick đều ổn.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  checkObserverProxy,
  deleteObserverProxy,
  setObserverProxyActive,
} from "@/lib/health/observer-proxy-actions";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function ObserverProxyRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch {
        setResult({ ok: false, message: "Thao tác hỏng. Xem log của dev server." });
      }
    });
  }

  return (
    <div className="space-y-1 text-right">
      <div className="flex flex-wrap justify-end gap-1">
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={pending}
          onClick={() => run(() => checkObserverProxy(id))}
        >
          {pending ? "Đang kiểm…" : "Kiểm"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={pending}
          onClick={() => run(() => setObserverProxyActive(id, !active))}
        >
          {active ? "Tắt" : "Bật"}
        </button>
        <button
          type="button"
          className={`${BUTTON_CLASS} text-red-700 dark:text-red-400`}
          disabled={pending}
          onClick={() => {
            if (confirm("Xóa hẳn proxy quan sát viên này?")) run(() => deleteObserverProxy(id));
          }}
        >
          Xóa
        </button>
      </div>
      {result ? (
        <p
          className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
