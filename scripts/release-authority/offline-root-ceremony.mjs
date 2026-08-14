#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  decryptRootSeed,
  encryptRootSeed,
  privateKeyFromSeed,
  publicKeyFromHex,
  publicKeyHex,
  releaseKeyId,
  sha256Bytes,
  signDelegation,
  signRecoveryProof,
  verifyRecoveryProof,
} from "./release-authority-format.mjs";
import {
  assertSeparateVolumeRoots,
  readConfirmedPassphrase,
  readJson,
  readRecoveryPassphrase,
  serializeJson,
  writeJsonExclusive,
} from "./offline-ceremony-io.mjs";
import {
  validateDelegationRequest,
  verifyWrittenBackup,
  writeBackupDirectory,
} from "./offline-root-backup-files.mjs";

export function initializeOfflineRoot({
  requestPath,
  backupDirectoryA,
  backupDirectoryB,
  passphrase,
  expectedDelegatedKeyId,
  allowSameVolume = false,
  scryptParameters,
}) {
  if (!allowSameVolume) assertSeparateVolumeRoots(backupDirectoryA, backupDirectoryB);
  const request = readJson(requestPath);
  validateDelegationRequest(request, expectedDelegatedKeyId);
  const createdAt = new Date().toISOString();
  const seed = randomBytes(32);
  try {
    const rootPrivateKey = privateKeyFromSeed(seed);
    const rootPublicKeyHex = publicKeyHex(rootPrivateKey);
    const rootKeyId = releaseKeyId(rootPublicKeyHex);
    const rootPublic = {
      schemaVersion: 1,
      type: "mkttool.release-root-public-key",
      algorithm: "Ed25519",
      rootKeyId,
      publicKeyHex: rootPublicKeyHex,
      createdAt,
    };
    const backupA = encryptRootSeed(
      seed,
      passphrase,
      { rootKeyId, publicKeyHex: rootPublicKeyHex, createdAt, copyLabel: "A" },
      scryptParameters,
    );
    const backupB = encryptRootSeed(
      seed,
      passphrase,
      { rootKeyId, publicKeyHex: rootPublicKeyHex, createdAt, copyLabel: "B" },
      scryptParameters,
    );
    const signedDelegation = signDelegation(rootPrivateKey, rootKeyId, request, createdAt);
    const publicRecord = {
      schemaVersion: 1,
      type: "mkttool.release-root-ceremony-public-record",
      rootKeyId,
      delegatedKeyId: request.delegatedKeyId,
      createdAt,
      backupHashes: {
        A: sha256Bytes(Buffer.from(serializeJson(backupA), "utf8")),
        B: sha256Bytes(Buffer.from(serializeJson(backupB), "utf8")),
      },
      recoveryRehearsalRequiredFrom: "B",
    };

    writeBackupDirectory(backupDirectoryA, backupA, rootPublic, request, signedDelegation, publicRecord);
    writeBackupDirectory(backupDirectoryB, backupB, rootPublic, request, signedDelegation, publicRecord);
    verifyWrittenBackup(backupDirectoryA, passphrase, rootKeyId);
    verifyWrittenBackup(backupDirectoryB, passphrase, rootKeyId);
    return { rootKeyId, delegatedKeyId: request.delegatedKeyId, publicRecord };
  } finally {
    seed.fill(0);
  }
}

export function recoverOfflineRoot({ backupPath, publicRecordPath, proofOutputPath, passphrase }) {
  const backup = readJson(backupPath);
  const publicRecord = readJson(publicRecordPath);
  if (
    publicRecord.schemaVersion !== 1 ||
    publicRecord.type !== "mkttool.release-root-ceremony-public-record" ||
    publicRecord.rootKeyId !== backup.rootKeyId ||
    publicRecord.recoveryRehearsalRequiredFrom !== "B"
  ) {
    throw new Error("The ceremony public record must require recovery from backup B.");
  }
  const backupHash = sha256Bytes(Buffer.from(serializeJson(backup), "utf8"));
  const expectedHash = publicRecord.backupHashes?.[backup.copyLabel];
  if (!expectedHash || backupHash !== expectedHash) {
    throw new Error("The selected root backup does not match the ceremony public record.");
  }
  if (backup.copyLabel !== publicRecord.recoveryRehearsalRequiredFrom) {
    throw new Error(`Recovery must be rehearsed from backup ${publicRecord.recoveryRehearsalRequiredFrom}.`);
  }

  const seed = decryptRootSeed(backup, passphrase);
  try {
    const rootPrivateKey = privateKeyFromSeed(seed);
    const proof = signRecoveryProof(rootPrivateKey, {
      rootKeyId: backup.rootKeyId,
      backupLabel: backup.copyLabel,
      backupSha256: backupHash,
      recoveredAt: new Date().toISOString(),
    });
    verifyRecoveryProof(publicKeyFromHex(backup.publicKeyHex), proof);
    writeJsonExclusive(proofOutputPath, proof);
    return proof;
  } finally {
    seed.fill(0);
  }
}

function parseCommand(values) {
  const [command, ...rest] = values;
  const args = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith("--") || !rest[index + 1]) throw new Error(usage());
    args.set(rest[index].slice(2), rest[index + 1]);
  }
  return { command, args };
}

function required(args, name) {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required.\n\n${usage()}`);
  return value;
}

function requiredPath(args, name) {
  return path.resolve(required(args, name));
}

function usage() {
  return [
    "Run this tool only on the offline ceremony host with Node.js 22:",
    "  node offline-root-ceremony.mjs initialize --request <file> --backup-a <dir> --backup-b <dir>",
    "    --expected-delegated-key-id <32-or-64-hex fingerprint>",
    "  node offline-root-ceremony.mjs recover --backup <file> --public-record <file> --proof-output <file>",
  ].join("\n");
}

async function main() {
  const { command, args } = parseCommand(process.argv.slice(2));
  if (command === "initialize") {
    const passphrase = await readConfirmedPassphrase();
    const result = initializeOfflineRoot({
      requestPath: requiredPath(args, "request"),
      backupDirectoryA: requiredPath(args, "backup-a"),
      backupDirectoryB: requiredPath(args, "backup-b"),
      passphrase,
      expectedDelegatedKeyId: required(args, "expected-delegated-key-id"),
    });
    console.log(`Offline root initialized: ${result.rootKeyId}`);
    console.log(`Build-machine comparison fingerprint: ${result.rootKeyId.slice(0, 32)}`);
    console.log("Keep the two encrypted backup directories on separate physical media.");
    return;
  }
  if (command === "recover") {
    const passphrase = await readRecoveryPassphrase();
    const proof = recoverOfflineRoot({
      backupPath: requiredPath(args, "backup"),
      publicRecordPath: requiredPath(args, "public-record"),
      proofOutputPath: requiredPath(args, "proof-output"),
      passphrase,
    });
    console.log(`Recovery rehearsal passed for root ${proof.rootKeyId} using backup ${proof.backupLabel}.`);
    return;
  }
  throw new Error(usage());
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error instanceof Error ? error.message : String(error)).replaceAll(/\r?\n/g, " "));
    process.exitCode = 1;
  });
}
