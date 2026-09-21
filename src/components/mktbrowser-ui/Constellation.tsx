"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { ProfileTile, type ProfileItemData } from "./ProfileTile";
import { WorkspaceStatusBoard } from "./workspace-status-board";
import {
  fetchRelayProfiles,
  pingRelay,
  refreshRelayLicenseCapacity,
} from "@/lib/relay/relay-browser-client";
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

interface FilterChip {
  id: ProfileListFilter;
  label: string;
}

const FILTERS: FilterChip[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Open" },
  { id: "warmup", label: "Cold-start" },
  { id: "error", label: "Attention" },
  { id: "idle", label: "Not open" },
];

export function Constellation({
  profiles,
  scopeNotice,
}: {
  profiles: ProfileItemData[];
  scopeNotice?: ReactNode;
}) {
  const [filter, setFilter] = useState<FilterChip["id"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [checkingLocal, setCheckingLocal] = useState(true);
  const [localReadiness, setLocalReadiness] = useState<LocalLaunchReadiness>(() =>
    currentRelayLaunchReadiness(null),
  );
  const [runningProfileIds, setRunningProfileIds] = useState<Set<string>>(() => new Set());
  const refreshSequence = useRef(0);
  const explicitRefreshInFlight = useRef(false);

  const refreshLocalState = useCallback(async (refreshCapacity = false) => {
    if (!refreshCapacity && explicitRefreshInFlight.current) return;
    const sequence = ++refreshSequence.current;
    if (refreshCapacity) explicitRefreshInFlight.current = true;
    setCheckingLocal(true);
    try {
      if (refreshCapacity) await refreshRelayLicenseCapacity();
      if (sequence !== refreshSequence.current) return;
      const [health, localProfiles] = await Promise.all([pingRelay(), fetchRelayProfiles()]);
      if (sequence !== refreshSequence.current) return;

      const inventory = localProfileInventorySnapshot(
        currentRelayLaunchReadiness(health),
        localProfiles,
      );
      setLocalReadiness(inventory.readiness);
      if (inventory.runningProfileIds) setRunningProfileIds(inventory.runningProfileIds);
    } finally {
      if (refreshCapacity) explicitRefreshInFlight.current = false;
      if (sequence === refreshSequence.current) setCheckingLocal(false);
    }
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
    <section className="min-w-0">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Home
          </p>
          <h1 className="text-pretty text-3xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
            Workspace overview
          </h1>
        </div>

        <Link
          href="/accounts"
          className="brand-btn inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <span>Nick vault</span>
          <ArrowRight size={16} />
        </Link>
      </header>

      <WorkspaceStatusBoard
        checking={checkingLocal}
        counts={counts}
        localReadiness={localReadiness}
        onRefresh={() => void refreshLocalState(true)}
      />

      {scopeNotice}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Nicks</h2>
        <p className="font-mono text-xs text-neutral-500">
          {filtered.length} of {profiles.length} shown
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
        <div className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/15 px-3 focus-within:border-amber-400/50">
          <Search size={16} className="shrink-0 text-neutral-500" />
          <input
            type="search"
            name="nick-search"
            autoComplete="off"
            spellCheck={false}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search nicks"
            placeholder="Search by username, owner, Relay PC, proxy, or notes…"
            className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-neutral-500 focus:outline-none sm:text-sm"
          />
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          {FILTERS.map((chip) => {
            const isActive = filter === chip.id;
            const count = counts[chip.id];

            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                aria-pressed={isActive}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                    : "border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200"
                }`}
              >
                <span>{chip.label}</span>
                <span className="font-mono text-[11px] text-neutral-500">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="app-surface rounded-2xl p-10 text-center">
          <h3 className="text-base font-semibold text-white">No nicks in the team vault</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
            Add the first shared nick record in the Nick vault. Browser profiles remain local data
            on their assigned Relay PCs.
          </p>
          <Link
            href="/accounts"
            className="brand-btn mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <span>Nick vault</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="app-surface rounded-2xl p-10 text-center">
          <h3 className="text-base font-semibold text-white">No matching nicks</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-400">
            Try another search or clear the filters to see the whole team vault again.
          </p>
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilter("all");
              }}
              className="mt-5 min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
            >
              Clear search and filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
    </section>
  );
}
