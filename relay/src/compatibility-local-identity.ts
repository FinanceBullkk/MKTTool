import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolveDeviceId } from "./relay-config";
import { DEVICE_KEY_FILE } from "./relay-home";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";

const IDENTITY_SECRET_NAMES = [
  RELAY_SECRET_NAMES.operatorDomainKey,
  RELAY_SECRET_NAMES.devicePrivateKey,
  RELAY_SECRET_NAMES.operatorGrantState,
  RELAY_SECRET_NAMES.deviceRetirementReceipt,
] as const;

export function localCompatibilityIdentityDataExists(options: {
  home: string;
  store: SecureStore;
  localAppData?: string;
}): boolean {
  if (IDENTITY_SECRET_NAMES.some((name) => options.store.read(name) !== null)) return true;
  if (resolveDeviceId(options.home)) return true;
  if (existsSync(path.join(options.home, DEVICE_KEY_FILE))) return true;

  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
  if (!localAppData?.trim()) return false;
  const profilesRoot = path.win32.join(
    localAppData,
    "MKTTool",
    "MKTBrowser",
    "data",
    "profiles",
  );
  try {
    return readdirSync(profilesRoot, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() || entry.isFile(),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new Error(`Cannot inspect local MKT Browser profile data: ${(error as Error).message}`);
  }
}
