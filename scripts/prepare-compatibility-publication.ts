import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateCompatibilityControlContract } from "../src/lib/release/compatibility-control-contract";
import { validateCompatibilityManifest } from "../src/lib/release/compatibility-manifest";
import { signedDelegationRevocationSchema } from "../src/lib/release/compatibility-manifest-schema";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import {
  relayCompatibilityArtifactR2Key,
  relayCompatibilityManifestR2Key,
  relayCompatibilityRevocationsR2Key,
  RELAY_COMPATIBILITY_ARTIFACT_KINDS,
  type RelayCompatibilityArtifactKind,
} from "../src/lib/relay/relay-release-r2";

export interface CompatibilityPublishArguments {
  manifest: string;
  revocations: string;
  installer: string;
  relay: string;
  browser: string;
  controlContract: string;
  engine: string;
}

export interface CompatibilityPublicationObject {
  key: string;
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

export function prepareCompatibilityPublication(args: CompatibilityPublishArguments): {
  sequence: number;
  objects: CompatibilityPublicationObject[];
} {
  // Retain the exact verified bytes: later file replacement must not change a publication input.
  const manifestBody = readFileSync(args.manifest);
  const signedInput = JSON.parse(manifestBody.toString("utf8"));
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
  const objects = RELAY_COMPATIBILITY_ARTIFACT_KINDS.map((kind) => {
    const artifact = kind === "control-contract"
      ? signed.manifest.artifacts.controlContract
      : signed.manifest.artifacts[kind];
    const expectedPath = `/api/relay/download/v${RELAY_VERSION}/artifact/${kind}`;
    if (new URL(artifact.url).pathname !== expectedPath) {
      throw new Error(`The signed ${kind} URL must use immutable path ${expectedPath}.`);
    }
    const body = readFileSync(artifactFiles[kind]);
    const sha256 = digest(body);
    if (body.length !== artifact.sizeBytes || sha256 !== artifact.sha256) {
      throw new Error(`The local ${kind} artifact does not match the signed manifest.`);
    }
    if (kind === "control-contract") {
      validateCompatibilityControlContract(body.toString("utf8"), signed.manifest);
    }
    return {
      key: relayCompatibilityArtifactR2Key(RELAY_VERSION, kind, signed.manifest.sequence),
      body,
      contentType: "application/octet-stream",
      metadata: { sha256, "relay-version": String(RELAY_VERSION), "artifact-kind": kind },
    };
  });
  // The manifest is last: it must never announce a partially uploaded candidate.
  return {
    sequence: signed.manifest.sequence,
    objects: [
      ...objects,
      jsonObject(relayCompatibilityRevocationsR2Key(RELAY_VERSION, signed.manifest.sequence), revocationsBody),
      jsonObject(relayCompatibilityManifestR2Key(RELAY_VERSION, signed.manifest.sequence), manifestBody),
    ],
  };
}

function jsonObject(key: string, body: Buffer): CompatibilityPublicationObject {
  return { key, body, contentType: "application/json", metadata: { sha256: digest(body) } };
}

function digest(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
