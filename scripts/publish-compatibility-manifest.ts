import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getObject, headObject, putObject } from "../src/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV, type R2Config } from "../src/lib/r2/r2-config";
import { RELAY_COMPATIBILITY_ARTIFACT_KINDS } from "../src/lib/relay/relay-release-r2";
import {
  prepareCompatibilityPublication,
  type CompatibilityPublicationObject,
  type CompatibilityPublishArguments,
} from "./prepare-compatibility-publication";

export const COMPATIBILITY_PUBLISH_ARTIFACT_KINDS = RELAY_COMPATIBILITY_ARTIFACT_KINDS;
type CompatibilityStorage = {
  getObject: typeof getObject;
  headObject: typeof headObject;
  putObject: typeof putObject;
};

async function main(): Promise<void> {
  const args = parseCompatibilityPublishArgs(process.argv.slice(2));
  const config = readR2Config(process.env, RELAY_RELEASE_R2_ENV);
  if (!config) throw new Error("The Relay release R2 write configuration is missing.");
  await publishCompatibilityManifest(args, { config });
}

export async function publishCompatibilityManifest(
  args: CompatibilityPublishArguments,
  options: { config: R2Config; storage?: CompatibilityStorage; report?: (message: string) => void },
): Promise<void> {
  const { config, storage = { getObject, headObject, putObject }, report = console.log } = options;
  const publication = prepareCompatibilityPublication(args);
  const missing: CompatibilityPublicationObject[] = [];
  // Check the complete namespace before the first write; a late conflict must not strand a tuple.
  for (const object of publication.objects) {
    report(
      `Preflight: bucket ${config.bucket}, object ${object.key}, ${object.body.length} bytes, SHA-256 ${object.metadata.sha256}`,
    );
    if (await verifyExistingObject(config, storage, object)) {
      report(`Verified existing immutable object ${object.key}.`);
    } else {
      missing.push(object);
    }
  }
  for (const object of missing) {
    // A racing publisher is not permission to overwrite, even after a successful preflight.
    await storage.putObject({ config, ...object, ifNoneMatch: "*" });
    if (!(await verifyExistingObject(config, storage, object))) {
      throw new Error(`Compatibility object ${object.key} did not verify after publication.`);
    }
    report(`Published and verified ${object.key}.`);
  }
  report(`Compatibility sequence ${publication.sequence} published and verified.`);
}

async function verifyExistingObject(
  config: R2Config,
  storage: CompatibilityStorage,
  object: CompatibilityPublicationObject,
): Promise<boolean> {
  const existing = await storage.headObject({ config, key: object.key });
  if (!existing) return false;
  if (
    // R2 can return content-length 0 for a HEAD response even when the object is non-empty.
    // The mandatory full GET below remains authoritative for bytes and size in that case.
    (existing.sizeBytes !== 0 && existing.sizeBytes !== object.body.length) ||
    Object.entries(object.metadata).some(([name, value]) => existing.metadata[name] !== value)
  ) {
    throw new Error(`Immutable compatibility object ${object.key} already exists with different bytes or metadata.`);
  }
  await verifyRemoteBytes(config, storage, object);
  return true;
}

async function verifyRemoteBytes(
  config: R2Config,
  storage: CompatibilityStorage,
  object: CompatibilityPublicationObject,
): Promise<void> {
  const { body } = await storage.getObject({ config, key: object.key });
  const reader = body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    hash.update(value);
  }
  if (size !== object.body.length || hash.digest("hex") !== object.metadata.sha256) {
    throw new Error(`Compatibility object ${object.key} bytes do not match the local publication input.`);
  }
}

export function parseCompatibilityPublishArgs(values: string[]): CompatibilityPublishArguments {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error(usage());
    parsed.set(name.slice(2), value);
  }
  const required = [
    "manifest",
    "revocations",
    "installer",
    "relay",
    "browser",
    "control-contract",
    "engine",
  ];
  if (required.some((name) => !parsed.get(name))) throw new Error(usage());
  return {
    manifest: path.resolve(parsed.get("manifest")!),
    revocations: path.resolve(parsed.get("revocations")!),
    installer: path.resolve(parsed.get("installer")!),
    relay: path.resolve(parsed.get("relay")!),
    browser: path.resolve(parsed.get("browser")!),
    controlContract: path.resolve(parsed.get("control-contract")!),
    engine: path.resolve(parsed.get("engine")!),
  };
}

function usage(): string {
  return (
    "Usage: npm run release:manifest:publish -- --manifest <signed.json> --revocations <json> " +
    "--installer <file> --relay <file> --browser <file> --control-contract <file> --engine <file>"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
