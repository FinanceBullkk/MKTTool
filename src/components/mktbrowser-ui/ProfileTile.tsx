"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, Loader2, MoreHorizontal, Play, Settings2, X } from "lucide-react";
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

  const isCold = profile.coldStartDaysRemaining > 0;
  const isDead = profile.status === "DEAD";
  const isCheckpoint = profile.status === "CHECKPOINT" || profile.status === "SHADOWBANNED";

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
  const canLaunch = launchReadiness.ready && !isRunning;
  const proxyPresentation = profile.proxy ? safeProxyPresentation(profile.proxy) : null;
  const localSetupStates = new Set([
    "checking",
    "relay-offline",
    "relay-permission",
    "relay-outdated",
    "relay-unconfigured",
    "relay-rejected",
    "device-unverified",
    "browser-offline",
    "engine-not-ready",
    "engine-unavailable",
    "contract-mismatch",
    "capability-missing",
    "profile-state-unknown",
    "recovery-pending",
  ]);
  const recoveryHref = localSetupStates.has(launchReadiness.state)
    ? "/setup"
    : `/accounts/${profile.id}`;
  const recoveryLabel = recoveryHref === "/setup" ? "Open setup" : "Resolve nick setup";
  const primaryState = isRunning
    ? { label: "Open on this Relay PC", className: "bg-emerald-500/10 text-emerald-300" }
    : isCheckpoint || isDead
      ? { label: "Action needed", className: "bg-red-500/10 text-red-300" }
      : !launchReadiness.ready
        ? { label: "Setup needed", className: "bg-amber-500/10 text-amber-200" }
        : isCold
          ? { label: "Cold-start", className: "bg-amber-500/10 text-amber-200" }
          : { label: "Ready to open", className: "bg-white/[0.06] text-neutral-200" };

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
    <article className="app-surface relative flex min-w-0 flex-col rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar label={profile.platform} size={42} accent={isRunning} />
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
              {profile.platform}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/accounts/${profile.id}`}
                className="truncate text-base font-semibold text-white transition-colors hover:text-amber-200"
              >
                {profile.username}
              </Link>
            </div>
            <p className="mt-0.5 truncate text-xs text-neutral-500">
              {profile.voice || profile.contentAngle || "No writing voice recorded"}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${primaryState.className}`}>
          {primaryState.label}
        </span>
      </div>

      <div className="mt-5 grid gap-4 border-y border-white/[0.07] py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-neutral-500">Nick owner</p>
          <p className="mt-1 truncate text-neutral-200" title={profile.owner?.email ?? undefined}>
            {profile.owner?.email ?? "Not assigned"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Relay PC</p>
          <p className="mt-1 truncate text-neutral-200" title={profile.device?.name ?? undefined}>
            {profile.device?.name ?? "Not assigned"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex min-h-8 items-center justify-between gap-3 text-sm">
        <span className="text-xs text-neutral-500">Assigned proxy</span>
        {profile.proxy ? (
          <div className="flex items-center gap-2 text-right">
            <Flag country={profile.proxy.country} />
            <span className="text-neutral-200">{proxyPresentation?.label}</span>
            <span className="text-xs text-neutral-500">{proxyPresentation?.status}</span>
          </div>
        ) : (
          <span className="text-amber-200">Not assigned</span>
        )}
      </div>

      {!launchReadiness.ready && !isRunning ? (
        <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2.5 text-[13px] leading-5 text-amber-100">
          {launchReadiness.message}
        </div>
      ) : isCold ? (
        <p className="mt-4 text-xs text-neutral-500">
          {profile.coldStartDaysRemaining} cold-start days remaining. Opening the browser profile is
          still allowed; posting remains unavailable.
        </p>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-5">
        {canLaunch ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleToggleLaunch}
            className="brand-btn flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Opening…</span>
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                <span>Open browser profile</span>
              </>
            )}
          </button>
        ) : (
          <Link
            href={isRunning ? `/accounts/${profile.id}` : recoveryHref}
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
          >
            {isRunning ? "View nick details" : recoveryLabel}
          </Link>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label={`More actions for ${profile.username}`}
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={17} />
          </button>

          {menuOpen ? (
            <div className="absolute bottom-full right-0 z-30 mb-2 flex w-60 flex-col gap-0.5 rounded-xl border border-white/[0.12] bg-[#171a20] p-1.5 text-sm text-neutral-300 shadow-2xl">
              <Link
                href={`/accounts/${profile.id}`}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <KeyRound size={15} />
                <span>View password and TOTP</span>
              </Link>
              <Link
                href={`/accounts/${profile.id}`}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <Settings2 size={15} />
                <span>Nick and proxy settings</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(profile.id);
                  setMenuOpen(false);
                  setFeedback({ kind: "ok", text: "Nick ID copied to the clipboard." });
                }}
                className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-left transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <Copy size={15} />
                <span>Copy nick ID ({profile.id.slice(0, 8)})</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 flex items-center justify-between rounded-lg border p-2.5 text-xs ${
            feedback.kind === "ok"
              ? "border-emerald-500/25 bg-emerald-950/50 text-emerald-300"
              : "border-red-500/25 bg-red-950/50 text-red-300"
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/[0.06] hover:text-white"
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </article>
  );
}
