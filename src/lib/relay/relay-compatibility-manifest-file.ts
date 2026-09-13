import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * Danh sách thu hồi ủy quyền, nằm CẠNH module chứ không nằm dưới `plans/`.
 *
 * FINDING C23 đã chuyển bốn file bằng chứng của buổi lễ khóa sang
 * `release-authority-public-evidence/` vì `plans/` là khu hồ sơ — được sắp xếp lại tự do và chỉ
 * được soi như tài liệu (xem `release-root-trust.ts`). File này bị bỏ sót lại, và nó là file
 * **nhạy cảm nhất trong nhóm**: nó nói ủy quyền nào đã bị thu hồi.
 *
 * Cái giá của việc bỏ sót không phải lý thuyết — nó làm **gãy mọi lượt deploy**, vì `plans/` không
 * được copy vào Docker image, trong khi dưới máy lập trình thư mục ấy luôn có nên `tsc`, test và
 * cả `npm run build` đều xanh. Xem `src-imports-stay-inside-the-image.test.ts`, thứ giờ canh cả
 * lớp lỗi này chứ không riêng file này.
 */
import bundledRevocations from "../release/release-authority-public-evidence/release-authority-delegation-revocations.json";
import { validateCompatibilityManifest, type SignedCompatibilityManifest } from "../release/compatibility-manifest";
import { signedDelegationRevocationSchema, type SignedDelegationRevocation } from "../release/compatibility-manifest-schema";
import {
  openRelayCompatibilityManifest,
  readRelayReleaseR2Config,
} from "./relay-release-r2";
import { readRelayRelease, readRelayReleaseFromDisk, relayReleaseDir } from "./relay-release-file";

export const RELAY_COMPATIBILITY_MANIFEST_NAME = "MKTTool-Relay.compatibility.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;

export function relayCompatibilityManifestPath(): string {
  return (
    process.env.RELAY_COMPATIBILITY_MANIFEST_FILE?.trim() ||
    path.join(relayReleaseDir(), RELAY_COMPATIBILITY_MANIFEST_NAME)
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
  const sequence = activeCompatibilitySequence();
  const [manifestBody, release] = await Promise.all([
    openRelayCompatibilityManifest(config, version, undefined, sequence),
    readRelayRelease(version),
  ]);
  const revocations = readRelayCompatibilityRevocations();
  return {
    manifest: verifyRelayManifest(await streamJson(manifestBody), version, release, revocations),
    revocations,
  };
}

function activeCompatibilitySequence(): number | undefined {
  const raw = process.env.RELAY_COMPATIBILITY_SEQUENCE?.trim();
  if (!raw) return undefined;
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error("The active compatibility sequence is invalid.");
  }
  return sequence;
}

export async function readRelayCompatibilityReleaseFromDisk(
  version: number,
): Promise<RelayCompatibilityRelease> {
  const raw = readFileSync(
    /* turbopackIgnore: true */ relayCompatibilityManifestPath(),
    "utf8",
  );
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
