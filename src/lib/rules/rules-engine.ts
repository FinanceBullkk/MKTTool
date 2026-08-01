/**
 * Bộ luật an toàn — chạy tuần tự 9 phép kiểm tra, gom mọi verdict, mức nặng nhất thắng.
 *
 * Nguyên tắc: KHÔNG dừng ở luật chặn đầu tiên. Bạn MKT cần thấy hết mọi vấn đề trong một lần
 * để sửa một lượt, chứ không phải sửa xong lại lòi ra lỗi tiếp.
 *
 * Chạy hết 9 luật trên dữ liệu đã nạp sẵn tốn chưa tới 1ms — phần chậm duy nhất là truy vấn
 * database ở rule-context-builder.ts.
 */
import { ruleAccountHealth, ruleColdStart } from "./rule-account-health";
import { ruleContentSimilarity } from "./rule-content-similarity";
import { ruleDailyCap } from "./rule-daily-cap";
import { ruleLinkPolicy } from "./rule-link-policy";
import { rulePromoRatio } from "./rule-promo-ratio";
import { ruleTargetCooldown } from "./rule-target-cooldown";
import { ruleTargetEligibility } from "./rule-target-eligibility";
import { ruleThreadCollision } from "./rule-thread-collision";
import {
  LEVEL_SEVERITY,
  type RuleContext,
  type RuleEvaluator,
  type RuleLevel,
  type RuleVerdict,
} from "./rule-types";

interface RuleDefinition {
  id: string;
  label: string;
  evaluate: RuleEvaluator;
  /** Người dùng có được phép bỏ qua khi luật này chặn không. */
  overridable: boolean;
}

const RULES: RuleDefinition[] = [
  { id: "account-health", label: "Sức khỏe nick", evaluate: ruleAccountHealth, overridable: true },
  { id: "cold-start", label: "Cold start", evaluate: ruleColdStart, overridable: true },
  {
    id: "target-eligibility",
    label: "Điều kiện đích",
    evaluate: ruleTargetEligibility,
    overridable: true,
  },
  { id: "daily-cap", label: "Hạn mức ngày", evaluate: ruleDailyCap, overridable: true },
  { id: "target-cooldown", label: "Nghỉ giữa 2 bài", evaluate: ruleTargetCooldown, overridable: true },
  { id: "promo-ratio", label: "Tỷ lệ promo", evaluate: rulePromoRatio, overridable: true },
  {
    id: "content-similarity",
    label: "Trùng nội dung",
    evaluate: ruleContentSimilarity,
    overridable: true,
  },
  // Luật duy nhất không cho ghi đè — xem đầu file rule-thread-collision.ts.
  {
    id: "thread-collision",
    label: "Đụng độ thread",
    evaluate: ruleThreadCollision,
    overridable: false,
  },
  { id: "link-policy", label: "Chính sách link", evaluate: ruleLinkPolicy, overridable: true },
];

export interface RuleResult {
  id: string;
  label: string;
  level: RuleLevel;
  reason: string | null;
  overridable: boolean;
}

export interface RuleEvaluation {
  level: RuleLevel;
  /** Kết quả của mọi luật, kể cả luật cho qua — để UI hiện checklist đầy đủ. */
  results: RuleResult[];
  blocks: RuleResult[];
  warnings: RuleResult[];
  /** false khi có ít nhất một luật không-cho-ghi-đè đang chặn. */
  overridable: boolean;
}

function toResult(rule: RuleDefinition, verdict: RuleVerdict): RuleResult {
  return {
    id: rule.id,
    label: rule.label,
    level: verdict.level,
    reason: verdict.level === "ALLOW" ? null : verdict.reason,
    overridable: rule.overridable,
  };
}

export function evaluateRules(ctx: RuleContext): RuleEvaluation {
  const results = RULES.map((rule) => toResult(rule, rule.evaluate(ctx)));

  const blocks = results.filter((result) => result.level === "BLOCK");
  const warnings = results.filter((result) => result.level === "WARN");

  const level = results.reduce<RuleLevel>(
    (worst, result) => (LEVEL_SEVERITY[result.level] > LEVEL_SEVERITY[worst] ? result.level : worst),
    "ALLOW",
  );

  return {
    level,
    results,
    blocks,
    warnings,
    overridable: blocks.every((result) => result.overridable),
  };
}

/** Một dòng tóm tắt cho bảng hàng đợi và thông báo của server action. */
export function summarizeEvaluation(evaluation: RuleEvaluation): string {
  if (evaluation.level === "BLOCK") {
    return `Bị chặn bởi ${evaluation.blocks.length} luật: ${evaluation.blocks
      .map((result) => result.label)
      .join(", ")}.`;
  }
  if (evaluation.level === "WARN") {
    return `Đăng được nhưng có ${evaluation.warnings.length} cảnh báo: ${evaluation.warnings
      .map((result) => result.label)
      .join(", ")}.`;
  }
  return "Không vi phạm luật nào.";
}

export function serializeEvaluation(evaluation: RuleEvaluation): string {
  return JSON.stringify(evaluation);
}

/** Verdict cũ lưu trong DB có thể thuộc phiên bản luật cũ — hỏng thì bỏ qua, không làm sập trang. */
export function deserializeEvaluation(raw: string | null): RuleEvaluation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RuleEvaluation;
    return Array.isArray(parsed?.results) ? parsed : null;
  } catch {
    return null;
  }
}
