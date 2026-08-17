"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";

/** Emergency server-side revocation for a lost or unreachable PC. */
export function RelayDeviceRevokeButton({
  action,
  deviceName,
}: {
  action: () => Promise<ActionResult>;
  deviceName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  function revoke() {
    startTransition(async () => {
      try {
        setResult(await action());
      } catch {
        setResult({ ok: false, message: "Emergency revocation failed. Check the server log." });
      }
      setArmed(false);
    });
  }

  if (armed) {
    return (
      <div className="space-y-2 text-right">
        <p className="text-xs text-red-700 dark:text-red-400">
          Emergency-revoke &quot;{deviceName}&quot;? Use this only when the PC is lost or unreachable.
          Server access stops immediately and account assignments are cleared, but local Relay or
          Browser data is not remotely erased. Rotate the operator key if exposure is plausible.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={revoke}
            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Revoking..." : "Emergency revoke"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          setArmed(true);
        }}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Emergency revoke
      </button>

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
