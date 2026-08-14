import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { issueDeviceRetirementAuthorization } from "../../src/lib/relay/retirement/device-retirement-authorization";
import { issueDeviceRetirementFinalization } from "../../src/lib/relay/retirement/device-retirement-finalization";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import { generateRelayDeviceKeyPair, relayPrivateKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import {
  finalizeLocalDeviceRetirement,
  readDeviceRetirementReceipt,
  retireLocalRelayDevice,
} from "./device-retirement";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import {
  assertRelayVersionAllowed,
  readRelaySecurityState,
  RELAY_SECURITY_STATE_FILE,
} from "./relay-security-state";
import { migrateRelaySecrets } from "./secret-migration";
import { RELAY_SECRET_NAMES } from "./secure-store";
import { LEGACY_DEVICE_KEY_TOMBSTONE } from "./legacy-device-key-tombstone";

const homes: string[] = [];
const signingKeys = generateKeyPairSync("ed25519");

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-retirement-"));
  homes.push(home);
  const device = generateRelayDeviceKeyPair();
  const proof = "retirement-proof";
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
    signingKeys.privateKey,
    1_000,
    30_000,
  );
  const store = new InMemorySecureStore({
    [RELAY_SECRET_NAMES.devicePrivateKey]: device.privateKeyHex,
    [RELAY_SECRET_NAMES.operatorDomainKey]: "aa".repeat(32),
    [RELAY_SECRET_NAMES.operatorGrantState]: JSON.stringify({ operatorKey: "bb".repeat(32) }),
  });
  writeFileSync(path.join(home, CONFIG_FILE), '{"deviceId":"device-1"}\n', "utf8");
  writeFileSync(path.join(home, DEVICE_KEY_FILE), '{"privateKeyLocation":"protected"}\n', "utf8");
  writeFileSync(path.join(home, RELAY_SECURITY_STATE_FILE), '{"schemaVersion":1}\n', "utf8");
  const finalization = issueDeviceRetirementFinalization(
    {
      authorizationId: "finalization-1",
      retirementId: "retirement-1",
      deviceId: "device-1",
      recipientPublicKey: device.publicKeyHex,
      completionHash: createHash("sha256").update(proof, "utf8").digest("hex"),
    },
    finalizationKeys.privateKey,
    2_000,
  );
  return { authorization, device, finalization, finalizationKeys, home, proof, store };
}

