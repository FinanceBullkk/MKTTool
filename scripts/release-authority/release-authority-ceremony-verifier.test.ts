import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
} from "./release-authority-format.mjs";
import { verifyReleaseAuthorityCeremony } from "./release-authority-ceremony-verifier";
import { initializeOfflineRoot, recoverOfflineRoot } from "./offline-root-ceremony.mjs";
import { protectForCurrentWindowsUser } from "./windows-dpapi-current-user";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.runIf(process.platform === "win32")("release-authority ceremony verification", () => {
  it("matches the signed delegation and backup-B proof to the DPAPI key", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-release-verifier-"));
    temporaryDirectories.push(root);
    const storeDirectory = path.join(root, "store");
    mkdirSync(storeDirectory);
    const delegatedSeed = randomBytes(32);
    const delegatedPublicHex = publicKeyHex(privateKeyFromSeed(delegatedSeed));
    const delegatedKeyId = releaseKeyId(delegatedPublicHex);
    writeJson(path.join(storeDirectory, "delegated-manifest-key.dpapi"), {
      schemaVersion: 1,
      type: "mkttool.delegated-release-key-store",
      delegatedKeyId,
      delegatedPublicKeyHex: delegatedPublicHex,
      protectedSeed: protectForCurrentWindowsUser(delegatedSeed),
    });
    delegatedSeed.fill(0);

    const expiresAt = new Date();
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
    const request = buildDelegationRequest({
      publicHex: delegatedPublicHex,
      createdAt: new Date().toISOString(),
      notBefore: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      label: "test",
    });
    const requestPath = path.join(root, "delegation-request.json");
    const backupA = path.join(root, "backup-a");
    const backupB = path.join(root, "backup-b");
    const recoveryProof = path.join(root, "root-recovery-proof.json");
    const receiptOutput = path.join(root, "ceremony-receipt.json");
    writeJson(requestPath, request);
    const initialization = initializeOfflineRoot({
      requestPath,
      backupDirectoryA: backupA,
      backupDirectoryB: backupB,
      passphrase: "synthetic-test-passphrase-only",
      expectedDelegatedKeyId: delegatedKeyId.slice(0, 32),
      allowSameVolume: true,
      scryptParameters: { N: 16_384, r: 8, p: 1 },
    });
    recoverOfflineRoot({
      backupPath: path.join(backupB, "root-private.encrypted.json"),
      publicRecordPath: path.join(backupB, "ceremony-public-record.json"),
      proofOutputPath: recoveryProof,
      passphrase: "synthetic-test-passphrase-only",
    });

    const verificationPaths = {
      rootPublic: path.join(backupB, "root-public.json"),
      signedDelegation: path.join(backupB, "signed-delegation.json"),
      publicRecord: path.join(backupB, "ceremony-public-record.json"),
      recoveryProof,
      receiptOutput,
      storeDirectory,
      expectedRootKeyId: initialization.rootKeyId.slice(0, 32),
    };
    expect(() =>
      verifyReleaseAuthorityCeremony({
        ...verificationPaths,
        receiptOutput: path.join(root, "wrong-root-receipt.json"),
        expectedRootKeyId: "0".repeat(32),
      }),
    ).toThrow("separately recorded fingerprint");

    const receipt = verifyReleaseAuthorityCeremony(verificationPaths);
    expect(receipt.status).toBe("verified");
    expect(receipt.recoveredFromBackup).toBe("B");
    expect(receipt.delegatedKeyId).toBe(delegatedKeyId);
  }, 15_000);
});

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
