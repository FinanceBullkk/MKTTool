"use client";

import Link from "next/link";
import { Settings as SettingsIcon } from "lucide-react";
import { Cube, Pill } from "./Atoms";
import type { ReactNode } from "react";

interface TopBarProps {
  /** Nhãn cầu nối đã dựng sẵn — xem `relayStatusLabel()`. Không đặt mặc định ở đây. */
  relayStatusText: string;
  sessionBadge?: ReactNode;
}

export function TopBar({
  relayStatusText,
  sessionBadge,
}: TopBarProps) {
  return (
    <header
      className="z-20 flex h-14 flex-shrink-0 items-center justify-center px-4"
      style={{
        background: "rgba(13, 15, 18, 0.9)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--mkt-border)",
      }}
    >
      <div className="app-frame flex items-center gap-3.5">
        <Link href="/" className="flex flex-shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
          <Cube size={24} />
          <span className="flex items-center gap-1 text-sm font-semibold tracking-tight text-white">
            MKT <span className="text-amber-300">Tool</span>
          </span>
        </Link>

        <div className="flex-1" />

        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 sm:gap-3">
          <Pill kind="running" dot>
            {relayStatusText}
          </Pill>

          <Link
            href="/setup"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Settings"
            aria-label="Open Relay PC setup"
          >
            <SettingsIcon size={16} />
          </Link>

          {sessionBadge}
        </div>
      </div>
    </header>
  );
}

