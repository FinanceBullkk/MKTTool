/** Đèn xanh/vàng/đỏ của bộ luật, cùng bảng màu với trạng thái nick. */
import type { RuleEvaluation, RuleResult } from "@/lib/rules/rules-engine";
import type { RuleLevel } from "@/lib/rules/rule-types";
import { Check, CircleX, TriangleAlert, type LucideIcon } from "lucide-react";
import { Disclosure, StatusBadge } from "@/components/ui/page-section";

const LEVEL_PRESENTATION: Record<RuleLevel, { label: string; className: string }> = {
  ALLOW: {
    label: "Can post",
    className: "bg-emerald-400/[0.1] text-emerald-300",
  },
  WARN: {
    label: "Consider",
    className: "bg-amber-400/[0.1] text-amber-300",
  },
  BLOCK: {
    label: "Blocked",
    className: "bg-red-400/[0.1] text-red-300",
  },
};

export function RuleVerdictBadge({ level }: { level: RuleLevel }) {
  const presentation = LEVEL_PRESENTATION[level] ?? LEVEL_PRESENTATION.BLOCK;
  return <StatusBadge label={presentation.label} className={presentation.className} />;
}

const ROW_ICON: Record<RuleLevel, LucideIcon> = {
  ALLOW: Check,
  WARN: TriangleAlert,
  BLOCK: CircleX,
};

const ROW_CLASS: Record<RuleLevel, string> = {
  ALLOW: "text-neutral-500",
  WARN: "text-amber-300",
  BLOCK: "text-red-300",
};

function RuleResultRow({ result }: { result: RuleResult }) {
  const Icon = ROW_ICON[result.level] ?? CircleX;
  return (
    <li className={`flex gap-2 text-sm ${ROW_CLASS[result.level] ?? ""}`}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
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
        <Disclosure summary={`View ${passed.length} passed rule${passed.length === 1 ? "" : "s"}`} icon={Check}>
          <ul className="mt-2 space-y-1.5">
            {passed.map((result) => (
              <RuleResultRow key={result.id} result={result} />
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {skipped.length > 0 ? (
        <p className="text-xs text-neutral-500">
          Not applicable to this platform: {skipped.map((rule) => rule.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
