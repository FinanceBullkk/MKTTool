import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { localCompatibilityIdentityDataExists } from "./compatibility-local-identity";
import { RELAY_SECRET_NAMES } from "./secure-store";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local compatibility identity detection", () => {
  it("does not treat an empty bootstrap installation as identity-bearing", () => {
    const fixture = createFixture();
    expect(localCompatibilityIdentityDataExists(fixture)).toBe(false);
  });

  it("detects protected Relay identity and Browser profile data", () => {
    const relay = createFixture();
    relay.store.write(RELAY_SECRET_NAMES.devicePrivateKey, "private");
    expect(localCompatibilityIdentityDataExists(relay)).toBe(true);

    const browser = createFixture();
    const profileRoot = path.join(
      browser.localAppData,
      "MKTTool",
      "MKTBrowser",
      "data",
      "profiles",
      "profile-1",
    );
    mkdirSync(profileRoot, { recursive: true });
    writeFileSync(path.join(profileRoot, "Cookies"), "identity");
    expect(localCompatibilityIdentityDataExists(browser)).toBe(true);
  });
});

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-local-identity-"));
  roots.push(root);
  const home = path.join(root, "MKTTool-Relay");
  const localAppData = path.join(root, "LocalAppData");
  mkdirSync(home, { recursive: true });
  return { home, localAppData, store: new InMemorySecureStore() };
}
