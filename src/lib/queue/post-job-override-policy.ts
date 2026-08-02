/**
 * Một chỗ duy nhất trả lời: "kết quả chấm luật này có được đi tiếp không?"
 *
 * Câu hỏi đó xuất hiện ở hai đường — lúc tạo job và lúc chấm lại job đang chờ — và trước đây
 * hai đường trả lời khác nhau: `recheckJob` chỉ nhìn `overrideReason` có tồn tại hay không,
 * nên một lần ghi đè luật nhẹ (ví dụ hạn mức ngày) vô tình miễn trừ luôn cho luật đụng độ
 * thread phát sinh sau đó — đúng cái luật duy nhất KHÔNG được phép ghi đè.
 *
 * Nên nhớ: `overrideReason` là bằng chứng của một lần ghi đè trong QUÁ KHỨ, cho một tập luật
 * đã khác. Nó không bao giờ là câu trả lời cho "lần chấm này có qua được không".
 */
import type { RuleEvaluation } from "@/lib/rules/rules-engine";

/**
 * Lần ghi đè này có hợp lệ không.
 *
 * Hai điều kiện, thiếu một là không: không luật nào trong nhóm đang chặn thuộc loại cấm ghi đè,
 * và người dùng đã nêu lý do.
 */
export function canOverride(
  evaluation: RuleEvaluation,
  overrideReason: string | null | undefined,
): boolean {
  return evaluation.overridable && Boolean(overrideReason?.trim());
}

/**
 * Chấm lại một job đang chờ: có phải đẩy nó sang BLOCKED không.
 *
 * Job từng ghi đè hợp lệ thì vẫn được nằm chờ — trừ khi lần chấm này lòi ra một luật
 * cấm ghi đè, lúc đó lý do cũ không mua được gì.
 */
export function shouldBlockOnRecheck(
  evaluation: RuleEvaluation,
  overrideReason: string | null | undefined,
): boolean {
  if (evaluation.level !== "BLOCK") return false;
  return !canOverride(evaluation, overrideReason);
}
