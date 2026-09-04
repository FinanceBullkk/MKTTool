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

export function CheckAllProxiesButton({
  count,
  compact = false,
}: {
  count: number;
  compact?: boolean;
}) {
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
        {pending ? `Checking ${count} proxies...` : `Check all ${count} proxies`}
      </button>
      <ResultText result={result} />
      {!compact ? (
        <p className="text-xs text-neutral-500">
          Each check requests the public IP through that exact proxy. It detects both an unreachable
          proxy and a proxy that responds without changing the IP.
        </p>
      ) : null}
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
        {pending ? "Checking..." : "Check"}
      </button>
      <ResultText result={result} />
    </div>
  );
}
