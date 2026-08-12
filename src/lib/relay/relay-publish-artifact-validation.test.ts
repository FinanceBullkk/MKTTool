import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_VERSION } from "./relay-endpoints";
import { RELAY_ARCHIVE_NAME } from "./relay-release-file";
import { writeRelayArtifactMetadata } from "./relay-release-metadata";
import { readVerifiedRelayPublishArtifact } from "./relay-publish-artifact-validation";

const releaseDirs: string[] = [];

function makeRelease(contents = "relay"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-publish-artifact-"));
  releaseDirs.push(dir);
  process.env.RELAY_RELEASE_DIR = dir;
  writeFileSync(path.join(dir, RELAY_ARCHIVE_NAME), contents);
  return dir;
}

function writeSidecar(dir: string, contents: string, version = RELAY_VERSION): void {
  writeRelayArtifactMetadata(dir, {
    version,
    sizeBytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}

afterEach(() => {
  delete process.env.RELAY_RELEASE_DIR;
  for (const dir of releaseDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readVerifiedRelayPublishArtifact", () => {
  it("accepts an archive matching its current-version sidecar", async () => {
    const dir = makeRelease();
    writeSidecar(dir, "relay");
    await expect(readVerifiedRelayPublishArtifact()).resolves.toMatchObject({
      local: { version: RELAY_VERSION, sizeBytes: 5 },
    });
  });

  it("rejects a missing sidecar", async () => {
    makeRelease();
    await expect(readVerifiedRelayPublishArtifact()).rejects.toThrow(/sidecar is missing/i);
  });

  it("rejects a stale sidecar version", async () => {
    const dir = makeRelease();
    writeSidecar(dir, "relay", RELAY_VERSION - 1);
    await expect(readVerifiedRelayPublishArtifact()).rejects.toThrow(/does not equal RELAY_VERSION/);
  });

  it("rejects archive bytes that no longer match the sidecar", async () => {
    const dir = makeRelease("relay");
    writeSidecar(dir, "other");
    await expect(readVerifiedRelayPublishArtifact()).rejects.toThrow(/SHA-256|size/);
  });
});
