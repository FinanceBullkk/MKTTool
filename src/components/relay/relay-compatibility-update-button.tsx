"use client";

import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  pingRelay,
  updateRelayCompatibility,
} from "@/lib/relay/relay-browser-client";
import { issueCompatibilityUpdateTicket } from "@/lib/release/compatibility-update-actions";
import { previewCompatibilityUpdate } from "@/lib/release/compatibility-update-preview-action";
import {
  planCompatibilityUpdate,
  type CompatibilityUpdatePlan,
} from "@/lib/release/compatibility-update-plan";
import { useLocalRelayPing } from "@/components/relay/relay-local-identity-provider";
import { relayDeviceLocality } from "@/lib/relay/relay-device-locality";
import { RelayCompatibilityUpdateConfirmation } from "./relay-compatibility-update-confirmation";

type ConfirmationPlan = Extract<CompatibilityUpdatePlan, { status: "confirm" }>;
type Inspection = { result: ActionResult } | { plan: ConfirmationPlan };

export function RelayCompatibilityUpdateButton({
  deviceId,
  deviceName,
  devicePublicKey,
}: {
  deviceId: string;
  deviceName: string;
  devicePublicKey: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationPlan | null>(null);
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();
  // This only controls rendering; `inspect()` performs the authoritative check.
  const locality = relayDeviceLocality(useLocalRelayPing(), {
    deviceId,
    publicKey: devicePublicKey,
    deviceName,
  });

  async function inspect(ping: ReturnType<typeof pingRelay>): Promise<Inspection> {
    const health = await ping;
    const local = health.status === "ok" || health.status === "rejected" ? health.data : undefined;
    if (!local) return { result: { ok: false, message: describeRelayFailure(health) } as ActionResult };
    if (local.deviceId !== deviceId || local.publicKey !== devicePublicKey) {
      return {
        result: {
          ok: false,
          message: "Compatibility update must run from the exact PC selected in this row.",
        } as ActionResult,
      };
    }

    const previewForm = new FormData();
    previewForm.set("deviceId", deviceId);
    const preview = await previewCompatibilityUpdate(null, previewForm);
    if (
      !preview.ok ||
      !("targetSequence" in preview) ||
      preview.targetSequence === undefined ||
      !("targetRelayVersion" in preview) ||
      !preview.targetRelayVersion ||
      !("targetBrowserVersion" in preview) ||
      !preview.targetBrowserVersion
    ) {
      return { result: preview };
    }

    const plan = planCompatibilityUpdate({
      update: local.compatibilityUpdate,
      currentRelayVersion: local.relayVersion,
      currentBrowserVersion: local.browser.appVersion,
      target: {
        sequence: preview.targetSequence,
        relayVersion: preview.targetRelayVersion,
        browserVersion: preview.targetBrowserVersion,
      },
    });
    return plan.status === "confirm"
      ? { plan }
      : { result: { ok: plan.status === "current", message: plan.message } as ActionResult };
  }

  function prepare() {
    const ping = pingRelay();
    startTransition(async () => {
      setResult(null);
      try {
        const inspected = await inspect(ping);
        if ("result" in inspected) {
          setResult(inspected.result);
          setConfirmation(null);
          return;
        }
        setConfirmation(inspected.plan);
        setTypedName("");
      } catch {
        setResult({
          ok: false,
          message: "Compatibility update could not be prepared. Recheck this PC and retry.",
        });
        setConfirmation(null);
      }
    });
  }

  function update() {
    const ping = pingRelay();
    startTransition(async () => {
      setResult(null);
      try {
        const inspected = await inspect(ping);
        if ("result" in inspected) {
          setResult(inspected.result);
          setConfirmation(null);
          return;
        }
        const plan = inspected.plan;
        if (plan.signature !== confirmation?.signature) {
          setConfirmation(plan);
          setTypedName("");
          setResult({
            ok: false,
            message: "The local state or signed target changed. Review the updated values before retrying.",
          });
          return;
        }

        const form = new FormData();
        form.set("deviceId", deviceId);
        form.set("repairMissingState", String(plan.repairMissingState));
        form.set("expectedTargetSequence", String(plan.targetSequence));
        const issued = await issueCompatibilityUpdateTicket(null, form);
        const ticket = "ticket" in issued ? issued.ticket : undefined;
        const targetSequence = "targetSequence" in issued ? issued.targetSequence : undefined;
        if (!issued.ok || !ticket) {
          setResult(issued);
          setConfirmation(null);
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
        setConfirmation(null);
      } catch {
        setResult({
          ok: false,
          message: "Compatibility update did not start. Recheck this PC and retry.",
        });
        setConfirmation(null);
      } finally {
        setTypedName("");
      }
    });
  }

  if (confirmation) {
    return (
      <RelayCompatibilityUpdateConfirmation
        plan={confirmation}
        deviceName={deviceName}
        typedName={typedName}
        pending={pending}
        onTypedNameChange={setTypedName}
        onConfirm={update}
        onCancel={() => {
          setConfirmation(null);
          setTypedName("");
        }}
      />
    );
  }

  if (locality.state === "elsewhere") {
    return <p className="text-xs leading-5 text-neutral-500">{locality.note}</p>;
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending || locality.state === "checking"}
        onClick={prepare}
        className={SMALL_BUTTON_CLASS}
      >
        {pending || locality.state === "checking"
          ? "Checking compatibility set..."
          : "Update / repair compatibility set"}
      </button>
      {locality.state === "unverified" ? (
        <p className="text-xs leading-5 text-neutral-500">{locality.note}</p>
      ) : null}
      {result ? (
        <p className={result.ok ? "text-xs text-emerald-300" : "text-xs text-red-300"}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
