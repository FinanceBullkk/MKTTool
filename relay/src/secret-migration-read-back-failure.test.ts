/**
 * Phase 01 / H17: does a failed protected-store write leave the migration failing *open*?
 *
 * `migrateRelaySecrets` moves the operator domain key and the device private key out of plaintext
 * files and into the OS-protected store, then deletes the plaintext. The whole safety of that
 * sequence rests on three guards in `secret-migration.ts` — a conflict check, a read-back
 * verification, and a post-deletion presence check — each of which throws rather than continuing.
 *
 * Those guards were unverified. The existing `secret-migration.test.ts` exercises a fault injected
 * at each `MigrationFaultPoint`, but every one of those faults is thrown *by the migration itself*,
 * so the store always behaves. Disabling both `verifySecret` and `requireProtectedSecret` outright
 * leaves all 15 of its tests green — including the one named "never deletes plaintext before
 * protected read-back verification passes". The guards are therefore untested, not proven.
 *
 * This file supplies the missing half: a store that *misbehaves the way a real protected store
 * fails*. That is fault injection of the same kind the module already provides for itself, not a
 * mock of the logic under test — the migration code path is entirely real, and the assertion is
 * that the plaintext source survives, i.e. the sequence fails **closed**.
 *
 * Windows DPAPI failure modes this models: a write that reports success but does not persist
 * (profile not loaded, roaming profile race) and a read that returns stale or foreign data.
 *
 * No real secrets. Fixture values are synthetic.
 */
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import { migrateRelaySecrets } from "./secret-migration";
import { RELAY_SECRET_NAMES, type SecureStore, type RelaySecretName } from "./secure-store";
import { InMemorySecureStore } from "./in-memory-secure-store";

const OPERATOR_KEY = "a1".repeat(32);
const DEVICE_KEY = "b2".repeat(32);
const RELAY_VERSION = 8;

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function makeLegacyHome(): string {
  const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-readback-"));
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

/** A protected store whose writes silently do not persist — the "profile not loaded" DPAPI case. */
class NonPersistingSecureStore extends InMemorySecureStore {
  constructor(private readonly failFor: RelaySecretName) {
    super();
  }

  override write(name: RelaySecretName, value: string): void {
    if (name === this.failFor) return; // reports success, stores nothing
    super.write(name, value);
  }

  override writeIfAbsent(name: RelaySecretName, value: string): boolean {
    if (name === this.failFor) return true;
    return super.writeIfAbsent(name, value);
  }
}

/** A protected store that returns foreign data on read — the stale/roamed-profile case. */
class CorruptingSecureStore extends InMemorySecureStore {
  constructor(private readonly corruptFor: RelaySecretName) {
    super();
  }

  override read(name: RelaySecretName): string | null {
    const value = super.read(name);
    if (name === this.corruptFor && value !== null) return `${value}-corrupted`;
    return value;
  }
}

function plaintextSurvives(home: string): boolean {
  const config = JSON.parse(readFileSync(path.join(home, CONFIG_FILE), "utf8")) as {
    vaultKeyOperator?: string;
  };
  const deviceKey = existsSync(path.join(home, DEVICE_KEY_FILE))
    ? (JSON.parse(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")) as { privateKey?: string })
    : {};
  return config.vaultKeyOperator === OPERATOR_KEY || deviceKey.privateKey === DEVICE_KEY;
}

describe("H17: migration fails closed when the protected store does not persist", () => {
  it("completes and removes the plaintext when the store behaves (control)", () => {
    // Establishes that the fixture reaches a successful migration, so the failures below are
    // attributable to the injected store fault and not to a broken fixture.
    const home = makeLegacyHome();
    const store: SecureStore = new InMemorySecureStore();

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION)).not.toThrow();
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(DEVICE_KEY);
    expect(plaintextSurvives(home)).toBe(false);
  });

  it("refuses to proceed when the operator key write does not persist", () => {
    const home = makeLegacyHome();
    const store = new NonPersistingSecureStore(RELAY_SECRET_NAMES.operatorDomainKey);

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION)).toThrow();
    // The security-relevant post-condition: the only surviving copy was not deleted.
    expect(plaintextSurvives(home)).toBe(true);
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
  });

  it("refuses to proceed when the device key write does not persist", () => {
    const home = makeLegacyHome();
    const store = new NonPersistingSecureStore(RELAY_SECRET_NAMES.devicePrivateKey);

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION)).toThrow();
    expect(plaintextSurvives(home)).toBe(true);
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBeNull();
  });

  it("refuses to proceed when the store reads back different data than was written", () => {
    const home = makeLegacyHome();
    const store = new CorruptingSecureStore(RELAY_SECRET_NAMES.operatorDomainKey);

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION)).toThrow();
    expect(plaintextSurvives(home)).toBe(true);
  });

  it("refuses when the protected store already holds a conflicting value", () => {
    // A relay whose protected store carries another machine's key must not silently adopt the
    // plaintext one, nor delete it.
    const home = makeLegacyHome();
    const store = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.operatorDomainKey]: "cc".repeat(32),
    });

    expect(() => migrateRelaySecrets(home, store, RELAY_VERSION)).toThrow();
    expect(plaintextSurvives(home)).toBe(true);
  });

  it("leaves the plaintext recoverable across a retry after a persistent store fault", () => {
    /**
     * The operational consequence. A store fault must be survivable: once the underlying problem is
     * fixed, rerunning the migration must succeed using the plaintext that was never deleted.
     */
    const home = makeLegacyHome();
    const failing = new NonPersistingSecureStore(RELAY_SECRET_NAMES.operatorDomainKey);
    expect(() => migrateRelaySecrets(home, failing, RELAY_VERSION)).toThrow();

    const healthy: SecureStore = new InMemorySecureStore();
    expect(() => migrateRelaySecrets(home, healthy, RELAY_VERSION)).not.toThrow();
    expect(healthy.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
    expect(healthy.read(RELAY_SECRET_NAMES.devicePrivateKey)).toBe(DEVICE_KEY);
    expect(plaintextSurvives(home)).toBe(false);
  });
});
