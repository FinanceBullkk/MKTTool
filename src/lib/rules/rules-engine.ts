/**
 * Bộ luật an toàn — 10 phép kiểm tra, chạy tuần tự những luật áp cho nền tảng của đích,
 * gom mọi verdict, mức nặng nhất thắng.
 *
 * Số luật thực chạy khác nhau theo nền tảng: Reddit 10, Facebook Group 9 (trừ luật dò
 * shadowban), Fanpage 5 (trừ thêm bốn luật giữ nhịp cộng đồng).
 *
 * Nguyên tắc: KHÔNG dừng ở luật chặn đầu tiên. Bạn MKT cần thấy hết mọi vấn đề trong một lần
 * để sửa một lượt, chứ không phải sửa xong lại lòi ra lỗi tiếp.
 *
 * Không phải luật nào cũng áp cho mọi nền tảng — xem `platforms` ở từng mục trong RULES.
 * Luật không áp dụng bị loại TRƯỚC khi chạy và được liệt kê riêng trong `skipped`, chứ không
 * lặng lẽ trả ALLOW: lỗ hổng im lặng trong một hệ thống an toàn là thứ nguy hiểm nhất.
 *
 * Chạy hết luật trên dữ liệu đã nạp sẵn tốn chưa tới 1ms — phần chậm duy nhất là truy vấn
 * database ở rule-context-builder.ts.
 */
import { COMMUNITY_PLATFORMS } from "@/lib/platforms/platform-family";
import { ruleAccountHealth, ruleColdStart } from "./rule-account-health";
import { ruleContentSimilarity } from "./rule-content-similarity";
import { ruleDailyCap } from "./rule-daily-cap";
import { ruleHealthCheck } from "./rule-health-check";
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
  /**
   * Nền tảng mà luật này áp dụng. Bỏ trống = áp cho mọi nền tảng.
   *
   * Chỉ khai khi luật thật sự VÔ NGHĨA ở nền tảng khác, đừng khai để né phiền: mặc định
   * phải là "luật áp cho tất cả", nếu không bộ luật sẽ mục ruỗng dần từng nền tảng một.
   */
  platforms?: readonly string[];
}

const RULES: RuleDefinition[] = [
  { id: "account-health", label: "Nick health", evaluate: ruleAccountHealth, overridable: true },
  { id: "cold-start", label: "Cold start", evaluate: ruleColdStart, overridable: true },
  {
    id: "target-eligibility",
    label: "Target eligibility",
    evaluate: ruleTargetEligibility,
    overridable: true,
  },
  // Bốn luật dưới đây giữ nhịp cho nick đi xin phép ở nhà người khác. Fanpage là kênh của
  // chính mình nên không áp — xem COMMUNITY_PLATFORMS trong platform-family.ts.
  {
    id: "daily-cap",
    label: "Daily posting cap",
    evaluate: ruleDailyCap,
    overridable: true,
    platforms: COMMUNITY_PLATFORMS,
  },
  {
    id: "target-cooldown",
    label: "Same-target cooldown",
    evaluate: ruleTargetCooldown,
    overridable: true,
    platforms: COMMUNITY_PLATFORMS,
  },
  {
    id: "promo-ratio",
    label: "Promotional ratio",
    evaluate: rulePromoRatio,
    overridable: true,
    platforms: COMMUNITY_PLATFORMS,
  },
  {
    id: "content-similarity",
    label: "Content similarity",
    evaluate: ruleContentSimilarity,
    overridable: true,
  },
  // Luật duy nhất không cho ghi đè — xem đầu file rule-thread-collision.ts.
  //
  // Nhãn nói "cùng đích" chứ không phải "đúng thread" là có chủ đích: lúc xếp lịch, bài
  // chưa tồn tại nên chưa có thread để so, `ctx.threadCollisions` luôn rỗng và ở đây luật
  // chỉ chạy được nhánh cảnh báo "nick khác vừa hoạt động cùng đích". Nhánh CHẶN theo đúng
  // thread nằm ở form ghi tương tác (interaction-actions.ts), nơi mới có link thread thật.
  // Ghi "Đụng độ thread ✓" trong checklist là để người dùng tưởng đã kiểm thứ chưa kiểm.
  {
    id: "thread-collision",
    label: "Same-target collision (another nick)",
    evaluate: ruleThreadCollision,
    overridable: false,
    platforms: COMMUNITY_PLATFORMS,
  },
  { id: "link-policy", label: "Link policy", evaluate: ruleLinkPolicy, overridable: true },
  // Chỉ Reddit: Fanpage đăng bằng Graph API nên đăng hỏng là báo lỗi ngay, không có kiểu
  // bài lên mà không ai thấy. Xem đầu file rule-health-check.ts.
  {
    id: "health-check",
    label: "Latest health check",
    evaluate: ruleHealthCheck,
    overridable: true,
    platforms: ["REDDIT"],
  },
];

/** Luật nào chạy cho nền tảng này. Bỏ trống `platforms` nghĩa là áp cho tất cả. */
function appliesTo(rule: RuleDefinition, platform: string): boolean {
  return !rule.platforms || rule.platforms.includes(platform);
}

export interface RuleResult {
  id: string;
  label: string;
  level: RuleLevel;
  reason: string | null;
  overridable: boolean;
}

export interface SkippedRule {
  id: string;
  label: string;
}

export interface RuleEvaluation {
  level: RuleLevel;
  /** Kết quả của mọi luật ĐÃ CHẠY, kể cả luật cho qua — để UI hiện checklist đầy đủ. */
  results: RuleResult[];
  blocks: RuleResult[];
  warnings: RuleResult[];
  /** Luật không áp dụng cho nền tảng của đích này. Hiện ra để người dùng biết còn thiếu gì. */
  skipped: SkippedRule[];
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
  const platform = ctx.target.platform;

  const results = RULES.filter((rule) => appliesTo(rule, platform)).map((rule) =>
    toResult(rule, rule.evaluate(ctx)),
  );

  const skipped = RULES.filter((rule) => !appliesTo(rule, platform)).map((rule) => ({
    id: rule.id,
    label: rule.label,
  }));

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
    skipped,
    overridable: blocks.every((result) => result.overridable),
  };
}

/** Một dòng tóm tắt cho bảng hàng đợi và thông báo của server action. */
export function summarizeEvaluation(evaluation: RuleEvaluation): string {
  if (evaluation.level === "BLOCK") {
    return `Blocked by ${evaluation.blocks.length} rule${evaluation.blocks.length === 1 ? "" : "s"}: ${evaluation.blocks
      .map((result) => result.label)
      .join(", ")}.`;
  }
  if (evaluation.level === "WARN") {
    return `Allowed with ${evaluation.warnings.length} warning${evaluation.warnings.length === 1 ? "" : "s"}: ${evaluation.warnings
      .map((result) => result.label)
      .join(", ")}.`;
  }
  return "No posting rules were violated.";
}

export function serializeEvaluation(evaluation: RuleEvaluation): string {
  return JSON.stringify(evaluation);
}

/** Verdict cũ lưu trong DB có thể thuộc phiên bản luật cũ — hỏng thì bỏ qua, không làm sập trang. */
export function deserializeEvaluation(raw: string | null): RuleEvaluation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RuleEvaluation;
    if (!Array.isArray(parsed?.results)) return null;

    // Verdict lưu trước khi có luật theo nền tảng không có trường `skipped`.
    // Bù mảng rỗng, đừng để trang hàng đợi sập vì một bản ghi cũ.
    return { ...parsed, skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [] };
  } catch {
    return null;
  }
}
