"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, CircleCheck, CircleDashed, Info, MonitorCog } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import { PageHeading, PageShell } from "@/components/ui/page-section";
import type { SetupChecklist } from "@/lib/setup/setup-checklist";

export function OnboardingStepper({
  viewer,
  checklist,
  browserDownloadSection,
  relayDownloadSection,
}: {
  viewer: { userId: string; email: string; isAdmin: boolean };
  checklist: SetupChecklist;
  browserDownloadSection: ReactNode;
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
    <PageShell>
      <PageHeading
        title="Set up this Windows PC"
        description="Install → register → unlock"
        eyebrow="Three-step onboarding"
        icon={MonitorCog}
      />

      <nav aria-label="Windows PC setup progress" className="mb-6 grid gap-3 md:grid-cols-3">
        <StepButton
          number={1}
          active={activeStep === 1}
          title="Install MKT Browser"
          description="Browser + Relay"
          onClick={() => selectStep(1)}
        />
        <StepButton
          number={2}
          active={activeStep === 2}
          title="Register this PC"
          description="Confirm machine"
          onClick={() => selectStep(2)}
        />
        <StepButton
          number={3}
          active={activeStep === 3}
          title="Confirm handoff"
          description="Review readiness"
          onClick={() => selectStep(3)}
        />
      </nav>

      {activeStep === 1 ? (
        <div className="space-y-4">
          {browserDownloadSection}
          <details className="rounded-xl border border-white/[0.08] bg-white/[0.025]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-medium text-neutral-300 marker:content-none">
              Standalone Relay download for repair
            </summary>
            <div className="border-t border-white/[0.08] p-4">{relayDownloadSection}</div>
          </details>
          <div className="flex justify-end pt-1">
            <NextButton
              label="I installed MKT Browser - register this PC"
              onClick={() => selectStep(2)}
            />
          </div>
        </div>
      ) : null}

      {activeStep === 2 ? (
        <div id="register" className="scroll-mt-6 space-y-4">
          <RelayEnrollCard viewer={viewer} onDownloadRelay={() => selectStep(1)} />
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <BackButton label="Install MKT Browser" onClick={() => selectStep(1)} />
            <NextButton label="Review workspace handoff" onClick={() => selectStep(3)} />
          </div>
        </div>
      ) : null}

      {activeStep === 3 ? (
        <div id="handoff" className="scroll-mt-6 space-y-4">
          <WorkspaceSetupChecklist checklist={checklist} isAdmin={viewer.isAdmin} />

          <details className="rounded-xl border border-white/[0.08] bg-white/[0.025]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-neutral-300 marker:content-none">
              <Info size={16} className="text-sky-300" />
              Product boundary
            </summary>
            <p className="border-t border-white/[0.08] px-4 py-3 text-xs leading-5 text-neutral-400">
              MKT Browser is a local profile manager with proxy binding. Installing it does not
              establish unique fingerprints, identity isolation, or real-account safety.
            </p>
          </details>

          <div className="app-surface flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                  workspaceReady
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                }`}
              >
                {workspaceReady ? <CircleCheck size={19} /> : <CircleDashed size={19} />}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {workspaceReady ? "Workspace handoff recorded" : "Workspace handoff pending"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-neutral-400">
                  {workspaceReady
                    ? "This PC has the shared identity workspace information needed for handoff."
                    : "Finish the highlighted nick, proxy, owner, and Relay PC steps above."}
                </p>
              </div>
            </div>

            {workspaceReady ? (
              <Link
                href="/"
                className="brand-btn inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
              >
                Open workspace
                <ChevronRight size={16} />
              </Link>
            ) : (
              <BackButton label="Check this Relay PC" onClick={() => selectStep(2)} />
            )}
          </div>
        </div>
      ) : null}
    </PageShell>
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
      aria-current={active ? "step" : undefined}
      className={`flex min-h-20 items-center gap-3 rounded-xl border p-3.5 text-left ${
        active
          ? "border-amber-400/40 bg-amber-400/[0.08]"
          : "border-white/[0.08] bg-white/[0.025] hover:border-white/[0.14]"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
          active ? "bg-amber-400 text-neutral-950" : "bg-white/[0.06] text-neutral-400"
        }`}
      >
        {number}
      </span>
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-neutral-500">{description}</span>
      </span>
    </button>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.09] px-4 text-sm font-medium text-neutral-300 hover:bg-white/[0.05]"
    >
      <ArrowLeft size={15} />
      {label}
    </button>
  );
}

function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="brand-btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
    >
      {label}
      <ChevronRight size={16} />
    </button>
  );
}
