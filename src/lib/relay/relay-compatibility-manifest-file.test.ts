import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRelayCompatibilityRevocations } from "./relay-compatibility-manifest-file";

const roots: string[] = [];

afterEach(() => {
  delete process.env.RELAY_COMPATIBILITY_REVOCATIONS_FILE;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("trusted compatibility revocations", () => {
  it("uses the bundled explicit empty snapshot when no trusted override is configured", () => {
    expect(readRelayCompatibilityRevocations()).toEqual([]);
  });

  it("fails closed when a trusted override is malformed", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-revocations-"));
    roots.push(root);
    const file = path.join(root, "revocations.json");
    writeFileSync(file, JSON.stringify([{}]));
    process.env.RELAY_COMPATIBILITY_REVOCATIONS_FILE = file;

    expect(() => readRelayCompatibilityRevocations()).toThrow();
  });
});
