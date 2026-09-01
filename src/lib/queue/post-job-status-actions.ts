"use server";

/**
 * Đổi trạng thái job sau khi bạn MKT đã thao tác tay trên trình duyệt antidetect.
 *
 * Phase 05 sẽ tự làm những việc này; giai đoạn này người bấm tay, nhưng dữ liệu ghi lại
 * phải giống hệt — vì chính nó nuôi bộ luật (tỷ lệ promo, chặn đụng độ, so trùng).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { OPEN_JOB_STATUSES, isOpenJobStatus } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import {
  UNRESOLVABLE_SHARE_LINK_MESSAGE,
  isUnresolvableShareLink,
} from "@/lib/rules/rule-thread-collision";
import { summarizeEvaluation } from "@/lib/rules/rules-engine";
import { markPostJobPosted } from "./post-job-mark-posted";
import { revertPostJobToPending } from "./post-job-revert";
import { recheckOneJob } from "./recheck-jobs-batch";

const urlSchema = z
  .string()
  .url("Link bài đăng không hợp lệ")
  // Cùng chốt với form ghi tương tác: `markPostJobPosted` ghi kèm một Interaction, nên một link
  // không rút được về id bài để lại đúng loại dấu vết mà luật 8 không đối chiếu được.
  .refine((value) => !isUnresolvableShareLink(value), UNRESOLVABLE_SHARE_LINK_MESSAGE);

/**
 * Đánh dấu đã đăng. Ghi luôn một Interaction cho chính bài đó: từ giờ nick khác đụng vào
 * thread này sẽ bị luật 8 chặn.
 */
export const markJobPosted = guardedAction(async function markJobPosted(
  _actor,
  jobId: string,
  postedUrl: string,
): Promise<ActionResult> {
  // Kiểm dạng URL nằm ở đây chứ không ở lõi: đây là chỗ nhận chuỗi người gõ. Bộ dò đưa vào
  // permalink do chính Reddit trả về nên không có gì để kiểm.
  const parsedUrl = urlSchema.safeParse(postedUrl.trim());
  if (!parsedUrl.success) return { ok: false, message: parsedUrl.error.issues[0].message };

  // Nhận cả `PUBLISHING` chứ không chỉ job còn mở: đường đăng Fanpage có một nhánh mà bài ĐÃ lên
  // tường nhưng ghi trạng thái hỏng, và câu nó dặn người dùng là *vào hàng đợi bấm "Đã đăng" và
  // dán chính link này*. Không nhận `PUBLISHING` ở đây thì lời dặn đó dẫn vào ngõ cụt, và job nằm
  // kẹt trong khi bài thì đã đăng rồi.
  //
  // Không mở lại kẽ hở đăng đôi: lõi vẫn đổi trạng thái bằng một câu lệnh có điều kiện, nên nếu
  // đường đăng còn đang bay thì đúng một trong hai bên ghi được, bên kia bị từ chối.
  const result = await markPostJobPosted(jobId, parsedUrl.data, [
    ...OPEN_JOB_STATUSES,
    "PUBLISHING",
  ]);
  if (!result.ok) return result;

  // Cả "/" nữa: thẻ nhắc việc đăng tay nằm ở trang Hôm nay và bấm "Đã đăng" được ngay tại đó,
  // job vừa xong phải biến khỏi danh sách nhắc chứ không nằm lại chờ bấm thêm lần nữa.
  revalidatePath("/queue");
  revalidatePath("/");
  return result;
});

/**
 * Trả job đã chốt về chờ đăng — lối thoát cho lần bấm nhầm.
 *
 * Ngược chiều với `markJobPosted` nên phải gỡ đúng những gì lượt đó đã ghi; phần nặng nằm ở
 * post-job-revert.ts, ở đây chỉ thêm việc làm mới hai trang có hiện job.
 */
export const revertJobToPending = guardedAction(async function revertJobToPending(
  _actor,
  jobId: string,
): Promise<ActionResult> {
  const result = await revertPostJobToPending(jobId);
  if (!result.ok) return result;

  // Cả "/": job vừa quay lại chờ đăng phải hiện lại ở thẻ nhắc việc, và cảnh báo trùng link
  // ở trang Hôm nay phải biến mất ngay — đó chính là chỗ người dùng nhìn thấy lỗi này.
  revalidatePath("/queue");
  revalidatePath("/");
  return result;
});

/**
 * Kiểm ở tầng server chứ không chỉ ở nút bấm: server action là một endpoint HTTP công khai,
 * và `prisma.update` trên id không tồn tại ném P2025 — lỗi đó đi thẳng ra trình duyệt thành
 * một promise reject không ai bắt, người dùng bấm xong thấy màn hình đứng im.
 */
async function requireOpenJob(
  jobId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const job = await prisma.postJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };
  if (!isOpenJobStatus(job.status)) {
    return { ok: false, message: "Chỉ đổi được job đang chờ hoặc đang bị chặn." };
  }
  return { ok: true };
}

export const markJobSkipped = guardedAction(async function markJobSkipped(
  _actor,
  jobId: string,
): Promise<ActionResult> {
  const open = await requireOpenJob(jobId);
  if (!open.ok) return open;

  await prisma.postJob.update({ where: { id: jobId }, data: { status: "SKIPPED" } });
  revalidatePath("/queue");
  return { ok: true, message: "Đã bỏ qua job. Nó không còn tính vào hạn mức và tỷ lệ promo nữa." };
});

/**
 * Chạy lại bộ luật cho một job đang chờ.
 *
 * Cần thiết vì bối cảnh đổi sau lúc xếp lịch: nick tụt karma, nick khác vừa đăng cùng sub,
 * hoặc một job trùng nội dung vừa được thêm vào. Job hết an toàn thì chuyển sang BLOCKED
 * thay vì âm thầm để đó.
 */
export const recheckJob = guardedAction(async function recheckJob(
  _actor,
  jobId: string,
): Promise<ActionResult> {
  const job = await prisma.postJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };
  if (!isOpenJobStatus(job.status)) {
    return { ok: false, message: "Chỉ kiểm tra lại được job đang chờ hoặc đang bị chặn." };
  }

  // Cùng lõi với lúc chấm lại cả mẻ sau khi sửa content/đích/nick — hai đường phải cho ra
  // đúng một kết quả, nếu không job được chấm bằng đường nào lại an toàn theo kiểu đó.
  const outcome = await recheckOneJob(job);
  if (!outcome.ok) return { ok: false, message: outcome.message };

  revalidatePath("/queue");
  return { ok: !outcome.blocked, message: summarizeEvaluation(outcome.evaluation) };
});
