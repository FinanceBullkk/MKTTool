import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import { readRelaySecurityState } from "./relay-security-state";
import {
  migrateRelaySecrets,
  type MigrationFaultPoint,
} from "./secret-migration";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { WindowsSecureStore } from "./windows-secure-store";
import { LEGACY_DEVICE_KEY_TOMBSTONE } from "./legacy-device-key-tombstone";

const OPERATOR_KEY = "a1".repeat(32);
const DEVICE_KEY = "b2".repeat(32);
const RELAY_VERSION = 8;

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function makeLegacyHome(): string {
  const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-migration-"));
  homes.push(home);
  writeFileSync(
    path.join(home, CONFIG_FILE),
    `${JSON.stringify({ deviceId: "device-1", vaultKeyOperator: OPERATOR_KEY }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(home, DEVICE_KEY_FILE),
    `${JSON.stringify({ privateKey: DEVICE_KEY }, null, 2)}\n`,
    "utf8",
  );
  return home;
}

const FAULTS: MigrationFaultPoint[] = [
  "before-import",
  "after-import",
  "after-read-back",
  "before-source-deletion",
  "after-source-deletion",
  "after-marker-commit",
  "after-activation",
];

describe("Relay protected-secret migration", () => {
  for (const faultAt of FAULTS) {
    it(`converges after a fault at ${faultAt}`, () => {
      const home = makeLegacyHome();
      const store = new InMemorySecureStore();

      expect(() => migrateRelaySecrets(home, store, RELAY_VERSION, { faultAt })).toThrow(
        `Injected migration fault at ${faultAt}.`,
      );

      const state = migrateRelaySecrets(home, store, RELAY_VERSION);
      expect(state).toMatchObject({
        schemaVersion: 1,
        migrationStage: "activated",
        protectedSecrets: [
          RELAY_SECRET_NAMES.operatorDomainKey,
          RELAY_SECRET_NAMES.devicePrivateKey,
        ],
        rollbackFloor: RELAY_VERSION,
        activeRelayVersion: RELAY_VERSION,
      });
      expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
      expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(DEVICE_KEY);
      expect(JSON.parse(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8"))).toEqual(
        LEGACY_DEVICE_KEY_TOMBSTONE,
      );
    });
  }

  it("survives a simulated reboot with a new migration coordinator", () => {
    const home = makeLegacyHome();
    const store = new InMemorySecureStore();
    expect(() =>
      migrateRelaySecrets(home, store, RELAY_VERSION, { faultAt: "after-source-deletion" }),
    ).toThrow();

    const rebootedStore = store;
    const state = migrateRelaySecrets(home, rebootedStore, RELAY_VERSION);
    expect(state.migrationStage).toBe("activated");
    expect(readRelaySecurityState(home).rollbackFloor).toBe(RELAY_VERSION);
  });

  it("never deletes plaintext before protected read-back verification passes", () => {
    const home = makeLegacyHome();
    const corruptStore: SecureStore = {
      read: () => "corrupt",
      write: () => undefined,
      writeIfAbsent: () => false,
      remove: () => undefined,
    };

    expect(() => migrateRelaySecrets(home, corruptStore, RELAY_VERSION)).toThrow(/conflicts/);
    expect(readFileSync(path.join(home, CONFIG_FILE), "utf8")).toContain(OPERATOR_KEY);
    expect(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")).toContain(DEVICE_KEY);
  });

  it("completes when a leftover temporary from a crashed run sits at the old collision path", () => {
    const home = makeLegacyHome();
    const configPath = path.join(home, CONFIG_FILE);
    // A crash between write and rename leaves `<config>.<pid>.tmp` behind. While the temporary
    // name carried only the PID, a later run that recycled that PID failed EEXIST here — after
    // read-back had already passed — and every retry failed identically, so the Relay never
    // started again until someone deleted that file by hand.
    writeFileSync(`${configPath}.${process.pid}.tmp`, "leftover", "utf8");

    const state = migrateRelaySecrets(home, new InMemorySecureStore(), RELAY_VERSION);

    expect(state.migrationStage).toBe("activated");
    expect(readFileSync(configPath, "utf8")).not.toContain(OPERATOR_KEY);
  });

  it("finds zero plaintext key occurrences anywhere under the temporary Relay home", () => {
    const home = makeLegacyHome();
    migrateRelaySecrets(home, new InMemorySecureStore(), RELAY_VERSION);

    const diskText = readTextTree(home);
    expect(diskText).not.toContain(OPERATOR_KEY);
    expect(diskText).not.toContain(DEVICE_KEY);
  });

  it.skipIf(process.platform !== "win32")(
    "migrates with DPAPI and finds zero plaintext occurrences in the temporary Relay home",
    () => {
      const home = makeLegacyHome();
      const store = new WindowsSecureStore(home);

      migrateRelaySecrets(home, store, RELAY_VERSION);

      expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
      expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(DEVICE_KEY);
      const diskText = readTextTree(home);
      expect(diskText).not.toContain(OPERATOR_KEY);
      expect(diskText).not.toContain(DEVICE_KEY);
    },
  );

  it("refuses a Relay below the durable rollback floor", () => {
    const home = makeLegacyHome();
    const store = new InMemorySecureStore();
    migrateRelaySecrets(home, store, RELAY_VERSION);

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION - 1)).toThrow(/rollback floor/);
  });

  it("migrates a legacy device key before the operator key has been enrolled", () => {
    const home = makeLegacyHome();
    const config = JSON.parse(readFileSync(path.join(home, CONFIG_FILE), "utf8"));
    delete config.vaultKeyOperator;
    writeFileSync(path.join(home, CONFIG_FILE), JSON.stringify(config), "utf8");
    const store = new InMemorySecureStore();

    const state = migrateRelaySecrets(home, store, RELAY_VERSION);

    expect(state.protectedSecrets).toEqual([RELAY_SECRET_NAMES.devicePrivateKey]);
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(DEVICE_KEY);
    expect(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")).not.toContain(DEVICE_KEY);
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
  });

  it("establishes the rollback floor after a fresh protected device key is created", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-fresh-"));
    homes.push(home);
    const store = new InMemorySecureStore();
    store.write(RELAY_SECRET_NAMES.devicePrivateKey, DEVICE_KEY);

    const state = migrateRelaySecrets(home, store, RELAY_VERSION);

    expect(state).toMatchObject({
      schemaVersion: 1,
      migrationStage: "activated",
      protectedSecrets: [RELAY_SECRET_NAMES.devicePrivateKey],
      rollbackFloor: RELAY_VERSION,
    });
  });
});

function readTextTree(root: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(root)) {
    const target = path.join(root, entry);
    if (statSync(target).isDirectory()) chunks.push(readTextTree(target));
    else chunks.push(readFileSync(target, "utf8"));
  }
  return chunks.join("\n");
}
