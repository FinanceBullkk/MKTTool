import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_RELEASE_R2_ENV } from "../r2/r2-config";
import {
  readRelayCompatibilityArtifactSource,
  relayCompatibilityArtifactPath,
} from "./relay-compatibility-artifact-source";

const roots: string[] = [];
const previousR2 = Object.fromEntries(
  Object.values(RELAY_RELEASE_R2_ENV).map((name) => [name, process.env[name]]),
);

afterEach(() => {
  delete process.env.RELAY_COMPATIBILITY_ARTIFACT_DIR;
  for (const name of Object.values(RELAY_RELEASE_R2_ENV)) {
    const value = previousR2[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("compatibility artifact source", () => {
  it("opens a disk artifact only when signed size and SHA-256 match", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-artifact-source-"));
    roots.push(root);
    process.env.RELAY_COMPATIBILITY_ARTIFACT_DIR = root;
    for (const name of Object.values(RELAY_RELEASE_R2_ENV)) delete process.env[name];
    const body = Buffer.from("relay");
    const filePath = relayCompatibilityArtifactPath(12, "relay");
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, body);
    const sha256 = createHash("sha256").update(body).digest("hex");

    const source = await readRelayCompatibilityArtifactSource(12, "relay", {
      sizeBytes: body.length,
      sha256,
    });
    expect(await new Response(await source.open()).text()).toBe("relay");
    await expect(
      readRelayCompatibilityArtifactSource(12, "relay", {
        sizeBytes: body.length,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("signed manifest");
  });
});
