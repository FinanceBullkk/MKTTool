import { readFileSync } from "node:fs";
import path from "node:path";
import bundledRevocations from "../../../plans/260812-1301-mkb-03-windows-onboarding-and-installer/release-authority-delegation-revocations.json";
import { validateCompatibilityManifest, type SignedCompatibilityManifest } from "../release/compatibility-manifest";
import { signedDelegationRevocationSchema, type SignedDelegationRevocation } from "../release/compatibility-manifest-schema";
import {
  openRelayCompatibilityManifest,
  readRelayReleaseR2Config,
} from "./relay-release-r2";
import { readRelayRelease, readRelayReleaseFromDisk, relayReleaseDir } from "./relay-release-file";

export const RELAY_COMPATIBILITY_MANIFEST_NAME = "MKTTool-Relay.compatibility.json";
export const RELAY_COMPATIBILITY_REVOCATIONS_NAME = "MKTTool-Relay.compatibility-revocations.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;

export function relayCompatibilityManifestPath(): string {
  return (
    process.env.RELAY_COMPATIBILITY_MANIFEST_FILE?.trim() ||
    path.join(relayReleaseDir(), RELAY_COMPATIBILITY_MANIFEST_NAME)
  );
}

export function relayCompatibilityRevocationsPath(): string {
  return (
    process.env.RELAY_COMPATIBILITY_REVOCATIONS_FILE?.trim() ||
    path.join(
      process.cwd(),
      "plans",
      "260812-1301-mkb-03-windows-onboarding-and-installer",
      "release-authority-delegation-revocations.json",
    )
  );
}

export interface RelayCompatibilityRelease {
  manifest: SignedCompatibilityManifest;
  revocations: SignedDelegationRevocation[];
}

export function readRelayCompatibilityRevocations(): SignedDelegationRevocation[] {
  return readTrustedRevocations();
}

export async function readRelayCompatibilityManifest(
  version: number,
): Promise<SignedCompatibilityManifest> {
  return (await readRelayCompatibilityRelease(version)).manifest;
}

export async function readRelayCompatibilityRelease(
  version: number,
): Promise<RelayCompatibilityRelease> {
  const config = readRelayReleaseR2Config();
  if (!config) return readRelayCompatibilityReleaseFromDisk(version);
  const [manifestBody, release] = await Promise.all([
    openRelayCompatibilityManifest(config, version),
    readRelayRelease(version),
  ]);
  const revocations = readRelayCompatibilityRevocations();
  return {
    manifest: verifyRelayManifest(await streamJson(manifestBody), version, release, revocations),
    revocations,
  };
}

export async function readRelayCompatibilityManifestFromDisk(
  version: number,
): Promise<SignedCompatibilityManifest> {
  return (await readRelayCompatibilityReleaseFromDisk(version)).manifest;
}

export async function readRelayCompatibilityReleaseFromDisk(
  version: number,
): Promise<RelayCompatibilityRelease> {
  const raw = readFileSync(relayCompatibilityManifestPath(), "utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("The Relay compatibility manifest is unexpectedly large.");
  }
  const revocations = readRelayCompatibilityRevocations();
  return {
    manifest: verifyRelayManifest(
      JSON.parse(raw),
      version,
      readRelayReleaseFromDisk(version),
      revocations,
    ),
    revocations,
  };
}

async function streamJson(body: ReadableStream<Uint8Array>): Promise<unknown> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_MANIFEST_BYTES) throw new Error("The Relay compatibility manifest is unexpectedly large.");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function verifyRelayManifest(
  input: unknown,
  version: number,
  release: ReturnType<typeof readRelayReleaseFromDisk> | Awaited<ReturnType<typeof readRelayRelease>>,
  revocations: SignedDelegationRevocation[],
): SignedCompatibilityManifest {
  if (!release.available) throw new Error("The compatibility manifest has no matching Relay artifact.");
  const source = input as { manifest?: { sequence?: number; transition?: { retainedSequence?: number | null } } };
  const sequence = source.manifest?.sequence;
  const retained = source.manifest?.transition?.retainedSequence ?? null;
  if (!Number.isSafeInteger(sequence) || Number(sequence) <= 0) {
    throw new Error("The Relay compatibility manifest sequence is invalid.");
  }
  const verified = validateCompatibilityManifest(input, {
    state: {
      highestAcceptedSequence: Number(sequence) - 1,
      currentSequence: retained,
      installerFloorSequence: 1,
    },
    revocations,
  });
  const relay = verified.manifest.artifacts.relay;
  if (
    relay.version !== String(version) ||
    relay.sizeBytes !== release.sizeBytes ||
    relay.sha256 !== release.checksum
  ) {
    throw new Error("The signed compatibility manifest does not match the Relay release artifact.");
  }
  return verified.signed;
}

function parseRevocations(input: unknown): SignedDelegationRevocation[] {
  return signedDelegationRevocationSchema.array().max(128).parse(input);
}

function readTrustedRevocations(): SignedDelegationRevocation[] {
  const override = process.env.RELAY_COMPATIBILITY_REVOCATIONS_FILE?.trim();
  if (!override) return parseRevocations(bundledRevocations);
  const raw = readFileSync(override, "utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("The release delegation revocation list is unexpectedly large.");
  }
  return parseRevocations(JSON.parse(raw));
}
