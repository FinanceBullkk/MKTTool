"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, MoreHorizontal, Loader2 } from "lucide-react";
import { Avatar, Flag } from "./Atoms";
import type { ProfileItemData } from "./ProfileTile";
import { pingRelay, sendTicketToRelay } from "@/lib/relay/relay-browser-client";
import { RELAY_PROFILE_WORK_TIMEOUT_MS } from "@/lib/relay/relay-endpoints";
import {
  describeProfileLaunchFailure,
  describeProfileTicketFailure,
  profileLaunchReadiness,
  safeProxyPresentation,
  type LocalLaunchReadiness,
} from "@/lib/relay/profile-launch-readiness";

export function ProfileTable({
  profiles,
  localReadiness,
  runningProfileIds,
  onOpened,
}: {
  profiles: ProfileItemData[];
  localReadiness: LocalLaunchReadiness;
  runningProfileIds: ReadonlySet<string>;
  onOpened: (profileId: string | null) => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-neutral-400 font-mono">
              <th scope="col" className="py-3 px-4">Nick</th>
              <th scope="col" className="py-3 px-4">Status</th>
              <th scope="col" className="py-3 px-4">Tags & niche</th>
              <th scope="col" className="py-3 px-4">Proxy</th>
              <th scope="col" className="py-3 px-4">Owner</th>
              <th scope="col" className="py-3 px-4">Relay PC</th>
              <th scope="col" className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-sm">
            {profiles.map((profile) => (
              <ProfileTableRow
                key={profile.id}
                profile={profile}
                localReadiness={localReadiness}
                isRunning={Boolean(
                  profile.antidetectProfileId &&
                    runningProfileIds.has(profile.antidetectProfileId)
                )}
                onOpened={() => onOpened(profile.antidetectProfileId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileTableRow({
  profile,
  localReadiness,
  isRunning,
  onOpened,
}: {
  profile: ProfileItemData;
  localReadiness: LocalLaunchReadiness;
  isRunning: boolean;
  onOpened: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const isCold = profile.coldStartDaysRemaining > 0;
  const launchReadiness = profileLaunchReadiness(
    {
      status: profile.status,
      antidetectProfileId: profile.antidetectProfileId,
      device: profile.device,
      proxy: profile.proxy,
      isRunning,
    },
    localReadiness,
  );
  const canLaunch = launchReadiness.ready;
  const proxyPresentation = profile.proxy ? safeProxyPresentation(profile.proxy) : null;

  async function handleToggleLaunch() {
    if (busy || !canLaunch) return;
    void pingRelay();
    setBusy(true);

    try {
      const response = await fetch(`/api/accounts/${profile.id}/launch`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message?: string; ticket?: string };

      if (!body.ok || !body.ticket) {
        alert(describeProfileTicketFailure(response.status, body.message));
        return;
      }

      const sent = await sendTicketToRelay(body.ticket, RELAY_PROFILE_WORK_TIMEOUT_MS);
      if (sent.status === "ok") {
        onOpened();
        return;
      }

      alert(describeProfileLaunchFailure(sent));
    } catch {
      alert("Could not send the browser profile launch request to Relay.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-white/[0.03] transition-colors group">
      {/* 1. Profile & Name */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Avatar emoji="🎬" size={32} accent={isRunning} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/accounts/${profile.id}`}
                className="font-bold text-white hover:text-purple-300 transition truncate text-[13px]"
              >
                {profile.platform} — {profile.username}
              </Link>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold font-mono tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                MANAGED
              </span>
            </div>
            <span className="font-mono text-[10px] text-neutral-400">{profile.id.slice(0, 8)}</span>
          </div>
        </div>
      </td>

      {/* 2. Status */}
      <td className="py-3 px-4">
        {isRunning ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Open on this Relay PC
          </span>
        ) : isCold ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Warmup ({profile.coldStartDaysRemaining}d)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/[0.04] text-neutral-400">
            Not open on this Relay PC
          </span>
        )}
      </td>

      {/* 3. Tags & Voice */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-neutral-400 border border-white/[0.06]">
            mkttool
          </span>
          {profile.voice ? (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-[10px] text-purple-300 border border-purple-500/20">
              {profile.voice}
            </span>
          ) : null}
        </div>
      </td>

      {/* 4. Proxy */}
      <td className="py-3 px-4">
        {profile.proxy ? (
          <div className="flex items-center gap-2">
            <Flag country={profile.proxy.country} />
            <span className="text-xs text-neutral-300">{proxyPresentation?.label}</span>
            <span className="text-[10px] text-neutral-500">{proxyPresentation?.status}</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                proxyPresentation?.healthy ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
          </div>
        ) : (
          <span className="text-xs text-neutral-400">Proxy not assigned</span>
        )}
      </td>

      {/* 5. Owner */}
      <td className="py-3 px-4 text-xs text-neutral-400">
        <span>{profile.owner?.email ?? "Owner not assigned"}</span>
      </td>

      {/* 6. Device */}
      <td className="py-3 px-4 text-xs text-neutral-400">
        <span>{profile.device?.name || "Relay PC not assigned"}</span>
      </td>

      {/* 7. Action */}
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy || !canLaunch}
            onClick={handleToggleLaunch}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
              isRunning
                ? "bg-neutral-800 border border-neutral-700 text-neutral-200"
                : canLaunch
                ? "bg-purple-950/40 border border-purple-500/40 text-purple-200 hover:bg-purple-900/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                : "bg-neutral-900 border border-neutral-800 text-neutral-600 opacity-50 cursor-not-allowed"
            }`}
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isRunning ? (
              <span>Open on this Relay PC</span>
            ) : (
              <>
                <Play size={10} fill="currentColor" />
                <span>Open browser profile</span>
              </>
            )}
          </button>

          <Link
            href={`/accounts/${profile.id}`}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:text-white transition"
          >
            <MoreHorizontal size={13} />
          </Link>
        </div>
        {!canLaunch && !busy ? (
          <div className="mt-1.5 max-w-xs text-[10px] leading-4 text-amber-300">
            {launchReadiness.message}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
