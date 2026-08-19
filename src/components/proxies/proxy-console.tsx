"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Flag, Kbd } from "@/components/mktbrowser-ui/Atoms";
import { NewProxySheet } from "./new-proxy-sheet";
import { CheckAllProxiesButton, CheckOneProxyButton } from "./proxy-check-controls";
import { MeasureProxySpeedButton } from "./proxy-speed-controls";
import { ProxyLastCheckCell } from "./proxy-last-check-cell";
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
  account: {
    username: string;
    platform: string;
  } | null;
}

export function ProxyConsole({
  proxies,
  isAdmin,
}: {
  proxies: ProxyItemData[];
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "unassigned" | "error">("all");
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => {
    return {
      all: proxies.length,
      active: proxies.filter((p) => p.account !== null).length,
      unassigned: proxies.filter((p) => p.account === null).length,
      error: proxies.filter((p) => p.lastCheckVerdict === "DEAD").length,
    };
  }, [proxies]);

  const filtered = useMemo(() => {
    return proxies.filter((p) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchLabel = p.label.toLowerCase().includes(q);
        const matchHost = p.host.toLowerCase().includes(q);
        const matchCountry = p.country.toLowerCase().includes(q);
        const matchAccount = (p.account?.username || "").toLowerCase().includes(q);
        if (!matchLabel && !matchHost && !matchCountry && !matchAccount) return false;
      }

      if (filter === "active") return p.account !== null;
      if (filter === "unassigned") return p.account === null;
      if (filter === "error") return p.lastCheckVerdict === "DEAD";

      return true;
    });
  }, [proxies, search, filter]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 p-6 overflow-y-auto max-w-6xl mx-auto w-full">
      {/* 1. Header Row */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl font-bold text-white tracking-tight">Proxies & Network</h1>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
            <span>{proxies.length} total</span>
            <span>·</span>
            <span>{counts.unassigned} unassigned</span>
            <span>·</span>
            <span className="text-emerald-400">{counts.active} active</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && proxies.length > 0 ? (
            <CheckAllProxiesButton count={proxies.length} />
          ) : null}

          {isAdmin ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="brand-btn px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-500/25"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Thêm Proxy</span>
              <Kbd>⌘ N</Kbd>
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Filter & Search Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              filter === "all"
                ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                : "bg-white/[0.02] border border-white/[0.04] text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span>Tất cả</span>
            <span className="font-mono text-[11px] text-neutral-500">{counts.all}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("unassigned")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              filter === "unassigned"
                ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                : "bg-white/[0.02] border border-white/[0.04] text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Chưa gắn Profile</span>
            <span className="font-mono text-[11px] text-neutral-500">{counts.unassigned}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              filter === "active"
                ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                : "bg-white/[0.02] border border-white/[0.04] text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Đang gắn Profile</span>
            <span className="font-mono text-[11px] text-neutral-500">{counts.active}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("error")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              filter === "error"
                ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                : "bg-white/[0.02] border border-white/[0.04] text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Hỏng / Chết</span>
            <span className="font-mono text-[11px] text-neutral-500">{counts.error}</span>
          </button>
        </div>

        {/* Quick Search */}
        <div className="w-full sm:w-64">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/40 transition">
            <Search size={13} className="text-neutral-500 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo IP, nhãn, quốc gia…"
              className="flex-1 bg-transparent text-xs text-white placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. Glass Table */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.01] border border-white/[0.04]">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-2xl mb-3">
            🌐
          </div>
          <h3 className="text-sm font-semibold text-white">Chưa có proxy nào phù hợp</h3>
          <p className="mt-1 text-xs text-neutral-400 max-w-sm">
            Bấm nút <strong>&quot;Thêm Proxy&quot;</strong> để nạp IP tĩnh 4G Mobile hoặc Dân cư cho dàn tài khoản.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-neutral-500 font-mono">
                  <th className="py-3 px-4">Nhãn & IP</th>
                  <th className="py-3 px-4">Giao thức & Loại</th>
                  <th className="py-3 px-4">Profile Đang Gắn</th>
                  <th className="py-3 px-4">Lần kiểm gần nhất</th>
                  <th className="py-3 px-4">Tốc độ</th>
                  <th className="py-3 px-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-sm">
                {filtered.map((proxy) => (
                  <tr key={proxy.id} className="hover:bg-white/[0.03] transition-colors group">
                    {/* 1. Label & IP */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Flag country={proxy.country} />
                        <div className="flex flex-col">
                          <Link
                            href={`/proxies/${proxy.id}`}
                            className="font-bold text-white hover:text-purple-300 transition text-[13px]"
                          >
                            {proxy.label}
                          </Link>
                          <span className="font-mono text-xs text-neutral-400 mt-0.5">
                            {proxy.host}:{proxy.port}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Protocol & Type */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-neutral-300 uppercase">
                          {proxy.protocol}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[11px] font-medium text-purple-300">
                          {proxy.type}
                        </span>
                      </div>
                    </td>

                    {/* 3. Assigned Profile */}
                    <td className="py-3 px-4">
                      {proxy.account ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs">🎬</span>
                          <span className="font-medium text-neutral-200 text-xs">
                            {proxy.account.platform} / {proxy.account.username}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-400">
                          chưa gắn
                        </span>
                      )}
                    </td>

                    {/* 4. Last Check */}
                    <td className="py-3 px-4">
                      <ProxyLastCheckCell
                        verdict={proxy.lastCheckVerdict}
                        checkedAt={proxy.lastCheckedAt}
                        exitIp={proxy.lastExitIp}
                      />
                    </td>

                    {/* 5. Speed */}
                    <td className="py-3 px-4">
                      <ProxySpeedCell
                        measuredAt={proxy.lastSpeedAt}
                        mbps={proxy.lastSpeedMbps}
                        detail={proxy.lastSpeedDetail}
                      />
                    </td>

                    {/* 6. Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <CheckOneProxyButton proxyId={proxy.id} />
                        {isAdmin ? <MeasureProxySpeedButton proxyId={proxy.id} /> : null}
                        <Link
                          href={`/proxies/${proxy.id}`}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
                        >
                          {isAdmin ? "Sửa" : "Xem"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. New Proxy Sheet */}
      <NewProxySheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
