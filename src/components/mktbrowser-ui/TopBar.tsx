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
    <div
      className="px-4 h-12 flex-shrink-0 z-20 flex items-center justify-center"
      style={{
        background: "rgba(10, 11, 15, 0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      <div className="max-w-6xl w-full flex items-center gap-3.5">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity flex-shrink-0">
          <Cube size={22} />
          <span className="font-bold text-[13px] tracking-tight text-white flex items-center gap-1">
            MKT <span className="text-purple-400">Tool</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Pill kind="running" dot>
            {relayStatusText}
          </Pill>

          <Link
            href="/setup"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
            title="Settings"
          >
            <SettingsIcon size={14} />
          </Link>

          {sessionBadge}
        </div>
      </div>
    </div>
  );
}

