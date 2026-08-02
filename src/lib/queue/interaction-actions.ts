"use server";

/**
 * Ghi tương tác thủ công: "vừa comment ở thread X", "vừa upvote bài Y".
 *
 * Nhàm chán nhưng là dữ liệu quan trọng nhất của luật 8 — không ghi thì công cụ không biết
 * nick nào đã đụng thread nào, và luật chặn đụng độ trở thành vô dụng. Phase 05 sẽ tự ghi.
 *
 * Chính thao tác ghi này cũng bị luật 8 chặn: nếu nick khác đã ở trong thread đó thì
 * không cho ghi thêm, để bạn MKT biết mình sắp làm hỏng cả cụm nick TRƯỚC khi bấm.
 * Chỉ chặn ở nền tảng cộng đồng, giống hệt lúc chạy qua rules-engine.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { INTERACTION_KINDS } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { isCommunityPlatform } from "@/lib/platforms/platform-family";
import { loadSameTargetNeighbors, loadThreadCollisions } from "@/lib/rules/rule-context-queries";
import { normalizeThreadUrl, ruleThreadCollision } from "@/lib/rules/rule-thread-collision";
import { DEFAULT_RULE_THRESHOLDS, applyThresholdOverrides } from "@/lib/rules/rule-thresholds";
import { ALLOW } from "@/lib/rules/rule-types";

const interactionSchema = z.object({
  accountId: z.string().min(1, "Chọn nick"),
  targetId: z.string().min(1, "Chọn đích"),
  threadUrl: z.string().url("Link thread không hợp lệ"),
  kind: z.enum(INTERACTION_KINDS),
  note: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().optional(),
  ),
});

export async function recordInteraction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = interactionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { threadUrl, note, ...rest } = parsed.data;
  const threadKey = normalizeThreadUrl(threadUrl);

  const target = await prisma.platformTarget.findUnique({ where: { id: rest.targetId } });
  if (!target) return { ok: false, message: "Không tìm thấy đích." };

  const thresholdRows = await prisma.ruleConfig.findMany();
  const thresholds = applyThresholdOverrides(thresholdRows, DEFAULT_RULE_THRESHOLDS);
  const at = new Date();

  const [threadCollisions, sameTargetNeighbors] = await Promise.all([
    loadThreadCollisions(threadKey, rest.accountId),
    loadSameTargetNeighbors(rest.targetId, rest.accountId, at, thresholds.threadCollisionWarnHours),
  ]);

  // Luật 8 chỉ áp cho nền tảng cộng đồng, giống hệt lúc chạy qua rules-engine. Trang trả lời
  // dưới bài của chính mình là chăm sóc khách hàng, không phải hai nick giả vờ đồng tình.
  const verdict = isCommunityPlatform(target.platform)
    ? ruleThreadCollision({
        target: {
          id: target.id,
          name: target.name,
          platform: target.platform,
          minKarma: target.minKarma,
          minAccountAgeDays: target.minAccountAgeDays,
          promoRatio: target.promoRatio,
          allowsLinks: target.allowsLinks,
        },
        threadCollisions,
        sameTargetNeighbors,
        thresholds,
      })
    : ALLOW;

  // Luật 8 không cho ghi đè — chặn là chặn, không có nút nào bỏ qua.
  if (verdict.level === "BLOCK") {
    return { ok: false, message: verdict.reason };
  }

  await prisma.$transaction([
    prisma.interaction.create({ data: { ...rest, threadUrl, threadKey, kind: rest.kind, note, at } }),
    prisma.account.update({ where: { id: rest.accountId }, data: { lastActionAt: at } }),
  ]);

  revalidatePath("/queue");
  return {
    ok: true,
    message:
      verdict.level === "WARN"
        ? `Đã ghi nhận. Cảnh báo: ${verdict.reason}`
        : "Đã ghi nhận tương tác. Nick khác sẽ bị chặn nếu đụng vào thread này.",
  };
}
