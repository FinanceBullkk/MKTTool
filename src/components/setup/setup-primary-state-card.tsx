import Link from "next/link";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import type { SetupStateResult } from "@/lib/setup/setup-state-machine";

const BUTTON =
  "inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

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
  const buttonAction = verdict.action.kind === "CONFIRM" || verdict.action.kind === "RETRY";
  const downloadAction = verdict.action.href === "/setup#download" && onDownloadRelay;
  const pendingLabel = health ? "Saving this PC..." : "Checking this PC...";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Current PC setup</p>
      <h2 className="mt-2 text-2xl font-semibold">{verdict.state}</h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{verdict.message}</p>

      {verdict.state === "Confirm this PC" ? (
        <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm dark:bg-neutral-950/60">
          <p><span className="text-neutral-500">PC</span> {health?.machineName ?? "Detected after confirmation"}</p>
          <p className="mt-1"><span className="text-neutral-500">Signed in</span> {email}</p>
        </div>
      ) : null}

      <div className="mt-5">
        {buttonAction ? (
          <button type="button" className={BUTTON} disabled={busy} onClick={onAction}>
            {busy ? pendingLabel : verdict.action.label}
          </button>
        ) : downloadAction ? (
          <button type="button" className={BUTTON} onClick={onDownloadRelay}>
            {verdict.action.label}
          </button>
        ) : verdict.action.href ? (
          <Link className={BUTTON} href={verdict.action.href}>{verdict.action.label}</Link>
        ) : (
          <p className="text-sm font-medium text-neutral-500">{verdict.action.label}</p>
        )}
      </div>
      {detail ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{detail}</p> : null}
    </div>
  );
}
