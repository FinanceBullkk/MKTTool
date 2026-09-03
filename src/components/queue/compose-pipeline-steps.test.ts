/**
 * Băng chuyền phải nói CÙNG một thứ với bảng luật và với nút xếp lịch.
 *
 * Hai kiểu lệch cần chặn:
 *  1. Chặng "xong" trong khi nút xếp lịch còn khóa — dạy người dùng tin vào băng chuyền rồi
 *     ngồi thắc mắc vì sao không bấm được.
 *  2. Đèn ở chặng cuối khác đèn ở bảng verdict — lúc đó một trong hai đang nói dối, và người
 *     dùng không có cách nào biết là cái nào.
 */
import { describe, expect, it } from "vitest";
import type { RuleEvaluation } from "@/lib/rules/rules-engine";
import { buildComposeSteps } from "./compose-pipeline-steps";
import type { PreviewState } from "./use-rule-preview";

function evaluation(level: RuleEvaluation["level"], passed: number, failed = 0): RuleEvaluation {
  const results = [
    ...Array.from({ length: passed }, (_, index) => ({
      id: `pass-${index}`,
      label: `Passed rule ${index}`,
      level: "ALLOW" as const,
      reason: null,
      overridable: true,
    })),
    ...Array.from({ length: failed }, (_, index) => ({
      id: `fail-${index}`,
      label: `Rule issue ${index}`,
      level,
      reason: "reason",
      overridable: true,
    })),
  ];

  return {
    level,
    results,
    blocks: results.filter((result) => result.level === "BLOCK"),
    warnings: results.filter((result) => result.level === "WARN"),
    skipped: [],
    overridable: true,
  };
}

const FULL: Parameters<typeof buildComposeSteps>[0] = {
  contentMode: "library",
  contentLabel: "Value post",
  accountLabel: "nick-a",
  targetLabel: "r/selfhosted",
  scheduledLabel: "05/08 09:00",
  preview: { status: "idle" },
};

function stepOf(selection: Parameters<typeof buildComposeSteps>[0], key: string) {
  const step = buildComposeSteps(selection).find((item) => item.key === key);
  if (!step) throw new Error(`No stage found for ${key}`);
  return step;
}

describe("buildComposeSteps", () => {
  it("keeps an incomplete stage idle instead of marking it green", () => {
    const step = stepOf({ ...FULL, accountLabel: null }, "account");
    expect(step.state).toBe("idle");
    expect(step.value).toBe("Not selected");
  });

  it("focuses the draft title for Write new and the content selector for library mode", () => {
    expect(stepOf(FULL, "content").focusId).toBe("field-content");
    expect(stepOf({ ...FULL, contentMode: "draft" }, "content").focusId).toBe("field-draft-title");
  });

  it("keeps the rule stage idle until the preview runs", () => {
    expect(stepOf(FULL, "rules").state).toBe("idle");
    expect(stepOf({ ...FULL, preview: { status: "loading" } }, "rules").state).toBe("idle");
  });

  it.each([
    ["ALLOW", "ok", "Passed 10/10 rules"],
    ["WARN", "warn", "Passed 9/10 rules"],
    ["BLOCK", "bad", "Passed 9/10 rules"],
  ] as const)("Verdict %s turns light %s", (level, state, hint) => {
    // Nhánh ALLOW không có luật nào kêu, nên cả 10 đều tính là qua.
    const preview: PreviewState = { status: "ready", evaluation: evaluation(level, 9, 1) };
    const step = stepOf({ ...FULL, preview }, "rules");
    expect(step.state).toBe(state);
    expect(step.hint).toBe(hint);
  });

  it("shows a red rule stage when evaluation fails", () => {
    const preview: PreviewState = { status: "error", message: "Cannot call rule set." };
    expect(stepOf({ ...FULL, preview }, "rules").state).toBe("bad");
  });
});
