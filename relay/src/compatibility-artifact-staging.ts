import { createHash } from "node:crypto";
import {
  copyFileSync,
  createWriteStream,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { VerifiedCompatibilityManifest } from "../../src/lib/release/compatibility-manifest";
import { validateCompatibilityControlContract } from "../../src/lib/release/compatibility-control-contract";
import { updateRoot } from "./compatibility-update-marker";
import type { CompatibilityArtifactKind } from "./update-state";
import { ACTIVE_ENGINE_PIN_FILE, enginePinFromManifest } from "./active-engine-pin";

export interface StagedCompatibilitySet {
  directory: string;
  artifacts: Record<CompatibilityArtifactKind, string>;
}

export type CompatibilityArtifactHeadersResolver = (url: string) => HeadersInit;

export async function stageCompatibilitySet(
  home: string,
  verified: VerifiedCompatibilityManifest,
  headersForUrl: CompatibilityArtifactHeadersResolver = () => ({}),
): Promise<StagedCompatibilitySet> {
  const directory = path.join(updateRoot(home), "staging", String(verified.manifest.sequence));
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const artifacts = {} as Record<CompatibilityArtifactKind, string>;
  const downloaded = new Map<string, string>();
  try {
    for (const [kind, artifact] of Object.entries(verified.manifest.artifacts) as [
      CompatibilityArtifactKind,
      (typeof verified.manifest.artifacts)[CompatibilityArtifactKind],
    ][]) {
      const identity = `${artifact.url}\n${artifact.sizeBytes}\n${artifact.sha256}`;
      const existing = downloaded.get(identity);
      const target = path.join(directory, `${kind}.artifact`);
      if (existing) {
        copyFileSync(existing, target);
        artifacts[kind] = target;
      } else {
        await downloadVerifiedArtifact(
          artifact.url,
          target,
          artifact.sizeBytes,
          artifact.sha256,
          headersForUrl(artifact.url),
        );
        artifacts[kind] = target;
        downloaded.set(identity, target);
      }
    }
    writeFileSync(
      path.join(directory, "signed-manifest.json"),
      `${JSON.stringify(verified.signed, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      path.join(directory, ACTIVE_ENGINE_PIN_FILE),
      `${JSON.stringify(enginePinFromManifest(verified.manifest), null, 2)}\n`,
      "utf8",
    );
    validateCompatibilityControlContract(
      readFileSync(artifacts.controlContract, "utf8"),
      verified.manifest,
    );
    return { directory, artifacts };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function downloadVerifiedArtifact(
  url: string,
  target: string,
  expectedSize: number,
  expectedSha256: string,
  headers: HeadersInit,
): Promise<void> {
  const response = await fetch(url, { headers, redirect: "error" });
  if (!response.ok || !response.body) throw new Error(`Artifact download failed with HTTP ${response.status}.`);
  const output = createWriteStream(target, { flags: "wx" });
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let receivedSize = 0;
  try {
    await once(output, "open");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      receivedSize += value.byteLength;
      if (receivedSize > expectedSize) {
        await reader.cancel();
        throw new Error("A compatibility artifact exceeds its signed byte size.");
      }
      hash.update(value);
      if (!output.write(value)) await once(output, "drain");
    }
    output.end();
    await once(output, "close");
  } catch (error) {
    output.destroy();
    if (!output.closed) await once(output, "close").catch(() => undefined);
    rmSync(target, { force: true });
    throw error;
  }
  if (
    receivedSize !== expectedSize ||
    statSync(target).size !== expectedSize ||
    hash.digest("hex") !== expectedSha256
  ) {
    rmSync(target, { force: true });
    throw new Error("A staged compatibility artifact does not match its signed size and SHA-256.");
  }
}
