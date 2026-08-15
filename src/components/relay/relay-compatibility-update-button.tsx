"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  pingRelay,
  updateRelayCompatibility,
} from "@/lib/relay/relay-browser-client";
import { issueCompatibilityUpdateTicket } from "@/lib/release/compatibility-update-actions";

export function RelayCompatibilityUpdateButton({
  deviceId,
  devicePublicKey,
}: {
  deviceId: string;
  devicePublicKey: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function update() {
    const ping = pingRelay();
    startTransition(async () => {
      setResult(null);
      try {
        const health = await ping;
        const local = health.status === "ok" || health.status === "rejected" ? health.data : undefined;
        if (!local) {
          setResult({ ok: false, message: describeRelayFailure(health) });
          return;
        }
        if (local.deviceId !== deviceId || local.publicKey !== devicePublicKey) {
          setResult({
            ok: false,
            message: "Compatibility update must run from the exact PC selected in this row.",
          });
          return;
        }
        if (local.compatibilityUpdate?.pending) {
          setResult({
            ok: false,
            message: "This PC already has a compatibility transition pending. Let Relay converge it first.",
          });
          return;
        }

        const repairMissingState = local.compatibilityUpdate?.initialized !== true;
        const form = new FormData();
        form.set("deviceId", deviceId);
        form.set("repairMissingState", String(repairMissingState));
        const issued = await issueCompatibilityUpdateTicket(null, form);
        const ticket = "ticket" in issued ? issued.ticket : undefined;
        const targetSequence = "targetSequence" in issued ? issued.targetSequence : undefined;
        if (!issued.ok || !ticket) {
          setResult(issued);
          return;
        }

        const started = await updateRelayCompatibility(ticket);
        setResult(
          started.status === "ok"
            ? {
                ok: true,
                message:
                  `Compatibility sequence ${started.data.targetSequence ?? targetSequence} is staged. ` +
                  "Relay and MKT Browser will restart after activation and the protected smoke check.",
              }
            : { ok: false, message: describeRelayFailure(started) },
        );
      } catch {
        setResult({
          ok: false,
          message: "Compatibility update did not start. Recheck this PC and retry.",
        });
      }
    });
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={update}
        className="rounded-md border border-sky-300 px-3 py-1.5 text-xs text-sky-800 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-900 dark:text-sky-400 dark:hover:bg-sky-950"
      >
        {pending ? "Preparing compatibility set..." : "Update / repair compatibility set"}
      </button>
      {result ? (
        <p className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
