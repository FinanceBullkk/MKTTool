"use client";

import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  finalizeRelayDeviceRetirement,
  pingRelay,
} from "@/lib/relay/relay-browser-client";
import { issueRelayDeviceRetirementFinalization } from "@/lib/retirement/relay-device-retirement-actions";

export function RelayDeviceRetirementReceiptButton({
  deviceId,
  devicePublicKey,
  retirementId,
}: {
  deviceId: string;
  devicePublicKey: string;
  retirementId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function finishLocalReceipt() {
    const ping = pingRelay();
    startTransition(async () => {
      setResult(null);
      try {
        const health = await ping;
        const local = health.status === "ok" || health.status === "rejected" ? health.data : undefined;
        if (!local) {
          setResult({
            ok: false,
            message:
              "Server cleanup is confirmed, but no running Relay was found on this PC. Start Relay here only if setup reports a pending retirement receipt.",
          });
          return;
        }
        if (local.deviceId !== deviceId || local.publicKey !== devicePublicKey) {
          setResult({
            ok: false,
            message: "The running Relay belongs to a different PC record. No local state was changed.",
          });
          return;
        }
        if (!local.retirementPending) {
          setResult({ ok: true, message: "No protected retirement receipt remains on this PC." });
          return;
        }

        const form = new FormData();
        form.set("deviceId", deviceId);
        const issued = await issueRelayDeviceRetirementFinalization(null, form);
        const authorization =
          "finalizationAuthorization" in issued ? issued.finalizationAuthorization : undefined;
        const issuedRetirementId = "retirementId" in issued ? issued.retirementId : undefined;
        if (!issued.ok || !authorization || issuedRetirementId !== retirementId) {
          setResult(issued.ok ? { ok: false, message: "Server finalization state does not match this PC." } : issued);
          return;
        }
        const finalized = await finalizeRelayDeviceRetirement(authorization);
        setResult(
          finalized.status === "ok"
            ? { ok: true, message: finalized.data.message }
            : { ok: false, message: describeRelayFailure(finalized, health) },
        );
      } catch {
        setResult({
          ok: false,
          message: "Local retirement receipt check did not finish. Retry on this same PC.",
        });
      }
    });
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={finishLocalReceipt}
        className={SMALL_BUTTON_CLASS}
      >
        {pending ? "Checking this PC..." : "Check local receipt"}
      </button>
      {result ? (
        <p className={result.ok ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
