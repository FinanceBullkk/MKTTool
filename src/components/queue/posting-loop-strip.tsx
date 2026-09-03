/**
 * Băng chuyền vòng đăng bài ở trang Hôm nay — quãng SAU khi xếp lịch.
 *
 * Trước đây quãng này không hiện ở đâu: hàng đợi cho biết có bao nhiêu job, nhưng không cho
 * biết vòng có đang khép lại hay không. Chặng "quá giờ" chính là chỗ vòng hay đứt.
 */
import { PipelineStrip, type PipelineStep } from "./pipeline-strip";
import type { PostingLoopSummary } from "@/lib/queue/posting-loop-summary";

export function PostingLoopStrip({ summary }: { summary: PostingLoopSummary }) {
  const steps: PipelineStep[] = [
    {
      key: "pending",
      label: "Pending",
      value: `${summary.pending} post${summary.pending === 1 ? "" : "s"}`,
      state: summary.pending > 0 ? "ok" : "idle",
      href: "/queue?status=PENDING",
    },
    {
      key: "overdue",
      label: "Overdue",
      value:
        summary.overdue > 0
          ? `${summary.overdue} post${summary.overdue === 1 ? "" : "s"}`
          : "None",
      hint: summary.overdue > 0 ? "If already published, click Posted" : undefined,
      state: summary.overdue > 0 ? "warn" : "ok",
      href: "/queue?status=PENDING",
    },
    {
      key: "posted",
      label: "Posted today",
      value: `${summary.postedToday} post${summary.postedToday === 1 ? "" : "s"}`,
      state: summary.postedToday > 0 ? "ok" : "idle",
      href: "/queue?status=POSTED",
    },
    {
      key: "interactions",
      label: "30-day interactions",
      value: `${summary.interactions30d} record${summary.interactions30d === 1 ? "" : "s"}`,
      hint: "This data feeds the rule set",
      state: "idle",
      href: "/queue",
    },
  ];

  return <PipelineStrip steps={steps} />;
}
