import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { issueDeviceRetirementAuthorization } from "../../src/lib/relay/retirement/device-retirement-authorization";
import { issueDeviceRetirementFinalization } from "../../src/lib/relay/retirement/device-retirement-finalization";
import {
  generateRelayDeviceKeyPair,
  relayPrivateKeyToKeyObject,
} from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { handleFinalizeDeviceRetirement } from "./handle-finalize-device-retirement";
import { handleRetireDevice } from "./handle-retire-device";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { CONFIG_FILE } from "./relay-home";
import { RELAY_SECRET_NAMES } from "./secure-store";

const homes: string[] = [];
const webOrigin = "https://mkttool.example.com";

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function request(origin = webOrigin): IncomingMessage {
  return { headers: { origin } } as IncomingMessage;
}

function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), "mkt-retirement-handler-"));
  homes.push(home);
  const server = generateKeyPairSync("ed25519");
  const device = generateRelayDeviceKeyPair();
  const proof = "completion-proof";
  const completion = sealForDevice({ proof }, device.publicKeyHex);
  const finalizationKeys = generateKeyPairSync("ed25519");
  const finalizationPublicKey = finalizationKeys.publicKey.export({ format: "jwk" }) as { x: string };
  const authorization = issueDeviceRetirementAuthorization(
    {
      authorizationId: "authorization-1",
      retirementId: "retirement-1",
      deviceId: "device-1",
      recipientPublicKey: device.publicKeyHex,
      completionHash: createHash("sha256").update(proof, "utf8").digest("hex"),
      completionEphemeralPublicKey: completion.ephemeralPublicKey,
      completionSealed: completion.sealed,
      finalizationPublicKey: Buffer.from(finalizationPublicKey.x, "base64url").toString("hex"),
    },
    server.privateKey,
    Date.now(),
    30_000,
  );
  const finalization = issueDeviceRetirementFinalization(
    {
      authorizationId: "finalization-1",
      retirementId: "retirement-1",
      deviceId: "device-1",
      recipientPublicKey: device.publicKeyHex,
      completionHash: createHash("sha256").update(proof, "utf8").digest("hex"),
    },
    finalizationKeys.privateKey,
    Date.now(),
  );
  const store = new InMemorySecureStore({
    [RELAY_SECRET_NAMES.devicePrivateKey]: device.privateKeyHex,
  });
  writeFileSync(path.join(home, CONFIG_FILE), '{"deviceId":"device-1"}\n', "utf8");
  return { authorization, device, finalization, home, proof, server, store };
}

describe("device retirement HTTP handlers", () => {
  it("rejects an untrusted web origin before touching local state", () => {
    const { authorization, device, home, server, store } = fixture();

    const result = handleRetireDevice(
      request("https://attacker.example"),
      JSON.stringify({ authorization }),
      {
        allowedOrigin: webOrigin,
        home,
        secureStore: store,
        activeIdentity: {
          deviceId: "device-1",
          devicePublicKey: device.publicKeyHex,
          devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
          serverPublicKey: server.publicKey,
          webOrigin,
        },
        onRetired: () => {
          throw new Error("must not run");
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(device.privateKeyHex);
  });

  it("returns proof only after cleanup and finalizes the matching protected receipt", () => {
    const { authorization, device, finalization, home, proof, server, store } = fixture();
    let retired = false;
    const result = handleRetireDevice(request(), JSON.stringify({ authorization }), {
      allowedOrigin: webOrigin,
      home,
      secureStore: store,
      activeIdentity: {
        deviceId: "device-1",
        devicePublicKey: device.publicKeyHex,
        devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
        serverPublicKey: server.publicKey,
        webOrigin,
      },
      onRetired: () => {
        retired = true;
      },
    });

    expect(result).toMatchObject({
      ok: true,
      retirementId: "retirement-1",
      proof,
      cleanupComplete: true,
    });
    expect(retired).toBe(true);

    let finalized = false;
    const finish = handleFinalizeDeviceRetirement(
      request(),
      JSON.stringify({ authorization: finalization }),
      {
        allowedOrigin: webOrigin,
        home,
        secureStore: store,
        onFinalized: () => {
          finalized = true;
        },
      },
    );
    expect(finish.ok).toBe(true);
    expect(finalized).toBe(true);
    expect(store.read(RELAY_SECRET_NAMES.deviceRetirementReceipt)).toBeNull();
  });
});
