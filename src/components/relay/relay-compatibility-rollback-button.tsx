"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  pingRelay,
  rollbackRelayCompatibility,
} from "@/lib/relay/relay-browser-client";
import { issueCompatibilityRollbackAuthorization } from "@/lib/release/compatibility-rollback-actions";

export function RelayCompatibilityRollbackButton({
  deviceId,
  deviceName,
  devicePublicKey,
}: {
  deviceId: string;
  deviceName: string;
  devicePublicKey: string;
}) {
  const [armed, setArmed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function rollback() {
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
            message: "Compatibility rollback must run from the exact PC selected in this row.",
          });
          return;
        }

        const update = local.compatibilityUpdate;
        if (
          !update?.rollbackAvailable ||
          update.currentSequence === null ||
          update.retainedSequence === null
        ) {
          setResult({
            ok: false,
            message:
              "This PC has no eligible retained compatibility set. Finish the current transition or use installer repair.",
          });
          return;
        }

        const authorizationForm = new FormData();
        authorizationForm.set("deviceId", deviceId);
        authorizationForm.set("currentSequence", String(update.currentSequence));
        authorizationForm.set("retainedSequence", String(update.retainedSequence));
        const issued = await issueCompatibilityRollbackAuthorization(null, authorizationForm);
        const authorization = "authorization" in issued ? issued.authorization : undefined;
        if (!issued.ok || !authorization) {
          setResult(issued);
          return;
        }

        const started = await rollbackRelayCompatibility(authorization);
        setResult(
          started.status === "ok"
            ? {
                ok: true,
                message:
                  `Rollback from sequence ${update.currentSequence} to ${update.retainedSequence} started. ` +
                  "Relay and MKT Browser will restart after the protected smoke check.",
              }
            : { ok: false, message: describeRelayFailure(started) },
        );
      } catch {
        setResult({
          ok: false,
          message: "Compatibility rollback did not start. Recheck this PC and retry.",
        });
      } finally {
        setArmed(false);
        setConfirmation("");
      }
    });
  }

  if (!armed) {
    return (
      <div className="space-y-2 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setResult(null);
            setArmed(true);
          }}
          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          Roll back compatibility set
        </button>
        {result ? (
          <p className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
            {result.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-300 p-3 text-left dark:border-amber-900">
      <p className="text-xs text-amber-800 dark:text-amber-400">
        This uses the one retained signed set, never crosses the protected rollback floor, and stops
        before changing anything if a profile is open. Type the exact PC name: <strong>{deviceName}</strong>
      </p>
      <input
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={pending}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
        aria-label={`Type ${deviceName} to confirm compatibility rollback`}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pending || confirmation !== deviceName}
          onClick={rollback}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Starting rollback..." : "Confirm rollback"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setArmed(false);
            setConfirmation("");
          }}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
