import type { SelectionChange } from "@/lib/forms/selection-change";

export function AccountProxyChangeConfirmation({
  change,
  pending,
  onConfirm,
  onCancel,
}: {
  change: SelectionChange;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p className="font-medium text-amber-900 dark:text-amber-300">
        Review the proxy change before saving.
      </p>
      <p className="text-neutral-700 dark:text-neutral-300">
        <strong>Proxy:</strong> {change.beforeLabel} -&gt; {change.afterLabel}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900 dark:text-amber-300">
        <li>The next safe browser launch pushes this proxy into the existing browser profile.</li>
        <li>Removing the proxy blocks browser-backed launch until another static proxy is assigned.</li>
        <li>This change does not move or recreate the local browser profile.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Confirm proxy change"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
