import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
} from "./release-authority-format.mjs";
import { initializeOfflineRoot, recoverOfflineRoot } from "./offline-root-ceremony.mjs";

const temporaryDirectories: string[] = [];
const TEST_SCRYPT = { N: 16_384, r: 8, p: 1 };

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("offline root ceremony", () => {
  it("creates distinct encrypted backups and proves recovery from copy B", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-release-ceremony-"));
    temporaryDirectories.push(root);
    const delegatedPublicHex = publicKeyHex(privateKeyFromSeed(Buffer.alloc(32, 7)));
    const request = buildDelegationRequest({
      publicHex: delegatedPublicHex,
      createdAt: "2026-08-14T00:00:00.000Z",
      notBefore: "2026-08-14T00:00:00.000Z",
      expiresAt: "2027-08-14T00:00:00.000Z",
      label: "test",
    });
    const requestPath = path.join(root, "delegation-request.json");
    const backupA = path.join(root, "backup-a");
    const backupB = path.join(root, "backup-b");
    const proofPath = path.join(root, "root-recovery-proof.json");
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

    expect(() =>
      initializeOfflineRoot({
        requestPath,
        backupDirectoryA: backupA,
        backupDirectoryB: backupB,
        passphrase: "a-password-manager-passphrase",
        expectedDelegatedKeyId: "0".repeat(32),
        allowSameVolume: true,
        scryptParameters: TEST_SCRYPT,
      }),
    ).toThrow("separately recorded fingerprint");

    initializeOfflineRoot({
      requestPath,
      backupDirectoryA: backupA,
      backupDirectoryB: backupB,
      passphrase: "a-password-manager-passphrase",
      expectedDelegatedKeyId: request.delegatedKeyId.slice(0, 32),
      allowSameVolume: true,
      scryptParameters: TEST_SCRYPT,
    });
    const encryptedA = readFileSync(path.join(backupA, "root-private.encrypted.json"), "utf8");
    const encryptedB = readFileSync(path.join(backupB, "root-private.encrypted.json"), "utf8");
    expect(encryptedA).not.toBe(encryptedB);

    const tamperedRecordPath = path.join(root, "tampered-public-record.json");
    const publicRecord = JSON.parse(
      readFileSync(path.join(backupB, "ceremony-public-record.json"), "utf8"),
    );
    writeFileSync(
      tamperedRecordPath,
      `${JSON.stringify({ ...publicRecord, recoveryRehearsalRequiredFrom: "A" }, null, 2)}\n`,
    );
    expect(() =>
      recoverOfflineRoot({
        backupPath: path.join(backupA, "root-private.encrypted.json"),
        publicRecordPath: tamperedRecordPath,
        proofOutputPath: proofPath,
        passphrase: "a-password-manager-passphrase",
      }),
    ).toThrow("must require recovery from backup B");

    const proof = recoverOfflineRoot({
      backupPath: path.join(backupB, "root-private.encrypted.json"),
      publicRecordPath: path.join(backupB, "ceremony-public-record.json"),
      proofOutputPath: proofPath,
      passphrase: "a-password-manager-passphrase",
    });
    expect(proof.backupLabel).toBe("B");
    expect(JSON.parse(readFileSync(proofPath, "utf8")).signature).toBe(proof.signature);
  });
});
