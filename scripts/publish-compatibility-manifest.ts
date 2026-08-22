import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateCompatibilityControlContract } from "../src/lib/release/compatibility-control-contract";
import { validateCompatibilityManifest } from "../src/lib/release/compatibility-manifest";
import { signedDelegationRevocationSchema } from "../src/lib/release/compatibility-manifest-schema";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import { getObject, headObject, putObject } from "../src/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV } from "../src/lib/r2/r2-config";
import {
  relayCompatibilityArtifactR2Key,
  relayCompatibilityManifestR2Key,
  relayCompatibilityRevocationsR2Key,
  RELAY_COMPATIBILITY_ARTIFACT_KINDS,
  type RelayCompatibilityArtifactKind,
} from "../src/lib/relay/relay-release-r2";

export const COMPATIBILITY_PUBLISH_ARTIFACT_KINDS = RELAY_COMPATIBILITY_ARTIFACT_KINDS;

async function main(): Promise<void> {
  const args = parseCompatibilityPublishArgs(process.argv.slice(2));
  const config = readR2Config(process.env, RELAY_RELEASE_R2_ENV);
  if (!config) throw new Error("The Relay release R2 write configuration is missing.");
  const signedInput = JSON.parse(readFileSync(args.manifest, "utf8"));
  const revocationsBody = readFileSync(args.revocations);
  const revocations = signedDelegationRevocationSchema.array().max(128).parse(
    JSON.parse(revocationsBody.toString("utf8")),
  );
  const source = signedInput as {
    manifest?: { sequence?: number; transition?: { retainedSequence?: number | null } };
  };
  const sequence = source.manifest?.sequence;
  if (!Number.isSafeInteger(sequence) || Number(sequence) <= 0) {
    throw new Error("The compatibility manifest sequence is invalid.");
  }
  const signed = validateCompatibilityManifest(signedInput, {
    state: {
      highestAcceptedSequence: Number(sequence) - 1,
      currentSequence: source.manifest?.transition?.retainedSequence ?? null,
      installerFloorSequence: 1,
    },
    revocations,
  }).signed;
  if (signed.manifest.artifacts.relay.version !== String(RELAY_VERSION)) {
    throw new Error(`The manifest does not target Relay v${RELAY_VERSION}.`);
  }

  const artifactFiles: Record<RelayCompatibilityArtifactKind, string> = {
    installer: args.installer,
    relay: args.relay,
    browser: args.browser,
    "control-contract": args.controlContract,
    engine: args.engine,
  };
  validateCompatibilityControlContract(
    readFileSync(args.controlContract, "utf8"),
    signed.manifest,
  );
  for (const kind of COMPATIBILITY_PUBLISH_ARTIFACT_KINDS) {
    const manifestArtifact =
      kind === "control-contract"
        ? signed.manifest.artifacts.controlContract
        : signed.manifest.artifacts[kind];
    const expectedPath = `/api/relay/download/v${RELAY_VERSION}/artifact/${kind}`;
    if (new URL(manifestArtifact.url).pathname !== expectedPath) {
      throw new Error(`The signed ${kind} URL must use immutable path ${expectedPath}.`);
    }
    const body = readFileSync(artifactFiles[kind]);
    const sha256 = digest(body);
    if (body.length !== manifestArtifact.sizeBytes || sha256 !== manifestArtifact.sha256) {
      throw new Error(`The local ${kind} artifact does not match the signed manifest.`);
    }
    await publishImmutable(
      config,
      relayCompatibilityArtifactR2Key(RELAY_VERSION, kind),
      body,
      "application/octet-stream",
      { sha256, "relay-version": String(RELAY_VERSION), "artifact-kind": kind },
    );
  }

  await publishImmutable(
    config,
    relayCompatibilityRevocationsR2Key(RELAY_VERSION),
    revocationsBody,
    "application/json",
    { sha256: digest(revocationsBody) },
  );
  const manifestBody = readFileSync(args.manifest);
  await publishImmutable(
    config,
    relayCompatibilityManifestR2Key(RELAY_VERSION),
    manifestBody,
    "application/json",
    { sha256: digest(manifestBody) },
  );
  console.log(`Compatibility sequence ${signed.manifest.sequence} published and verified.`);
}

async function publishImmutable(
  config: NonNullable<ReturnType<typeof readR2Config>>,
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string>,
): Promise<void> {
  console.log(
    `Preflight: bucket ${config.bucket}, object ${key}, ${body.length} bytes, SHA-256 ${metadata.sha256}`,
  );
  const existing = await headObject({ config, key });
  if (existing) {
    if (existing.sizeBytes !== body.length || existing.metadata.sha256 !== metadata.sha256) {
      throw new Error(`Immutable compatibility object ${key} already exists with different bytes.`);
    }
    await verifyRemoteBytes(config, key, body.length, metadata.sha256);
    console.log(`Verified existing immutable object ${key}.`);
    return;
  }
  await putObject({ config, key, body, contentType, metadata, ifNoneMatch: "*" });
  const remote = await headObject({ config, key });
  if (!remote || remote.sizeBytes !== body.length || remote.metadata.sha256 !== metadata.sha256) {
    throw new Error(`Compatibility object ${key} did not verify after publication.`);
  }
  await verifyRemoteBytes(config, key, body.length, metadata.sha256);
  console.log(`Published and verified ${key}.`);
}

async function verifyRemoteBytes(
  config: NonNullable<ReturnType<typeof readR2Config>>,
  key: string,
  expectedSize: number,
  expectedSha256: string,
): Promise<void> {
  const { body } = await getObject({ config, key });
  const reader = body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    hash.update(value);
  }
  if (size !== expectedSize || hash.digest("hex") !== expectedSha256) {
    throw new Error(`Compatibility object ${key} bytes do not match the local publication input.`);
  }
}

function digest(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export function parseCompatibilityPublishArgs(values: string[]): {
  manifest: string;
  revocations: string;
  installer: string;
  relay: string;
  browser: string;
  controlContract: string;
  engine: string;
} {
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
