"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, MoreHorizontal, Loader2 } from "lucide-react";
import { Avatar, Flag } from "./Atoms";
import { pingRelay, sendTicketToRelay } from "@/lib/relay/relay-browser-client";
import { RELAY_PROFILE_WORK_TIMEOUT_MS } from "@/lib/relay/relay-endpoints";
import {
  describeProfileLaunchFailure,
  describeProfileTicketFailure,
  profileLaunchReadiness,
  safeProxyPresentation,
  type LocalLaunchReadiness,
} from "@/lib/relay/profile-launch-readiness";

export interface ProfileItemData {
  id: string;
  username: string;
  platform: string;
  status: string;
  coldStartUntil: string | null;
  coldStartDaysRemaining: number;
  voice: string | null;
  contentAngle: string | null;
  notes: string | null;
  firstLoginAt: string | null;
  antidetectProfileId: string | null;
  owner: {
    email: string;
  } | null;
  device: {
    id: string;
    name: string;
    userId: string;
  } | null;
  proxy: {
    id: string;
    label: string;
    host: string;
    port: number;
    country: string;
    type: string;
    lastExitIp: string | null;
    lastCheckVerdict: string | null;
  } | null;
}

const EMOJIS = ["💬", "🎲", "🛍️", "💄", "🤖", "📱", "🎬", "✨", "🔥", "☕", "🎮", "🍔"];

function getEmojiForProfile(id: string, name: string): string {
  let hash = 0;
  const str = id + name;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return EMOJIS[Math.abs(hash) % EMOJIS.length];
}

