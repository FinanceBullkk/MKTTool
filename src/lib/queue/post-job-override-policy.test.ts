import { describe, expect, it } from "vitest";
import type { RuleEvaluation, RuleResult } from "@/lib/rules/rules-engine";
import { canOverride, shouldBlockOnRecheck } from "./post-job-override-policy";

const LY_DO = "Launch campaign, accept thicker posts today.";

function makeResult(overrides: Partial<RuleResult> = {}): RuleResult {
  return {
    id: "daily-cap",
    label: "Daily posting cap",
    level: "BLOCK",
    reason: "Nick has posted 2 times today.",
    overridable: true,
    ...overrides,
  };
}

/** Dựng một RuleEvaluation từ danh sách luật đang chặn. Rỗng = không chặn gì. */
function makeEvaluation(blocks: RuleResult[]): RuleEvaluation {
  return {
    level: blocks.length > 0 ? "BLOCK" : "ALLOW",
    results: blocks,
    blocks,
    warnings: [],
    skipped: [],
    overridable: blocks.every((block) => block.overridable),
  };
}

const THREAD_COLLISION = makeResult({
  id: "thread-collision",
  label: "Thread collision",
  reason: "Nick \"u/binh\" of mine has posted in this thread.",
  overridable: false,
});

describe("canOverride", () => {
  it("allow overriding when the rule blocks and there is a reason", () => {
    expect(canOverride(makeEvaluation([makeResult()]), LY_DO)).toBe(true);
  });

  it("reject when lacking a reason", () => {
    expect(canOverride(makeEvaluation([makeResult()]), null)).toBe(false);
    expect(canOverride(makeEvaluation([makeResult()]), undefined)).toBe(false);
  });

  it("reject reason consisting only of whitespace", () => {
    expect(canOverride(makeEvaluation([makeResult()]), "   ")).toBe(false);
  });

  it("reject when there is a blocking override rule, no matter how good the reason is", () => {
    expect(canOverride(makeEvaluation([THREAD_COLLISION]), LY_DO)).toBe(false);
  });

  it("reject when the blocking override rule is accompanied by an overridable rule", () => {
    expect(canOverride(makeEvaluation([makeResult(), THREAD_COLLISION]), LY_DO)).toBe(false);
  });
});

describe("shouldBlockOnRecheck", () => {
  it("do not block when the rule set allows it", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([]), null)).toBe(false);
  });

  it("block job that is blocked by a rule but not yet overridden", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult()]), null)).toBe(true);
  });

  it("to leave a valid overridden job waiting in the queue", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult()]), LY_DO)).toBe(false);
  });

  /**
   * Đây là lỗ hổng từng có thật: job ghi đè luật hạn mức ngày, sau đó nick khác đăng vào
   * đúng thread. Bản cũ chỉ hỏi "có overrideReason không" nên job vẫn nằm PENDING —
   * luật duy nhất không cho ghi đè bị vượt qua bằng lý do viết cho một luật khác.
   */
  it("block when a new blocking override rule surfaces, even if the job already has an old override reason", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([THREAD_COLLISION]), LY_DO)).toBe(true);
  });

  it("block when a new blocking override rule surfaces alongside the old rule that has been overridden", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult(), THREAD_COLLISION]), LY_DO)).toBe(true);
  });
});
