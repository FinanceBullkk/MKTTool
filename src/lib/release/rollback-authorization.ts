import { sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonicalJson, publicKeyFromHex } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";

const DOMAIN = "MKTTool compatibility rollback authorization v1\n";
export const ROLLBACK_AUTHORIZATION_CLOCK_SKEW_MS = 60_000;
export const ROLLBACK_AUTHORIZATION_MAX_LIFETIME_MS = 60_000;

const rollbackAuthorizationSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.compatibility-rollback-authorization"),
    authorizationId: z.uuid(),
    adminUserId: z.string().min(1),
    authorizedRole: z.literal("ADMIN"),
    deviceId: z.string().min(1),
    currentSequence: z.number().int().positive(),
    retainedSequence: z.number().int().positive(),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    signature: z.string().min(80).max(120),
  })
  .strict();

export type RollbackAuthorization = z.infer<typeof rollbackAuthorizationSchema>;

export function signRollbackAuthorization(
  serverPrivateKey: KeyObject,
  statement: Omit<RollbackAuthorization, "signature">,
): RollbackAuthorization {
  return {
    ...statement,
    signature: sign(null, payload(statement), serverPrivateKey).toString("base64url"),
  };
}

export function verifyRollbackAuthorization(
  input: unknown,
  options: {
    serverPublicKeyHex: string;
    deviceId: string;
    currentSequence: number;
    retainedSequence: number;
    rollbackFloorSequence: number;
    usedAuthorizationIds: string[];
    now?: Date;
  },
): RollbackAuthorization {
  const authorization = rollbackAuthorizationSchema.parse(input);
  const { signature, ...statement } = authorization;
  if (
    !verify(
      null,
      payload(statement),
      publicKeyFromHex(options.serverPublicKeyHex),
      Buffer.from(signature, "base64url"),
    )
  ) {
    throw new Error("The rollback authorization signature is invalid.");
  }
  const now = (options.now ?? new Date()).getTime();
  const issuedAt = Date.parse(authorization.issuedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > ROLLBACK_AUTHORIZATION_MAX_LIFETIME_MS
  ) {
    throw new Error("The rollback authorization lifetime is invalid.");
  }
  if (issuedAt > now + ROLLBACK_AUTHORIZATION_CLOCK_SKEW_MS) {
    throw new Error("The rollback authorization is not active yet. Sync Windows date and time, then retry.");
  }
  if (expiresAt <= now) {
    throw new Error("The rollback authorization has expired. Sync Windows date and time, then retry.");
  }
  if (
    authorization.deviceId !== options.deviceId ||
    authorization.currentSequence !== options.currentSequence ||
    authorization.retainedSequence !== options.retainedSequence
  ) {
    throw new Error("The rollback authorization does not match this device and retained set.");
  }
  if (authorization.retainedSequence < options.rollbackFloorSequence) {
    throw new Error("The authorized rollback target is below the secure-store rollback floor.");
  }
  if (authorization.retainedSequence >= authorization.currentSequence) {
    throw new Error("The authorized rollback target must be older than the active compatibility set.");
  }
  if (options.usedAuthorizationIds.includes(authorization.authorizationId)) {
    throw new Error("The rollback authorization has already been used.");
  }
  return authorization;
}

function payload(statement: Omit<RollbackAuthorization, "signature">): Buffer {
  return Buffer.from(DOMAIN + canonicalJson(statement), "utf8");
}
