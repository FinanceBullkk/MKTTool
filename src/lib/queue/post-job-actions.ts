"use server";

/**
 * Tạo job đăng bài.
 *
 * Bộ luật chạy LẠI ở đây chứ không tin kết quả xem trước gửi từ trình duyệt —
 * dữ liệu có thể đã đổi giữa lúc xem và lúc bấm lưu, và không bao giờ tin dữ liệu từ client.
 *
 * Ghi đè luật thì bắt buộc có lý do và luôn để lại AuditLog.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";
import { serializeEvaluation, summarizeEvaluation } from "@/lib/rules/rules-engine";
import { joinReasons, previewPostJobRules } from "./post-job-rule-preview";

const postJobSchema = z.object({
  contentItemId: z.string().min(1, "Chọn content"),
  accountId: z.string().min(1, "Chọn nick"),
  targetId: z.string().min(1, "Chọn đích đăng"),
  scheduledAt: z.coerce.date(),
  overrideReason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(10, "Lý do ghi đè phải nói rõ vì sao — ít nhất 10 ký tự").optional(),
  ),
});

export async function createPostJob(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = postJobSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { overrideReason, ...job } = parsed.data;
  const preview = await previewPostJobRules(job);
  if (!preview.ok) return { ok: false, message: preview.message };

  const { evaluation } = preview;

  if (evaluation.level === "BLOCK") {
    if (!evaluation.overridable) {
      return {
        ok: false,
        message: `Không xếp lịch được, luật này không cho ghi đè. ${joinReasons(evaluation)}`,
      };
    }
    if (!overrideReason) {
      return {
        ok: false,
        message: `Bị chặn: ${joinReasons(evaluation)} — nhập lý do ghi đè nếu vẫn muốn xếp lịch.`,
      };
    }
  }

  const created = await prisma.postJob.create({
    data: {
      ...job,
      status: "PENDING",
      ruleVerdicts: serializeEvaluation(evaluation),
      overrideReason: evaluation.level === "BLOCK" ? (overrideReason ?? null) : null,
    },
  });

  if (evaluation.level === "BLOCK") {
    await prisma.auditLog.create({
      data: {
        accountId: job.accountId,
        action: "RULE_OVERRIDDEN",
        detail: `job ${created.id} — ${joinReasons(evaluation)} — lý do: ${overrideReason}`.slice(0, 900),
      },
    });
  }

  revalidatePath("/queue");
  return {
    ok: true,
    message:
      evaluation.level === "BLOCK"
        ? `Đã xếp lịch bằng cách GHI ĐÈ luật. ${summarizeEvaluation(evaluation)}`
        : `Đã xếp lịch. ${summarizeEvaluation(evaluation)}`,
  };
}