export function ProfileTile({
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
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const emoji = getEmojiForProfile(profile.id, profile.username);
  const isCold = profile.coldStartDaysRemaining > 0;
  const isDead = profile.status === "DEAD";
  const isCheckpoint = profile.status === "CHECKPOINT" || profile.status === "SHADOWBANNED";

  // State
  let tileState: "running" | "idle" | "error" = isRunning ? "running" : "idle";
  if (isCheckpoint || isDead) tileState = "error";

  const glowShadow =
    tileState === "running"
      ? "0 0 32px rgba(16, 185, 129, 0.18), inset 0 0 0 1px rgba(16, 185, 129, 0.3)"
      : tileState === "error"
      ? "0 0 32px rgba(239, 68, 68, 0.15), inset 0 0 0 1px rgba(239, 68, 68, 0.3)"
      : "0 24px 48px -16px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)";

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
  const shortId = profile.id.slice(0, 8);

  async function handleToggleLaunch() {
    if (busy || !canLaunch) return;
    void pingRelay();
    setBusy(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/accounts/${profile.id}/launch`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message?: string; ticket?: string };

      if (!body.ok || !body.ticket) {
        setFeedback({
          kind: "error",
          text: describeProfileTicketFailure(response.status, body.message),
        });
        return;
      }

      const sent = await sendTicketToRelay(body.ticket, RELAY_PROFILE_WORK_TIMEOUT_MS);
      if (sent.status === "ok") {
        onOpened();
        setFeedback({ kind: "ok", text: "Browser profile opened on this Relay PC." });
        return;
      }

      setFeedback({
        kind: "error",
        text: describeProfileLaunchFailure(sent),
      });
    } catch {
      setFeedback({
        kind: "error",
        text: "Could not send the browser profile launch request to Relay.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col justify-between p-4 rounded-[18px] transition-all relative group"
      style={{
        background: "rgba(255, 255, 255, 0.025)",
        boxShadow: glowShadow,
        backdropFilter: "blur(20px)",
      }}
    >
      {/* 1. Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar emoji={emoji} size={40} accent={isRunning} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/accounts/${profile.id}`}
                className="font-bold text-[14px] text-white hover:text-purple-300 transition-colors truncate"
              >
                {profile.platform === "TIKTOK" ? "TIKTOK" : profile.platform} — {profile.username}
              </Link>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                MANAGED
              </span>
            </div>
            <span className="font-mono text-[11px] text-neutral-400 mt-0.5">{shortId}</span>
          </div>
        </div>

        {/* Status Pill */}
        {isRunning ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Open on this Relay PC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.04] text-neutral-400">
            Not open on this Relay PC
          </span>
        )}
      </div>

      {/* 2. Tags Row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-mono text-neutral-400">
          mkttool
        </span>
        {profile.voice ? (
          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300">
            {profile.voice}
          </span>
        ) : null}
        {isCold ? (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
            Warmup ({profile.coldStartDaysRemaining}d)
          </span>
        ) : null}
      </div>

      {/* 3. Proxy Section */}
      <div className="rounded-xl bg-black/40 border border-white/[0.04] p-2.5 mb-3">
        {profile.proxy ? (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Flag country={profile.proxy.country} />
              <span className="font-medium text-neutral-200">
                {proxyPresentation?.label}
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400 font-mono">
              {proxyPresentation?.status}
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  proxyPresentation?.healthy ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>Proxy not assigned</span>
            <span className="font-mono text-[11px]">Blocked</span>
          </div>
        )}
      </div>

      {/* 4. Owner & Relay PC */}
      <div className="mb-3 grid gap-1 px-1 text-[11px] text-neutral-400">
        <span className="truncate" title={profile.owner?.email ?? undefined}>
          Owner: {profile.owner?.email ?? "not assigned"}
        </span>
        <span className="truncate" title={profile.device?.name ?? undefined}>
          Relay PC: {profile.device?.name ?? "not assigned"}
        </span>
        <span>{profile.notes ? `📝 ${profile.notes}` : "No notes"}</span>
      </div>

      {/* 5. Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !canLaunch}
          onClick={handleToggleLaunch}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            isRunning
              ? "bg-neutral-800 border border-neutral-700 text-neutral-200 hover:bg-neutral-700"
              : canLaunch
              ? "bg-purple-950/40 border border-purple-500/40 text-purple-200 hover:bg-purple-900/60 hover:border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
              : "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed opacity-50"
          }`}
        >
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Opening browser...</span>
            </>
          ) : isRunning ? (
            <span>Open on this Relay PC</span>
          ) : (
            <>
              <Play size={12} fill="currentColor" />
              <span>Open browser profile</span>
            </>
          )}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Options"
          >
            <MoreHorizontal size={15} />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 bottom-full mb-2 w-48 rounded-xl bg-[#12141c] border border-white/[0.1] shadow-2xl p-1 z-30 flex flex-col gap-0.5 text-xs text-neutral-300">
              <Link
                href={`/accounts/${profile.id}`}
                className="px-3 py-2 rounded-lg hover:bg-white/[0.06] hover:text-white flex items-center gap-2 transition"
              >
                <span>🔑</span>
                <span>View password and TOTP</span>
              </Link>
              <Link
                href={`/accounts/${profile.id}`}
                className="px-3 py-2 rounded-lg hover:bg-white/[0.06] hover:text-white flex items-center gap-2 transition"
              >
                <span>⚙️</span>
                <span>Nick and proxy settings</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(profile.id);
                  setMenuOpen(false);
                  setFeedback({ kind: "ok", text: "Nick ID copied to the clipboard." });
                }}
                className="px-3 py-2 rounded-lg hover:bg-white/[0.06] hover:text-white flex items-center gap-2 text-left transition cursor-pointer"
              >
                <span>📋</span>
                <span>Copy nick ID ({profile.id.slice(0, 8)})</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!canLaunch && !busy ? (
        <div className="mt-2.5 rounded-lg border border-amber-500/20 bg-amber-950/30 p-2 text-[11px] text-amber-200">
          {launchReadiness.message}
        </div>
      ) : null}

      {/* Feedback Alert */}
      {feedback ? (
        <div
          className={`mt-2.5 p-2 rounded-lg text-[11px] flex items-center justify-between ${
            feedback.kind === "ok"
              ? "bg-emerald-950/60 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/60 border border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-white ml-2">
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
