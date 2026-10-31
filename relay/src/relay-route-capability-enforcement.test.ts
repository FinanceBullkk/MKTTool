/**
 * F5: make `RELAY_ROUTE_CAPABILITIES` mean something at runtime.
 *
 * `relay-route-policy.test.ts` proves every path is classified exactly once and that the strings
 * come from the allowed sets. It never checks that a route classified `operator-key-seal` actually
 * verifies anything — so the table documents an intent nothing enforces. That is precisely how F4
 * survived: `/encrypt-for-vault` carried a capability classification while its handler performed no
 * caller check at all.
 *
 * This file closes that. Each capability is bound to the enforcement it is required to perform, and
 * for every capability whose enforcement is caller-origin the real handler is invoked with a
 * hostile `Origin` and required to refuse.
 *
 * Deliberately behavioral rather than source-text: a regex over the handler module would pass on a
 * check sitting in dead code, which is the failure mode F2 documents for the MKTBrowser suite.
 */
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import {
  RELAY_ROUTE_CAPABILITIES,
  RELAY_ROUTE_POLICIES,
  type RelayRouteCapability,
} from "./relay-route-policy";
import { handleAuthorizeBootstrap } from "./handle-authorize-bootstrap";
import { handleConfigure } from "./handle-configure";
import { handleEncryptForVault } from "./handle-encrypt-for-vault";
import { handleFinalizeDeviceRetirement } from "./handle-finalize-device-retirement";
import { handleLicenseCapacityRefresh } from "./handle-license-capacity-refresh";
import { handleReadBootstrapCompletion } from "./handle-read-bootstrap-completion";
import { handleReceiveOperatorKey } from "./handle-receive-operator-key";
import { handleRetireDevice } from "./handle-retire-device";
import { handleSealOperatorKey } from "./handle-seal-operator-key";
import { handleSetOperatorKey } from "./handle-set-operator-key";

const WEB_ORIGIN = "https://mkt.example";
const HOSTILE_ORIGIN = "https://evil.example";

/**
 * What a capability class is required to check before it acts.
 *
 * - `caller-origin` — the handler must reject a caller from an untrusted `Origin`.
 * - `signed-ticket` — authority comes from a server signature on the body, not from the caller.
 * - `local-read-only` — reads state already on this machine and changes nothing, so there is
 *   nothing for a hostile caller to gain beyond what a local process already sees.
 */
type EnforcementKind = "caller-origin" | "signed-ticket" | "local-read-only";

const CAPABILITY_ENFORCEMENT: Record<RelayRouteCapability, EnforcementKind> = {
  "runtime-read": "local-read-only",
  "profile-catalog-read": "local-read-only",
  "license-capacity-refresh": "caller-origin",
  "signed-profile-operation": "signed-ticket",
  "local-secret-reveal": "signed-ticket",
  "device-configuration": "caller-origin",
  "local-operator-key-write": "caller-origin",
  "operator-secret-encryption": "caller-origin",
  "operator-key-seal": "caller-origin",
  "operator-key-receive": "caller-origin",
  "admin-bootstrap-authorization": "caller-origin",
  "admin-bootstrap-completion-read": "caller-origin",
  "device-retirement": "caller-origin",
  "device-retirement-finalize": "caller-origin",
};

function request(origin: string): IncomingMessage {
  return { headers: { origin } } as IncomingMessage;
}

/**
 * Minimal dependency objects.
 *
 * Every handler below checks the caller before touching a dependency, so the stubs never have to
 * be real. That ordering is itself part of the contract: a handler that reads its dependencies
 * first would throw here instead of returning, and the assertion below reports that as a failure
 * rather than letting it pass.
 */
function stub<T>(): T {
  return {} as T;
}

type OriginInvoker = (origin: string) => Promise<{ ok: boolean }> | { ok: boolean };

