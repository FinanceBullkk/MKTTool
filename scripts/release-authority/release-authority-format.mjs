import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  sign,
  verify,
} from "node:crypto";
import {
  canonicalJson,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
} from "./release-authority-key-primitives.mjs";

export {
  canonicalJson,
  privateKeyFromSeed,
  publicKeyFromHex,
  publicKeyHex,
  releaseKeyId,
  sha256Bytes,
} from "./release-authority-key-primitives.mjs";

export const RELEASE_AUTHORITY_SCOPE = "mkttool.windows.compatibility-manifest";
/** @type {Readonly<{ N: number, r: number, p: number }>} */
export const ROOT_BACKUP_SCRYPT = Object.freeze({ N: 262_144, r: 8, p: 1 });

const DELEGATION_DOMAIN = "MKTTool release delegation v1\n";
const RECOVERY_DOMAIN = "MKTTool release root recovery proof v1\n";

export function buildDelegationRequest({ publicHex, createdAt, notBefore, expiresAt, label }) {
  return {
    schemaVersion: 1,
    type: "mkttool.release-delegation-request",
    scope: RELEASE_AUTHORITY_SCOPE,
    label,
    delegatedKeyId: releaseKeyId(publicHex),
    delegatedPublicKeyHex: publicHex,
    createdAt,
    notBefore,
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  };
}

export function signDelegation(rootPrivateKey, rootKeyId, request, signedAt) {
  const statement = {
    schemaVersion: 1,
    type: "mkttool.release-delegation",
    rootKeyId,
    signedAt,
    delegation: request,
  };
  const payload = Buffer.from(DELEGATION_DOMAIN + canonicalJson(statement), "utf8");
  return { ...statement, signature: sign(null, payload, rootPrivateKey).toString("base64url") };
}

export function verifySignedDelegation(rootPublicKey, signedDelegation) {
  const { signature, ...statement } = signedDelegation;
  if (statement.schemaVersion !== 1 || statement.type !== "mkttool.release-delegation") {
    throw new Error("The release delegation metadata is invalid.");
  }
  if (typeof signature !== "string") throw new Error("The delegation signature is missing.");
  const payload = Buffer.from(DELEGATION_DOMAIN + canonicalJson(statement), "utf8");
  if (!verify(null, payload, rootPublicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("The release delegation signature is invalid.");
  }
  return statement;
}

export function encryptRootSeed(seed, passphrase, metadata, scryptParameters = ROOT_BACKUP_SCRYPT) {
  if (passphrase.length < 20) throw new Error("The root-backup passphrase must be at least 20 characters.");
  validateScryptParameters(scryptParameters);
  const header = {
    ...metadata,
    schemaVersion: 1,
    type: "mkttool.release-root-private-backup",
    algorithm: "Ed25519",
  };
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, {
    ...scryptParameters,
    maxmem: 512 * 1024 * 1024,
  });
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(canonicalJson(header), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(seed), cipher.final()]);
    return {
      ...header,
      encryption: {
        cipher: "aes-256-gcm",
        kdf: "scrypt",
        parameters: scryptParameters,
        salt: salt.toString("base64url"),
        iv: iv.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        tag: cipher.getAuthTag().toString("base64url"),
      },
    };
  } finally {
    key.fill(0);
  }
}

export function decryptRootSeed(backup, passphrase) {
  const { encryption, ...header } = backup;
  if (
    header.schemaVersion !== 1 ||
    header.type !== "mkttool.release-root-private-backup" ||
    header.algorithm !== "Ed25519"
  ) {
    throw new Error("The root backup metadata is invalid.");
  }
  if (encryption?.cipher !== "aes-256-gcm" || encryption?.kdf !== "scrypt") {
    throw new Error("The root backup uses an unsupported encryption format.");
  }
  validateScryptParameters(encryption.parameters);
  const salt = Buffer.from(encryption.salt, "base64url");
  const iv = Buffer.from(encryption.iv, "base64url");
  const key = scryptSync(passphrase, salt, 32, {
    ...encryption.parameters,
    maxmem: 512 * 1024 * 1024,
  });
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(canonicalJson(header), "utf8"));
    decipher.setAuthTag(Buffer.from(encryption.tag, "base64url"));
    const seed = Buffer.concat([
      decipher.update(Buffer.from(encryption.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const recoveredPublicHex = publicKeyHex(privateKeyFromSeed(seed));
    if (recoveredPublicHex !== header.publicKeyHex || releaseKeyId(recoveredPublicHex) !== header.rootKeyId) {
      seed.fill(0);
      throw new Error("The recovered root key does not match the backup metadata.");
    }
    return seed;
  } finally {
    key.fill(0);
  }
}

export function signRecoveryProof(rootPrivateKey, proofFields) {
  const statement = {
    schemaVersion: 1,
    type: "mkttool.release-root-recovery-proof",
    ...proofFields,
    challenge: randomBytes(32).toString("base64url"),
  };
  const payload = Buffer.from(RECOVERY_DOMAIN + canonicalJson(statement), "utf8");
  return { ...statement, signature: sign(null, payload, rootPrivateKey).toString("base64url") };
}

export function verifyRecoveryProof(rootPublicKey, proof) {
  const { signature, ...statement } = proof;
  if (statement.schemaVersion !== 1 || statement.type !== "mkttool.release-root-recovery-proof") {
    throw new Error("The root recovery proof metadata is invalid.");
  }
  const payload = Buffer.from(RECOVERY_DOMAIN + canonicalJson(statement), "utf8");
  if (!verify(null, payload, rootPublicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("The root recovery proof signature is invalid.");
  }
  return statement;
}

function validateScryptParameters(parameters) {
  const powerOfTwo = Number.isInteger(parameters?.N) && (parameters.N & (parameters.N - 1)) === 0;
  if (
    !powerOfTwo ||
    parameters.N < 16_384 ||
    parameters.N > ROOT_BACKUP_SCRYPT.N ||
    parameters.r !== ROOT_BACKUP_SCRYPT.r ||
    parameters.p !== ROOT_BACKUP_SCRYPT.p
  ) {
    throw new Error("The root backup contains unsafe scrypt parameters.");
  }
}
