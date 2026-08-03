/**
 * Chạy thử bộ luật cho một dự định đăng.
 *
 * Tách khỏi server action vì cả hai chỗ đều cần: route /api/rules/preview (UI gọi lại mỗi lần
 * đổi nick/đích/giờ) và chính lúc tạo job. Cùng một hàm nên không bao giờ có chuyện
 * đèn xanh lúc xem trước mà lúc lưu lại bị chặn.
 */
import { type ContentSource, buildRuleContext } from "@/lib/rules/rule-context-builder";
import { type RuleEvaluation, evaluateRules } from "@/lib/rules/rules-engine";

export interface PreviewInput {
  /**
   * Content lấy từ kho, hoặc nháp đang gõ dở ở trang xếp lịch.
   *
   * Nháp chỉ để XEM THỬ verdict — lúc lưu, createPostJob cất nó thành ContentItem rồi mới tạo
   * job. Không có đường nào để một job trỏ vào content không nằm trong kho.
   */
  content: ContentSource;
  accountId: string;
  targetId: string;
  scheduledAt: Date;
  /** Bỏ qua chính job đang kiểm tra lại. */
  excludeJobId?: string;
}

export type PreviewResult =
  | { ok: true; evaluation: RuleEvaluation }
  | { ok: false; message: string };

export async function previewPostJobRules(input: PreviewInput): Promise<PreviewResult> {
  const built = await buildRuleContext({
    accountId: input.accountId,
    targetId: input.targetId,
    content: input.content,
    scheduledAt: input.scheduledAt,
    excludeJobId: input.excludeJobId,
  });

  if (!built.ok) return built;
  return { ok: true, evaluation: evaluateRules(built.ctx) };
}

/** Gom lý do của các luật đang chặn thành một đoạn đọc được. */
export function joinReasons(evaluation: RuleEvaluation): string {
  return evaluation.blocks.map((result) => `${result.label}: ${result.reason}`).join(" | ");
}
