"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  finalizeRelayDeviceRetirement,
  pingRelay,
} from "@/lib/relay/relay-browser-client";
import { issueRelayDeviceRetirementFinalization } from "@/lib/retirement/relay-device-retirement-actions";
import { useLocalRelayPing } from "@/components/relay/relay-local-identity-provider";
import { relayDeviceLocality } from "@/lib/relay/relay-device-locality";

export function RelayDeviceRetirementReceiptButton({
  deviceId,
  deviceName,
  devicePublicKey,
  retirementId,
}: {
  deviceId: string;
  deviceName: string;
  devicePublicKey: string;
  retirementId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [finalized, setFinalized] = useState(false);
  // The receipt lives on that PC, so this action is meaningful only from the same machine.
  const locality = relayDeviceLocality(useLocalRelayPing(), {
    deviceId,
    publicKey: devicePublicKey,
    deviceName,
  });

  function finishLocalReceipt() {
    const ping = pingRelay();
    startTransition(async () => {
      setResult(null);
      setFinalized(false);
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
        const finalization = await finalizeRelayDeviceRetirement(authorization);
        setFinalized(finalization.status === "ok");
        setResult(
          finalization.status === "ok"
            ? { ok: true, message: finalization.data.message }
            : { ok: false, message: describeRelayFailure(finalization, health) },
        );
      } catch {
        setResult({
          ok: false,
          message: "Local retirement receipt check did not finish. Retry on this same PC.",
        });
      }
    });
  }

  if (locality.state === "elsewhere") {
    return (
      <p className="text-xs leading-5 text-neutral-500">
        The cleanup receipt is stored on {deviceName}. Check it from that PC.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending || locality.state === "checking"}
        onClick={finishLocalReceipt}
        className={SMALL_BUTTON_CLASS}
      >
        {pending || locality.state === "checking" ? "Checking this PC..." : "Check local receipt"}
      </button>
      {locality.state === "unverified" ? (
        <p className="text-xs leading-5 text-neutral-500">{locality.note}</p>
      ) : null}
      {result ? (
        <p className={result.ok ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
          {result.message}
        </p>
      ) : null}
      {finalized ? (
        <p className="text-xs leading-5 text-neutral-400">
          To use this PC again, open the MKTTool Relay desktop shortcut, then{" "}
          <Link href="/setup" className="text-sky-300 underline">open Setup and register a new Relay PC</Link>.
        </p>
      ) : (
        <p className="text-xs leading-5 text-neutral-400">
          On {deviceName}, if Setup still reports unfinished retirement, check the local receipt here first.
          After Relay confirms completion and closes, open the MKTTool Relay desktop shortcut,
          then <Link href="/setup" className="text-sky-300 underline">open Setup and register a new Relay PC</Link>.
        </p>
      )}
    </div>
  );
}
