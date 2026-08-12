import { diffieHellman } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { relayPublicKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { RELAY_SECRET_NAMES } from "./secure-store";
import { WindowsSecureStore } from "./windows-secure-store";
import { DEVICE_KEY_FILE } from "./relay-home";
import { readFileSync } from "node:fs";

const homes: string[] = [];

function newHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), "mkttool-relay-"));
  homes.push(home);
  return home;
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true });
});

describe("loadOrCreateDeviceKeypair", () => {
  it("creates the first keypair in Windows protected storage", () => {
    const home = newHome();
    const keypair = loadOrCreateDeviceKeypair(home);

    expect(keypair.created).toBe(true);
    expect(keypair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(new WindowsSecureStore(home).read(RELAY_SECRET_NAMES.devicePrivateKey)).not.toBeNull();
    expect(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")).not.toContain("privateKey\"");
  });

  it("loads the same protected keypair on the next start", () => {
    const home = newHome();
    const first = loadOrCreateDeviceKeypair(home);
    const second = loadOrCreateDeviceKeypair(home);

    expect(second.created).toBe(false);
    expect(second.publicKeyHex).toBe(first.publicKeyHex);
  });

  it("keeps the public and private halves paired", () => {
    const keypair = loadOrCreateDeviceKeypair(newHome());
    expect(() =>
      diffieHellman({
        privateKey: keypair.privateKey,
        publicKey: relayPublicKeyToKeyObject(keypair.publicKeyHex),
      }),
    ).not.toThrow();
  });

  it("fails on an invalid protected value instead of rotating device identity", () => {
    const home = newHome();
    new WindowsSecureStore(home).write(RELAY_SECRET_NAMES.devicePrivateKey, "not-a-device-key");
    expect(() => loadOrCreateDeviceKeypair(home)).toThrow();
  });
});
