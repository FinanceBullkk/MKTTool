"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, MonitorCheck, Search, UsersRound } from "lucide-react";
import { ProfileTile, type ProfileItemData } from "./ProfileTile";
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
    <section className="min-w-0">
      <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            Home
          </p>
          <h1 className="text-pretty text-3xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-4xl">
            Workspace overview
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-6 text-neutral-400">
            Check this Relay PC, find the nick you need, and resolve blockers before opening a
            browser profile. Shared records are managed in the Nick vault.
          </p>
        </div>

        <Link
          href="/accounts"
          className="brand-btn inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-semibold lg:self-auto"
        >
          <span>Manage nick vault</span>
          <ArrowRight size={16} />
        </Link>
      </header>

      <div className="app-surface mb-6 grid grid-cols-3 overflow-hidden rounded-2xl">
        <OverviewMetric
          icon={<UsersRound size={18} />}
          value={profiles.length}
          label={profiles.length === 1 ? "Nick in the vault" : "Nicks in the vault"}
        />
        <OverviewMetric icon={<Clock3 size={18} />} value={counts.warmup} label="In cold-start" />
        <OverviewMetric
          icon={<MonitorCheck size={18} />}
          value={counts.running}
          label="Open on this Relay PC"
        />
      </div>

      {scopeNotice}

      <div
        className="mb-7 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              localReadiness.ready ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <div>
            <p className="font-medium text-neutral-100">This Relay PC</p>
            <p className="mt-0.5 text-[13px] leading-5 text-neutral-400">
              {checkingLocal && localReadiness.state === "checking"
                ? "Checking local browser profile conditions…"
                : localReadiness.message}
            </p>
          </div>
        </div>
        {!localReadiness.ready ? (
          <button
            type="button"
            disabled={checkingLocal}
            onClick={() => void refreshLocalState()}
            className="min-h-10 shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-sm text-neutral-200 transition-colors hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50"
          >
            {checkingLocal ? "Checking…" : "Check again"}
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Nick activity</h2>
          <p className="mt-1 text-sm text-neutral-400">
            One primary state and one next action for each nick.
          </p>
        </div>
        <p className="font-mono text-xs text-neutral-500">
          {filtered.length} of {profiles.length} shown
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
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
                className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
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
            <span>Manage nick vault</span>
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

function OverviewMetric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-start gap-2 border-r border-white/[0.07] px-3 py-3 last:border-r-0 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4">
      <span className="text-amber-300">{icon}</span>
      <div>
        <p className="font-mono text-xl font-semibold text-white">{value}</p>
        <p className="text-[11px] leading-4 text-neutral-500 sm:text-xs">{label}</p>
      </div>
    </div>
  );
}
