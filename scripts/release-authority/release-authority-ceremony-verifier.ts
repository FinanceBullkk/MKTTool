import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  privateKeyFromSeed,
  publicKeyFromHex,
  publicKeyHex,
  releaseKeyId,
  verifyRecoveryProof,
  verifySignedDelegation,
} from "./release-authority-format.mjs";
import { unprotectForCurrentWindowsUser } from "./windows-dpapi-current-user";

export interface CeremonyVerificationPaths {
  rootPublic: string;
  signedDelegation: string;
  publicRecord: string;
  recoveryProof: string;
  receiptOutput: string;
  storeDirectory: string;
  expectedRootKeyId: string;
}

interface RootPublicRecord {
  schemaVersion: number;
  type: string;
  algorithm: string;
  rootKeyId: string;
  publicKeyHex: string;
}

interface CeremonyPublicRecord {
  schemaVersion: number;
  type: string;
  rootKeyId: string;
  delegatedKeyId: string;
  backupHashes: Record<string, string>;
  recoveryRehearsalRequiredFrom: string;
}

interface DelegatedKeyStore {
  schemaVersion: number;
  type: string;
  delegatedKeyId: string;
  delegatedPublicKeyHex: string;
  protectedSeed: string;
}

export interface CeremonyReceipt {
  schemaVersion: 1;
  type: "mkttool.release-authority-ceremony-receipt";
  status: "verified";
  verifiedAt: string;
  rootKeyId: string;
  delegatedKeyId: string;
  delegationExpiresAt: string;
  recoveredFromBackup: string;
  signedDelegationSha256: string;
  recoveryProofSha256: string;
}

export function verifyReleaseAuthorityCeremony(paths: CeremonyVerificationPaths): CeremonyReceipt {
  const delegatedStorePath = path.join(paths.storeDirectory, "delegated-manifest-key.dpapi");
  const rootPublic = readJson<RootPublicRecord>(paths.rootPublic);
  const signedDelegation = readJson<unknown>(paths.signedDelegation);
  const publicRecord = readJson<CeremonyPublicRecord>(paths.publicRecord);
  const recoveryProof = readJson<unknown>(paths.recoveryProof);
  const delegatedStore = readJson<DelegatedKeyStore>(delegatedStorePath);
  const seed = unprotectForCurrentWindowsUser(delegatedStore.protectedSeed);

  try {
    const delegatedPublicHex = publicKeyHex(privateKeyFromSeed(seed));
    const delegatedKeyId = releaseKeyId(delegatedPublicHex);
    if (
      delegatedStore.schemaVersion !== 1 ||
      delegatedStore.type !== "mkttool.delegated-release-key-store" ||
      delegatedKeyId !== delegatedStore.delegatedKeyId ||
      delegatedPublicHex !== delegatedStore.delegatedPublicKeyHex
    ) {
      throw new Error("The DPAPI delegated key does not match its protected-store metadata.");
    }

    const rootKeyId = releaseKeyId(rootPublic.publicKeyHex);
    assertFingerprint(paths.expectedRootKeyId, rootKeyId, "root key");
    if (
      rootPublic.schemaVersion !== 1 ||
      rootPublic.type !== "mkttool.release-root-public-key" ||
      rootPublic.algorithm !== "Ed25519" ||
      publicRecord.schemaVersion !== 1 ||
      publicRecord.type !== "mkttool.release-root-ceremony-public-record" ||
      publicRecord.recoveryRehearsalRequiredFrom !== "B" ||
      !isSha256(publicRecord.backupHashes?.A) ||
      !isSha256(publicRecord.backupHashes?.B) ||
      publicRecord.backupHashes.A === publicRecord.backupHashes.B
    ) {
      throw new Error("The root ceremony public metadata is invalid.");
    }
    if (rootKeyId !== rootPublic.rootKeyId || rootKeyId !== publicRecord.rootKeyId) {
      throw new Error("The public root key does not match the ceremony record.");
    }
    const rootKey = publicKeyFromHex(rootPublic.publicKeyHex);
    const delegationStatement = verifySignedDelegation(rootKey, signedDelegation);
    const delegation = delegationStatement.delegation;
    if (
      delegationStatement.rootKeyId !== rootKeyId ||
      delegation.delegatedKeyId !== delegatedKeyId ||
      delegation.delegatedPublicKeyHex !== delegatedPublicHex ||
      publicRecord.delegatedKeyId !== delegatedKeyId
    ) {
      throw new Error("The signed delegation does not match the local delegated key.");
    }
    if (delegation.scope !== "mkttool.windows.compatibility-manifest") {
      throw new Error("The signed delegation has the wrong release scope.");
    }
    const notBefore = Date.parse(delegation.notBefore);
    const expiresAt = Date.parse(delegation.expiresAt);
    const lifetimeDays = (expiresAt - notBefore) / 86_400_000;
    if (
      !Number.isFinite(notBefore) ||
      !Number.isFinite(expiresAt) ||
      lifetimeDays < 30 ||
      lifetimeDays > 400 ||
      notBefore > Date.now() ||
      expiresAt <= Date.now()
    ) {
      throw new Error("The signed release delegation is inactive, expired, or outside its allowed lifetime.");
    }

    const recoveryStatement = verifyRecoveryProof(rootKey, recoveryProof);
    if (
      recoveryStatement.rootKeyId !== rootKeyId ||
      recoveryStatement.backupLabel !== publicRecord.recoveryRehearsalRequiredFrom ||
      recoveryStatement.backupSha256 !== publicRecord.backupHashes[recoveryStatement.backupLabel]
    ) {
      throw new Error("The recovery proof does not satisfy the ceremony record.");
    }

    const receipt: CeremonyReceipt = {
      schemaVersion: 1,
      type: "mkttool.release-authority-ceremony-receipt",
      status: "verified",
      verifiedAt: new Date().toISOString(),
      rootKeyId,
      delegatedKeyId,
      delegationExpiresAt: delegation.expiresAt,
      recoveredFromBackup: recoveryStatement.backupLabel,
      signedDelegationSha256: sha256File(paths.signedDelegation),
      recoveryProofSha256: sha256File(paths.recoveryProof),
    };
    writeFileSync(paths.receiptOutput, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return receipt;
  } finally {
    seed.fill(0);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function assertFingerprint(expected: string, actual: string, label: string): void {
  if (!/^[0-9a-f]{32}([0-9a-f]{32})?$/i.test(expected) || !actual.startsWith(expected.toLowerCase())) {
    throw new Error(`The ${label} does not match the separately recorded fingerprint.`);
  }
}
