import { createHash, sign, verify, type KeyObject } from "node:crypto";

export interface DeviceRetirementAuthorizationEnvelope {
  v: 1;
  kind: "device-retirement";
  authorizationId: string;
  retirementId: string;
  deviceId: string;
  recipientPublicKey: string;
  completionHash: string;
  completionEphemeralPublicKey: string;
  completionSealed: string;
  finalizationPublicKey: string;
  iat: number;
  exp: number;
}

export type DeviceRetirementAuthorizationInput = Omit<
  DeviceRetirementAuthorizationEnvelope,
  "v" | "kind" | "iat" | "exp"
>;

export const DEVICE_RETIREMENT_CLOCK_SKEW_MS = 60_000;

export class DeviceRetirementAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceRetirementAuthorizationError";
  }
}

export function issueDeviceRetirementAuthorization(
  input: DeviceRetirementAuthorizationInput,
  privateKey: KeyObject,
  now: number,
  lifetimeMs: number,
): string {
  const envelope: DeviceRetirementAuthorizationEnvelope = {
    v: 1,
    kind: "device-retirement",
    ...input,
    iat: now,
    exp: now + lifetimeMs,
  };
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(encoded, "utf8"), privateKey).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyDeviceRetirementAuthorization(
  signed: string,
  publicKey: KeyObject,
  now: number = Date.now(),
  validateTime = true,
): DeviceRetirementAuthorizationEnvelope {
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new DeviceRetirementAuthorizationError("Device retirement authorization has an invalid format.");
  }
  const [encoded, rawSignature] = parts;
  let signature: Buffer;
  try {
    signature = Buffer.from(rawSignature, "base64url");
  } catch {
    throw new DeviceRetirementAuthorizationError("Device retirement signature is not base64url.");
  }
  if (!verify(null, Buffer.from(encoded, "utf8"), publicKey, signature)) {
    throw new DeviceRetirementAuthorizationError("Device retirement signature is invalid.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new DeviceRetirementAuthorizationError("Device retirement payload is invalid.");
  }
  const value = raw as Partial<DeviceRetirementAuthorizationEnvelope>;
  if (
    value.v !== 1 ||
    value.kind !== "device-retirement" ||
    !isText(value.authorizationId) ||
    !isText(value.retirementId) ||
    !isText(value.deviceId) ||
    !isHex(value.recipientPublicKey, 64) ||
    !isHex(value.completionHash, 64) ||
    !isHex(value.completionEphemeralPublicKey, 64) ||
    !isText(value.completionSealed, 10_000) ||
    !isHex(value.finalizationPublicKey, 64) ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp)
  ) {
    throw new DeviceRetirementAuthorizationError(
      "Device retirement authorization payload has an invalid shape.",
    );
  }
  const authorization = value as DeviceRetirementAuthorizationEnvelope;
  if (authorization.exp <= authorization.iat) {
    throw new DeviceRetirementAuthorizationError("Device retirement authorization lifetime is invalid.");
  }
  if (validateTime) assertDeviceRetirementAuthorizationActive(authorization, now);
  return authorization;
}

export function hashDeviceRetirementProof(proof: string): string {
  return createHash("sha256").update(proof, "utf8").digest("hex");
}

function assertDeviceRetirementAuthorizationActive(
  authorization: Pick<DeviceRetirementAuthorizationEnvelope, "iat" | "exp">,
  now: number,
): void {
  if (authorization.iat > now + DEVICE_RETIREMENT_CLOCK_SKEW_MS) {
    throw new DeviceRetirementAuthorizationError(
      "Device retirement authorization is not active yet. Sync Windows date and time, then retry.",
    );
  }
  if (authorization.exp <= now - DEVICE_RETIREMENT_CLOCK_SKEW_MS) {
    throw new DeviceRetirementAuthorizationError(
      "Device retirement authorization has expired. Sync Windows date and time, then retry.",
    );
  }
}

function isText(value: unknown, maxLength = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
