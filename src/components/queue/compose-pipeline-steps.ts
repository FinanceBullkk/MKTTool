/**
 * Dựng các chặng của băng chuyền ở trang xếp lịch từ lựa chọn hiện tại.
 *
 * Hàm thuần, tách khỏi composer để test được mà không cần dựng cả form — phần dễ sai ở đây là
 * ánh xạ verdict sang màu: băng chuyền báo xanh trong khi bảng luật báo đỏ thì thà đừng có
 * băng chuyền, vì lúc đó nó dạy người dùng tin nhầm chỗ.
 *
 * Chặng chỉ "xong" khi phần đó đủ để LƯU, không phải khi đã gõ vài chữ — nếu không, nút xếp
 * lịch vẫn khóa mà băng chuyền lại nói xong hết.
 */
import type { RuleLevel } from "@/lib/rules/rule-types";
import type { ContentMode } from "./content-source-picker";
import type { PipelineStep, StepState } from "./pipeline-strip";
import type { PreviewState } from "./use-rule-preview";

const VERDICT_STATE: Record<RuleLevel, StepState> = {
  ALLOW: "ok",
  WARN: "warn",
  BLOCK: "bad",
};

const VERDICT_LABEL: Record<RuleLevel, string> = {
  ALLOW: "Can post",
  WARN: "Consider",
  BLOCK: "Blocked",
};

export interface ComposeSelection {
  contentMode: ContentMode;
  /** `null` khi phần đó chưa đủ để lưu. */
  contentLabel: string | null;
  accountLabel: string | null;
  targetLabel: string | null;
  scheduledLabel: string | null;
  preview: PreviewState;
}

function fieldStep(
  key: string,
  label: string,
  value: string | null,
  focusId: string,
  hint?: string,
): PipelineStep {
  return {
    key,
    label,
    value: value ?? "Not selected",
    hint: value ? hint : undefined,
    state: value ? "ok" : "idle",
    focusId,
  };
}

/**
 * Nhãn KHÔNG ghi cứng "10 luật": đích Facebook Page chỉ áp 5 luật, số còn lại không áp dụng cho
 * nền tảng đó. Ghi cứng thì chặng này tự mâu thuẫn — "10 luật · qua 5/5".
 */
function ruleStep(preview: PreviewState): PipelineStep {
  const base = { key: "rules", label: "Rule set" };

  if (preview.status === "idle") return { ...base, value: "Complete all 4 fields", state: "idle" };
  if (preview.status === "loading") return { ...base, value: "Evaluating...", state: "idle" };
  if (preview.status === "error") {
    return { ...base, value: "Could not evaluate", hint: "See the reason below", state: "bad" };
  }

  const { evaluation } = preview;
  const passed = evaluation.results.filter((result) => result.level === "ALLOW").length;

  return {
    ...base,
    value: VERDICT_LABEL[evaluation.level] ?? "Blocked",
    hint: `Passed ${passed}/${evaluation.results.length} rules`,
    state: VERDICT_STATE[evaluation.level] ?? "bad",
  };
}

export function buildComposeSteps(selection: ComposeSelection): PipelineStep[] {
  const draft = selection.contentMode === "draft";

  return [
    fieldStep(
      "content",
      "Content",
      selection.contentLabel,
      draft ? "field-draft-title" : "field-content",
      draft ? "New draft; saved to library" : "From content library",
    ),
    fieldStep("account", "Nick", selection.accountLabel, "field-account"),
    fieldStep("target", "Target", selection.targetLabel, "field-target"),
    fieldStep("scheduled", "Posting time", selection.scheduledLabel, "field-scheduled"),
    ruleStep(selection.preview),
  ];
}
