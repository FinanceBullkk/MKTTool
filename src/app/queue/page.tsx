import Link from "next/link";
import { InteractionForm } from "@/components/queue/interaction-form";
import { PromoRatioTable } from "@/components/queue/promo-ratio-table";
import { QueueJobTable } from "@/components/queue/queue-job-table";
import { Card, DataTable, EmptyState, PageHeading } from "@/components/ui/page-section";
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

  const filters = [{ value: undefined, label: "Tất cả" }, ...JOB_STATUSES.map((value) => ({
    value,
    label: getJobStatusPresentation(value).label,
  }))];

  return (
    <>
      <PageHeading
        title="Hàng đợi"
        description="Mỗi dòng là một lần đăng đã được bộ luật chấm. Đăng xong nhớ bấm 'Đã đăng' — dữ liệu đó nuôi chính bộ luật."
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
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
        <Link
          href="/queue/new"
          className="ml-auto rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Xếp lịch bài mới
        </Link>
      </div>

      <Card title={`Lịch đăng — ${jobs.length} job`}>
        <QueueJobTable jobs={jobs} />
      </Card>

      <Card title="Tỷ lệ promo theo cặp nick × đích">
        <PromoRatioTable rows={promoRows} />
      </Card>

      <Card title="Ghi tương tác thủ công">
        {accounts.length === 0 || targets.length === 0 ? (
          <EmptyState>Cần có ít nhất một nick và một đích trước đã.</EmptyState>
        ) : (
          <InteractionForm accounts={accounts} targets={targets} />
        )}
      </Card>

      <Card title="Tương tác gần đây">
        {interactions.length === 0 ? (
          <EmptyState>
            Chưa ghi tương tác nào. Không ghi thì luật chặn đụng độ thread không có gì để so.
          </EmptyState>
        ) : (
          <DataTable headers={["Lúc", "Nick", "Kiểu", "Đích", "Thread"]}>
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
      </Card>
    </>
  );
}
