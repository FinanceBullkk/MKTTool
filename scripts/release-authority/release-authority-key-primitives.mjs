import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new TypeError("Release-authority records must contain only JSON values.");
}

export function privateKeyFromSeed(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) {
    throw new Error("An Ed25519 seed must be exactly 32 bytes.");
  }
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function publicKeyHex(key) {
  const publicKey = key.type === "private" ? createPublicKey(key) : key;
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.crv !== "Ed25519" || !jwk.x) throw new Error("Expected an Ed25519 public key.");
  return Buffer.from(jwk.x, "base64url").toString("hex");
}

export function publicKeyFromHex(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("An Ed25519 public key must be 64 hex characters.");
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(hex, "hex").toString("base64url") },
    format: "jwk",
  });
}

export function releaseKeyId(publicHex) {
  return createHash("sha256").update(Buffer.from(publicHex, "hex")).digest("hex");
}

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
