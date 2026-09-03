"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Grid3x3, List, Search } from "lucide-react";
import { ProfileTile, type ProfileItemData } from "./ProfileTile";
import { ProfileTable } from "./ProfileTable";
import { fetchRelayProfiles, pingRelay } from "@/lib/relay/relay-browser-client";
import {
  currentRelayLaunchReadiness,
  localProfileInventorySnapshot,
  type LocalLaunchReadiness,
} from "@/lib/relay/profile-launch-readiness";
import {
  isProfileRunning,
  profileListCounts,
  profileMatchesListFilter,
  profileMatchesSearchQuery,
  type ProfileListFilter,
} from "./profile-list-state";

type ViewMode = "grid" | "list";

interface FilterChip {
  id: ProfileListFilter;
  label: string;
}

const FILTERS: FilterChip[] = [
  { id: "all", label: "All nicks" },
  { id: "running", label: "Open on this Relay PC" },
  { id: "warmup", label: "Cold-start" },
  { id: "error", label: "Needs attention" },
  { id: "idle", label: "Not open on this Relay PC" },
];

export function Constellation({
  profiles,
}: {
  profiles: ProfileItemData[];
}) {
  const [filter, setFilter] = useState<FilterChip["id"]>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [checkingLocal, setCheckingLocal] = useState(true);
  const [localReadiness, setLocalReadiness] = useState<LocalLaunchReadiness>(() =>
    currentRelayLaunchReadiness(null),
  );
  const [runningProfileIds, setRunningProfileIds] = useState<Set<string>>(() => new Set());
  const refreshSequence = useRef(0);

  const refreshLocalState = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setCheckingLocal(true);
    const healthPromise = pingRelay();
    const profilesPromise = fetchRelayProfiles();
    const [health, localProfiles] = await Promise.all([healthPromise, profilesPromise]);
    if (sequence !== refreshSequence.current) return;

    const inventory = localProfileInventorySnapshot(
      currentRelayLaunchReadiness(health),
      localProfiles,
    );
    setLocalReadiness(inventory.readiness);
    if (inventory.runningProfileIds) setRunningProfileIds(inventory.runningProfileIds);
    setCheckingLocal(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshLocalState(), 0);
    const timer = window.setInterval(() => void refreshLocalState(), 15_000);
    return () => {
      refreshSequence.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshLocalState]);

  const markProfileRunning = useCallback((profileId: string | null) => {
    if (!profileId) return;
    refreshSequence.current += 1;
    setCheckingLocal(false);
    setRunningProfileIds((current) => new Set(current).add(profileId));
  }, []);

  const counts = useMemo(
    () => profileListCounts(profiles, runningProfileIds),
    [profiles, runningProfileIds],
  );

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      return (
        profileMatchesSearchQuery(p, searchQuery) &&
        profileMatchesListFilter(p, filter, runningProfileIds)
      );
    });
  }, [profiles, searchQuery, filter, runningProfileIds]);

  const hasActiveFilter = searchQuery.trim() !== "" || filter !== "all";

  return (
    <div
      // No scroll container here: `main` in AppShell already owns the vertical
      // scroll. Two nested scrollers meant the wheel stopped at an inner
      // boundary and the page looked stuck.
      className="flex-1 flex flex-col min-w-0 min-h-0 p-6 max-w-6xl mx-auto w-full"
    >
      {/* 1. Header Row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-xl font-bold text-white tracking-tight">Team nick vault</h1>
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
              <span>{profiles.length} {profiles.length === 1 ? "nick" : "nicks"}</span>
              <span>·</span>
              <span>{counts.warmup} cold-start</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Shared identity records for the whole team. Each browser profile is local data on one
            Relay PC.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === "grid" ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-300"
              }`}
              title="Grid view"
            >
              <Grid3x3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                viewMode === "list" ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:text-neutral-300"
              }`}
              title="List view"
            >
              <List size={15} />
            </button>
          </div>

          <Link
            href="/accounts"
            className="brand-btn px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-500/25"
          >
            <span>Open nick vault</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <div className="mb-3 flex w-full max-w-xl items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 focus-within:border-purple-500/40 focus-within:bg-white/[0.05]">
        <Search size={14} className="shrink-0 text-neutral-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search nicks"
          placeholder="Search nicks by username, owner, Relay PC, proxy, or notes..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-neutral-400 focus:outline-none"
        />
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
              <span className="font-mono text-[11px] text-neutral-400">{count}</span>
            </button>
          );
        })}
      </div>

      <div
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs"
        role="status"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              localReadiness.ready ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="truncate text-neutral-300">
            {checkingLocal && localReadiness.state === "checking"
              ? "Checking local browser profile conditions..."
              : localReadiness.message}
          </span>
        </div>
        {!localReadiness.ready ? (
          <button
            type="button"
            disabled={checkingLocal}
            onClick={() => void refreshLocalState()}
            className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-neutral-200 transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50"
          >
            {checkingLocal ? "Checking..." : "Check again"}
          </button>
        ) : null}
      </div>

      {/* 3. Cards Grid or List View */}
      {profiles.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.01] border border-white/[0.04]">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-2xl mb-3">
            🗂️
          </div>
          <h3 className="text-sm font-semibold text-white">No nicks in the team vault</h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-400">
            Open the nick vault to add an identity record or review assigned nicks. A browser
            profile is separate local data on a Relay PC, not a vault record.
          </p>
          <Link
            href="/accounts"
            className="brand-btn mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>Open nick vault</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.01] border border-white/[0.04]">
          <h3 className="text-sm font-semibold text-white">No matching nicks</h3>
          <p className="mt-1 max-w-sm text-xs text-neutral-400">
            Try another search or clear the filters to see the whole team vault again.
          </p>
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilter("all");
              }}
              className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Clear search and filters
            </button>
          ) : null}
        </div>
      ) : viewMode === "list" ? (
        <ProfileTable
          profiles={filtered}
          localReadiness={localReadiness}
          runningProfileIds={runningProfileIds}
          onOpened={markProfileRunning}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((profile) => (
            <ProfileTile
              key={profile.id}
              profile={profile}
              localReadiness={localReadiness}
              isRunning={isProfileRunning(profile, runningProfileIds)}
              onOpened={() => markProfileRunning(profile.antidetectProfileId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
