"use client";

import { useMemo, useState } from "react";
import { Grid3x3, List, Plus } from "lucide-react";
import { ProfileTile, type ProfileItemData } from "./ProfileTile";
import { ProfileTable } from "./ProfileTable";
import {
  NewTikTokProfileSheet,
  type DeviceOption,
  type FreeProxyOption,
} from "@/components/tiktok/new-tiktok-profile-sheet";
import { Kbd } from "./Atoms";

type ViewMode = "grid" | "list";

interface FilterChip {
  id: "all" | "running" | "warmup" | "error" | "idle";
  label: string;
}

const FILTERS: FilterChip[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "warmup", label: "Warmup" },
  { id: "error", label: "Errors" },
  { id: "idle", label: "Idle" },
];

export function Constellation({
  profiles,
  freeProxies,
  devices,
  searchQuery = "",
}: {
  profiles: ProfileItemData[];
  freeProxies: FreeProxyOption[];
  devices: DeviceOption[];
  searchQuery?: string;
}) {
  const [filter, setFilter] = useState<FilterChip["id"]>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => {
    return {
      all: profiles.length,
      running: 0, // dynamic
      warmup: profiles.filter((p) => p.coldStartDaysRemaining > 0).length,
      error: profiles.filter((p) => p.status === "CHECKPOINT" || p.status === "DEAD").length,
      idle: profiles.filter((p) => p.status === "ALIVE" && p.coldStartDaysRemaining === 0).length,
    };
  }, [profiles]);

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.username.toLowerCase().includes(q);
        const matchVoice = (p.voice || "").toLowerCase().includes(q);
        const matchProxy = (p.proxy?.lastExitIp || p.proxy?.host || "").toLowerCase().includes(q);
        const matchNotes = (p.notes || "").toLowerCase().includes(q);
        if (!matchName && !matchVoice && !matchProxy && !matchNotes) return false;
      }

      // Status
      if (filter === "warmup") return p.coldStartDaysRemaining > 0;
      if (filter === "error") return p.status === "CHECKPOINT" || p.status === "DEAD" || !p.proxy;
      if (filter === "idle") return p.coldStartDaysRemaining === 0 && p.status !== "DEAD";

      return true;
    });
  }, [profiles, searchQuery, filter]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 p-6 overflow-y-auto max-w-6xl mx-auto w-full">
      {/* 1. Header Row */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl font-bold text-white tracking-tight">All profiles</h1>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
            <span>{profiles.length} total</span>
            <span>·</span>
            <span>{counts.warmup} warmup</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === "grid" ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
              title="Grid view"
            >
              <Grid3x3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === "list" ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
              title="List view"
            >
              <List size={15} />
            </button>
          </div>

          {/* New Profile Button */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="brand-btn px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-500/25"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New profile</span>
            <Kbd>⌘ N</Kbd>
          </button>
        </div>
      </div>

      {/* 2. Filter Chips Row */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {FILTERS.map((chip) => {
          const isActive = filter === chip.id;
          const count = counts[chip.id];

          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                  : "bg-white/[0.02] border border-white/[0.04] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]"
              }`}
            >
              {chip.id === "running" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              {chip.id === "warmup" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              {chip.id === "error" && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
              {chip.id === "idle" && <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />}
              <span>{chip.label}</span>
              <span className="font-mono text-[11px] text-neutral-500">{count}</span>
            </button>
          );
        })}

        <div className="h-4 w-px bg-white/[0.08] mx-1" />

        <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/[0.06] text-neutral-400 select-none">
          mkttool
        </span>
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/[0.06] text-neutral-400 select-none">
          tiktok
        </span>
      </div>

      {/* 3. Cards Grid or List View */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.01] border border-white/[0.04]">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-2xl mb-3">
            🎬
          </div>
          <h3 className="text-sm font-semibold text-white">Chưa có profile nào</h3>
          <p className="mt-1 text-xs text-neutral-400 max-w-sm">
            Bấm nút <strong>&quot;New profile&quot;</strong> để tạo môi trường trình duyệt cách ly mới kèm Proxy 4G.
          </p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="brand-btn mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            <span>Tạo Profile đầu tiên</span>
          </button>
        </div>
      ) : viewMode === "list" ? (
        <ProfileTable
          profiles={filtered}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((profile) => (
            <ProfileTile
              key={profile.id}
              profile={profile}
            />
          ))}
        </div>
      )}

      {/* 4. Modal New Profile */}
      <NewTikTokProfileSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        freeProxies={freeProxies}
        devices={devices}
      />
    </div>
  );
}
