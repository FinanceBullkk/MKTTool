import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";

export default function NotFound() {
  return (
    <main className="app-page flex min-h-[65dvh] items-center justify-center">
      <section className="app-surface w-full max-w-xl rounded-2xl p-6 text-center sm:p-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
          <FileQuestion size={21} aria-hidden="true" />
        </span>
        <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/75">
          Route not found
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">This page is not in the console</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-400">
          The link may be old or the record may have been removed. Return to the workspace overview
          and choose a current destination.
        </p>
        <Link href="/" className={`${PRIMARY_BUTTON_CLASS} mt-6`}>
          <ArrowLeft size={16} aria-hidden="true" />
          Workspace overview
        </Link>
      </section>
    </main>
  );
}
