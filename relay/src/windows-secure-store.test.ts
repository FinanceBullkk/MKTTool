import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_SECRET_NAMES } from "./secure-store";
import { WindowsSecureStore } from "./windows-secure-store";

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "win32")("WindowsSecureStore", () => {
  it("round-trips through DPAPI CurrentUser without plaintext on disk", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-dpapi-"));
    homes.push(home);
    const store = new WindowsSecureStore(home);
    const secret = "c3".repeat(32);

    store.write(RELAY_SECRET_NAMES.operatorDomainKey, secret);

    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(secret);
    expect(
      readFileSync(path.join(home, "protected-secrets", "operator-domain-key.dpapi"), "utf8"),
    ).not.toContain(secret);
  });

  it("atomically replaces an existing protected value", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mkt-relay-dpapi-"));
    homes.push(home);
    const store = new WindowsSecureStore(home);

    store.write(RELAY_SECRET_NAMES.operatorDomainKey, "d4".repeat(32));
    store.write(RELAY_SECRET_NAMES.operatorDomainKey, "e5".repeat(32));

    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe("e5".repeat(32));
  });
});
