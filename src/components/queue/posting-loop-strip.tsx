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
      label: "Chờ đăng",
      value: `${summary.pending} bài`,
      state: summary.pending > 0 ? "ok" : "idle",
      href: "/queue?status=PENDING",
    },
    {
      key: "overdue",
      label: "Quá giờ",
      value: summary.overdue > 0 ? `${summary.overdue} bài` : "không có",
      hint: summary.overdue > 0 ? "đăng rồi thì bấm Đã đăng" : undefined,
      state: summary.overdue > 0 ? "warn" : "ok",
      href: "/queue?status=PENDING",
    },
    {
      key: "posted",
      label: "Đã đăng hôm nay",
      value: `${summary.postedToday} bài`,
      state: summary.postedToday > 0 ? "ok" : "idle",
      href: "/queue?status=POSTED",
    },
    {
      key: "interactions",
      label: "Tương tác 30 ngày",
      value: `${summary.interactions30d} bản ghi`,
      hint: "dữ liệu nuôi bộ luật",
      state: "idle",
      href: "/queue",
    },
  ];

  return <PipelineStrip steps={steps} />;
}