const CALLER_ORIGIN_INVOKERS: Record<string, OriginInvoker> = {
  "device-configuration": (origin) =>
    handleConfigure(request(origin), "{}", {
      allowedOrigin: WEB_ORIGIN,
      onConfigured: () => ({ ok: true, message: "" }),
    }),

  "license-capacity-refresh": (origin) =>
    handleLicenseCapacityRefresh(request(origin), {
      allowedOrigin: WEB_ORIGIN,
      antidetect: {
        refreshLicenseCapacity: async () => ({
          total: 1,
          free: 1,
          active: 0,
          pendingRecovery: 0,
          cooling: 0,
          availability: "ready",
          reason: "CAPACITY_AVAILABLE",
        }),
      },
    }),

  // Pinned to the relay's own status page rather than the web origin: the operator key must never
  // travel through the web app. A hostile origin is refused either way.
  "local-operator-key-write": (origin) =>
    handleSetOperatorKey(request(origin), "{}", {
      onConfigured: () => ({ ok: true, message: "" }),
    }),

  "operator-secret-encryption": (origin) =>
    handleEncryptForVault(request(origin), "{}", {
      vaultKeyOperator: Buffer.alloc(32, 7),
      allowedOrigin: WEB_ORIGIN,
      notConfiguredMessage: "",
    }),

  // A real key, not `null`: with an unconfigured relay this handler refuses everything, so a
  // hostile caller would be rejected for the wrong reason and the probe would prove nothing.
  "operator-key-seal": (origin) =>
    handleSealOperatorKey(request(origin), "{}", {
      allowedOrigin: WEB_ORIGIN,
      vaultKeyOperator: Buffer.alloc(32, 7),
      notConfiguredMessage: "",
    }),

  "operator-key-receive": (origin) =>
    handleReceiveOperatorKey(request(origin), "{}", {
      ...stub<Parameters<typeof handleReceiveOperatorKey>[2]>(),
      allowedOrigin: WEB_ORIGIN,
    }),

  "admin-bootstrap-authorization": (origin) =>
    handleAuthorizeBootstrap(request(origin), "{}", WEB_ORIGIN, stub()),

  "admin-bootstrap-completion-read": (origin) =>
    handleReadBootstrapCompletion(request(origin), WEB_ORIGIN, stub()),

  "device-retirement": (origin) =>
    handleRetireDevice(request(origin), "{}", {
      ...stub<Parameters<typeof handleRetireDevice>[2]>(),
      allowedOrigin: WEB_ORIGIN,
    }),

  "device-retirement-finalize": (origin) =>
    handleFinalizeDeviceRetirement(request(origin), "{}", {
      ...stub<Parameters<typeof handleFinalizeDeviceRetirement>[2]>(),
      allowedOrigin: WEB_ORIGIN,
    }),
};

describe("Relay route capability enforcement", () => {
  it("binds every capability class to a required enforcement", () => {
    // A new capability added to the table without a decision here fails this test rather than
    // shipping unenforced. That is the whole point: the classification must cost something.
    expect(Object.keys(CAPABILITY_ENFORCEMENT).sort()).toEqual([...RELAY_ROUTE_CAPABILITIES].sort());
  });

  it("provides a hostile-origin probe for every caller-origin capability", () => {
    const originEnforced = Object.entries(CAPABILITY_ENFORCEMENT)
      .filter(([, kind]) => kind === "caller-origin")
      .map(([capability]) => capability)
      .sort();

    expect(Object.keys(CALLER_ORIGIN_INVOKERS).sort()).toEqual(originEnforced);
  });

  it("classifies every routed capability", () => {
    for (const policy of Object.values(RELAY_ROUTE_POLICIES)) {
      expect(CAPABILITY_ENFORCEMENT[policy.capability]).toBeDefined();
    }
  });

  it("keeps local-read-only capabilities on GET, so a hostile caller cannot change state", () => {
    for (const policy of Object.values(RELAY_ROUTE_POLICIES)) {
      if (CAPABILITY_ENFORCEMENT[policy.capability] !== "local-read-only") continue;
      expect(policy.method).toBe("GET");
    }
  });

  /** Trusted origin per capability. The operator-key write is pinned to the relay's own page. */
  const TRUSTED_ORIGIN: Record<string, string> = {
    ...Object.fromEntries(Object.keys(CALLER_ORIGIN_INVOKERS).map((k) => [k, WEB_ORIGIN])),
    "local-operator-key-write": RELAY_ORIGIN,
  };

  /**
   * Collapse a call to a comparable outcome, throw included.
   *
   * The comparison, not the `ok` flag, is what carries the proof. Asserting only `ok === false`
   * for a hostile caller is worthless: most of these handlers reject an empty body anyway, so the
   * assertion passes whether or not the origin gate exists. Verified — with the origin check in
   * `handle-seal-operator-key.ts` disabled, an `ok === false` probe still passed.
   */
  async function outcome(invoke: OriginInvoker, origin: string): Promise<string> {
    try {
      const result = await invoke(origin);
      return JSON.stringify({ ok: result.ok, message: (result as { message?: string }).message });
    } catch (error) {
      return `threw:${(error as Error).message}`;
    }
  }

  describe.each(Object.entries(CALLER_ORIGIN_INVOKERS))("%s", (capability, invoke) => {
    it("takes a different path for a hostile origin than for the trusted one", async () => {
      const hostile = await outcome(invoke, HOSTILE_ORIGIN);
      const trusted = await outcome(invoke, TRUSTED_ORIGIN[capability]!);

      // Identical outcomes mean the handler never looked at Origin: same body, same dependencies,
      // only the caller differs, so any difference has to come from the caller check.
      expect(
        hostile,
        `${capability} treats a hostile origin exactly like its trusted origin — the caller check ` +
          `is missing or unreachable`,
      ).not.toBe(trusted);
    });

    it("refuses a hostile origin outright", async () => {
      const result = await invoke(HOSTILE_ORIGIN);
      expect(result.ok).toBe(false);
    });

    it("takes a different path for a caller sending no Origin header", async () => {
      const absent = await outcome(invoke, "");
      const trusted = await outcome(invoke, TRUSTED_ORIGIN[capability]!);

      expect(absent, `${capability} accepts a caller that declares no origin`).not.toBe(trusted);
    });
  });
});
