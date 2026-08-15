import { createHash, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson, publicKeyFromHex } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import type {
  CompatibilityManifest,
  SignedCompatibilityManifest,
  SignedDelegation,
  SignedDelegationRevocation,
} from "./compatibility-manifest-schema";

const MANIFEST_DOMAIN = "MKTTool Windows compatibility manifest v1\n";
const REVOCATION_DOMAIN = "MKTTool release delegation revocation v1\n";

export function signCompatibilityManifest(
  delegatedPrivateKey: KeyObject,
  delegation: SignedDelegation,
  manifest: CompatibilityManifest,
  signedAt: string,
): SignedCompatibilityManifest {
  const statement = {
    schemaVersion: 1 as const,
    type: "mkttool.signed-windows-compatibility-manifest" as const,
    signedAt,
    delegation,
    manifest,
  };
  return {
    ...statement,
    signature: sign(null, manifestPayload(statement), delegatedPrivateKey).toString("base64url"),
  };
}

export function verifyManifestSignature(value: SignedCompatibilityManifest): boolean {
  const { signature, ...statement } = value;
  return verify(
    null,
    manifestPayload(statement),
    publicKeyFromHex(value.delegation.delegation.delegatedPublicKeyHex),
    Buffer.from(signature, "base64url"),
  );
}

export function verifyRevocationSignature(
  rootPublicKey: KeyObject,
  value: SignedDelegationRevocation,
): boolean {
  const { signature, ...statement } = value;
  return verify(
    null,
    Buffer.from(REVOCATION_DOMAIN + canonicalJson(statement), "utf8"),
    rootPublicKey,
    Buffer.from(signature, "base64url"),
  );
}

export function signDelegationRevocation(
  rootPrivateKey: KeyObject,
  statement: Omit<SignedDelegationRevocation, "signature">,
): SignedDelegationRevocation {
  const payload = Buffer.from(REVOCATION_DOMAIN + canonicalJson(statement), "utf8");
  return { ...statement, signature: sign(null, payload, rootPrivateKey).toString("base64url") };
}

export function signedManifestDigest(value: SignedCompatibilityManifest): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function manifestPayload(value: Omit<SignedCompatibilityManifest, "signature">): Buffer {
  return Buffer.from(MANIFEST_DOMAIN + canonicalJson(value), "utf8");
}
