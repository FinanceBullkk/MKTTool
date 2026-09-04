import type { CompatibilityUpdatePlan } from "@/lib/release/compatibility-update-plan";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/components/ui/page-section";

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
    <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-left">
      <p className="text-xs text-amber-200">
        <strong>Compatibility set:</strong> {plan.beforeLabel} -&gt; {plan.afterLabel}
      </p>
      <p className="text-xs leading-5 text-amber-100/80">
        Relay and MKT Browser will stop and restart during activation. The protected smoke check
        runs before the new set becomes authoritative; an open browser profile blocks the update.
      </p>
      <p className="text-xs text-amber-200">
        Type the exact PC name to continue: <strong>{deviceName}</strong>
      </p>
      <input
        value={typedName}
        onChange={(event) => onTypedNameChange(event.target.value)}
        disabled={pending}
        className="min-h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-base text-white outline-none focus:border-amber-400/50 disabled:opacity-40 sm:text-xs"
        aria-label={`Type ${deviceName} to confirm compatibility update`}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pending || typedName !== deviceName}
          onClick={onConfirm}
          className={PRIMARY_BUTTON_CLASS}
        >
          {pending ? "Starting update..." : "Confirm compatibility update"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
