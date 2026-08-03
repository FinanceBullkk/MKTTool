/**
 * Chấm lại luật cho một hoặc nhiều job đang chờ.
 *
 * Tồn tại vì sửa dữ liệu là làm cũ đi mọi verdict đã lưu: đổi thân bài thì độ trùng tính lại
 * khác, hạ karma nick hoặc nâng `minKarma` của sub thì điều kiện đích khác. Verdict cũ nằm im
 * trong hàng đợi trông y hệt verdict đúng — đó là kiểu lỗ hổng im lặng mà cả bộ luật này được
 * dựng ra để tránh.
 *
 * Tách khỏi post-job-status-actions.ts vì file đó là `"use server"`: mọi thứ export ra từ đó
 * đều thành endpoint HTTP, mà mấy hàm dưới đây chỉ để gọi nội bộ.
 */
import type { Prisma } from "@prisma/client";
import { OPEN_JOB_STATUSES, isOpenJobStatus } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { type RuleEvaluation, serializeEvaluation } from "@/lib/rules/rules-engine";
import { shouldBlockOnRecheck } from "./post-job-override-policy";
import { previewPostJobRules } from "./post-job-rule-preview";

/** Đúng những cột cần để chấm lại — nhận cả bản ghi Prisma đầy đủ. */
export interface RecheckableJob {
  id: string;
  contentItemId: string;
  accountId: string;
  targetId: string;
  scheduledAt: Date;
  status: string;
  overrideReason: string | null;
}

export type RecheckOutcome =
  | { ok: true; evaluation: RuleEvaluation; blocked: boolean }
  | { ok: false; message: string };

/**
 * Chấm lại đúng một job và ghi kết quả.
 *
 * KHÔNG gọi revalidatePath: chấm cả mẻ thì người gọi làm một lần cho cả mẻ là đủ.
 */
export async function recheckOneJob(job: RecheckableJob): Promise<RecheckOutcome> {
  if (!isOpenJobStatus(job.status)) {
    return { ok: false, message: "Chỉ kiểm tra lại được job đang chờ hoặc đang bị chặn." };
  }

  const preview = await previewPostJobRules({
    content: { contentItemId: job.contentItemId },
    accountId: job.accountId,
    targetId: job.targetId,
    scheduledAt: job.scheduledAt,
    // Bỏ qua chính nó, nếu không job sẽ tự so trùng với chính mình.
    excludeJobId: job.id,
  });
  if (!preview.ok) return preview;

  const { evaluation } = preview;
  // Lý do ghi đè cũ vẫn có giá trị, TRỪ khi lần chấm này lòi ra luật cấm ghi đè.
  const blocked = shouldBlockOnRecheck(evaluation, job.overrideReason);

  await prisma.postJob.update({
    where: { id: job.id },
    data: { status: blocked ? "BLOCKED" : "PENDING", ruleVerdicts: serializeEvaluation(evaluation) },
  });

  return { ok: true, evaluation, blocked };
}

export interface BatchRecheckResult {
  checked: number;
  /** Số job vừa bị đẩy sang BỊ CHẶN vì sửa dữ liệu làm chúng hết an toàn. */
  blocked: number;
  /** Job không chấm lại được (thiếu nick/đích/content) — nêu ra chứ không nuốt. */
  failed: number;
}

/**
 * Chấm lại mọi job chưa chốt khớp điều kiện — dùng sau khi sửa content, đích hoặc nick.
 *
 * `where` chỉ nên lọc theo quan hệ (contentItemId, targetId, accountId); phần trạng thái
 * do hàm này tự áp để không chỗ nào lỡ tay chấm lại một job đã đăng.
 */
export async function recheckJobsMatching(
  where: Prisma.PostJobWhereInput,
): Promise<BatchRecheckResult> {
  const jobs = await prisma.postJob.findMany({
    where: { ...where, status: { in: OPEN_JOB_STATUSES } },
    select: {
      id: true,
      contentItemId: true,
      accountId: true,
      targetId: true,
      scheduledAt: true,
      status: true,
      overrideReason: true,
    },
  });

  const result: BatchRecheckResult = { checked: 0, blocked: 0, failed: 0 };

  for (const job of jobs) {
    const outcome = await recheckOneJob(job);
    if (!outcome.ok) {
      result.failed += 1;
      continue;
    }
    result.checked += 1;
    if (outcome.blocked) result.blocked += 1;
  }

  return result;
}

/** Câu đuôi gắn vào thông báo "đã lưu", để việc chấm lại không diễn ra âm thầm. */
export function describeRecheck(result: BatchRecheckResult): string {
  if (result.checked === 0 && result.failed === 0) return "";

  const parts = [`Đã chấm lại ${result.checked} job đang chờ`];
  if (result.blocked > 0) {
    parts.push(`${result.blocked} job chuyển sang BỊ CHẶN — xem lý do ở hàng đợi`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} job không chấm được (thiếu nick, đích hoặc content)`);
  }

  return ` ${parts.join(", ")}.`;
}
