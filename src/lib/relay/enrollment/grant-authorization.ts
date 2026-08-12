import { sign, verify, type KeyObject } from "node:crypto";

export type GrantAuthorizationKind = "delivery" | "bootstrap";

export interface GrantAuthorizationEnvelope {
  v: 1;
  kind: GrantAuthorizationKind;
  authorizationId: string;
  deviceId: string;
  recipientPublicKey: string;
  grantId: string;
  generation: number;
  grantHash: string;
  completionHash: string;
  completionEphemeralPublicKey: string;
  completionSealed: string;
  iat: number;
  exp: number;
}

export type GrantAuthorizationInput = Omit<GrantAuthorizationEnvelope, "v" | "iat" | "exp">;

export const GRANT_AUTHORIZATION_CLOCK_SKEW_MS = 60_000;

export class GrantAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantAuthorizationError";
  }
}

export function issueGrantAuthorization(
  input: GrantAuthorizationInput,
  privateKey: KeyObject,
  now: number,
  lifetimeMs: number,
): string {
  const envelope: GrantAuthorizationEnvelope = { v: 1, ...input, iat: now, exp: now + lifetimeMs };
  const encoded = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(encoded, "utf8"), privateKey).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGrantAuthorization(
  signed: string,
  publicKey: KeyObject,
  now: number = Date.now(),
  validateTime = true,
): GrantAuthorizationEnvelope {
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GrantAuthorizationError("Grant authorization has an invalid format.");
  }
  const [encoded, rawSignature] = parts;
  let signature: Buffer;
  try {
    signature = Buffer.from(rawSignature, "base64url");
  } catch {
    throw new GrantAuthorizationError("Grant authorization signature is not base64url.");
  }
  if (!verify(null, Buffer.from(encoded, "utf8"), publicKey, signature)) {
    throw new GrantAuthorizationError("Grant authorization signature is invalid.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new GrantAuthorizationError("Grant authorization payload is invalid.");
  }
  const value = raw as Partial<GrantAuthorizationEnvelope>;
  if (
    value.v !== 1 ||
    (value.kind !== "delivery" && value.kind !== "bootstrap") ||
    !isText(value.authorizationId) ||
    !isText(value.deviceId) ||
    !isHex(value.recipientPublicKey, 64) ||
    !isText(value.grantId) ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !isHex(value.grantHash, 64) ||
    !isHex(value.completionHash, 64) ||
    !isHex(value.completionEphemeralPublicKey, 64) ||
    !isText(value.completionSealed) ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp)
  ) {
    throw new GrantAuthorizationError("Grant authorization payload has an invalid shape.");
  }
  const authorization = value as GrantAuthorizationEnvelope;
  if (authorization.exp <= authorization.iat) {
    throw new GrantAuthorizationError("Grant authorization lifetime is invalid.");
  }
  if (validateTime) assertGrantAuthorizationActive(authorization, now);
  return authorization;
}

export function isGrantAuthorizationActive(
  authorization: Pick<GrantAuthorizationEnvelope, "iat" | "exp">,
  now: number = Date.now(),
): boolean {
  return (
    authorization.iat <= now + GRANT_AUTHORIZATION_CLOCK_SKEW_MS &&
    authorization.exp > now - GRANT_AUTHORIZATION_CLOCK_SKEW_MS
  );
}

export function assertGrantAuthorizationActive(
  authorization: Pick<GrantAuthorizationEnvelope, "iat" | "exp">,
  now: number = Date.now(),
): void {
  if (authorization.iat > now + GRANT_AUTHORIZATION_CLOCK_SKEW_MS) {
    throw new GrantAuthorizationError(
      "Grant authorization is not active yet. Sync Windows date and time, then retry.",
    );
  }
  if (authorization.exp <= now - GRANT_AUTHORIZATION_CLOCK_SKEW_MS) {
    throw new GrantAuthorizationError(
      "Grant authorization has expired. Sync Windows date and time, then retry.",
    );
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