describe("local Relay device retirement", () => {
  it("persists a recovery receipt before deleting every Relay identity-bearing datum", () => {
    const { authorization, device, home, proof, store } = fixture();

    const result = retireLocalRelayDevice(authorization, {
      home,
      secureStore: store,
      now: () => 2_000,
      activeIdentity: {
        deviceId: "device-1",
        devicePublicKey: device.publicKeyHex,
        devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
        serverPublicKey: signingKeys.publicKey,
        webOrigin: "https://mkttool.example.com",
      },
    });

    expect(result).toMatchObject({ retirementId: "retirement-1", proof, cleanupComplete: true });
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBeNull();
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
    expect(store.read(RELAY_SECRET_NAMES.operatorGrantState)).toBeNull();
    expect(readDeviceRetirementReceipt(store)?.stage).toBe("cleaned");
    expect(existsSync(path.join(home, CONFIG_FILE))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8"))).toEqual(
      LEGACY_DEVICE_KEY_TOMBSTONE,
    );
    expect(readRelaySecurityState(home)).toMatchObject({
      migrationStage: "not-started",
      protectedSecrets: [],
      rollbackFloor: RELAY_VERSION,
    });
  });

  it("resumes cleanup from the protected receipt after a crash and returns the same proof", () => {
    const { authorization, device, home, proof, store } = fixture();
    expect(() =>
      retireLocalRelayDevice(
        authorization,
        {
          home,
          secureStore: store,
          now: () => 2_000,
          activeIdentity: {
            deviceId: "device-1",
            devicePublicKey: device.publicKeyHex,
            devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
            serverPublicKey: signingKeys.publicKey,
            webOrigin: "https://mkttool.example.com",
          },
        },
        { faultAt: "after-receipt" },
      ),
    ).toThrow(/injected retirement fault/i);
    expect(() => assertRelayVersionAllowed(home, RELAY_VERSION - 1)).toThrow(/rollback floor/i);

    const resumed = retireLocalRelayDevice("ticket-key-rotated-after-receipt", {
      home,
      secureStore: store,
      now: () => 500_000,
      activeIdentity: null,
    });

    expect(resumed).toMatchObject({ proof, cleanupComplete: true, recovered: true });
    expect(readDeviceRetirementReceipt(store)?.stage).toBe("cleaned");
    expect(existsSync(path.join(home, CONFIG_FILE))).toBe(false);
  });

  it("does not report cleanup complete when protected secret deletion fails read-back", () => {
    const { authorization, device, home, store } = fixture();
    const remove = store.remove.bind(store);
    store.remove = (name) => {
      if (name !== RELAY_SECRET_NAMES.operatorDomainKey) remove(name);
    };

    expect(() =>
      retireLocalRelayDevice(authorization, {
        home,
        secureStore: store,
        now: () => 2_000,
        activeIdentity: {
          deviceId: "device-1",
          devicePublicKey: device.publicKeyHex,
          devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
          serverPublicKey: signingKeys.publicKey,
          webOrigin: "https://mkttool.example.com",
        },
      }),
    ).toThrow(/remains after retirement cleanup/i);
    expect(readDeviceRetirementReceipt(store)?.stage).toBe("prepared");
  });

  it("keeps the receipt until server completion is confirmed, then permits a fresh identity", () => {
    const { authorization, device, finalization, finalizationKeys, home, proof, store } = fixture();
    retireLocalRelayDevice(authorization, {
      home,
      secureStore: store,
      now: () => 2_000,
      activeIdentity: {
        deviceId: "device-1",
        devicePublicKey: device.publicKeyHex,
        devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
        serverPublicKey: signingKeys.publicKey,
        webOrigin: "https://mkttool.example.com",
      },
    });

    expect(() => finalizeLocalDeviceRetirement("invalid", store, home)).toThrow(/invalid format/i);
    const wrongFinalization = issueDeviceRetirementFinalization(
      {
        authorizationId: "finalization-wrong-device",
        retirementId: "retirement-1",
        deviceId: "device-2",
        recipientPublicKey: device.publicKeyHex,
        completionHash: createHash("sha256").update(proof, "utf8").digest("hex"),
      },
      finalizationKeys.privateKey,
      2_000,
    );
    expect(finalizeLocalDeviceRetirement(wrongFinalization, store, home)).toBe(false);
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
    rmSync(path.join(home, RELAY_SECURITY_STATE_FILE), { force: true });
    expect(finalizeLocalDeviceRetirement(finalization, store, home)).toBe(true);
    expect(readDeviceRetirementReceipt(store)).toBeNull();
    expect(() => assertRelayVersionAllowed(home, RELAY_VERSION - 1)).toThrow(/rollback floor/i);

    expect(migrateRelaySecrets(home, store, RELAY_VERSION).migrationStage).toBe("not-started");
    const fresh = loadOrCreateDeviceKeypair(home, store);
    expect(fresh.created).toBe(true);
    expect(migrateRelaySecrets(home, store, RELAY_VERSION)).toMatchObject({
      migrationStage: "activated",
      protectedSecrets: [RELAY_SECRET_NAMES.devicePrivateKey],
      rollbackFloor: RELAY_VERSION,
    });
  });

  it("does not report finalization when protected receipt deletion fails read-back", () => {
    const { authorization, device, finalization, home, store } = fixture();
    retireLocalRelayDevice(authorization, {
      home,
      secureStore: store,
      now: () => 2_000,
      activeIdentity: {
        deviceId: "device-1",
        devicePublicKey: device.publicKeyHex,
        devicePrivateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
        serverPublicKey: signingKeys.publicKey,
        webOrigin: "https://mkttool.example.com",
      },
    });
    const remove = store.remove.bind(store);
    store.remove = (name) => {
      if (name !== RELAY_SECRET_NAMES.deviceRetirementReceipt) remove(name);
    };

    expect(() => finalizeLocalDeviceRetirement(finalization, store, home)).toThrow(
      /remains after finalization/i,
    );
    expect(readDeviceRetirementReceipt(store)).not.toBeNull();
  });
});
