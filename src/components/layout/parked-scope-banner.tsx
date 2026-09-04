/**
 * One-line notice at the top of a route outside the current team rollout scope.
 *
 * Parked is not deleted. These routes stay reachable by URL for history and
 * reference, while server-side guards keep every posting action closed.
 */
import Link from "next/link";
import { Archive, ChevronDown } from "lucide-react";

export function ParkedScopeBanner({ what }: { what: string }) {
  return (
    <details
      role="note"
      className="group mb-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.055] text-amber-100"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 marker:content-none">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
          <Archive size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Parked workflow</span>
          <span className="block truncate text-[11px] text-amber-200/65">{what} · viewing history only</span>
        </span>
        <ChevronDown size={15} className="text-amber-200/60 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-amber-400/15 px-4 py-3 text-xs leading-5 text-amber-100/75">
        Removed from team rollout on 2 September 2026. Existing records remain visible, but posting
        is unavailable. <Link href="/accounts" className="font-semibold underline">Return to the nick vault</Link>.
      </div>
    </details>
  );
}
