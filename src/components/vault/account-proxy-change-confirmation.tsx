import type { SelectionChange } from "@/lib/forms/selection-change";
import { ArrowRight, Info, Save, ShieldCheck, X } from "lucide-react";
import {
  Disclosure,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "@/components/ui/page-section";

export function AccountProxyChangeConfirmation({
  change,
  pending,
  onConfirm,
  onCancel,
}: {
  change: SelectionChange;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-200">
        <ShieldCheck size={17} aria-hidden="true" />
        Review proxy change
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.07] bg-black/10 p-3 text-xs text-neutral-200">
        <span>{change.beforeLabel}</span>
        <ArrowRight size={13} className="text-amber-300" aria-hidden="true" />
        <strong>{change.afterLabel}</strong>
      </div>
      <Disclosure summary="What changes on the next launch" icon={Info}>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-5">
          <li>The next safe browser launch pushes this proxy into the existing browser profile.</li>
          <li>Removing it blocks browser-backed launch until another static proxy is assigned.</li>
          <li>The local browser profile is not moved or recreated.</li>
        </ul>
      </Disclosure>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={PRIMARY_BUTTON_CLASS}
        >
          <Save size={16} aria-hidden="true" />
          {pending ? "Saving..." : "Confirm proxy change"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={SECONDARY_BUTTON_CLASS}
        >
          <X size={16} aria-hidden="true" />
          Cancel
        </button>
      </div>
    </div>
  );
}
