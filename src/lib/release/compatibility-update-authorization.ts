import { sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import {
  canonicalJson,
  publicKeyFromHex,
} from "../../../scripts/release-authority/release-authority-key-primitives.mjs";

const DOMAIN = "MKTTool compatibility update authorization v1\n";
const SHA256 = /^[0-9a-f]{64}$/;
const ARTIFACT_PATH = /^\/api\/relay\/download\/v\d+\/artifact\/[a-z-]+$/;

export const COMPATIBILITY_UPDATE_COMMAND_LIFETIME_MS = 60_000;
export const COMPATIBILITY_ARTIFACT_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const COMPATIBILITY_UPDATE_CLOCK_SKEW_MS = 60_000;
export const COMPATIBILITY_ARTIFACT_AUTHORIZATION_SCHEME = "MKTTool-Compatibility";

const authorizationSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.compatibility-update-authorization"),
    authorizationId: z.uuid(),
    actorUserId: z.string().min(1),
    authorizedRole: z.enum(["ADMIN", "OPERATOR"]),
    deviceId: z.string().min(1),
    sequence: z.number().int().positive().safe(),
    manifestDigest: z.string().regex(SHA256),
    repairMissingState: z.boolean(),
    authenticatedArtifactPaths: z.array(z.string().regex(ARTIFACT_PATH)).max(5),
    issuedAt: z.iso.datetime({ offset: true }),
    commandExpiresAt: z.iso.datetime({ offset: true }),
    artifactExpiresAt: z.iso.datetime({ offset: true }),
    signature: z.string().min(80).max(120),
  })
  .strict();

export type CompatibilityUpdateAuthorization = z.infer<typeof authorizationSchema>;

export function signCompatibilityUpdateAuthorization(
  privateKey: KeyObject,
  statement: Omit<CompatibilityUpdateAuthorization, "signature">,
): CompatibilityUpdateAuthorization {
  return {
    ...statement,
    signature: sign(null, payload(statement), privateKey).toString("base64url"),
  };
}

export function verifyCompatibilityUpdateAuthorization(
  input: unknown,
  options: {
    serverPublicKeyHex: string;
    deviceId: string;
    sequence: number;
    manifestDigest: string;
    manifestArtifactUrls: string[];
    now?: Date;
  },
): CompatibilityUpdateAuthorization {
  const authorization = parseAndVerify(input, options.serverPublicKeyHex);
  validateTimes(authorization, options.now ?? new Date(), true);
  if (
    authorization.deviceId !== options.deviceId ||
    authorization.sequence !== options.sequence ||
    authorization.manifestDigest !== options.manifestDigest
  ) {
    throw new Error("The compatibility update authorization does not match this device and manifest.");
  }
  if (authorization.repairMissingState && authorization.authorizedRole !== "ADMIN") {
    throw new Error("Only ADMIN can authorize missing compatibility-state repair.");
  }
  const manifestPaths = new Set(options.manifestArtifactUrls.map((url) => new URL(url).pathname));
  if (authorization.authenticatedArtifactPaths.some((path) => !manifestPaths.has(path))) {
    throw new Error("The compatibility artifact authorization names a URL outside the signed manifest.");
  }
  return authorization;
}

export function encodeCompatibilityArtifactAuthorization(
  authorization: CompatibilityUpdateAuthorization,
): string {
  return `${COMPATIBILITY_ARTIFACT_AUTHORIZATION_SCHEME} ${Buffer.from(
    JSON.stringify(authorization),
    "utf8",
  ).toString("base64url")}`;
}

export function compatibilityArtifactAuthorizationMatches(
  header: string | null,
  options: { serverPublicKeyHex: string; requestPath: string; now?: Date },
): boolean {
  try {
    const prefix = `${COMPATIBILITY_ARTIFACT_AUTHORIZATION_SCHEME} `;
    if (!header?.startsWith(prefix)) return false;
    const input = JSON.parse(
      Buffer.from(header.slice(prefix.length), "base64url").toString("utf8"),
    );
    const authorization = parseAndVerify(input, options.serverPublicKeyHex);
    validateTimes(authorization, options.now ?? new Date(), false);
    return authorization.authenticatedArtifactPaths.includes(options.requestPath);
  } catch {
    return false;
  }
}

function parseAndVerify(
  input: unknown,
  serverPublicKeyHex: string,
): CompatibilityUpdateAuthorization {
  const authorization = authorizationSchema.parse(input);
  const { signature, ...statement } = authorization;
  const valid = verify(
    null,
    payload(statement),
    publicKeyFromHex(serverPublicKeyHex),
    Buffer.from(signature, "base64url"),
  );
  if (!valid) throw new Error("The compatibility update authorization signature is invalid.");
  return authorization;
}

function validateTimes(
  authorization: CompatibilityUpdateAuthorization,
  now: Date,
  command: boolean,
): void {
  const issuedAt = Date.parse(authorization.issuedAt);
  const commandExpiresAt = Date.parse(authorization.commandExpiresAt);
  const artifactExpiresAt = Date.parse(authorization.artifactExpiresAt);
  if (
    commandExpiresAt <= issuedAt ||
    commandExpiresAt - issuedAt > COMPATIBILITY_UPDATE_COMMAND_LIFETIME_MS ||
    artifactExpiresAt < commandExpiresAt ||
    artifactExpiresAt - issuedAt > COMPATIBILITY_ARTIFACT_LIFETIME_MS
  ) {
    throw new Error("The compatibility update authorization lifetime is invalid.");
  }
  if (issuedAt > now.getTime() + COMPATIBILITY_UPDATE_CLOCK_SKEW_MS) {
    throw new Error("The compatibility update authorization is not active yet.");
  }
  const expiry = command ? commandExpiresAt : artifactExpiresAt;
  if (expiry <= now.getTime()) {
    throw new Error("The compatibility update authorization has expired.");
  }
}

function payload(statement: Omit<CompatibilityUpdateAuthorization, "signature">): Buffer {
  return Buffer.from(DOMAIN + canonicalJson(statement), "utf8");
}
