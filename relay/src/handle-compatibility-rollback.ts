import type { IncomingMessage } from "node:http";
import type { CompatibilityRollbackRequest } from "../../src/lib/relay/relay-endpoints";
import { prepareCompatibilityRollback, type CompatibilityUpdatePlatform } from "./local-updater";
import type { RelayResponseBody } from "./relay-http-server";
import type { SecureStore } from "./secure-store";

export async function handleCompatibilityRollback(
  request: IncomingMessage,
  body: string,
  dependencies: {
    allowedOrigin: string | null;
    home: string;
    store: SecureStore;
    createPlatform(): CompatibilityUpdatePlatform;
    serverPublicKeyHex: string | null;
    deviceId: string | null;
    now?: Date;
    onPrepared(): void;
  },
): Promise<RelayResponseBody> {
  if (!dependencies.allowedOrigin || request.headers.origin !== dependencies.allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may roll back this Relay." };
  }
  if (!dependencies.serverPublicKeyHex || !dependencies.deviceId) {
    return { ok: false, message: "This Relay is not fully configured for signed rollback." };
  }

  try {
    const parsed = JSON.parse(body) as Partial<CompatibilityRollbackRequest>;
    if (!parsed.authorization || typeof parsed.authorization !== "object") {
      throw new Error("Compatibility rollback authorization is missing.");
    }
    const authorization = await prepareCompatibilityRollback(
      parsed.authorization,
      {
        serverPublicKeyHex: dependencies.serverPublicKeyHex,
        deviceId: dependencies.deviceId,
        now: dependencies.now,
      },
      {
        home: dependencies.home,
        store: dependencies.store,
        platform: dependencies.createPlatform(),
      },
    );
    dependencies.onPrepared();
    return {
      ok: true,
      message: "Compatibility rollback is prepared. Relay and MKT Browser will restart now.",
      rollbackStarted: true,
      currentSequence: authorization.currentSequence,
      retainedSequence: authorization.retainedSequence,
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
