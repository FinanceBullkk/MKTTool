"use client";

import Link from "next/link";
import {
  Clock3,
  LoaderCircle,
  MonitorCheck,
  MonitorX,
  RefreshCw,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { SummaryMetric } from "@/components/ui/summary-metric";
import type { LocalLaunchReadiness } from "@/lib/relay/profile-launch-readiness";

export function WorkspaceStatusBoard({
  checking,
  counts,
  localReadiness,
  onRefresh,
}: {
  checking: boolean;
  counts: { all: number; running: number; warmup: number; error: number };
  localReadiness: LocalLaunchReadiness;
  onRefresh: () => void;
}) {
  const state = relayVisualState(localReadiness, checking);
  const StateIcon = state.icon;

  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.4fr)]">
      <section className="app-surface relative overflow-hidden rounded-2xl p-5">
        <div className={`absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-30 ${state.wash}`} />
        <div className="relative flex items-center gap-4">
          <div className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border ${state.iconBox}`}>
            <StateIcon size={28} className={checking ? "animate-spin" : undefined} strokeWidth={1.7} />
            <span className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#15181d] ${state.dot}`} />
          </div>
          <div className="min-w-0" role="status" aria-live="polite">
            <p className="text-xs font-medium text-neutral-500">This Relay PC</p>
            <h2 className={`mt-1 text-2xl font-semibold tracking-tight ${state.heading}`}>
              {state.label}
            </h2>
          </div>
        </div>

        <details className="group relative mt-4 border-t border-white/[0.07] pt-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-neutral-400 marker:hidden hover:text-neutral-200">
            Status details
          </summary>
          <p className="mt-2 text-xs leading-5 text-neutral-400">
            {checking ? "Checking local browser profile conditions..." : localReadiness.message}
          </p>
        </details>

        <div className="relative mt-4 flex gap-2">
          {!checking && !localReadiness.ready ? (
            <Link
              href="/setup"
              className="brand-btn inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold"
            >
              Open setup
            </Link>
          ) : null}
          <button
            type="button"
            disabled={checking}
            onClick={onRefresh}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-sm font-medium text-neutral-300 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-50 ${
              checking || localReadiness.ready ? "flex-1" : ""
            }`}
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : undefined} />
            {checking ? "Checking" : "Check again"}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <SummaryMetric icon={UsersRound} label="All nicks" value={counts.all} />
        <SummaryMetric
          icon={MonitorCheck}
          label="Open now"
          value={counts.running}
          tone={counts.running > 0 ? "success" : "neutral"}
        />
        <SummaryMetric
          icon={Clock3}
          label="Cold-start"
          value={counts.warmup}
          tone={counts.warmup > 0 ? "warning" : "neutral"}
        />
        <SummaryMetric
          icon={TriangleAlert}
          label="Needs attention"
          value={counts.error}
          tone={counts.error > 0 ? "danger" : "success"}
        />
      </div>
    </div>
  );
}

function relayVisualState(localReadiness: LocalLaunchReadiness, checking: boolean) {
  if (checking) {
    return {
      label: "Checking",
      icon: LoaderCircle,
      heading: "text-neutral-100",
      iconBox: "border-white/[0.1] bg-white/[0.04] text-neutral-300",
      dot: "bg-neutral-400",
      wash: "bg-neutral-200/10",
    };
  }

  if (localReadiness.ready) {
    return {
      label: "Ready",
      icon: MonitorCheck,
      heading: "text-emerald-200",
      iconBox: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      dot: "bg-emerald-400",
      wash: "bg-emerald-400/20",
    };
  }

  return {
    label: localReadiness.state === "relay-offline" ? "Offline" : "Needs setup",
    icon: MonitorX,
    heading: "text-amber-200",
    iconBox: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
    wash: "bg-amber-400/20",
  };
}
