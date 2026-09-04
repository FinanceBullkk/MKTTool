import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { CalendarDays, ChartNoAxesColumn, ListChecks, MessageSquarePlus, Plus, Rows3 } from "lucide-react";
import { InteractionForm } from "@/components/queue/interaction-form";
import { PromoRatioTable } from "@/components/queue/promo-ratio-table";
import { QueueJobTable } from "@/components/queue/queue-job-table";
import { Card, DataTable, Disclosure, EmptyState, PageHeading, PageShell } from "@/components/ui/page-section";
import { JOB_STATUSES, getInteractionKindLabel, getJobStatusPresentation } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { loadPromoRatioRows } from "@/lib/queue/promo-ratio-summary";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeStatus = JOB_STATUSES.find((value) => value === status);

  const [jobs, promoRows, accounts, targets, interactions] = await Promise.all([
    prisma.postJob.findMany({
      where: activeStatus ? { status: activeStatus } : {},
      orderBy: { scheduledAt: "asc" },
      include: {
        contentItem: { select: { title: true, type: true } },
        account: { select: { username: true } },
        target: { select: { name: true, platform: true } },
      },
    }),
    loadPromoRatioRows(),
    prisma.account.findMany({
      orderBy: [{ platform: "asc" }, { username: "asc" }],
      select: { id: true, username: true, platform: true },
    }),
    prisma.platformTarget.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.interaction.findMany({
      orderBy: { at: "desc" },
      take: 15,
      include: { account: { select: { username: true } }, target: { select: { name: true } } },
    }),
  ]);

  const filters = [{ value: undefined, label: "All" }, ...JOB_STATUSES.map((value) => ({
    value,
    label: getJobStatusPresentation(value).label,
  }))];

  return (
    <PageShell>
      <ParkedScopeBanner what="job queue" />
      <PageHeading
        title="Posting queue"
        description="Schedule, rule verdicts, and posting history"
        eyebrow="Parked posting data"
        icon={ListChecks}
        action={
          <Link
            href="/queue/new"
            className="brand-btn inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <Plus size={16} /> Schedule a post
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filters.map((filter) => {
          const selected = filter.value === activeStatus;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/queue?status=${filter.value}` : "/queue"}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                selected
                  ? "border border-amber-400/35 bg-amber-400/10 text-amber-200"
                  : "border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <Card title={`Posting schedule - ${jobs.length} job${jobs.length === 1 ? "" : "s"}`} icon={CalendarDays}>
        <QueueJobTable jobs={jobs} />
      </Card>

      <Disclosure summary="Promotional ratio by nick and target" icon={ChartNoAxesColumn} className="mb-3">
        <PromoRatioTable rows={promoRows} />
      </Disclosure>

      <Disclosure summary="Record a manual interaction" icon={MessageSquarePlus} className="mb-3">
        {accounts.length === 0 || targets.length === 0 ? (
          <EmptyState title="Nick and target required" icon={MessageSquarePlus}>Add at least one nick and one posting target first.</EmptyState>
        ) : (
          <InteractionForm accounts={accounts} targets={targets} />
        )}
      </Disclosure>

      <Disclosure summary={`Recent interactions - ${interactions.length}`} icon={Rows3} className="mb-5">
        {interactions.length === 0 ? (
          <EmptyState title="No interactions recorded" icon={Rows3}>
            Thread-collision checks have no manual activity to compare yet.
          </EmptyState>
        ) : (
          <DataTable headers={["Time", "Nick", "Type", "Target", "Thread"]}>
            {interactions.map((interaction) => (
              <tr key={interaction.id}>
                <td className="whitespace-nowrap py-2 pr-4 text-xs text-neutral-500">
                  {formatDayMonthTime(interaction.at)}
                </td>
                <td className="py-2 pr-4 font-medium">{interaction.account.username}</td>
                <td className="py-2 pr-4">{getInteractionKindLabel(interaction.kind)}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                  {interaction.target.name}
                </td>
                <td className="max-w-xs truncate py-2 pr-4 text-xs">
                  <a href={interaction.threadUrl} target="_blank" rel="noreferrer" className="underline">
                    {interaction.threadUrl}
                  </a>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Disclosure>
    </PageShell>
  );
}
