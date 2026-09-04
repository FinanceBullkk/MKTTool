import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import { Wrench } from "lucide-react";
import { Disclosure } from "@/components/ui/page-section";

export function SetupSupportDetails({ health }: { health: RelayHealth | null }) {
  return (
    <Disclosure summary="Support and administrator details" icon={Wrench}>
      {health ? (
        <>
          <dl className="grid gap-2 text-xs sm:grid-cols-[auto_1fr]">
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
          <p className="mt-3 text-xs text-neutral-500">
            Browser status is diagnostic only. It does not determine Relay PC registration or
            identity-workspace handoff readiness.
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">
          Local technical status appears here after you confirm this PC.
        </p>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Advanced registration and revocation remain available on the relay device support page.
      </p>
    </Disclosure>
  );
}
