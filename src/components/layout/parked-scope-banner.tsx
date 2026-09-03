/**
 * One-line notice at the top of a route outside the current team rollout scope.
 *
 * Parked is not deleted. These routes stay reachable by URL for history and
 * reference, while server-side guards keep every posting action closed.
 */
import Link from "next/link";

export function ParkedScopeBanner({ what }: { what: string }) {
  return (
    <div
      role="note"
      className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-amber-200/90"
    >
      Parked - {what} was removed from the rollout scope on 2 September 2026. This page is for
      viewing history only; posting is unavailable.{" "}
      <Link href="/accounts" className="font-medium underline">
        Return to the nick vault
      </Link>
      .
    </div>
  );
}
