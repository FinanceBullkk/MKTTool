/**
 * Bảng hàng đợi, gom theo ngày đăng.
 *
 * Gom theo ngày chứ không đổ một danh sách dài, vì câu hỏi hằng ngày của bạn MKT là
 * "hôm nay đăng gì" chứ không phải "job thứ 47 là gì".
 */
import { DataTable, EmptyState, StatusBadge } from "@/components/ui/page-section";
import { CONTENT_TYPE_LABELS, type ContentType, getJobStatusPresentation } from "@/lib/content/content-types";
import { formatDayMonth, formatDayMonthTime, localDayKey } from "@/lib/format/vietnamese-date-format";
import { deserializeEvaluation } from "@/lib/rules/rules-engine";
import { JobRowActions } from "./job-row-actions";
import { RuleVerdictBadge } from "./rule-verdict-badge";

export interface QueueJob {
  id: string;
  /** Cần cho nút "Quét & gán link": bộ dò làm việc theo nick, không theo job. */
  accountId: string;
  scheduledAt: Date;
  status: string;
  ruleVerdicts: string | null;
  overrideReason: string | null;
  postedUrl: string | null;
  errorMessage: string | null;
  contentItem: { title: string; type: string };
  account: { username: string };
  target: { name: string; platform: string };
}

function VerdictCell({ job }: { job: QueueJob }) {
  const evaluation = deserializeEvaluation(job.ruleVerdicts);
  if (!evaluation) return <span className="text-xs text-neutral-400">chưa chấm</span>;

  const problems = [...evaluation.blocks, ...evaluation.warnings];

  return (
    <div className="space-y-1">
      <RuleVerdictBadge level={evaluation.level} />
      {problems.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-neutral-500">
          {problems.map((result) => (
            <li key={result.id}>{result.label}</li>
          ))}
        </ul>
      ) : null}
      {job.overrideReason ? (
        <p className="text-xs font-medium text-red-700 dark:text-red-400">
          Ghi đè: {job.overrideReason}
        </p>
      ) : null}
    </div>
  );
}

export function QueueJobTable({ jobs }: { jobs: QueueJob[] }) {
  if (jobs.length === 0) {
    return <EmptyState>Không có job nào khớp bộ lọc.</EmptyState>;
  }

  // Khóa gom nhóm có năm; nhãn hiển thị mới là `28/07`. Dùng chuỗi hiển thị làm khóa
  // thì bài của 02/08 năm nay và 02/08 năm sau chung một nhóm.
  const byDay = new Map<string, { label: string; jobs: QueueJob[] }>();
  for (const job of jobs) {
    const key = localDayKey(job.scheduledAt);
    const group = byDay.get(key) ?? { label: formatDayMonth(job.scheduledAt), jobs: [] };
    group.jobs.push(job);
    byDay.set(key, group);
  }

  return (
    <div className="space-y-6">
      {[...byDay.entries()].map(([day, { label, jobs: dayJobs }]) => (
        <div key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {label} — {dayJobs.length} bài
          </h3>
          <DataTable headers={["Giờ", "Content", "Nick", "Đích", "Trạng thái", "Luật", "Thao tác"]}>
            {dayJobs.map((job) => {
              const status = getJobStatusPresentation(job.status);
              const type = job.contentItem.type as ContentType;

              return (
                <tr key={job.id}>
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                    {formatDayMonthTime(job.scheduledAt)}
                  </td>
                  <td className="max-w-xs py-2 pr-4">
                    <div className="font-medium">{job.contentItem.title}</div>
                    <div className="text-xs text-neutral-500">
                      {CONTENT_TYPE_LABELS[type] ?? job.contentItem.type}
                    </div>
                  </td>
                  <td className="py-2 pr-4">{job.account.username}</td>
                  <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                    {job.target.name}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={status.label} className={status.className} />
                    {job.postedUrl ? (
                      <a
                        href={job.postedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs underline"
                      >
                        xem bài
                      </a>
                    ) : null}
                    {job.errorMessage ? (
                      <p className="mt-1 text-xs text-orange-700 dark:text-orange-400">
                        {job.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    <VerdictCell job={job} />
                  </td>
                  <td className="py-2 pr-4">
                    <JobRowActions
                      jobId={job.id}
                      accountId={job.accountId}
                      status={job.status}
                      targetPlatform={job.target.platform}
                    />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ))}
    </div>
  );
}
