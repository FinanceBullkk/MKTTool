import Link from "next/link";
import { Check, ChevronRight, CircleDashed, Info } from "lucide-react";
import { Card, Disclosure, StatusBadge } from "@/components/ui/page-section";
import type {
  SetupChecklist,
  SetupChecklistSection,
  SetupStep,
} from "@/lib/setup/setup-checklist";

const STATE_BADGE: Record<SetupStep["state"], { label: string; className: string }> = {
  done: {
    label: "Done",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  partial: {
    label: "In progress",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  todo: {
    label: "Not started",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

function ChecklistSection({
  section,
  isAdmin,
  headingId,
  title,
  completeMessage,
  pendingMessage,
}: {
  section: SetupChecklistSection;
  isAdmin: boolean;
  headingId: string;
  title: string;
  completeMessage: React.ReactNode;
  pendingMessage: string;
}) {
  const { steps, nextStepId, doneCount } = section;

  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <Card
        title={`${title} - ${doneCount}/${steps.length}`}
        description={nextStepId === null ? undefined : pendingMessage}
      >
        {nextStepId === null ? (
          <p id={headingId} className="text-sm font-medium text-emerald-300">
            {completeMessage}
          </p>
        ) : (
          <div id={headingId} className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-amber-400"
              style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
            />
          </div>
        )}
      </Card>

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const badge = STATE_BADGE[step.state];
          const isNext = step.id === nextStepId;
          const locked = step.adminOnly && !isAdmin;

          return (
            <li
              key={step.id}
              className={`rounded-xl border p-4 ${
                isNext
                  ? "border-amber-400/35 bg-amber-400/[0.055]"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${step.state === "done" ? "bg-emerald-400/10 text-emerald-300" : isNext ? "bg-amber-400/10 text-amber-300" : "bg-white/[0.045] text-neutral-500"}`}>
                  {step.state === "done" ? <Check size={16} /> : <CircleDashed size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Step {index + 1}</span>
                    <StatusBadge label={badge.label} className={badge.className} />
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-sm text-neutral-400">{step.status}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-sm">
                {locked ? (
                  <span className="text-neutral-500">An administrator must complete this step.</span>
                ) : (
                  <Link href={step.href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-amber-200 hover:text-amber-100">
                    {step.linkLabel}<ChevronRight size={14} />
                  </Link>
                )}
              </div>
              <Disclosure summary="Why this step matters" icon={Info} className="mt-3">
                <p className="text-xs leading-5">{step.why}</p>
              </Disclosure>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function WorkspaceSetupChecklist({
  checklist,
  isAdmin,
}: {
  checklist: SetupChecklist;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-6">
      <ChecklistSection
        section={checklist.handoff}
        isAdmin={isAdmin}
        headingId="workspace-handoff-heading"
        title="Workspace handoff"
        completeMessage={
          <>
            The identity workspace handoff is complete. Continue from the{" "}
            <Link href="/" className="underline">Today page</Link>. Browser installer availability is
            tracked separately and does not block this checklist.
          </>
        }
        pendingMessage="Complete these required handoff steps in order. The first unfinished step is highlighted below; this checklist does not depend on Browser installer availability or prove identity isolation."
      />

      {checklist.posting.inRolloutScope ? (
        <ChecklistSection
          section={checklist.posting}
          isAdmin={isAdmin}
          headingId="posting-setup-heading"
          title="Posting preparation"
          completeMessage="Posting preparation is complete for the current rollout scope."
          pendingMessage="Posting is back in rollout scope. Complete these steps separately from the identity workspace handoff."
        />
      ) : null}
    </div>
  );
}
