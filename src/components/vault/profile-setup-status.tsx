import { CircleAlert, RefreshCw } from "lucide-react";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ProfileSetupBlocked } from "@/lib/relay/profile-setup-readiness";

export function ProfileSetupStatus({ state, checking, onRetry }: {
  state: ProfileSetupBlocked | null;
  checking: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100" aria-busy={checking}>
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 space-y-2">
        <div role="status" aria-live="polite">
          <p className="font-semibold">{state?.title ?? "Checking this PC"}</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">
            {state?.message ?? "Checking Relay and MKT Browser before loading browser profiles."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={SMALL_BUTTON_CLASS} onClick={onRetry} disabled={checking}>
            <RefreshCw size={14} aria-hidden="true" />
            {checking ? "Checking..." : "Check again"}
          </button>
          {state?.setupHref ? (
            <a href={state.setupHref} className="text-xs font-medium underline underline-offset-2">
              Set up this Relay PC
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
