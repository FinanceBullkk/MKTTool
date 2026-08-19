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
      className="rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-purple-500/30 flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #ff6b35 0%, #ff3d8a 35%, #8b5cf6 70%, #3b82f6 100%)",
        fontSize: size * 0.55,
      }}
    >
      M
    </div>
  );
}

const EMOJI_TINTS = [
  "#1e293b", // slate
  "#1e1b4b", // indigo
  "#2e1065", // purple
  "#064e3b", // emerald
  "#451a03", // amber
  "#4c0519", // rose
  "#0f172a", // dark
];

export function Avatar({
  emoji,
  size = 40,
  accent,
}: {
  emoji: string;
  size?: number;
  accent?: boolean;
}): JSX.Element {
  let hash = 0;
  for (let i = 0; i < emoji.length; i++) {
    hash = (hash << 5) - hash + emoji.charCodeAt(i);
  }
  const bg = EMOJI_TINTS[Math.abs(hash) % EMOJI_TINTS.length];

  return (
    <div
      className="rounded-xl flex items-center justify-center select-none flex-shrink-0 transition-transform"
      style={{
        width: size,
        height: size,
        background: accent ? "rgba(168, 85, 247, 0.15)" : bg,
        border: accent ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
        fontSize: size * 0.55,
      }}
    >
      {emoji}
    </div>
  );
}

export function Flag({ country }: { country: string }): JSX.Element {
  const code = (country || "").toUpperCase();
  const flagMap: Record<string, string> = {
    VN: "🇻🇳",
    US: "🇺🇸",
    SG: "🇸🇬",
    GB: "🇬🇧",
    JP: "🇯🇵",
    ES: "🇪🇸",
    PT: "🇵🇹",
    DE: "🇩🇪",
    FR: "🇫🇷",
  };
  const flag = flagMap[code] || "🌐";
  return <span className="text-sm select-none">{flag}</span>;
}
