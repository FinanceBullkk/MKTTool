import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui/page-section";
import type { SetupChecklist, SetupStep } from "@/lib/setup/setup-checklist";

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

export function WorkspaceSetupChecklist({
  checklist,
  isAdmin,
}: {
  checklist: SetupChecklist;
  isAdmin: boolean;
}) {
  const { steps, nextStepId, doneCount } = checklist;

  return (
    <section className="space-y-3" aria-labelledby="workspace-setup-heading">
      <Card title={`Workspace preparation - ${doneCount}/${steps.length} steps`}>
        {nextStepId === null ? (
          <p id="workspace-setup-heading" className="text-sm text-emerald-700 dark:text-emerald-400">
            All technical workspace checks are complete. Continue from the <Link href="/" className="underline">Today page</Link>.
            These checks do not prove Browser identity isolation; keep the pilot human-controlled.
          </p>
        ) : (
          <p id="workspace-setup-heading" className="text-sm text-neutral-600 dark:text-neutral-400">
            Complete these required technical steps in order. The first unfinished step is highlighted below;
            a green checklist is not an identity or production-rollout approval.
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
