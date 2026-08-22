import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPATIBILITY_PUBLISH_ARTIFACT_KINDS,
  parseCompatibilityPublishArgs,
} from "./publish-compatibility-manifest";

describe("compatibility publisher CLI", () => {
  it("requires and publishes the engine with the compatible app tuple", () => {
    const values = [
      "--manifest", "signed.json",
      "--revocations", "revocations.json",
      "--installer", "installer.exe",
      "--relay", "relay.zip",
      "--browser", "app.asar",
      "--control-contract", "control.json",
      "--engine", "engine.zip",
    ];

    expect(COMPATIBILITY_PUBLISH_ARTIFACT_KINDS).toEqual([
      "installer",
      "relay",
      "browser",
      "control-contract",
      "engine",
    ]);
    expect(parseCompatibilityPublishArgs(values).engine).toBe(path.resolve("engine.zip"));
    expect(() => parseCompatibilityPublishArgs(values.slice(0, -2))).toThrow(/--engine/);
  });
});
