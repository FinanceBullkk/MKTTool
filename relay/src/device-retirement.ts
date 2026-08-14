import { existsSync, unlinkSync } from "node:fs";
import type { KeyObject } from "node:crypto";
import path from "node:path";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import {
  hashDeviceRetirementProof,
  verifyDeviceRetirementAuthorization,
  type DeviceRetirementAuthorizationEnvelope,
} from "../../src/lib/relay/retirement/device-retirement-authorization";
import { publicKeyToHex } from "../../src/lib/tickets/server-signing-key";
import { openSealedPayload } from "../../src/lib/tickets/ticket-sealed-box";
import { CONFIG_FILE } from "./relay-home";
import { writeRelayRetirementSecurityGuard } from "./relay-security-state";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { writeLegacyDeviceKeyTombstone } from "./legacy-device-key-tombstone";
import {
  readDeviceRetirementReceipt,
  retirementServerPublicKey,
  writeDeviceRetirementReceipt,
  type DeviceRetirementReceipt,
} from "./device-retirement-receipt";

export {
  finalizeLocalDeviceRetirement,
  readDeviceRetirementReceipt,
  type DeviceRetirementReceipt,
} from "./device-retirement-receipt";

export interface ActiveRetirementIdentity {
  deviceId: string;
  devicePublicKey: string;
  devicePrivateKey: KeyObject;
  serverPublicKey: KeyObject;
  webOrigin: string;
}

export interface DeviceRetirementResult {
  retirementId: string;
  proof: string;
  cleanupComplete: true;
  recovered: boolean;
}

export type DeviceRetirementFaultPoint = "after-receipt" | "after-secrets" | "after-files";

export function retireLocalRelayDevice(
  signedAuthorization: string,
  options: {
    home: string;
    secureStore: SecureStore;
    activeIdentity: ActiveRetirementIdentity | null;
    now?: () => number;
  },
  testOptions: { faultAt?: DeviceRetirementFaultPoint } = {},
): DeviceRetirementResult {
  const now = options.now?.() ?? Date.now();
  let receipt = readDeviceRetirementReceipt(options.secureStore);
  const recovered = receipt !== null;

  if (!receipt) {
    const identity = options.activeIdentity;
    if (!identity) throw new Error("This Relay has no active device identity to retire.");
    const authorization = verifyDeviceRetirementAuthorization(
      signedAuthorization,
      identity.serverPublicKey,
      now,
    );
    assertAuthorizationMatchesActiveIdentity(authorization, identity);
    const proof = openCompletionProof(authorization, identity.devicePrivateKey);
    receipt = {
      v: 1,
      stage: "prepared",
      authorization: signedAuthorization,
      authorizationId: authorization.authorizationId,
      retirementId: authorization.retirementId,
      deviceId: authorization.deviceId,
      recipientPublicKey: authorization.recipientPublicKey,
      completionHash: authorization.completionHash,
      proof,
      serverPublicKeyHex: publicKeyToHex(identity.serverPublicKey),
      finalizationPublicKeyHex: authorization.finalizationPublicKey,
      webOrigin: identity.webOrigin,
    };
    writeRelayRetirementSecurityGuard(options.home, RELAY_VERSION);
    writeDeviceRetirementReceipt(options.secureStore, receipt);
    injectFault(testOptions.faultAt, "after-receipt");
  } else {
    // The protected receipt is the durable authorization boundary after preparation. Requiring a
    // freshly signed retry here would strand cleanup if the normal ticket key rotates meanwhile.
    const authorization = verifyReceiptRetryAuthorization(receipt, now);
    assertAuthorizationMatchesReceipt(authorization, receipt);
    // Repair receipts written before the rollback guard existed, before retrying any deletion.
    writeRelayRetirementSecurityGuard(options.home, RELAY_VERSION);
  }

  removeRelaySecrets(options.secureStore);
  injectFault(testOptions.faultAt, "after-secrets");
  removeRelayIdentityFiles(options.home);
  injectFault(testOptions.faultAt, "after-files");

  if (receipt.stage !== "cleaned") {
    receipt = { ...receipt, stage: "cleaned" };
    writeDeviceRetirementReceipt(options.secureStore, receipt);
  }
  return {
    retirementId: receipt.retirementId,
    proof: receipt.proof,
    cleanupComplete: true,
    recovered,
  };
}

function verifyReceiptRetryAuthorization(
  receipt: DeviceRetirementReceipt,
  now: number,
): DeviceRetirementAuthorizationEnvelope {
  const serverPublicKey = retirementServerPublicKey(receipt);
  return verifyDeviceRetirementAuthorization(
    receipt.authorization,
    serverPublicKey,
    now,
    false,
  );
}

function assertAuthorizationMatchesActiveIdentity(
  authorization: DeviceRetirementAuthorizationEnvelope,
  identity: ActiveRetirementIdentity,
): void {
  if (
    authorization.deviceId !== identity.deviceId ||
    authorization.recipientPublicKey !== identity.devicePublicKey
  ) {
    throw new Error("Device retirement authorization belongs to a different Relay identity.");
  }
}

function assertAuthorizationMatchesReceipt(
  authorization: DeviceRetirementAuthorizationEnvelope,
  receipt: DeviceRetirementReceipt,
): void {
  if (
    authorization.retirementId !== receipt.retirementId ||
    authorization.deviceId !== receipt.deviceId ||
    authorization.recipientPublicKey !== receipt.recipientPublicKey ||
    authorization.completionHash !== receipt.completionHash ||
    authorization.finalizationPublicKey !== receipt.finalizationPublicKeyHex
  ) {
    throw new Error("Device retirement authorization does not match the protected cleanup receipt.");
  }
}

function openCompletionProof(
  authorization: DeviceRetirementAuthorizationEnvelope,
  devicePrivateKey: KeyObject,
): string {
  const opened = openSealedPayload(
    {
      ephemeralPublicKey: authorization.completionEphemeralPublicKey,
      sealed: authorization.completionSealed,
    },
    devicePrivateKey,
  ) as { proof?: unknown };
  if (typeof opened.proof !== "string" || opened.proof.length === 0 || opened.proof.length > 500) {
    throw new Error("Device retirement completion proof is invalid.");
  }
  if (hashDeviceRetirementProof(opened.proof) !== authorization.completionHash) {
    throw new Error("Device retirement completion proof does not match its signed hash.");
  }
  return opened.proof;
}

function removeRelaySecrets(store: SecureStore): void {
  for (const name of [
    RELAY_SECRET_NAMES.operatorDomainKey,
    RELAY_SECRET_NAMES.operatorGrantState,
    RELAY_SECRET_NAMES.devicePrivateKey,
  ]) {
    store.remove(name);
    if (store.read(name) !== null) {
      throw new Error(`Protected Relay secret ${name} remains after retirement cleanup.`);
    }
  }
}

function removeRelayIdentityFiles(home: string): void {
  for (const fileName of [CONFIG_FILE]) {
    const target = path.join(home, fileName);
    if (!existsSync(target)) continue;
    try {
      unlinkSync(target);
    } catch (cause) {
      throw new Error(`Cannot remove retired Relay state ${fileName}: ${(cause as Error).message}`);
    }
  }
  // These non-secret markers block both protected-store and plaintext Relay downgrades while the
  // receipt is pending. After finalization, `not-started` lets the current Relay track a fresh key.
  writeLegacyDeviceKeyTombstone(home);
}

function injectFault(actual: DeviceRetirementFaultPoint | undefined, expected: DeviceRetirementFaultPoint): void {
  if (actual === expected) throw new Error(`Injected retirement fault at ${expected}.`);
}
