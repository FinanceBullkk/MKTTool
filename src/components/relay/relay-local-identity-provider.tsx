"use client";

/**
 * Query local Relay once for the page and share the result with every device row.
 *
 * Per-button lookups would send one loopback request per row and make every request time out on a
 * browser that has not granted local-network access. The answer describes the browser PC, so all
 * rows can reuse it.
 *
 * This mount-time lookup has no user activation, so it cannot open the local-network permission
 * prompt. It controls rendering only and never replaces the authoritative click-time check.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pingRelay, type RelayOutcome } from "@/lib/relay/relay-browser-client";
import type { RelayHealth, RelayReply } from "@/lib/relay/relay-endpoints";

type LocalRelayPing = RelayOutcome<RelayHealth & RelayReply> | null;

/** `null` means the lookup is pending. A missing provider therefore leaves local-only actions disabled. */
const LocalRelayPingContext = createContext<LocalRelayPing>(null);

export function RelayLocalIdentityProvider({ children }: { children: ReactNode }) {
  const [ping, setPing] = useState<LocalRelayPing>(null);

  useEffect(() => {
    let cancelled = false;
    // `pingRelay` represents every expected failure as a `RelayOutcome` branch.
    void pingRelay().then((outcome) => {
      if (!cancelled) setPing(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <LocalRelayPingContext.Provider value={ping}>{children}</LocalRelayPingContext.Provider>;
}

export function useLocalRelayPing(): LocalRelayPing {
  return useContext(LocalRelayPingContext);
}
