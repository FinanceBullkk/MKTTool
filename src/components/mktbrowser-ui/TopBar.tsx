"use client";

import Link from "next/link";
import { Search, Settings as SettingsIcon } from "lucide-react";
import { Cube, Pill, Kbd } from "./Atoms";
import type { ReactNode } from "react";

interface TopBarProps {
  totalCount: number;
  runningCount: number;
  /** Nhãn cầu nối đã dựng sẵn — xem `relayStatusLabel()`. Không đặt mặc định ở đây. */
  relayStatusText: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sessionBadge?: ReactNode;
}

export function TopBar({
  totalCount,
  runningCount,
  relayStatusText,
  searchQuery,
  onSearchChange,
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

        {/* Search Bar */}
        <div className="flex-1 flex justify-center max-w-md mx-auto">
          <div
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/40 focus-within:bg-white/[0.05] transition-all"
          >
            <Search size={14} className="text-neutral-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search profiles, tags, urls…"
              className="flex-1 bg-transparent text-[13px] text-white placeholder:text-neutral-400 focus:outline-none"
            />
            <Kbd>Ctrl K</Kbd>
          </div>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
            <span className="font-mono text-neutral-200 text-[12px] font-semibold">{runningCount}</span>
            <span>running</span>
            <span className="text-neutral-600">·</span>
            <span className="font-mono text-neutral-400 text-[12px]">{totalCount}</span>
            <span>total</span>
          </div>

          <Pill kind="running" dot>
            {relayStatusText}
          </Pill>

          <Link
            href="/setup"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
            title="Cài đặt"
          >
            <SettingsIcon size={14} />
          </Link>

          {sessionBadge}
        </div>
      </div>
    </div>
  );
}

