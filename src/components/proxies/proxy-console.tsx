"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Flag } from "@/components/mktbrowser-ui/Atoms";
import { Card, EmptyState, PageHeading, PageShell } from "@/components/ui/page-section";
import { CheckAllProxiesButton, CheckOneProxyButton } from "./proxy-check-controls";
import { MeasureProxySpeedButton } from "./proxy-speed-controls";
import { ProxyLastCheckCell } from "./proxy-last-check-cell";
import { NewProxySheet } from "./new-proxy-sheet";
import { ProxySpeedCell } from "./proxy-speed-cell";

export interface ProxyItemData {
  id: string;
  label: string;
  host: string;
  port: number;
  protocol: string;
  country: string;
  type: string;
  username: string;
  lastCheckVerdict: string | null;
  lastCheckedAt: Date | null;
  lastExitIp: string | null;
  lastSpeedMbps: number | null;
  lastSpeedAt: Date | null;
  lastSpeedDetail: string | null;
  account: { username: string; platform: string } | null;
}

type ProxyFilter = "all" | "active" | "unassigned" | "error";

export function ProxyConsole({
  proxies,
  isAdmin,
  adminContactEmail,
}: {
  proxies: ProxyItemData[];
  isAdmin: boolean;
  adminContactEmail: string;
}) {
  const [filter, setFilter] = useState<ProxyFilter>("all");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(
    () => ({
      all: proxies.length,
      active: proxies.filter((proxy) => proxy.account !== null).length,
      unassigned: proxies.filter((proxy) => proxy.account === null).length,
      error: proxies.filter((proxy) => proxy.lastCheckVerdict === "DEAD").length,
    }),
    [proxies],
  );

  const filtered = useMemo(() => {
    return proxies.filter((proxy) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matches = [proxy.label, proxy.host, proxy.country, proxy.account?.username ?? ""].some(
          (value) => value.toLowerCase().includes(query),
        );
        if (!matches) return false;
      }

      if (filter === "active") return proxy.account !== null;
      if (filter === "unassigned") return proxy.account === null;
      if (filter === "error") return proxy.lastCheckVerdict === "DEAD";
      return true;
    });
  }, [filter, proxies, search]);

  const filterOptions: Array<{ id: ProxyFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.all },
    { id: "unassigned", label: "Unassigned", count: counts.unassigned },
    { id: "active", label: "Assigned", count: counts.active },
    { id: "error", label: "Unavailable", count: counts.error },
  ];

  return (
    <PageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeading
          title="Proxy vault"
          description="Monitor the dedicated proxy assigned to each browser-backed nick."
        />
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="brand-btn inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <Plus size={17} strokeWidth={2.25} />
            Add proxy
          </button>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric label="Total proxies" value={counts.all} />
        <SummaryMetric label="Assigned" value={counts.active} />
        <SummaryMetric
          label="Needs attention"
          value={counts.error}
          tone={counts.error > 0 ? "danger" : "default"}
        />
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.08] pb-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filterOptions.map((option) => (
                <FilterButton
                  key={option.id}
                  active={filter === option.id}
                  count={option.count}
                  label={option.label}
                  onClick={() => setFilter(option.id)}
                />
              ))}
            </div>

            <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.09] bg-black/10 px-3 focus-within:border-amber-400/50 lg:w-80">
              <Search size={16} className="shrink-0 text-neutral-500" />
              <span className="sr-only">Search proxies</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search label, IP, country, or nick"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
              />
            </label>
          </div>

          {isAdmin && proxies.length > 0 ? (
            <div className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.025] px-3 py-3">
              <p className="max-w-2xl text-xs leading-5 text-neutral-500">
                A health check confirms that each endpoint responds and changes the public IP.
              </p>
              <CheckAllProxiesButton count={proxies.length} compact />
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState>
            {proxies.length > 0 ? (
              "No proxy matches the current search and filter."
            ) : isAdmin ? (
              'Select "Add proxy" to prepare the first dedicated endpoint.'
            ) : (
              <>
                An administrator prepares and assigns proxies. Contact{" "}
                <a href={`mailto:${adminContactEmail}`} className="underline">
                  {adminContactEmail}
                </a>
                .
              </>
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <thead className="border-b border-white/[0.08] text-xs text-neutral-500">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Proxy</th>
                  <th className="pb-3 pr-4 font-medium">Assignment</th>
                  <th className="pb-3 pr-4 font-medium">Health</th>
                  <th className="pb-3 pr-4 font-medium">Speed</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {filtered.map((proxy) => (
                  <tr key={proxy.id}>
                    <td className="py-4 pr-4 align-top">
                      <div className="flex items-start gap-3">
                        <Flag country={proxy.country} />
                        <div>
                          <Link
                            href={`/proxies/${proxy.id}`}
                            className="font-semibold text-white hover:text-amber-300"
                          >
                            {proxy.label}
                          </Link>
                          <span className="mt-1 block font-mono text-xs text-neutral-500">
                            {proxy.host}:{proxy.port}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-wide text-neutral-600">
                            {proxy.protocol} / {proxy.type}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-top">
                      {proxy.account ? (
                        <>
                          <span className="block font-medium text-neutral-200">
                            {proxy.account.username}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-wide text-neutral-500">
                            {proxy.account.platform}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-neutral-500">Not assigned</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 align-top">
                      <ProxyLastCheckCell
                        verdict={proxy.lastCheckVerdict}
                        checkedAt={proxy.lastCheckedAt}
                        exitIp={proxy.lastExitIp}
                      />
                    </td>
                    <td className="py-4 pr-4 align-top">
                      <ProxySpeedCell
                        measuredAt={proxy.lastSpeedAt}
                        mbps={proxy.lastSpeedMbps}
                        detail={proxy.lastSpeedDetail}
                      />
                    </td>
                    <td className="py-4 align-top">
                      <div className="flex items-start gap-2">
                        <CheckOneProxyButton proxyId={proxy.id} />
                        <details className="relative">
                          <summary className="flex min-h-9 cursor-pointer list-none items-center rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:bg-neutral-800 marker:content-none">
                            More
                          </summary>
                          <div className="absolute right-0 z-20 mt-2 w-56 space-y-3 rounded-xl border border-white/10 bg-neutral-950 p-3 shadow-2xl">
                            {isAdmin ? <MeasureProxySpeedButton proxyId={proxy.id} /> : null}
                            <Link
                              href={`/proxies/${proxy.id}`}
                              className="flex min-h-9 items-center justify-center rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:bg-neutral-800"
                            >
                              {isAdmin ? "Edit proxy" : "View proxy"}
                            </Link>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewProxySheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />
    </PageShell>
  );
}

function FilterButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
        active
          ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
          : "border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
      <span className="font-mono text-[11px] text-neutral-500">{count}</span>
    </button>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="app-surface rounded-xl px-3 py-3 sm:px-4">
      <span className="text-[11px] font-medium leading-4 text-neutral-500 sm:text-xs">{label}</span>
      <strong
        className={`mt-1 block text-xl font-semibold sm:text-2xl ${
          tone === "danger" ? "text-red-300" : "text-white"
        }`}
      >
        {value}
      </strong>
    </div>
  );
}
