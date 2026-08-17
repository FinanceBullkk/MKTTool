import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateCompatibilityControlContract } from "../../src/lib/release/compatibility-control-contract";
import { signedManifestDigest } from "../../src/lib/release/compatibility-manifest-crypto";
import { signedCompatibilityManifestSchema } from "../../src/lib/release/compatibility-manifest-schema";
import {
  ACTIVE_ENGINE_PIN_FILE,
  enginePinFromManifest,
  parseEnginePin,
} from "./active-engine-pin";
import type { StagedCompatibilitySet } from "./compatibility-artifact-staging";
import type { CompatibilityArtifactKind, CompatibilitySetRecord } from "./update-state";

const ARTIFACT_KINDS: CompatibilityArtifactKind[] = [
  "installer",
  "relay",
  "browser",
  "controlContract",
  "engine",
];

export function assertCompatibilitySetFilesPresent(
  directory: string,
  label: string,
): void {
  const required = [
    ...ARTIFACT_KINDS.map((kind) => artifactPath(directory, kind)),
    path.join(directory, "signed-manifest.json"),
    path.join(directory, ACTIVE_ENGINE_PIN_FILE),
  ];
  if (required.some((filePath) => !existsSync(filePath) || statSync(filePath).size <= 0)) {
    throw new Error(`${label} compatibility set is incomplete; installer repair is required.`);
  }
}

export async function verifyCompatibilitySetDirectory(
  directory: string,
  record: CompatibilitySetRecord,
): Promise<StagedCompatibilitySet> {
  assertCompatibilitySetFilesPresent(directory, "The selected");
  let signed;
  try {
    signed = signedCompatibilityManifestSchema.parse(
      JSON.parse(readFileSync(path.join(directory, "signed-manifest.json"), "utf8")),
    );
  } catch {
    throw new Error("The compatibility set manifest is invalid; installer repair is required.");
  }
  // The protected digest binds this untrusted on-disk manifest to the release already validated.
  if (signedManifestDigest(signed) !== record.manifestDigest || signed.manifest.sequence !== record.sequence) {
    throw new Error("The compatibility set manifest does not match protected state.");
  }

  const artifacts = {} as Record<CompatibilityArtifactKind, string>;
  for (const kind of ARTIFACT_KINDS) {
    const expected = signed.manifest.artifacts[kind];
    if (expected.version !== record.versions[kind]) {
      throw new Error("The compatibility set versions do not match protected state.");
    }
    const filePath = artifactPath(directory, kind);
    if (statSync(filePath).size !== expected.sizeBytes || (await sha256File(filePath)) !== expected.sha256) {
      throw new Error(`The compatibility ${kind} artifact does not match its signed manifest.`);
    }
    artifacts[kind] = filePath;
  }

  validateCompatibilityControlContract(
    readFileSync(artifacts.controlContract, "utf8"),
    signed.manifest,
  );
  const pin = parseEnginePin(readFileSync(path.join(directory, ACTIVE_ENGINE_PIN_FILE), "utf8"));
  const expectedPin = enginePinFromManifest(signed.manifest);
  if (
    pin.schemaVersion !== expectedPin.schemaVersion ||
    pin.sequence !== expectedPin.sequence ||
    pin.engineKind !== expectedPin.engineKind ||
    pin.version !== expectedPin.version ||
    pin.url !== expectedPin.url ||
    pin.sha256 !== expectedPin.sha256 ||
    pin.sizeBytes !== expectedPin.sizeBytes
  ) {
    throw new Error("The compatibility engine pin does not match the signed manifest.");
  }
  return { directory, artifacts };
}

function artifactPath(directory: string, kind: CompatibilityArtifactKind): string {
  return path.join(directory, `${kind}.artifact`);
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
