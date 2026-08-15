const DEFAULT_DEVELOPMENT_FLOOR = "1";

export const COMPATIBILITY_INSTALLER_FLOOR_ENV =
  "RELAY_COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE";

export function parseCompatibilityInstallerFloor(value: string | undefined): number {
  const raw = value?.trim() || DEFAULT_DEVELOPMENT_FLOOR;
  if (!/^\d+$/.test(raw)) {
    throw new Error("The embedded compatibility installer floor must be a positive integer.");
  }
  const floor = Number(raw);
  if (!Number.isSafeInteger(floor) || floor <= 0) {
    throw new Error("The embedded compatibility installer floor must be a positive integer.");
  }
  return floor;
}

export const COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE = parseCompatibilityInstallerFloor(
  process.env.RELAY_COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE,
);
