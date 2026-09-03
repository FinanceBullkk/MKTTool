"use client";

import Link from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import type { SetupChecklist } from "@/lib/setup/setup-checklist";

export function OnboardingStepper({
  viewer,
  checklist,
  relayDownloadSection,
}: {
  viewer: { userId: string; email: string; isAdmin: boolean };
  checklist: SetupChecklist;
  relayDownloadSection: ReactNode;
}) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const workspaceReady = checklist.handoff.nextStepId === null;

  function selectStep(step: 1 | 2 | 3) {
    setActiveStep(step);
    const targetId = step === 1 ? "download" : step === 2 ? "register" : "handoff";
    window.history.replaceState(null, "", `#${targetId}`);
    window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView());
  }

  return (
    <div className="mx-auto flex min-h-0 min-w-0 max-w-5xl flex-1 flex-col space-y-6 overflow-y-auto p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <span>⚙️</span>
          <span>Relay PC setup</span>
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Three steps connect this PC to the shared identity workspace: download Relay, register the
          PC, then receive nick and proxy assignments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StepButton
          number={1}
          active={activeStep === 1}
          title="Step 1: Download Relay"
          description="Install the current Relay package on this PC"
          onClick={() => selectStep(1)}
        />
        <StepButton
          number={2}
          active={activeStep === 2}
          title="Step 2: Register this Relay PC"
          description="Enroll the PC and request approval"
          onClick={() => selectStep(2)}
        />
        <StepButton
          number={3}
          active={activeStep === 3}
          title="Step 3: Receive nicks and proxies"
          description="Complete the shared vault handoff"
          onClick={() => selectStep(3)}
        />
      </div>

      {activeStep === 1 ? (
        <div className="space-y-4">
          {relayDownloadSection}
          <div className="flex justify-end pt-2">
            <NextButton label="Continue: Step 2" onClick={() => selectStep(2)} />
          </div>
        </div>
      ) : null}

      {activeStep === 2 ? (
        <div id="register" className="space-y-4 scroll-mt-6">
          <RelayEnrollCard viewer={viewer} onDownloadRelay={() => selectStep(1)} />
          <div className="flex items-center justify-between pt-2">
            <BackButton label="Back to Step 1" onClick={() => selectStep(1)} />
            <NextButton label="Continue: Step 3" onClick={() => selectStep(3)} />
          </div>
        </div>
      ) : null}

      {activeStep === 3 ? (
        <div id="handoff" className="space-y-4 scroll-mt-6">
          <WorkspaceSetupChecklist checklist={checklist} isAdmin={viewer.isAdmin} />

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 shrink-0 text-sky-300" size={18} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">MKT Browser is outside this setup</h4>
                <p className="text-[11px] leading-relaxed text-neutral-300">
                  MKT Browser is not distributed from this page and is not required to download
                  Relay, register a Relay PC, or receive nick and proxy assignments. It remains in
                  the separate Browser rollout lane, with no identity-isolation approval implied.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-lg text-emerald-400">
                🚀
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">
                  {workspaceReady
                    ? "Workspace handoff checks recorded"
                    : "Workspace handoff is still pending"}
                </h4>
                <p className="text-[11px] text-neutral-400">
                  {workspaceReady
                    ? "The shared identity workspace is ready for handoff."
                    : "Finish the highlighted nick, proxy, owner, and Relay PC handoff steps."}
                </p>
              </div>
            </div>

            {workspaceReady ? (
              <Link
                href="/"
                className="brand-btn inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white"
              >
                <span>Open Dashboard</span>
                <ChevronRight size={14} />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepButton({
  number,
  active,
  title,
  description,
  onClick,
}: {
  number: number;
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
        active
          ? "border-purple-500/40 bg-purple-950/30 shadow-lg shadow-purple-500/10"
          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
      }`}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${
          active
            ? "bg-purple-500 text-white shadow-md shadow-purple-500/40"
            : "bg-white/[0.06] text-neutral-400"
        }`}
      >
        {number}
      </div>
      <div>
        <div className="text-xs font-bold text-white">{title}</div>
        <div className="text-[11px] text-neutral-400">{description}</div>
      </div>
    </button>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-white/[0.05] px-4 py-2 text-xs font-medium text-neutral-400 transition hover:bg-white/[0.1] hover:text-white"
    >
      ← {label}
    </button>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white/[0.05] px-4 py-2 text-xs font-medium text-white transition hover:bg-white/[0.1]"
    >
      <span>{label}</span>
      <ChevronRight size={14} />
    </button>
  );
}
