"use client";

import type { JSX, ReactNode } from "react";

export type PillKind = "running" | "pending" | "error" | "ai" | "idle" | "info";

const PALETTE: Record<PillKind, [string, string, string, boolean]> = {
  running: ["rgba(16,185,129,0.10)", "#34d399", "rgba(16,185,129,0.4)", true],
  pending: ["rgba(245,158,11,0.10)", "#fbbf24", "rgba(245,158,11,0.4)", false],
  error: ["rgba(239,68,68,0.10)", "#f87171", "rgba(239,68,68,0.4)", false],
  ai: ["rgba(168,85,247,0.10)", "#c084fc", "rgba(168,85,247,0.4)", true],
  idle: ["rgba(100,116,139,0.10)", "#94a3b8", "rgba(100,116,139,0.3)", false],
  info: ["rgba(99,102,241,0.10)", "#a5b4fc", "rgba(99,102,241,0.3)", false],
};

export function Pill({
  kind = "idle",
  children,
  glow,
  dot,
  className,
}: {
  kind?: PillKind;
  children: ReactNode;
  glow?: boolean;
  dot?: boolean;
  className?: string;
}): JSX.Element {
  const [bg, fg, glowColor, animated] = PALETTE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide font-sans ${className ?? ""}`}
      style={{
        background: bg,
        color: fg,
        boxShadow: glow ? `0 0 24px ${glowColor}` : undefined,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: "currentColor",
            animation: animated ? "pulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
      )}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-400 shadow-[inset_0_-1px_0_rgba(0,0,0,0.3)]">
      {children}
    </kbd>
  );
}

export function Cube({ size = 22 }: { size?: number }): JSX.Element {
  return (
    <div
      className="flex flex-shrink-0 select-none items-center justify-center rounded-lg font-bold text-[#1c160d]"
      style={{
        width: size,
        height: size,
        background: "var(--mkt-accent)",
        fontSize: size * 0.55,
      }}
    >
      M
    </div>
  );
}

export function Avatar({
  label,
  size = 40,
  accent,
}: {
  label: string;
  size?: number;
  accent?: boolean;
}): JSX.Element {
  return (
    <div
      className="flex flex-shrink-0 select-none items-center justify-center rounded-xl font-semibold uppercase"
      style={{
        width: size,
        height: size,
        background: accent ? "rgba(231, 173, 87, 0.14)" : "rgba(255, 255, 255, 0.05)",
        border: accent ? "1px solid rgba(231, 173, 87, 0.28)" : "1px solid rgba(255, 255, 255, 0.08)",
        color: accent ? "#f0bd70" : "#cbd0d8",
        fontSize: size * 0.34,
      }}
    >
      {label.slice(0, 2)}
    </div>
  );
}

export function Flag({ country }: { country: string }): JSX.Element {
  const code = (country || "").toUpperCase();
  return (
    <span className="inline-flex h-6 min-w-7 select-none items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 font-mono text-[10px] font-semibold text-neutral-300">
      {code || "--"}
    </span>
  );
}
