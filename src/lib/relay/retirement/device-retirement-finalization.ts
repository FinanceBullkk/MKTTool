import { sign, verify, type KeyObject } from "node:crypto";

export interface DeviceRetirementFinalizationEnvelope {
  v: 1;
  kind: "device-retirement-finalization";
  authorizationId: string;
  retirementId: string;
  deviceId: string;
  recipientPublicKey: string;
  completionHash: string;
  completedAt: number;
}

type FinalizationInput = Omit<
  DeviceRetirementFinalizationEnvelope,
  "v" | "kind" | "completedAt"
>;

export function issueDeviceRetirementFinalization(
  input: FinalizationInput,
  privateKey: KeyObject,
  completedAt: number,
): string {
  const envelope: DeviceRetirementFinalizationEnvelope = {
    v: 1,
    kind: "device-retirement-finalization",
    ...input,
    completedAt,
  };
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(encoded, "utf8"), privateKey).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyDeviceRetirementFinalization(
  signedAuthorization: string,
  publicKey: KeyObject,
): DeviceRetirementFinalizationEnvelope {
  const parts = signedAuthorization.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Device retirement finalization has an invalid format.");
  }
  const [encoded, rawSignature] = parts;
  const signature = Buffer.from(rawSignature, "base64url");
  if (!verify(null, Buffer.from(encoded, "utf8"), publicKey, signature)) {
    throw new Error("Device retirement finalization signature is invalid.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Device retirement finalization payload is invalid.");
  }
  const value = parsed as Partial<DeviceRetirementFinalizationEnvelope>;
  if (
    value.v !== 1 ||
    value.kind !== "device-retirement-finalization" ||
    !isText(value.authorizationId) ||
    !isText(value.retirementId) ||
    !isText(value.deviceId) ||
    !isHex(value.recipientPublicKey, 64) ||
    !isHex(value.completionHash, 64) ||
    !Number.isSafeInteger(value.completedAt) ||
    value.completedAt! <= 0
  ) {
    throw new Error("Device retirement finalization payload has an invalid shape.");
  }
  return value as DeviceRetirementFinalizationEnvelope;
}

function isText(value: unknown, maxLength = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
