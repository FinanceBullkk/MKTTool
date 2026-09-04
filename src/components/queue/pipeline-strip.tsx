"use client";

/**
 * Băng chuyền trạng thái: một bài đi qua những chặng nào, và đang tắc ở chặng nào.
 *
 * Có hai chỗ dùng, cùng một hình dạng nhưng khác câu hỏi:
 *  - Trang xếp lịch: bốn ô cần điền cộng đèn luật. Bấm chặng nào thì con trỏ nhảy vào ô nhập đó,
 *    nên nó là đường tắt chứ không phải hình trang trí.
 *  - Trang Hôm nay: quãng SAU khi xếp lịch (chờ đăng → quá giờ → đã đăng → tương tác đã ghi).
 *    Quãng này trước giờ không hiện ở đâu cả, trong khi mắt xích hay đứt nhất nằm đúng ở đó:
 *    quên bấm "Đã đăng" thì bộ luật coi như bài chưa từng tồn tại.
 *
 * Thuần trình bày — mọi con số do trang gọi tính sẵn rồi truyền vào.
 */
import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type StepState = "idle" | "ok" | "warn" | "bad";

export interface PipelineStep {
  key: string;
  /** Tên chặng, ví dụ "Nick" hoặc "Đã đăng". */
  label: string;
  value: string;
  hint?: string;
  state: StepState;
  /** id của ô nhập tương ứng — bấm vào chặng thì con trỏ nhảy vào đó. */
  focusId?: string;
  /** Chặng dẫn sang trang khác thay vì một ô nhập. */
  href?: string;
}

const STATE_CLASS: Record<StepState, string> = {
  idle: "border-dashed border-white/[0.1] bg-black/10",
  ok: "border-white/[0.08] bg-white/[0.025]",
  warn: "border-amber-400/20 bg-amber-400/[0.06]",
  bad: "border-red-400/20 bg-red-400/[0.06]",
};

const VALUE_CLASS: Record<StepState, string> = {
  idle: "text-neutral-400",
  ok: "text-neutral-100",
  warn: "text-amber-300",
  bad: "text-red-300",
};

const NODE_CLASS =
  "flex min-h-14 min-w-[8rem] flex-1 flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors";

/** Đưa con trỏ tới ô nhập của chặng vừa bấm. Ô không tồn tại thì im lặng bỏ qua. */
function focusField(id: string) {
  const field = document.getElementById(id);
  if (!field) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  field.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  field.focus({ preventScroll: true });
}

function StepBody({ step }: { step: PipelineStep }) {
  return (
    <>
      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-neutral-500">
        {step.label}
      </span>
      <span className={`text-sm font-medium ${VALUE_CLASS[step.state]}`}>{step.value}</span>
      {step.hint ? <span className="text-xs text-neutral-500">{step.hint}</span> : null}
    </>
  );
}

function StepNode({ step }: { step: PipelineStep }) {
  const className = `${NODE_CLASS} ${STATE_CLASS[step.state]}`;
  const interactive = "hover:border-amber-400/30 hover:bg-amber-400/[0.04]";

  if (step.href) {
    return (
      <Link href={step.href} className={`${className} ${interactive}`}>
        <StepBody step={step} />
      </Link>
    );
  }

  if (step.focusId) {
    const focusId = step.focusId;
    return (
      <button
        type="button"
        title="Click to jump to input field"
        className={`${className} ${interactive}`}
        onClick={() => focusField(focusId)}
      >
        <StepBody step={step} />
      </button>
    );
  }

  return (
    <div className={className}>
      <StepBody step={step} />
    </div>
  );
}

export function PipelineStrip({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
      {steps.map((step, index) => (
        <Fragment key={step.key}>
          {index > 0 ? (
            <ChevronRight size={14} aria-hidden="true" className="self-center shrink-0 text-neutral-700" />
          ) : null}
          <StepNode step={step} />
        </Fragment>
      ))}
    </div>
  );
}
