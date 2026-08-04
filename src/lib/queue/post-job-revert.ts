/**
 * Trả một job đã chốt (ĐÃ ĐĂNG / BỎ QUA / LỖI) về CHỜ ĐĂNG.
 *
 * Có thật 04/08/2026: job "Looking for a game similar to trove" mang `POSTED` cùng đúng link
 * của một bài khác — người dùng dán nhầm khi bấm "Đã đăng", bài đó chưa từng lên Reddit. Trước
 * đây không có đường sửa: POSTED là trạng thái cuối, dòng job chỉ hiện "—". Sổ sách sai nằm im
 * như vậy làm bộ luật đếm sai (luật 4, 5, 6) và KHÓA LUÔN NỘI DUNG: luật 7 tưởng bài đã đăng
 * nên sẽ chặn khi đăng nó thật.
 *
 * Việc nặng nhất ở đây không phải đổi cột `status` mà là XÓA DẤU VẾT. `markJobPosted` ghi kèm
 * một Interaction để luật 8 chặn nick khác đụng vào thread. Trả job về mà để dấu vết lại là
 * nhớ mãi một lần chạm chưa từng xảy ra.
 *
 * Tách khỏi post-job-status-actions.ts vì file đó là `"use server"` — mọi thứ export ra từ đó
 * đều thành endpoint HTTP, còn hàm này còn phải gọi được từ test và từ chỗ khác trong server.
 */
import type { ActionResult } from "@/lib/actions/action-result";
import { isOpenJobStatus } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";
import { summarizeEvaluation } from "@/lib/rules/rules-engine";
import { AUTO_POST_INTERACTION_NOTE } from "./post-job-mark-posted";
import { recheckOneJob } from "./recheck-jobs-batch";

interface RevertableJob {
  accountId: string;
  targetId: string;
  postedUrl: string | null;
}

/**
 * Tìm Interaction mà lượt đánh dấu đã đăng đã tự ghi cho job này.
 *
 * Interaction không có khóa ngoại trỏ về PostJob nên phải dò ngược bằng chính bộ giá trị đã
 * ghi ra. Khi hai job cùng nick, cùng đích dán trùng một link thì hai bản ghi giống hệt nhau —
 * xóa bản nào cũng như nhau, bản còn lại vẫn nói đúng một câu: nick này đã chạm thread đó.
 *
 * Vì vậy `findFirst` rồi xóa theo id, TUYỆT ĐỐI không `deleteMany`: deleteMany sẽ cuốn theo cả
 * dấu vết của bài đăng thật, và luật 8 mất khả năng chặn đúng chỗ nó cần chặn.
 */
async function findAutoPostTraceId(job: RevertableJob): Promise<string | null> {
  const postedUrl = job.postedUrl?.trim();
  if (!postedUrl) return null;

  const trace = await prisma.interaction.findFirst({
    where: {
      accountId: job.accountId,
      targetId: job.targetId,
      threadKey: normalizeThreadUrl(postedUrl),
      kind: "POST",
      note: AUTO_POST_INTERACTION_NOTE,
    },
    orderBy: { at: "desc" },
    select: { id: true },
  });

  return trace?.id ?? null;
}

export async function revertPostJobToPending(jobId: string): Promise<ActionResult> {
  const job = await prisma.postJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };
  if (isOpenJobStatus(job.status)) {
    return { ok: false, message: "Job này vẫn đang chờ hoặc đang bị chặn — không có gì để trả về." };
  }

  const traceId = await findAutoPostTraceId(job);

  // Một giao dịch: xóa dấu vết mà không đổi được trạng thái là mất dữ liệu của luật 8 mà
  // chẳng đổi lại được gì.
  await prisma.$transaction([
    ...(traceId ? [prisma.interaction.delete({ where: { id: traceId } })] : []),
    prisma.postJob.update({
      where: { id: jobId },
      data: { status: "PENDING", postedUrl: null, postedAt: null, errorMessage: null },
    }),
  ]);

  // Verdict cũ được chấm ở bối cảnh khác, và chính job này vừa thôi được đếm là đã đăng — để
  // nguyên verdict cũ là mời người dùng đăng theo một kết luận đã hết hạn.
  const outcome = await recheckOneJob({ ...job, status: "PENDING" });
  const removedTrace = traceId ? " Dấu vết đụng thread của bài đó đã xóa." : "";

  if (!outcome.ok) {
    return {
      ok: true,
      message: `Đã trả job về chờ đăng.${removedTrace} Chưa chấm lại luật được: ${outcome.message}`,
    };
  }

  return {
    ok: true,
    message: `Đã trả job về chờ đăng.${removedTrace} ${summarizeEvaluation(outcome.evaluation)}`,
  };
}
