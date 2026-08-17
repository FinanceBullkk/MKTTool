import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import { readDeviceRetirementReceipt, type DeviceRetirementReceipt } from "./device-retirement-receipt";
import { handleFinalizeDeviceRetirement } from "./handle-finalize-device-retirement";
import { handleRetireDevice } from "./handle-retire-device";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import { defineRelayRoutes } from "./relay-route-policy";
import type { SecureStore } from "./secure-store";
import { SECRET_REVEAL_PATH } from "./secret-page";

const RETIRED_MESSAGE = "Relay identity is retired. Finish server confirmation first.";

export function retirementHealth(receipt: DeviceRetirementReceipt) {
  return {
    ok: false,
    message: "Relay identity is retired. Completion confirmation is still pending.",
    publicKey: receipt.recipientPublicKey,
    configured: false,
    retirementPending: true,
    deviceId: receipt.deviceId,
    webOrigin: receipt.webOrigin,
    antidetectReady: false,
    browser: {
      ready: false,
      provider: null,
      appVersion: null,
      contractVersion: null,
      contractCompatible: false,
      contractProblem: "Relay identity is retired.",
      engine: null,
      capabilities: [],
    },
  };
}

export function retirementBlocked() {
  return { ok: false, message: RETIRED_MESSAGE };
}

export async function runRetirementRecoveryServer(
  home: string,
  secureStore: SecureStore,
  receipt: DeviceRetirementReceipt,
): Promise<void> {
  const server = createRelayServer({
    allowedOrigin: () => receipt.webOrigin,
    htmlPages: {
      "/": () =>
        "<!doctype html><meta charset=utf-8><title>MKTTool Relay retirement</title>" +
        "<h1>Relay retirement pending</h1><p>Return to MKTTool to confirm local cleanup.</p>",
    },
    routes: defineRelayRoutes({
      [RELAY_PATHS.health]: () => retirementHealth(receipt),
      [RELAY_PATHS.retireDevice]: (request, body) =>
        handleRetireDevice(request, body, {
          allowedOrigin: receipt.webOrigin,
          home,
          secureStore,
          activeIdentity: null,
          onRetired: () => {},
        }),
      [RELAY_PATHS.finalizeDeviceRetirement]: (request, body) =>
        handleFinalizeDeviceRetirement(request, body, {
          allowedOrigin: receipt.webOrigin,
          home,
          secureStore,
          onFinalized: () => server.close(),
        }),
      [RELAY_PATHS.profiles]: retirementBlocked,
      [RELAY_PATHS.ticket]: retirementBlocked,
      [RELAY_PATHS.configure]: () => ({
        ok: false,
        message: "Finish retirement before enrolling again.",
      }),
      [RELAY_PATHS.setOperatorKey]: retirementBlocked,
      [RELAY_PATHS.encryptForVault]: retirementBlocked,
      [SECRET_REVEAL_PATH]: retirementBlocked,
      [RELAY_PATHS.sealOperatorKey]: retirementBlocked,
      [RELAY_PATHS.receiveOperatorKey]: retirementBlocked,
      [RELAY_PATHS.authorizeBootstrap]: retirementBlocked,
      [RELAY_PATHS.bootstrapCompletion]: retirementBlocked,
      [RELAY_PATHS.compatibilityUpdate]: retirementBlocked,
      [RELAY_PATHS.compatibilityRollback]: retirementBlocked,
    }),
  });
  await listenOnLoopback(server);
  console.log(`Relay retirement ${receipt.retirementId} is pending confirmation.`);
}

export function loadPendingRetirementReceipt(secureStore: SecureStore): DeviceRetirementReceipt | null {
  return readDeviceRetirementReceipt(secureStore);
}
