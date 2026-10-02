import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compatibilitySequenceForFrom,
  readRelayCompatibilityRevocations,
  relayVersionForCompatibilitySequence,
} from "./relay-compatibility-manifest-file";

const roots: string[] = [];

afterEach(() => {
  delete process.env.RELAY_COMPATIBILITY_REVOCATIONS_FILE;
  delete process.env.RELAY_COMPATIBILITY_SEQUENCE_BY_FROM;
  delete process.env.RELAY_COMPATIBILITY_SEQUENCE;
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

describe("compatibility target selection", () => {
  it("selects the release version bound to each immutable sequence", () => {
    expect(relayVersionForCompatibilitySequence(26)).toBe(18);
    expect(relayVersionForCompatibilitySequence(31)).toBe(18);
    expect(relayVersionForCompatibilitySequence(32)).toBe(20);
    expect(relayVersionForCompatibilitySequence(33)).toBe(22);
    expect(() => relayVersionForCompatibilitySequence(0)).toThrow(/invalid/);
  });
  it("selects an explicit target for each current sequence", () => {
    process.env.RELAY_COMPATIBILITY_SEQUENCE_BY_FROM = JSON.stringify({ 0: 25, 21: 24, 22: 23 });

    expect(compatibilitySequenceForFrom(0)).toBe(25);
    expect(compatibilitySequenceForFrom(21)).toBe(24);
    expect(compatibilitySequenceForFrom(22)).toBe(23);
  });

  it("falls back to the active target when no mapping entry exists", () => {
    process.env.RELAY_COMPATIBILITY_SEQUENCE = "24";

    expect(compatibilitySequenceForFrom(7)).toBe(24);
  });

  it("rejects malformed mappings and invalid current sequences", () => {
    process.env.RELAY_COMPATIBILITY_SEQUENCE_BY_FROM = "not-json";
    expect(() => compatibilitySequenceForFrom(0)).toThrow(/valid JSON/);

    delete process.env.RELAY_COMPATIBILITY_SEQUENCE_BY_FROM;
    expect(() => compatibilitySequenceForFrom(-1)).toThrow(/invalid/);
  });
});
