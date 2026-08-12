import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DEVICE_KEY_FILE } from "./relay-home";

export const LEGACY_DEVICE_KEY_TOMBSTONE = {
  secureStoreSchema: 1,
  privateKeyLocation: "windows-current-user-protected-store",
} as const;

/**
 * A plaintext-only Relay finds this path, rejects the missing privateKey field, and stops before
 * listening. The tombstone contains no secret and prevents an old rollback from recreating one.
 */
export function writeLegacyDeviceKeyTombstone(home: string): void {
  mkdirSync(home, { recursive: true });
  const destination = path.join(home, DEVICE_KEY_FILE);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(LEGACY_DEVICE_KEY_TOMBSTONE, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  renameSync(temporary, destination);
}
