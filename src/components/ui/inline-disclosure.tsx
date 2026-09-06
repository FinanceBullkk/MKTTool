import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function InlineDisclosure({
  summary,
  children,
  icon: Icon,
  className = "",
}: {
  summary: string;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/[0.035] hover:text-neutral-200 marker:content-none">
        {Icon ? <Icon size={15} className="text-neutral-500" aria-hidden="true" /> : null}
        <span>{summary}</span>
        <ChevronDown
          size={14}
          className="text-neutral-600 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-l border-white/[0.08] pb-1 pl-4 pt-1 text-sm text-neutral-400">
        {children}
      </div>
    </details>
  );
}
