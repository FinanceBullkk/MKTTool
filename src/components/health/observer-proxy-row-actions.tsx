"use client";

/**
 * Bật/tắt và xóa một proxy quan sát viên.
 *
 * Tắt chứ không xóa là cách nghỉ một proxy: xóa xong mà quên thêm cái mới thì lượt dò tiếp
 * theo dừng ngay từ đầu, và bảng sức khỏe đứng im ở số liệu cũ — trông y như mọi nick đều ổn.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  checkObserverProxy,
  deleteObserverProxy,
  setObserverProxyActive,
} from "@/lib/health/observer-proxy-actions";

export function ObserverProxyRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch {
        setResult({
          ok: false,
          message: "The action failed. Review the development server log and try again.",
        });
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
          {pending ? "Checking..." : "Check"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={pending}
          onClick={() => run(() => setObserverProxyActive(id, !active))}
        >
          {active ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          className={`${BUTTON_CLASS} border-red-400/20 text-red-300 hover:border-red-400/35 hover:bg-red-400/[0.08] hover:text-red-200`}
          disabled={pending}
          onClick={() => {
            if (confirm("Permanently delete this observer proxy?")) {
              run(() => deleteObserverProxy(id));
            }
          }}
        >
          Delete
        </button>
      </div>
      {result ? (
        <p
          className={`text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
