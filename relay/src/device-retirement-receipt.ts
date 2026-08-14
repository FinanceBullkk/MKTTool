import type { KeyObject } from "node:crypto";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import { verifyDeviceRetirementFinalization } from "../../src/lib/relay/retirement/device-retirement-finalization";
import { publicKeyFromHex } from "../../src/lib/tickets/server-signing-key";
import { writeRelayRetirementSecurityGuard } from "./relay-security-state";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";

export interface DeviceRetirementReceipt {
  v: 1;
  stage: "prepared" | "cleaned";
  authorization: string;
  authorizationId: string;
  retirementId: string;
  deviceId: string;
  recipientPublicKey: string;
  completionHash: string;
  proof: string;
  serverPublicKeyHex: string;
  finalizationPublicKeyHex: string;
  webOrigin: string;
}

export function readDeviceRetirementReceipt(store: SecureStore): DeviceRetirementReceipt | null {
  const raw = store.read(RELAY_SECRET_NAMES.deviceRetirementReceipt);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Protected device retirement receipt is not valid JSON.");
  }
  const receipt = parsed as Partial<DeviceRetirementReceipt>;
  if (
    receipt.v !== 1 ||
    (receipt.stage !== "prepared" && receipt.stage !== "cleaned") ||
    !isText(receipt.authorization, 20_000) ||
    !isText(receipt.authorizationId) ||
    !isText(receipt.retirementId) ||
    !isText(receipt.deviceId) ||
    !isHex(receipt.recipientPublicKey, 64) ||
    !isHex(receipt.completionHash, 64) ||
    !isText(receipt.proof, 500) ||
    !isHex(receipt.serverPublicKeyHex, 64) ||
    !isHex(receipt.finalizationPublicKeyHex, 64) ||
    !isOrigin(receipt.webOrigin)
  ) {
    throw new Error("Protected device retirement receipt has an invalid shape.");
  }
  return receipt as DeviceRetirementReceipt;
}

export function writeDeviceRetirementReceipt(
  store: SecureStore,
  receipt: DeviceRetirementReceipt,
): void {
  const serialized = JSON.stringify(receipt);
  store.write(RELAY_SECRET_NAMES.deviceRetirementReceipt, serialized);
  if (store.read(RELAY_SECRET_NAMES.deviceRetirementReceipt) !== serialized) {
    throw new Error("Protected device retirement receipt failed read-back verification.");
  }
}

export function finalizeLocalDeviceRetirement(
  signedAuthorization: string,
  store: SecureStore,
  home: string,
): boolean {
  const receipt = readDeviceRetirementReceipt(store);
  if (!receipt || receipt.stage !== "cleaned") return false;
  const authorization = verifyDeviceRetirementFinalization(
    signedAuthorization,
    publicKeyFromHex(receipt.finalizationPublicKeyHex),
  );
  if (
    authorization.retirementId !== receipt.retirementId ||
    authorization.deviceId !== receipt.deviceId ||
    authorization.recipientPublicKey !== receipt.recipientPublicKey ||
    authorization.completionHash !== receipt.completionHash
  ) {
    return false;
  }
  writeRelayRetirementSecurityGuard(home, RELAY_VERSION);
  store.remove(RELAY_SECRET_NAMES.deviceRetirementReceipt);
  if (store.read(RELAY_SECRET_NAMES.deviceRetirementReceipt) !== null) {
    throw new Error("Protected device retirement receipt remains after finalization.");
  }
  return true;
}

export function retirementServerPublicKey(receipt: DeviceRetirementReceipt): KeyObject {
  return publicKeyFromHex(receipt.serverPublicKeyHex);
}

function isText(value: unknown, maxLength = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}

function isOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_000) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}
