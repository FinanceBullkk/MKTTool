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
      label: `Luật qua ${index}`,
      level: "ALLOW" as const,
      reason: null,
      overridable: true,
    })),
    ...Array.from({ length: failed }, (_, index) => ({
      id: `fail-${index}`,
      label: `Luật kêu ${index}`,
      level,
      reason: "lý do",
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
  contentLabel: "Bài hữu ích",
  accountLabel: "nick-a",
  targetLabel: "r/selfhosted",
  scheduledLabel: "05/08 09:00",
  preview: { status: "idle" },
};

function stepOf(selection: Parameters<typeof buildComposeSteps>[0], key: string) {
  const step = buildComposeSteps(selection).find((item) => item.key === key);
  if (!step) throw new Error(`không có chặng ${key}`);
  return step;
}

describe("buildComposeSteps", () => {
  it("chặng thiếu dữ liệu thì để trạng thái chờ, không phải xanh", () => {
    const step = stepOf({ ...FULL, accountLabel: null }, "account");
    expect(step.state).toBe("idle");
    expect(step.value).toBe("chưa chọn");
  });

  it("tab Viết mới trỏ vào ô tiêu đề nháp, tab kho trỏ vào ô chọn content", () => {
    expect(stepOf(FULL, "content").focusId).toBe("field-content");
    expect(stepOf({ ...FULL, contentMode: "draft" }, "content").focusId).toBe("field-draft-title");
  });

  it("chưa chấm xong thì chặng luật không hiện đèn nào", () => {
    expect(stepOf(FULL, "rules").state).toBe("idle");
    expect(stepOf({ ...FULL, preview: { status: "loading" } }, "rules").state).toBe("idle");
  });

  it.each([
    ["ALLOW", "ok", "qua 10/10 luật"],
    ["WARN", "warn", "qua 9/10 luật"],
    ["BLOCK", "bad", "qua 9/10 luật"],
  ] as const)("verdict %s ra đèn %s", (level, state, hint) => {
    // Nhánh ALLOW không có luật nào kêu, nên cả 10 đều tính là qua.
    const preview: PreviewState = { status: "ready", evaluation: evaluation(level, 9, 1) };
    const step = stepOf({ ...FULL, preview }, "rules");
    expect(step.state).toBe(state);
    expect(step.hint).toBe(hint);
  });

  it("gọi bộ luật hỏng thì báo đỏ chứ không im lặng để xanh", () => {
    const preview: PreviewState = { status: "error", message: "Không gọi được bộ luật." };
    expect(stepOf({ ...FULL, preview }, "rules").state).toBe("bad");
  });
});
