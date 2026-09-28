import Link from "next/link";
import { CircleCheck, CircleDashed, MonitorCog, TriangleAlert } from "lucide-react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import type { SetupStateResult } from "@/lib/setup/setup-state-machine";

export function SetupPrimaryStateCard({
  verdict,
  health,
  email,
  busy,
  detail,
  onDownloadRelay,
  onAction,
}: {
  verdict: SetupStateResult;
  health: RelayHealth | null;
  email: string;
  busy: boolean;
  detail: string | null;
  onDownloadRelay?: () => void;
  onAction: () => void;
}) {
  const buttonAction =
    verdict.action.kind === "CONFIRM" ||
    verdict.action.kind === "RETRY" ||
    verdict.action.kind === "SELF_ENROLL";
  const downloadAction = verdict.action.href === "/setup#download" && onDownloadRelay;
  const pendingLabel = health ? "Saving this PC..." : "Checking this PC...";
  const ready = verdict.state === "Ready";
  const waiting =
    verdict.state === "Starting" ||
    verdict.state === "Unable to verify" ||
    verdict.state === "Enter operator key";
  const needsRepair = verdict.state === "Needs repair";
  const StateIcon = ready ? CircleCheck : needsRepair ? TriangleAlert : waiting ? CircleDashed : MonitorCog;
  const tone = ready
    ? "border-emerald-400/20 bg-emerald-400/[0.055] text-emerald-300"
    : needsRepair
      ? "border-red-400/20 bg-red-400/[0.055] text-red-300"
      : waiting
        ? "border-amber-400/20 bg-amber-400/[0.055] text-amber-300"
        : "border-white/[0.1] bg-white/[0.025] text-neutral-300";

  return (
    <section className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-black/10">
          <StateIcon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Current PC</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{verdict.state}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-neutral-300">{verdict.message}</p>
        </div>
      </div>

      {verdict.state === "Confirm this PC" ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-3 text-sm sm:grid-cols-2">
          <p><span className="mr-2 text-xs text-neutral-500">PC</span>{health?.machineName ?? "Detected after confirmation"}</p>
          <p><span className="mr-2 text-xs text-neutral-500">Signed in</span>{email}</p>
        </div>
      ) : null}

      <div className="mt-5">
        {buttonAction ? (
          <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={busy} onClick={onAction}>
            {busy ? pendingLabel : verdict.action.label}
          </button>
        ) : downloadAction ? (
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={onDownloadRelay}>
            {verdict.action.label}
          </button>
        ) : verdict.action.href ? (
          <Link className={PRIMARY_BUTTON_CLASS} href={verdict.action.href}>{verdict.action.label}</Link>
        ) : (
          <p className="text-sm font-medium text-current">{verdict.action.label}</p>
        )}
      </div>
      {detail ? <p role="alert" className="mt-3 text-sm text-red-200">{detail}</p> : null}
    </section>
  );
}
