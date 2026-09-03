import type { CompatibilityUpdatePlan } from "@/lib/release/compatibility-update-plan";

type ConfirmationPlan = Extract<CompatibilityUpdatePlan, { status: "confirm" }>;

export function RelayCompatibilityUpdateConfirmation({
  plan,
  deviceName,
  typedName,
  pending,
  onTypedNameChange,
  onConfirm,
  onCancel,
}: {
  plan: ConfirmationPlan;
  deviceName: string;
  typedName: string;
  pending: boolean;
  onTypedNameChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-amber-300 p-3 text-left dark:border-amber-900">
      <p className="text-xs text-amber-800 dark:text-amber-400">
        <strong>Compatibility set:</strong> {plan.beforeLabel} -&gt; {plan.afterLabel}
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-400">
        Relay and MKT Browser will stop and restart during activation. The protected smoke check
        runs before the new set becomes authoritative; an open browser profile blocks the update.
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-400">
        Type the exact PC name to continue: <strong>{deviceName}</strong>
      </p>
      <input
        value={typedName}
        onChange={(event) => onTypedNameChange(event.target.value)}
        disabled={pending}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
        aria-label={`Type ${deviceName} to confirm compatibility update`}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pending || typedName !== deviceName}
          onClick={onConfirm}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Starting update..." : "Confirm compatibility update"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
