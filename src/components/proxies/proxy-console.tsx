"use client";

import Link from "next/link";
import { Gauge, Link2, Plus, Search, Server, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Flag } from "@/components/mktbrowser-ui/Atoms";
import { InlineDisclosure } from "@/components/ui/inline-disclosure";
import { Card, DataTable, EmptyState, PageHeading, PageShell } from "@/components/ui/page-section";
import { SummaryMetric } from "@/components/ui/summary-metric";
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
      <PageHeading
        title="Proxy vault"
        description="Assignment, availability, and measured network health"
        eyebrow="Network inventory"
        icon={Server}
        action={
          isAdmin ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="brand-btn inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <Plus size={17} strokeWidth={2.25} />
            Add proxy
          </button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric icon={Server} label="Total proxies" value={counts.all} />
        <SummaryMetric icon={Link2} label="Assigned" value={counts.active} />
        <SummaryMetric
          icon={TriangleAlert}
          label="Needs attention"
          value={counts.error}
          tone={counts.error > 0 ? "danger" : "success"}
        />
      </div>

      <Card
        title={`Proxy inventory - ${filtered.length}`}
        description="Search or filter first; checks and paid speed tests stay with each endpoint."
        icon={Gauge}
      >
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
          <EmptyState
            title={proxies.length > 0 ? "No matching proxies" : "No proxies in the vault"}
            icon={Search}
          >
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
          <DataTable headers={["Proxy", "Assignment", "Network health", "Action"]}>
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
                          <span className="mt-1 block text-sm text-neutral-400">
                            {proxy.country}
                          </span>
                          <InlineDisclosure summary="Connection details" className="mt-1">
                            <div className="space-y-1.5">
                              <code className="block break-all font-mono text-xs text-neutral-300">
                                {proxy.host}:{proxy.port}
                              </code>
                              <p className="text-xs uppercase tracking-wide text-neutral-600">
                                {proxy.protocol} / {proxy.type}
                              </p>
                            </div>
                          </InlineDisclosure>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-top">
                      {proxy.account ? (
                        <>
                          <span className="block font-medium text-neutral-200">
                            {proxy.account.username}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-wide text-neutral-400">
                            {proxy.account.platform}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-neutral-500">Not assigned</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 align-top">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-neutral-500">Availability</p>
                          <ProxyLastCheckCell
                            verdict={proxy.lastCheckVerdict}
                            checkedAt={proxy.lastCheckedAt}
                            exitIp={proxy.lastExitIp}
                          />
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-neutral-500">Speed</p>
                          <ProxySpeedCell
                            measuredAt={proxy.lastSpeedAt}
                            mbps={proxy.lastSpeedMbps}
                            detail={proxy.lastSpeedDetail}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 align-top">
                      <div className="flex flex-wrap items-start gap-2">
                        <CheckOneProxyButton proxyId={proxy.id} />
                        <Link
                          href={`/proxies/${proxy.id}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-neutral-300 hover:bg-white/[0.06]"
                        >
                          {isAdmin ? "Edit" : "View"}
                        </Link>
                      </div>
                      {isAdmin ? (
                        <InlineDisclosure summary="Speed test" className="mt-1">
                          <MeasureProxySpeedButton proxyId={proxy.id} />
                        </InlineDisclosure>
                      ) : null}
                    </td>
              </tr>
            ))}
          </DataTable>
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
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${
        active
          ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
          : "border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
      <span className="font-mono text-xs text-neutral-500">{count}</span>
    </button>
  );
}
