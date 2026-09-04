"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Save, ShieldCheck, X } from "lucide-react";
import { SelectField } from "@/components/ui/form-controls";
import {
  Disclosure,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeSelectionChange,
  type LabeledSelection,
  type SelectionChange,
} from "@/lib/forms/selection-change";

interface ClusterConfirmation {
  owner: SelectionChange | null;
  device: SelectionChange | null;
  signature: string;
}

export function AccountClusterAssignmentForm({
  action,
  accountId,
  revision,
  initialOwner,
  initialDevice,
  teamMembers,
  relayDevices,
}: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  accountId: string;
  revision: string;
  initialOwner: LabeledSelection | null;
  initialDevice: LabeledSelection | null;
  teamMembers: LabeledSelection[];
  relayDevices: (LabeledSelection & { ownerEmail: string })[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmation, setConfirmation] = useState<ClusterConfirmation | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  function describeChange(formData: FormData): ClusterConfirmation | null {
    const ownerValue = String(formData.get("ownerId") ?? "").trim();
    const deviceValue = String(formData.get("deviceId") ?? "").trim();
    const owner = describeSelectionChange({
      initial: initialOwner,
      nextValue: ownerValue,
      options: teamMembers,
      emptyLabel: "Owner not assigned",
    });
    const device = describeSelectionChange({
      initial: initialDevice,
      nextValue: deviceValue,
      options: relayDevices,
      emptyLabel: "Relay PC not assigned",
    });
    if (!owner && !device) return null;
    return { owner, device, signature: `${ownerValue}\n${deviceValue}` };
  }

  function requestSubmit(formData: FormData) {
    const change = describeChange(formData);
    if (change && change.signature !== confirmation?.signature) {
      setResult(null);
      setConfirmation(change);
      return;
    }
    void submit(formData);
  }

  async function submit(formData: FormData) {
    setPending(true);
    setResult(null);
    setConfirmation(null);
    try {
      const outcome = await action(null, formData);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "The assignment was not saved. Reload the page and retry." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) requestSubmit(new FormData(event.currentTarget));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="revision" value={revision} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Owner"
          name="ownerId"
          defaultValue={initialOwner?.id ?? ""}
          options={teamMembers.map((member) => ({ value: member.id, label: member.label }))}
          hint="Only teammates who have signed in at least once appear."
        />
        <SelectField
          label="Relay PC"
          name="deviceId"
          defaultValue={initialDevice?.id ?? ""}
          options={relayDevices.map((device) => ({
            value: device.id,
            label: `${device.label} - ${device.ownerEmail}`,
          }))}
          hint={
            relayDevices.length === 0
              ? "No Relay PC is registered. Install Relay and register the PC before assigning a nick."
              : "Leave blank only when the nick does not use a browser profile."
          }
        />
      </div>

      {confirmation ? (
        <div className="space-y-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-200">
            <ShieldCheck size={17} aria-hidden="true" />
            Review assignment change
          </p>
          <dl className="grid gap-2 text-neutral-200 sm:grid-cols-2">
            {confirmation.owner ? (
              <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
                <dt className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Owner</dt>
                <dd className="flex items-center gap-2 text-xs">
                  <span>{confirmation.owner.beforeLabel}</span>
                  <ArrowRight size={13} className="text-amber-300" aria-hidden="true" />
                  <strong>{confirmation.owner.afterLabel}</strong>
                </dd>
              </div>
            ) : null}
            {confirmation.device ? (
              <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
                <dt className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-500">Relay PC</dt>
                <dd className="flex items-center gap-2 text-xs">
                  <span>{confirmation.device.beforeLabel}</span>
                  <ArrowRight size={13} className="text-amber-300" aria-hidden="true" />
                  <strong>{confirmation.device.afterLabel}</strong>
                </dd>
              </div>
            ) : null}
          </dl>
          <Disclosure summary="What this assignment controls" icon={Info}>
            <ul className="list-disc space-y-1.5 pl-5 text-xs leading-5">
              <li>The owner controls who may request the nick password and OTP.</li>
              <li>The Relay PC controls which PC receives browser and credential tickets.</li>
              <li>This does not move the local browser profile. Verify the imported copy before deleting the old local copy.</li>
            </ul>
          </Disclosure>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const form = formRef.current;
                if (form) requestSubmit(new FormData(form));
              }}
              className={PRIMARY_BUTTON_CLASS}
            >
              <Save size={16} aria-hidden="true" />
              {pending ? "Saving..." : "Confirm assignment change"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmation(null)}
              className={SECONDARY_BUTTON_CLASS}
            >
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className={PRIMARY_BUTTON_CLASS}
        >
          <Save size={16} aria-hidden="true" />
          {pending ? "Saving..." : "Save assignment"}
        </button>
      )}

      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-emerald-300" : "text-sm text-red-300"}>
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
