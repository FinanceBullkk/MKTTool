import path from "node:path";
import {
  RELEASE_AUTHORITY_SCOPE,
  decryptRootSeed,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
} from "./release-authority-format.mjs";
import { createNewDirectory, readJson, writeJsonExclusive } from "./offline-ceremony-io.mjs";

export function writeBackupDirectory(directory, backup, rootPublic, request, signedDelegation, publicRecord) {
  createNewDirectory(directory);
  writeJsonExclusive(path.join(directory, "root-private.encrypted.json"), backup);
  writeJsonExclusive(path.join(directory, "root-public.json"), rootPublic);
  writeJsonExclusive(path.join(directory, "delegation-request.json"), request);
  writeJsonExclusive(path.join(directory, "signed-delegation.json"), signedDelegation);
  writeJsonExclusive(path.join(directory, "ceremony-public-record.json"), publicRecord);
}

export function verifyWrittenBackup(directory, passphrase, expectedRootKeyId) {
  const writtenBackup = readJson(path.join(directory, "root-private.encrypted.json"));
  const recoveredSeed = decryptRootSeed(writtenBackup, passphrase);
  try {
    const recoveredRootKeyId = releaseKeyId(publicKeyHex(privateKeyFromSeed(recoveredSeed)));
    if (recoveredRootKeyId !== expectedRootKeyId) {
      throw new Error(`The encrypted backup written to ${directory} failed read-back verification.`);
    }
  } finally {
    recoveredSeed.fill(0);
  }
}

export function validateDelegationRequest(request, expectedDelegatedKeyId) {
  if (request?.type !== "mkttool.release-delegation-request" || request?.schemaVersion !== 1) {
    throw new Error("The delegation request format is invalid.");
  }
  if (request.scope !== RELEASE_AUTHORITY_SCOPE) {
    throw new Error("The delegation request has the wrong release scope.");
  }
  if (releaseKeyId(request.delegatedPublicKeyHex) !== request.delegatedKeyId) {
    throw new Error("The delegation request key id does not match its public key.");
  }
  assertFingerprint(expectedDelegatedKeyId, request.delegatedKeyId, "delegated key");
  const notBefore = Date.parse(request.notBefore);
  const expiresAt = Date.parse(request.expiresAt);
  const lifetimeDays = (expiresAt - notBefore) / 86_400_000;
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt) || lifetimeDays < 30 || lifetimeDays > 400) {
    throw new Error("The delegation lifetime must be between 30 and 400 days.");
  }
}

function assertFingerprint(expected, actual, label) {
  if (!/^[0-9a-f]{32}([0-9a-f]{32})?$/i.test(expected) || !actual.startsWith(expected.toLowerCase())) {
    throw new Error(`The ${label} does not match the separately recorded fingerprint.`);
  }
}
