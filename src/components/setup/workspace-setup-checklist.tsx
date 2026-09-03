import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui/page-section";
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
      <Card title={`${title} - ${doneCount}/${steps.length} steps`}>
        {nextStepId === null ? (
          <p id={headingId} className="text-sm text-emerald-700 dark:text-emerald-400">
            {completeMessage}
          </p>
        ) : (
          <p id={headingId} className="text-sm text-neutral-600 dark:text-neutral-400">
            {pendingMessage}
          </p>
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
              className={`rounded-lg border bg-white p-4 dark:bg-neutral-900 ${
                isNext ? "border-neutral-900 dark:border-neutral-100" : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-neutral-500">Step {index + 1}</span>
                <span className="font-medium">{step.title}</span>
                <StatusBadge label={badge.label} className={badge.className} />
                {isNext ? <span className="text-xs font-medium">Next required step</span> : null}
              </div>
              <p className="mt-2 text-sm">{step.status}</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{step.why}</p>
              <div className="mt-3 text-sm">
                {locked ? (
                  <span className="text-neutral-500">An administrator must complete this step.</span>
                ) : (
                  <Link href={step.href} className="underline">{step.linkLabel}</Link>
                )}
              </div>
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
