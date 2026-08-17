"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  finalizeRelayDeviceRetirement,
  pingRelay,
  relaySupportsDeviceRetirement,
  retireRelayDevice,
} from "@/lib/relay/relay-browser-client";
import {
  beginRelayDeviceRetirement,
  completeRelayDeviceRetirement,
} from "@/lib/retirement/relay-device-retirement-actions";

export function RelayDeviceRetirementButton({
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

  function retire() {
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
            message:
              "This browser is not on the selected PC. Device retirement must run on the exact PC whose Relay identity will be removed.",
          });
          return;
        }
        if (!relaySupportsDeviceRetirement(local.relayVersion)) {
          setResult({
            ok: false,
            message:
              "Update MKTTool Relay to version 11 or later before retiring this PC. Server access was not changed.",
          });
          return;
        }

        const beginForm = new FormData();
        beginForm.set("deviceId", deviceId);
        const begun = await beginRelayDeviceRetirement(null, beginForm);
        const retirementId = "retirementId" in begun ? begun.retirementId : undefined;
        if (!begun.ok || !retirementId) {
          setResult(begun);
          return;
        }

        if ("state" in begun && begun.state === "completed") {
          const finalizationAuthorization =
            "finalizationAuthorization" in begun ? begun.finalizationAuthorization : undefined;
          if (!finalizationAuthorization) {
            setResult({ ok: false, message: "The server did not return a retirement finalization authorization." });
            return;
          }
          const finalized = await finalizeRelayDeviceRetirement(finalizationAuthorization);
          setResult(
            finalized.status === "ok"
              ? { ok: true, message: finalized.data.message }
              : { ok: false, message: describeRelayFailure(finalized) },
          );
          return;
        }

        const authorization = "authorization" in begun ? begun.authorization : undefined;
        if (!authorization) {
          setResult({ ok: false, message: "The server did not return a local retirement authorization." });
          return;
        }
        const retired = await retireRelayDevice(authorization);
        if (
          retired.status !== "ok" ||
          !retired.data.retirementId ||
          !retired.data.proof ||
          !retired.data.cleanupComplete
        ) {
          setResult({
            ok: false,
            message:
              retired.status === "ok"
                ? "Relay removed incomplete state. Retry retirement to recover its protected receipt."
                : describeRelayFailure(retired),
          });
          return;
        }

        const completion = new FormData();
        completion.set("deviceId", deviceId);
        completion.set("retirementId", retired.data.retirementId);
        completion.set("proof", retired.data.proof);
        const completed = await completeRelayDeviceRetirement(null, completion);
        if (!completed.ok) {
          setResult(completed);
          return;
        }

        const refreshed = await beginRelayDeviceRetirement(null, beginForm);
        const finalizationAuthorization =
          "finalizationAuthorization" in refreshed ? refreshed.finalizationAuthorization : undefined;
        if (!refreshed.ok || !finalizationAuthorization) {
          setResult({
            ok: false,
            message: `${completed.message} Retry this action to remove the protected local receipt.`,
          });
          return;
        }
        const finalized = await finalizeRelayDeviceRetirement(finalizationAuthorization);
        setResult(
          finalized.status === "ok"
            ? { ok: true, message: completed.message }
            : {
                ok: false,
                message:
                  `${completed.message} The local receipt remains protected; retry this action to finish: ` +
                  describeRelayFailure(finalized),
              },
        );
      } catch {
        setResult({
          ok: false,
          message: "Device retirement did not finish. Retry on the same PC; completed steps are idempotent.",
        });
      } finally {
        setArmed(false);
        setConfirmation("");
      }
    });
  }

  if (armed) {
    return (
      <div className="space-y-2 rounded-md border border-red-300 p-3 text-left dark:border-red-900">
        <p className="text-xs text-red-700 dark:text-red-400">
          This revokes the server record first, unpins its accounts, and removes Relay credentials
          from this PC. It does not delete MKT Browser profiles or MultiZen data. Type the exact PC
          name to continue: <strong>{deviceName}</strong>
        </p>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={pending}
          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          aria-label={`Type ${deviceName} to confirm Relay retirement`}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={pending || confirmation !== deviceName}
            onClick={retire}
            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Retiring..." : "Retire this PC"}
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

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          setArmed(true);
        }}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Retire this PC
      </button>
      {result ? (
        <p className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
