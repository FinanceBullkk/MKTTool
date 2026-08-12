import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import type { RelayRoute, RelayRouteDefinition } from "./relay-http-server";
import { SECRET_REVEAL_PATH } from "./secret-page";

export const RELAY_ROUTE_CAPABILITIES = [
  "runtime-read",
  "profile-catalog-read",
  "signed-profile-operation",
  "device-configuration",
  "local-operator-key-write",
  "operator-secret-encryption",
  "local-secret-reveal",
  "operator-key-seal",
  "operator-key-receive",
  "admin-bootstrap-authorization",
  "admin-bootstrap-completion-read",
] as const;

export type RelayRouteCapability = (typeof RELAY_ROUTE_CAPABILITIES)[number];

type RelayContractPath =
  | Exclude<(typeof RELAY_PATHS)[keyof typeof RELAY_PATHS], typeof RELAY_PATHS.secret>
  | typeof SECRET_REVEAL_PATH;

type RelayRoutePolicy = {
  method: "GET" | "POST";
  capability: RelayRouteCapability;
};

export const RELAY_ROUTE_POLICIES = {
  [RELAY_PATHS.health]: { method: "GET", capability: "runtime-read" },
  [RELAY_PATHS.profiles]: { method: "GET", capability: "profile-catalog-read" },
  [RELAY_PATHS.ticket]: { method: "POST", capability: "signed-profile-operation" },
  [RELAY_PATHS.configure]: { method: "POST", capability: "device-configuration" },
  [RELAY_PATHS.setOperatorKey]: { method: "POST", capability: "local-operator-key-write" },
  [RELAY_PATHS.encryptForVault]: { method: "POST", capability: "operator-secret-encryption" },
  [SECRET_REVEAL_PATH]: { method: "POST", capability: "local-secret-reveal" },
  [RELAY_PATHS.sealOperatorKey]: { method: "POST", capability: "operator-key-seal" },
  [RELAY_PATHS.receiveOperatorKey]: { method: "POST", capability: "operator-key-receive" },
  [RELAY_PATHS.authorizeBootstrap]: { method: "POST", capability: "admin-bootstrap-authorization" },
  [RELAY_PATHS.bootstrapCompletion]: { method: "GET", capability: "admin-bootstrap-completion-read" },
} as const satisfies Record<RelayContractPath, RelayRoutePolicy>;

type RelayRouteHandlers = Record<RelayContractPath, RelayRoute>;

/** Pair every owned endpoint with its reviewed method and capability classification. */
export function defineRelayRoutes(
  handlers: RelayRouteHandlers,
): Record<RelayContractPath, RelayRouteDefinition> {
  return Object.fromEntries(
    Object.entries(handlers).map(([path, handler]) => [
      path,
      { ...RELAY_ROUTE_POLICIES[path as RelayContractPath], handler },
    ]),
  ) as Record<RelayContractPath, RelayRouteDefinition>;
}
