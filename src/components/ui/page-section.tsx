import Link from "next/link";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";

export const SMALL_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] px-3 text-xs font-semibold text-neutral-300 transition-colors hover:border-amber-400/35 hover:bg-amber-400/[0.06] hover:text-amber-200 active:bg-amber-400/[0.1] disabled:cursor-not-allowed disabled:opacity-40";

export const PRIMARY_BUTTON_CLASS =
  "brand-btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";

export const SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.025] px-4 text-sm font-semibold text-neutral-300 transition-colors hover:border-amber-400/30 hover:bg-amber-400/[0.06] hover:text-amber-100 active:bg-amber-400/[0.1] disabled:cursor-not-allowed disabled:opacity-40";

export const DANGER_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.1] px-4 text-sm font-semibold text-red-200 transition-colors hover:border-red-400/40 hover:bg-red-400/[0.16] active:bg-red-400/[0.2] disabled:cursor-not-allowed disabled:opacity-40";

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="app-page">{children}</div>;
}

export function PageHeading({
  title,
  description,
  eyebrow,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon ? (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/75">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] text-white sm:text-[1.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-[68ch] text-pretty text-sm leading-5 text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {children}
    </Link>
  );
}

export function Card({
  title,
  description,
  icon: Icon,
  action,
  children,
  tone = "default",
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  tone?: "default" | "muted" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/[0.025]"
      : tone === "muted"
        ? "bg-white/[0.018]"
        : "";

  return (
    <section className={`app-surface mb-5 rounded-2xl p-4 sm:p-5 ${toneClass}`}>
      {title || description || action ? (
        <div className="mb-4 flex items-start gap-3 border-b border-white/[0.07] pb-3.5">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-300">
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-sm font-semibold text-white">{title}</h2> : null}
            {description ? (
              <p className="mt-1 max-w-3xl text-xs leading-5 text-neutral-500">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  children,
  title = "Nothing here yet",
  icon: Icon = CircleDashed,
  action,
}: {
  children?: ReactNode;
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.1] bg-black/10 px-5 py-8 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-neutral-500">
        <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
      {children ? <div className="mt-1.5 max-w-lg text-sm leading-5 text-neutral-500">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Disclosure({
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
    <details className={`group rounded-xl border border-white/[0.08] bg-black/10 ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-neutral-300 marker:content-none">
        {Icon ? <Icon size={16} className="text-neutral-500" aria-hidden="true" /> : null}
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          size={15}
          className="shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-white/[0.07] p-4 text-sm text-neutral-400">{children}</div>
    </details>
  );
}

type ElementWithChildren = ReactElement<{ children?: ReactNode; className?: string }>;

function labelTableRows(children: ReactNode, headers: string[]): ReactNode {
  return Children.map(children, (row) => {
    if (!isValidElement(row)) return row;
    const typedRow = row as ElementWithChildren;
    const cells = Children.map(typedRow.props.children, (cell, index) => {
      if (!isValidElement(cell)) return cell;
      const typedCell = cell as ElementWithChildren;
      return cloneElement(typedCell, { "data-label": headers[index] ?? "" } as never);
    });
    return cloneElement(typedRow, { children: cells });
  });
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="responsive-data-table overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-white/[0.08] text-xs text-neutral-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="pb-3 pr-4 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.07]">{labelTableRows(children, headers)}</tbody>
      </table>
    </div>
  );
}
