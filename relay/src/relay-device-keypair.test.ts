import { diffieHellman } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { relayPublicKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { RELAY_SECRET_NAMES } from "./secure-store";
// Kho giả, không phải DPAPI: bài này kiểm logic sinh/nạp khóa, và kho thật ném trên CI Linux.
import { InMemorySecureStore } from "./in-memory-secure-store";
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
  it("creates the first keypair in protected storage, never as plaintext on disk", () => {
    const home = newHome();
    const store = new InMemorySecureStore();
    const keypair = loadOrCreateDeviceKeypair(home, store);

    expect(keypair.created).toBe(true);
    expect(keypair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(store.read(RELAY_SECRET_NAMES.devicePrivateKey)).not.toBeNull();
    expect(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")).not.toContain("privateKey\"");
  });

  it("loads the same protected keypair on the next start", () => {
    const home = newHome();
    const store = new InMemorySecureStore();
    const first = loadOrCreateDeviceKeypair(home, store);
    const second = loadOrCreateDeviceKeypair(home, store);

    expect(second.created).toBe(false);
    expect(second.publicKeyHex).toBe(first.publicKeyHex);
  });

  it("keeps the public and private halves paired", () => {
    const keypair = loadOrCreateDeviceKeypair(newHome(), new InMemorySecureStore());
    expect(() =>
      diffieHellman({
        privateKey: keypair.privateKey,
        publicKey: relayPublicKeyToKeyObject(keypair.publicKeyHex),
      }),
    ).not.toThrow();
  });

  // Sinh cặp mới ở đây là biến một chiếc máy ĐÃ đăng ký thành một chiếc máy lạ, và triệu chứng
  // sẽ là "vé này phát cho máy khác" — câu chỉ đúng chỗ sai nhưng không nói được vì sao.
  it("fails on an invalid protected value instead of rotating device identity", () => {
    const store = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.devicePrivateKey]: "not-a-device-key",
    });
    expect(() => loadOrCreateDeviceKeypair(newHome(), store)).toThrow();
  });
});
