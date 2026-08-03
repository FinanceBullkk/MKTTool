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
import { isOpenJobStatus } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";
import { summarizeEvaluation } from "@/lib/rules/rules-engine";
import { recheckOneJob } from "./recheck-jobs-batch";

const urlSchema = z.string().url("Link bài đăng không hợp lệ");

/**
 * Đánh dấu đã đăng. Ghi luôn một Interaction cho chính bài đó: từ giờ nick khác đụng vào
 * thread này sẽ bị luật 8 chặn.
 */
export async function markJobPosted(jobId: string, postedUrl: string): Promise<ActionResult> {
  const parsedUrl = urlSchema.safeParse(postedUrl.trim());
  if (!parsedUrl.success) return { ok: false, message: parsedUrl.error.issues[0].message };

  const job = await prisma.postJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };

  // Bấm hai lần thì lần sau không được ghi thêm Interaction: một bài đăng là một dấu vết,
  // nhân đôi dấu vết làm bẩn chính dữ liệu mà bộ luật dựa vào để đếm.
  if (job.status === "POSTED") {
    return { ok: false, message: "Job này đã được đánh dấu đã đăng rồi." };
  }
  if (!isOpenJobStatus(job.status)) {
    return {
      ok: false,
      message: "Job này đã bỏ qua hoặc đã đánh dấu lỗi — không đánh dấu đã đăng được.",
    };
  }

  await prisma.$transaction([
    prisma.postJob.update({
      where: { id: jobId },
      data: { status: "POSTED", postedUrl: parsedUrl.data, postedAt: new Date(), errorMessage: null },
    }),
    prisma.interaction.create({
      data: {
        accountId: job.accountId,
        targetId: job.targetId,
        threadUrl: parsedUrl.data,
        threadKey: normalizeThreadUrl(parsedUrl.data),
        kind: "POST",
        note: "tự ghi khi đánh dấu job đã đăng",
      },
    }),
    prisma.account.update({ where: { id: job.accountId }, data: { lastActionAt: new Date() } }),
  ]);

  // Cả "/" nữa: thẻ nhắc việc đăng tay nằm ở trang Hôm nay và bấm "Đã đăng" được ngay tại đó,
  // job vừa xong phải biến khỏi danh sách nhắc chứ không nằm lại chờ bấm thêm lần nữa.
  revalidatePath("/queue");
  revalidatePath("/");
  return { ok: true, message: "Đã ghi nhận bài đăng. Nick khác sẽ bị chặn nếu đụng vào thread này." };
}

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

export async function markJobSkipped(jobId: string): Promise<ActionResult> {
  const open = await requireOpenJob(jobId);
  if (!open.ok) return open;

  await prisma.postJob.update({ where: { id: jobId }, data: { status: "SKIPPED" } });
  revalidatePath("/queue");
  return { ok: true, message: "Đã bỏ qua job. Nó không còn tính vào hạn mức và tỷ lệ promo nữa." };
}

/**
 * Chạy lại bộ luật cho một job đang chờ.
 *
 * Cần thiết vì bối cảnh đổi sau lúc xếp lịch: nick tụt karma, nick khác vừa đăng cùng sub,
 * hoặc một job trùng nội dung vừa được thêm vào. Job hết an toàn thì chuyển sang BLOCKED
 * thay vì âm thầm để đó.
 */
export async function recheckJob(jobId: string): Promise<ActionResult> {
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
}
