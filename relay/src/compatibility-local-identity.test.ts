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
    /**
     * The profiles root is built with `path.win32.join` to match the source, and the profile inside
     * it with the platform-native join.
     *
     * This is business logic — "is there identity data here" — so it must run on CI too, and the
     * split is what makes that possible. The source is Windows-only and joins with `path.win32`. On
     * Linux those separators are ordinary filename characters, so the whole win32 string is a single
     * directory; joining the profile on with `path.win32` as well would create one deeper name and
     * leave the directory the source actually reads non-existent. Creating the root as that single
     * name, then the profile natively inside it, gives the source a readable directory with an entry
     * in it on both platforms.
     */
    const profilesRoot = path.win32.join(
      browser.localAppData,
      "MKTTool",
      "MKTBrowser",
      "data",
      "profiles",
    );
    const profileRoot = path.join(profilesRoot, "profile-1");
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
