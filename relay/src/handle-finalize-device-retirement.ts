import type { IncomingMessage } from "node:http";
import { finalizeLocalDeviceRetirement } from "./device-retirement-receipt";
import type { RelayResponseBody } from "./relay-http-server";
import type { SecureStore } from "./secure-store";

export function handleFinalizeDeviceRetirement(
  request: IncomingMessage,
  body: string,
  deps: {
    allowedOrigin: string | null;
    home: string;
    secureStore: SecureStore;
    onFinalized(): void;
  },
): RelayResponseBody {
  if (!deps.allowedOrigin || request.headers.origin !== deps.allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may finalize retirement." };
  }
  try {
    const parsed = JSON.parse(body) as { authorization?: unknown };
    if (typeof parsed.authorization !== "string" || parsed.authorization.length === 0) {
      throw new Error("Device retirement finalization authorization is missing.");
    }
    if (!finalizeLocalDeviceRetirement(parsed.authorization, deps.secureStore, deps.home)) {
      throw new Error("The protected retirement receipt does not match this completion.");
    }
    deps.onFinalized();
    return { ok: true, message: "Relay retirement is complete. Relay will now close." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
