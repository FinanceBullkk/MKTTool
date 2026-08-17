import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicKeyHex } from "../../scripts/release-authority/release-authority-key-primitives.mjs";
import { signRollbackAuthorization } from "../../src/lib/release/rollback-authorization";
import { updateRoot } from "./compatibility-update-marker";
import { handleCompatibilityRollback } from "./handle-compatibility-rollback";
import { InMemorySecureStore } from "./in-memory-secure-store";
import type { CompatibilityUpdatePlatform } from "./local-updater";
import { readCompatibilityUpdateState, writeCompatibilityUpdateState } from "./update-state";

const roots: string[] = [];
const keys = generateKeyPairSync("ed25519");
const now = new Date("2026-08-16T00:00:30.000Z");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("compatibility rollback Relay endpoint", () => {
  it("prepares one device-bound rollback before handing off to the helper", async () => {
    const fixture = createFixture();
    const result = await handleCompatibilityRollback(request("https://mkt.example"), body(), fixture);

    expect(result).toMatchObject({ ok: true, rollbackStarted: true, currentSequence: 2, retainedSequence: 1 });
    expect(fixture.onPrepared).toHaveBeenCalledOnce();
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toMatchObject({
      mode: "rollback",
      smokeProfileId: "smoke-profile",
      target: { sequence: 1 },
    });
  });

  it("rejects another origin and an open profile before changing protected state", async () => {
    const fixture = createFixture();
    const wrongOrigin = await handleCompatibilityRollback(request("https://other.example"), body(), fixture);
    expect(wrongOrigin.ok).toBe(false);

    fixture.platform.open = true;
    const openProfile = await handleCompatibilityRollback(
      request("https://mkt.example"),
      body(),
      fixture,
    );
    expect(openProfile).toMatchObject({ ok: false });
    expect(openProfile.message).toMatch(/close every/i);
    expect(readCompatibilityUpdateState(fixture.store)?.pending).toBeNull();
    expect(fixture.onPrepared).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-rollback-handler-"));
  roots.push(root);
  const home = path.join(root, "MKTTool-Relay");
  const store = new InMemorySecureStore();
  const record = (sequence: number) => ({
    sequence,
    manifestDigest: String(sequence).repeat(64),
    versions: {
      installer: "1",
      relay: "1",
      browser: "1",
      controlContract: "1",
      engine: "1",
    },
  });
  writeCompatibilityUpdateState(store, {
    schemaVersion: 1,
    highestAcceptedSequence: 2,
    rollbackFloorSequence: 1,
    smokeProfileId: "smoke-profile",
    current: record(2),
    retained: record(1),
    pending: null,
    usedRollbackAuthorizationIds: [],
    revokedDelegatedKeyIds: [],
  });
  const retainedDirectory = path.join(updateRoot(home), "sets", "1");
  mkdirSync(retainedDirectory, { recursive: true });
  for (const name of [
    "installer.artifact",
    "relay.artifact",
    "browser.artifact",
    "controlContract.artifact",
    "engine.artifact",
    "signed-manifest.json",
    "active-engine.json",
  ]) {
    writeFileSync(path.join(retainedDirectory, name), "fixture");
  }
  const platform = new TestPlatform();
  return {
    allowedOrigin: "https://mkt.example",
    home,
    store,
    platform,
    createPlatform: () => platform,
    serverPublicKeyHex: publicKeyHex(keys.publicKey),
    deviceId: "device-1",
    now,
    onPrepared: vi.fn(),
  };
}

function body(): string {
  return JSON.stringify({
    authorization: signRollbackAuthorization(keys.privateKey, {
      schemaVersion: 1,
      type: "mkttool.compatibility-rollback-authorization",
      authorizationId: "3d1971be-ae6e-4c2a-9a1b-92ba75c748ab",
      adminUserId: "admin-1",
      authorizedRole: "ADMIN",
      deviceId: "device-1",
      currentSequence: 2,
      retainedSequence: 1,
      issuedAt: "2026-08-16T00:00:00.000Z",
      expiresAt: "2026-08-16T00:01:00.000Z",
    }),
  });
}

function request(origin: string): IncomingMessage {
  return { headers: { origin } } as IncomingMessage;
}

class TestPlatform implements CompatibilityUpdatePlatform {
  open = false;
  async hasOpenProfiles() {
    return this.open;
  }
  async stopOwnedProcesses() {}
  async activateArtifact() {}
  async restoreArtifact() {}
  async startOwnedProcesses() {}
}
