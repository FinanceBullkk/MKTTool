"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { DANGER_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui/page-section";

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
      <div className="space-y-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3 text-left">
        <p className="text-xs leading-5 text-red-200">
          Emergency-revoke &quot;{deviceName}&quot;? Use this only when the PC is lost or unreachable.
          Server access stops immediately and account assignments are cleared, but local Relay or
          Browser data is not remotely erased. Rotate the operator key if exposure is plausible.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={revoke}
            className={DANGER_BUTTON_CLASS}
          >
            {pending ? "Revoking..." : "Emergency revoke"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setArmed(false)}
            className={SECONDARY_BUTTON_CLASS}
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
        className={DANGER_BUTTON_CLASS}
      >
        Emergency revoke
      </button>

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
