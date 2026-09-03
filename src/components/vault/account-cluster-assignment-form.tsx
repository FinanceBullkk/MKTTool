"use client";

import { useRef, useState } from "react";
import { SelectField } from "@/components/ui/form-controls";
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
  initialOwner,
  initialDevice,
  teamMembers,
  relayDevices,
}: {
  action: (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  accountId: string;
  initialOwner: LabeledSelection | null;
  initialDevice: LabeledSelection | null;
  teamMembers: LabeledSelection[];
  relayDevices: (LabeledSelection & { ownerEmail: string })[];
}) {
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
      setResult(await action(null, formData));
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
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-300">
            Review the assignment change before saving.
          </p>
          <dl className="space-y-1 text-neutral-700 dark:text-neutral-300">
            {confirmation.owner ? (
              <div>
                <dt className="inline font-medium">Owner: </dt>
                <dd className="inline">
                  {confirmation.owner.beforeLabel} -&gt; {confirmation.owner.afterLabel}
                </dd>
              </div>
            ) : null}
            {confirmation.device ? (
              <div>
                <dt className="inline font-medium">Relay PC: </dt>
                <dd className="inline">
                  {confirmation.device.beforeLabel} -&gt; {confirmation.device.afterLabel}
                </dd>
              </div>
            ) : null}
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900 dark:text-amber-300">
            <li>The owner controls who may request the nick password and OTP.</li>
            <li>The Relay PC controls which PC receives browser and credential tickets.</li>
            <li>
              This assignment does not move the local browser profile. After a PC transfer, verify
              the imported copy and delete the old local copy.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const form = formRef.current;
                if (form) requestSubmit(new FormData(form));
              }}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving..." : "Confirm assignment change"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmation(null)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {pending ? "Saving..." : "Save assignment"}
        </button>
      )}

      {result ? (
        <p className={result.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
