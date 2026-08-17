import type { IncomingMessage } from "node:http";
import type { ActiveRetirementIdentity, DeviceRetirementResult } from "./device-retirement";
import { retireLocalRelayDevice } from "./device-retirement";
import type { RelayResponseBody } from "./relay-http-server";
import type { SecureStore } from "./secure-store";
import { assertNoCompatibilityTransitionInProgress } from "./compatibility-transition-preparation-lock";

export function handleRetireDevice(
  request: IncomingMessage,
  body: string,
  deps: {
    allowedOrigin: string | null;
    home: string;
    secureStore: SecureStore;
    activeIdentity: ActiveRetirementIdentity | null;
    onRetired(result: DeviceRetirementResult): void;
  },
): RelayResponseBody {
  if (!deps.allowedOrigin || request.headers.origin !== deps.allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may retire this Relay." };
  }
  try {
    assertNoCompatibilityTransitionInProgress(deps.home);
    const parsed = JSON.parse(body) as { authorization?: unknown };
    if (typeof parsed.authorization !== "string" || parsed.authorization.length === 0) {
      throw new Error("Device retirement authorization is missing.");
    }
    const result = retireLocalRelayDevice(parsed.authorization, {
      home: deps.home,
      secureStore: deps.secureStore,
      activeIdentity: deps.activeIdentity,
    });
    deps.onRetired(result);
    return {
      ok: true,
      message: "Local Relay identity data was removed. Confirming completion with the server.",
      ...result,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
