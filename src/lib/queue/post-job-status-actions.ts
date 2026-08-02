"use server";

/**
 * Đổi trạng thái job sau khi bạn MKT đã thao tác tay trên trình duyệt antidetect.
 *
 * Phase 05 sẽ tự làm những việc này; giai đoạn này người bấm tay, nhưng dữ liệu ghi lại
 * phải giống hệt — vì chính nó nuôi bộ luật (tỷ lệ promo, chặn đụng độ, so trùng).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";
import { serializeEvaluation, summarizeEvaluation } from "@/lib/rules/rules-engine";
import { shouldBlockOnRecheck } from "./post-job-override-policy";
import { previewPostJobRules } from "./post-job-rule-preview";

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

  revalidatePath("/queue");
  return { ok: true, message: "Đã ghi nhận bài đăng. Nick khác sẽ bị chặn nếu đụng vào thread này." };
}

export async function markJobSkipped(jobId: string): Promise<ActionResult> {
  await prisma.postJob.update({ where: { id: jobId }, data: { status: "SKIPPED" } });
  revalidatePath("/queue");
  return { ok: true, message: "Đã bỏ qua job. Nó không còn tính vào hạn mức và tỷ lệ promo nữa." };
}

export async function markJobFailed(jobId: string, errorMessage: string): Promise<ActionResult> {
  await prisma.postJob.update({
    where: { id: jobId },
    data: { status: "FAILED", errorMessage: errorMessage.slice(0, 500) },
  });
  revalidatePath("/queue");
  return { ok: true, message: "Đã đánh dấu lỗi." };
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
  if (job.status !== "PENDING" && job.status !== "BLOCKED") {
    return { ok: false, message: "Chỉ kiểm tra lại được job đang chờ hoặc đang bị chặn." };
  }

  const preview = await previewPostJobRules({
    contentItemId: job.contentItemId,
    accountId: job.accountId,
    targetId: job.targetId,
    scheduledAt: job.scheduledAt,
    excludeJobId: job.id,
  });
  if (!preview.ok) return { ok: false, message: preview.message };

  const { evaluation } = preview;
  // Job đã được ghi đè có chủ đích thì giữ nguyên trạng thái chờ — nhưng lý do cũ KHÔNG
  // che được luật cấm ghi đè mới lòi ra (xem post-job-override-policy.ts).
  const blocked = shouldBlockOnRecheck(evaluation, job.overrideReason);

  await prisma.postJob.update({
    where: { id: jobId },
    data: { status: blocked ? "BLOCKED" : "PENDING", ruleVerdicts: serializeEvaluation(evaluation) },
  });

  revalidatePath("/queue");
  return { ok: !blocked, message: summarizeEvaluation(evaluation) };
}
