import { describe, expect, it } from "vitest";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { RELAY_SECRET_NAMES } from "./secure-store";
import {
  initializeCompatibilityUpdateState,
  readCompatibilityUpdateState,
  rememberRevokedDelegatedKeyIds,
  writeCompatibilityUpdateState,
  type CompatibilityUpdateState,
} from "./update-state";

describe("protected compatibility update state", () => {
  it("initializes a clean install at the embedded installer floor", () => {
    const state = initializeCompatibilityUpdateState({
      installerFloorSequence: 4,
      localIdentityDataExists: false,
    });
    expect(state).toMatchObject({ highestAcceptedSequence: 3, rollbackFloorSequence: 4 });
  });

  it("routes missing anti-downgrade state with local data to ADMIN repair", () => {
    expect(() =>
      initializeCompatibilityUpdateState({ installerFloorSequence: 4, localIdentityDataExists: true }),
    ).toThrow("ADMIN repair");
  });

  it("persists and reads the protected state with read-back verification", () => {
    const store = new InMemorySecureStore();
    const state = initializeCompatibilityUpdateState({
      installerFloorSequence: 1,
      localIdentityDataExists: false,
    });
    writeCompatibilityUpdateState(store, state);
    expect(readCompatibilityUpdateState(store)).toEqual(state);
  });

  it("rejects incomplete or internally downgraded protected state", () => {
    const store = new InMemorySecureStore();
    const valid = initializeCompatibilityUpdateState({
      installerFloorSequence: 2,
      localIdentityDataExists: false,
    });
    const incomplete = {
      ...valid,
      current: {
        sequence: 2,
        manifestDigest: "a".repeat(64),
        versions: { installer: "1" },
      },
    } as unknown as CompatibilityUpdateState;
    expect(() => writeCompatibilityUpdateState(store, incomplete)).toThrow("invalid update state");

    expect(() =>
      writeCompatibilityUpdateState(store, {
        ...valid,
        highestAcceptedSequence: 1,
        current: setRecord(2),
      }),
    ).toThrow("invalid update state");
  });

  it("rejects pending transitions that could activate bytes from the wrong set", () => {
    const store = new InMemorySecureStore();
    const base: CompatibilityUpdateState = {
      schemaVersion: 1,
      highestAcceptedSequence: 3,
      rollbackFloorSequence: 1,
      smokeProfileId: "smoke-profile",
      current: setRecord(3),
      retained: setRecord(2),
      pending: null,
      usedRollbackAuthorizationIds: [],
      revokedDelegatedKeyIds: [],
    };
    expect(() =>
      writeCompatibilityUpdateState(store, {
        ...base,
        pending: {
          mode: "rollback",
          target: setRecord(1),
          smokeProfileId: "smoke-profile",
          phase: "staged",
          activatedArtifacts: [],
          authorizationId: "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
        },
      }),
    ).toThrow("invalid update state");
    expect(() =>
      writeCompatibilityUpdateState(store, {
        ...base,
        pending: {
          mode: "update",
          target: setRecord(3),
          smokeProfileId: "smoke-profile",
          phase: "staged",
          activatedArtifacts: [],
        },
      }),
    ).toThrow("invalid update state");
  });

  it("fails closed when persisted state repeats a one-use rollback authorization", () => {
    const store = new InMemorySecureStore();
    const authorizationId = "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab";
    store.write(
      RELAY_SECRET_NAMES.compatibilityUpdateState,
      JSON.stringify({
        schemaVersion: 1,
        highestAcceptedSequence: 2,
        rollbackFloorSequence: 1,
        smokeProfileId: "smoke-profile",
        current: setRecord(2),
        retained: setRecord(1),
        pending: null,
        usedRollbackAuthorizationIds: [authorizationId, authorizationId],
      }),
    );
    expect(() => readCompatibilityUpdateState(store)).toThrow("ADMIN repair");
  });

  it("remembers proven revocations without duplicating them", () => {
    const first = "a".repeat(64);
    const second = "b".repeat(64);
    const clean = initializeCompatibilityUpdateState({
      installerFloorSequence: 1,
      localIdentityDataExists: false,
    });

    const once = rememberRevokedDelegatedKeyIds(clean, [first]);
    const twice = rememberRevokedDelegatedKeyIds(once, [first, second]);

    expect(once.revokedDelegatedKeyIds).toEqual([first]);
    expect(twice.revokedDelegatedKeyIds).toEqual([first, second]);
    // Nothing new to record must not churn the protected store.
    expect(rememberRevokedDelegatedKeyIds(twice, [first])).toBe(twice);
  });

  it("never drops a remembered revocation when a later payload omits it", () => {
    const store = new InMemorySecureStore();
    const revoked = "c".repeat(64);
    const clean = initializeCompatibilityUpdateState({
      installerFloorSequence: 1,
      localIdentityDataExists: false,
    });
    writeCompatibilityUpdateState(store, rememberRevokedDelegatedKeyIds(clean, [revoked]));

    const reloaded = readCompatibilityUpdateState(store)!;

    expect(rememberRevokedDelegatedKeyIds(reloaded, []).revokedDelegatedKeyIds).toEqual([revoked]);
  });

  it("reads state written before revocation memory existed as an empty set", () => {
    const store = new InMemorySecureStore();
    store.write(
      RELAY_SECRET_NAMES.compatibilityUpdateState,
      JSON.stringify({
        schemaVersion: 1,
        highestAcceptedSequence: 2,
        rollbackFloorSequence: 1,
        smokeProfileId: "smoke-profile",
        current: setRecord(2),
        retained: setRecord(1),
        pending: null,
        usedRollbackAuthorizationIds: [],
      }),
    );

    expect(readCompatibilityUpdateState(store)?.revokedDelegatedKeyIds).toEqual([]);
  });

  it("fails closed when a persisted revoked key id is malformed", () => {
    const store = new InMemorySecureStore();
    store.write(
      RELAY_SECRET_NAMES.compatibilityUpdateState,
      JSON.stringify({
        schemaVersion: 1,
        highestAcceptedSequence: 2,
        rollbackFloorSequence: 1,
        smokeProfileId: "smoke-profile",
        current: setRecord(2),
        retained: setRecord(1),
        pending: null,
        usedRollbackAuthorizationIds: [],
        revokedDelegatedKeyIds: ["not-a-key-id"],
      }),
    );

    expect(() => readCompatibilityUpdateState(store)).toThrow("ADMIN repair");
  });

  it("keeps the rollback floor fixed at the value the clean install recorded", () => {
    const store = new InMemorySecureStore();
    const state = initializeCompatibilityUpdateState({
      installerFloorSequence: 4,
      localIdentityDataExists: false,
    });
    writeCompatibilityUpdateState(store, state);

    // Nothing in the update path may move the floor; a rollback below it stays refused for the
    // life of the install rather than drifting with whatever installer ran last.
    expect(readCompatibilityUpdateState(store)?.rollbackFloorSequence).toBe(4);
  });
});

function setRecord(sequence: number) {
  return {
    sequence,
    manifestDigest: "a".repeat(64),
    versions: {
      installer: "1",
      relay: "1",
      browser: "1",
      controlContract: "1",
      engine: "1",
    },
  };
}
