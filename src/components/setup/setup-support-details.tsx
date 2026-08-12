import type { RelayHealth } from "@/lib/relay/relay-endpoints";

export function SetupSupportDetails({ health }: { health: RelayHealth | null }) {
  return (
    <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950/40">
      <summary className="cursor-pointer font-medium">Support and administrator details</summary>
      {health ? (
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-neutral-500">Relay</dt>
          <dd>Version {health.relayVersion}</dd>
          <dt className="text-neutral-500">MKT Browser</dt>
          <dd>{health.browser.appVersion ?? "Not detected"}</dd>
          <dt className="text-neutral-500">Contract</dt>
          <dd>{health.browser.contractVersion ?? "Unknown"}</dd>
          <dt className="text-neutral-500">Engine</dt>
          <dd>
            {health.browser.engine
              ? `${health.browser.engine.kind} / ${health.browser.engine.version ?? "unknown"} / ${health.browser.engine.status}`
              : "Not detected"}
          </dd>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">
          Local technical status appears here after you confirm this PC.
        </p>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Advanced registration and revocation remain available on the relay device support page.
      </p>
    </details>
  );
}
