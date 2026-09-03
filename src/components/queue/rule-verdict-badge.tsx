/** Đèn xanh/vàng/đỏ của bộ luật, cùng bảng màu với trạng thái nick. */
import type { RuleEvaluation, RuleResult } from "@/lib/rules/rules-engine";
import type { RuleLevel } from "@/lib/rules/rule-types";

const LEVEL_PRESENTATION: Record<RuleLevel, { label: string; className: string }> = {
  ALLOW: {
    label: "Can post",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  WARN: {
    label: "Consider",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  BLOCK: {
    label: "Blocked",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

export function RuleVerdictBadge({ level }: { level: RuleLevel }) {
  const presentation = LEVEL_PRESENTATION[level] ?? LEVEL_PRESENTATION.BLOCK;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}

const ROW_ICON: Record<RuleLevel, string> = { ALLOW: "✓", WARN: "!", BLOCK: "✕" };

const ROW_CLASS: Record<RuleLevel, string> = {
  ALLOW: "text-neutral-500",
  WARN: "text-amber-700 dark:text-amber-400",
  BLOCK: "text-red-700 dark:text-red-400",
};

function RuleResultRow({ result }: { result: RuleResult }) {
  return (
    <li className={`flex gap-2 text-sm ${ROW_CLASS[result.level] ?? ""}`}>
      <span className="w-4 shrink-0 text-center font-bold">{ROW_ICON[result.level] ?? "?"}</span>
      <span>
        <span className="font-medium">{result.label}</span>
        {result.reason ? ` — ${result.reason}` : null}
        {result.level === "BLOCK" && !result.overridable ? (
          <span className="ml-1 font-medium">(not overridable)</span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Checklist đầy đủ. Luật cho qua vẫn hiện — bạn MKT cần thấy công cụ đã kiểm tra gì,
 * không chỉ thấy thứ bị chặn. Luật không áp dụng cho nền tảng này cũng nói rõ, chứ không
 * để người dùng tưởng nó đã kiểm mà thật ra không.
 */
export function RuleVerdictPanel({ evaluation }: { evaluation: RuleEvaluation }) {
  const failed = evaluation.results.filter((result) => result.level !== "ALLOW");
  const passed = evaluation.results.filter((result) => result.level === "ALLOW");
  // Verdict cũ lưu trước khi có luật theo nền tảng không có trường này.
  const skipped = evaluation.skipped ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RuleVerdictBadge level={evaluation.level} />
        <span className="text-xs text-neutral-500">
          {failed.length === 0
            ? `Passed all ${evaluation.results.length} rules`
            : `${passed.length}/${evaluation.results.length} rules passed`}
        </span>
      </div>

      <ul className="space-y-1.5">
        {failed.map((result) => (
          <RuleResultRow key={result.id} result={result} />
        ))}
      </ul>

      {passed.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs text-neutral-500">
            View {passed.length} passed rule{passed.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {passed.map((result) => (
              <RuleResultRow key={result.id} result={result} />
            ))}
          </ul>
        </details>
      ) : null}

      {skipped.length > 0 ? (
        <p className="text-xs text-neutral-500">
          Not applicable to this platform: {skipped.map((rule) => rule.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
