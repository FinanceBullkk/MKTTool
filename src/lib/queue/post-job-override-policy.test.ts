import { describe, expect, it } from "vitest";
import type { RuleEvaluation, RuleResult } from "@/lib/rules/rules-engine";
import { canOverride, shouldBlockOnRecheck } from "./post-job-override-policy";

const LY_DO = "Chiến dịch ra mắt, chấp nhận đăng dày hơn trong hôm nay.";

function makeResult(overrides: Partial<RuleResult> = {}): RuleResult {
  return {
    id: "daily-cap",
    label: "Hạn mức ngày",
    level: "BLOCK",
    reason: "Nick đã có 2 bài hôm nay.",
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
  label: "Đụng độ thread",
  reason: 'Nick "u/binh" của mình đã đăng ở đúng thread này.',
  overridable: false,
});

describe("canOverride", () => {
  it("cho qua khi luật chặn đều ghi đè được và có lý do", () => {
    expect(canOverride(makeEvaluation([makeResult()]), LY_DO)).toBe(true);
  });

  it("từ chối khi thiếu lý do", () => {
    expect(canOverride(makeEvaluation([makeResult()]), null)).toBe(false);
    expect(canOverride(makeEvaluation([makeResult()]), undefined)).toBe(false);
  });

  it("từ chối lý do chỉ toàn khoảng trắng", () => {
    expect(canOverride(makeEvaluation([makeResult()]), "   ")).toBe(false);
  });

  it("từ chối khi có luật cấm ghi đè, dù lý do có hay tới đâu", () => {
    expect(canOverride(makeEvaluation([THREAD_COLLISION]), LY_DO)).toBe(false);
  });

  it("từ chối khi luật cấm ghi đè đi kèm luật ghi đè được", () => {
    expect(canOverride(makeEvaluation([makeResult(), THREAD_COLLISION]), LY_DO)).toBe(false);
  });
});

describe("shouldBlockOnRecheck", () => {
  it("không chặn khi bộ luật cho qua", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([]), null)).toBe(false);
  });

  it("chặn job bị luật chặn mà chưa từng ghi đè", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult()]), null)).toBe(true);
  });

  it("để job đã ghi đè hợp lệ nằm chờ tiếp", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult()]), LY_DO)).toBe(false);
  });

  /**
   * Đây là lỗ hổng từng có thật: job ghi đè luật hạn mức ngày, sau đó nick khác đăng vào
   * đúng thread. Bản cũ chỉ hỏi "có overrideReason không" nên job vẫn nằm PENDING —
   * luật duy nhất không cho ghi đè bị vượt qua bằng lý do viết cho một luật khác.
   */
  it("chặn khi luật cấm ghi đè mới lòi ra, dù job đã có lý do ghi đè cũ", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([THREAD_COLLISION]), LY_DO)).toBe(true);
  });

  it("chặn khi luật cấm ghi đè lòi ra bên cạnh luật cũ đã được ghi đè", () => {
    expect(shouldBlockOnRecheck(makeEvaluation([makeResult(), THREAD_COLLISION]), LY_DO)).toBe(true);
  });
});
