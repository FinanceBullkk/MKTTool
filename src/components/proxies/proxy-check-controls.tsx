"use client";

/**
 * Nút kiểm proxy còn sống — một proxy hoặc cả kho.
 *
 * Previously this check lived entirely outside the tool: `launch/route.ts` only suggested opening
 * ipinfo.io to verify the IP and left the operator to do it manually. A dead proxy therefore showed
 * up only in the MKT Browser interface, or worse, nowhere at all.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkEveryProxy, checkOneProxy } from "@/lib/proxies/proxy-check-actions";

function ResultText({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={
        result.ok
          ? "text-xs text-emerald-700 dark:text-emerald-400"
          : "text-xs text-red-700 dark:text-red-400"
      }
    >
      {result.message}
    </p>
  );
}

export function CheckAllProxiesButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={pending || count === 0}
        onClick={() => startTransition(async () => setResult(await checkEveryProxy()))}
      >
        {pending ? `Đang kiểm ${count} proxy…` : `Kiểm tất cả ${count} proxy`}
      </button>
      <ResultText result={result} />
      <p className="text-xs text-neutral-500">
        Mỗi lượt đi qua đúng proxy đó hỏi ipinfo.io xem người ngoài nhìn thấy IP nào — nên nó
        phát hiện được cả proxy đã chết lẫn proxy còn sống mà không đổi IP.
      </p>
    </div>
  );
}

export function CheckOneProxyButton({ proxyId }: { proxyId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await checkOneProxy(proxyId)))}
      >
        {pending ? "Đang kiểm…" : "Kiểm"}
      </button>
      <ResultText result={result} />
    </div>
  );
}
