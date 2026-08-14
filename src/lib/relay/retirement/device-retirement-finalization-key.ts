import { randomBytes } from "node:crypto";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import {
  parseSigningSeed,
  publicKeyToHex,
  signingKeysFromSeed,
  SIGNING_SEED_BYTES,
  type ServerSigningKeys,
} from "@/lib/tickets/server-signing-key";

export interface DeviceRetirementFinalizationKey {
  encryptedSeed: string;
  publicKeyHex: string;
}

/**
 * Each retirement owns its finalization key so rotating the normal ticket-signing key cannot strand
 * a DPAPI recovery receipt that was created before the rotation.
 */
export function createDeviceRetirementFinalizationKey(): DeviceRetirementFinalizationKey {
  const seed = randomBytes(SIGNING_SEED_BYTES);
  const keys = signingKeysFromSeed(seed);
  return {
    encryptedSeed: encryptCredential(seed.toString("hex"), loadVaultKey("server")),
    publicKeyHex: publicKeyToHex(keys.publicKey),
  };
}

export function loadDeviceRetirementFinalizationKeys(encryptedSeed: string): ServerSigningKeys {
  const seedHex = decryptCredential(encryptedSeed, loadVaultKey("server"));
  return signingKeysFromSeed(parseSigningSeed(seedHex, "stored retirement finalization key"));
}
