import type { LucideIcon } from "lucide-react";

type MetricTone = "neutral" | "success" | "warning" | "danger";

const TONES: Record<MetricTone, { icon: string; value: string; wash: string }> = {
  neutral: {
    icon: "border-white/[0.08] bg-white/[0.04] text-neutral-300",
    value: "text-white",
    wash: "bg-white/[0.025]",
  },
  success: {
    icon: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    value: "text-emerald-200",
    wash: "bg-emerald-400/[0.035]",
  },
  warning: {
    icon: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    value: "text-amber-200",
    wash: "bg-amber-400/[0.035]",
  },
  danger: {
    icon: "border-red-400/20 bg-red-400/10 text-red-300",
    value: "text-red-200",
    wash: "bg-red-400/[0.035]",
  },
};

export function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: MetricTone;
}) {
  const palette = TONES[tone];

  return (
    <article className={`app-surface relative overflow-hidden rounded-xl p-3.5 sm:p-4 ${palette.wash}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${palette.icon}`}>
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <strong className={`font-mono text-2xl font-semibold tabular-nums ${palette.value}`}>
          {value}
        </strong>
      </div>
      <p className="mt-3 text-xs font-medium text-neutral-400">{label}</p>
    </article>
  );
}
