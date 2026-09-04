"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-page flex min-h-[65dvh] items-center justify-center">
      <section className="app-surface w-full max-w-xl rounded-2xl p-6 text-center sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-red-400/20 bg-red-400/[0.08] text-red-200">
          <CircleAlert size={21} aria-hidden="true" />
        </span>
        <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300/80">
          Request interrupted
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">This view could not be loaded</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
          No action was confirmed by this screen. Retry once; contact an administrator if the same
          view fails again.
        </p>
        <button type="button" onClick={reset} className={`${PRIMARY_BUTTON_CLASS} mt-6`}>
          <RotateCw size={16} aria-hidden="true" />
          Retry
        </button>
      </section>
    </main>
  );
}
