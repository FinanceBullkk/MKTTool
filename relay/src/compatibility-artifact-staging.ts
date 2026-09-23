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

export type CompatibilityArtifactDownloadErrorCode =
  | "COMPATIBILITY_ARTIFACT_TLS"
  | "COMPATIBILITY_ARTIFACT_TIMEOUT"
  | "COMPATIBILITY_ARTIFACT_NETWORK"
  | "COMPATIBILITY_ARTIFACT_HTTP"
  | "COMPATIBILITY_ARTIFACT_SIZE"
  | "COMPATIBILITY_ARTIFACT_HASH"
  | "COMPATIBILITY_ARTIFACT_IO";

const DOWNLOAD_MESSAGES: Record<CompatibilityArtifactDownloadErrorCode, string> = {
  COMPATIBILITY_ARTIFACT_TLS:
    "The Relay could not verify the compatibility artifact server certificate.",
  COMPATIBILITY_ARTIFACT_TIMEOUT: "The signed compatibility artifact download timed out.",
  COMPATIBILITY_ARTIFACT_NETWORK: "The Relay could not reach the compatibility artifact service.",
  COMPATIBILITY_ARTIFACT_HTTP:
    "The compatibility artifact service refused the signed download request.",
  COMPATIBILITY_ARTIFACT_SIZE: "A compatibility artifact exceeds its signed byte size.",
  COMPATIBILITY_ARTIFACT_HASH:
    "A compatibility artifact does not match its signed SHA-256.",
  COMPATIBILITY_ARTIFACT_IO: "The Relay could not write the compatibility artifact locally.",
};

/** This boundary keeps provider, URL, and TLS-stack details out of Relay responses. */
export class CompatibilityArtifactDownloadError extends Error {
  constructor(readonly code: CompatibilityArtifactDownloadErrorCode, options?: { cause?: unknown }) {
    super(DOWNLOAD_MESSAGES[code], options);
    this.name = "CompatibilityArtifactDownloadError";
  }
}

export interface CompatibilityArtifactDownloadPolicy {
  headerTimeoutMs: number;
  bodyIdleTimeoutMs: number;
  totalTimeoutMs: number;
}

/** Large signed sets can take time, but no header, body, or whole staging attempt may wait forever. */
export const COMPATIBILITY_ARTIFACT_DOWNLOAD_POLICY: CompatibilityArtifactDownloadPolicy = {
  headerTimeoutMs: 60_000,
  bodyIdleTimeoutMs: 120_000,
  totalTimeoutMs: 90 * 60_000,
};

const CANCELLATION_TIMEOUT_MS = 5_000;
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export async function stageCompatibilitySet(
  home: string,
  verified: VerifiedCompatibilityManifest,
  headersForUrl: CompatibilityArtifactHeadersResolver = () => ({}),
  policyOverrides: Partial<CompatibilityArtifactDownloadPolicy> = {},
): Promise<StagedCompatibilitySet> {
  const policy = { ...COMPATIBILITY_ARTIFACT_DOWNLOAD_POLICY, ...policyOverrides };
  const controller = new AbortController();
  const abortForTimeout = () => {
    if (!controller.signal.aborted) {
      controller.abort(new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_TIMEOUT"));
    }
  };
  const totalTimer = setTimeout(abortForTimeout, policy.totalTimeoutMs);
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
          controller,
          policy,
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
  } finally {
    clearTimeout(totalTimer);
  }
}

async function downloadVerifiedArtifact(
  url: string,
  target: string,
  expectedSize: number,
  expectedSha256: string,
  headers: HeadersInit,
  controller: AbortController,
  policy: CompatibilityArtifactDownloadPolicy,
): Promise<void> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let output: ReturnType<typeof createWriteStream> | undefined;
  try {
    const response = await fetchWithHeaderDeadline(url, headers, controller, policy.headerTimeoutMs);
    if (!response.ok || !response.body) {
      await cancelWithinDeadline(response.body);
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_HTTP");
    }
    const announcedSize = parseContentLength(response.headers.get("content-length"));
    if (announcedSize !== null && announcedSize > expectedSize) {
      await cancelWithinDeadline(response.body);
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_SIZE");
    }

    try {
      output = createWriteStream(target, { flags: "wx" });
    } catch (error) {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_IO", { cause: error });
    }
    reader = response.body.getReader();
    const hash = createHash("sha256");
    let receivedSize = 0;
    // `write()` can accept a chunk before disk/AV failures surface asynchronously. Keep this
    // listener alive through every read and drain so the Relay cleans the partial stage instead of
    // receiving an unhandled WriteStream error.
    const writerFailure: Promise<never> = once(output, "error").then(([error]) => {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_IO", { cause: error });
    });
    await waitForAbortable(Promise.race([once(output, "open"), writerFailure]), controller.signal);
    while (true) {
      const { value, done } = await waitForAbortable(
        Promise.race([
          readWithBodyIdleDeadline(reader, controller, policy.bodyIdleTimeoutMs),
          writerFailure,
        ]),
        controller.signal,
      );
      if (done) break;
      receivedSize += value.byteLength;
      if (receivedSize > expectedSize) {
        throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_SIZE");
      }
      hash.update(value);
      let accepted: boolean;
      try {
        accepted = output.write(value);
      } catch (error) {
        throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_IO", { cause: error });
      }
      if (!accepted) {
        await waitForAbortable(Promise.race([once(output, "drain"), writerFailure]), controller.signal);
      }
    }
    try {
      output.end();
    } catch (error) {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_IO", { cause: error });
    }
    await waitForAbortable(Promise.race([once(output, "close"), writerFailure]), controller.signal);
    let writtenSize: number;
    try {
      writtenSize = statSync(target).size;
    } catch (error) {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_IO", { cause: error });
    }
    if (receivedSize !== expectedSize || writtenSize !== expectedSize) {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_SIZE");
    }
    if (hash.digest("hex") !== expectedSha256) {
      throw new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_HASH");
    }
  } catch (error) {
    await cancelWithinDeadline(reader);
    await closeWithinDeadline(output);
    rmSync(target, { force: true });
    throw toDownloadError(error, controller.signal);
  }
}

async function fetchWithHeaderDeadline(
  url: string,
  headers: HeadersInit,
  controller: AbortController,
  headerTimeoutMs: number,
): Promise<Response> {
  const timer = setTimeout(() => abortForTimeout(controller), headerTimeoutMs);
  try {
    return await fetch(url, { headers, redirect: "error", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readWithBodyIdleDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  bodyIdleTimeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const timer = setTimeout(() => abortForTimeout(controller), bodyIdleTimeoutMs);
  try {
    return await waitForAbortable(reader.read(), controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForAbortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw timeoutFromSignal(signal);
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(timeoutFromSignal(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      operation.then(resolve, reject);
    });
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function cancelWithinDeadline(
  body: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null | undefined,
): Promise<void> {
  if (!body) return;
  await settleWithinDeadline(Promise.resolve().then(() => body.cancel()));
}

async function closeWithinDeadline(output: ReturnType<typeof createWriteStream> | undefined): Promise<void> {
  if (!output || output.closed) return;
  output.destroy();
  await settleWithinDeadline(once(output, "close").then(() => undefined).catch(() => undefined));
}

async function settleWithinDeadline(operation: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CANCELLATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function abortForTimeout(controller: AbortController): void {
  if (!controller.signal.aborted) {
    controller.abort(new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_TIMEOUT"));
  }
}

function timeoutFromSignal(signal: AbortSignal): CompatibilityArtifactDownloadError {
  const reason = signal.reason;
  return reason instanceof CompatibilityArtifactDownloadError
    ? reason
    : new CompatibilityArtifactDownloadError("COMPATIBILITY_ARTIFACT_TIMEOUT", { cause: reason });
}

function toDownloadError(error: unknown, signal: AbortSignal): CompatibilityArtifactDownloadError {
  if (error instanceof CompatibilityArtifactDownloadError) return error;
  if (signal.aborted) return timeoutFromSignal(signal);
  return new CompatibilityArtifactDownloadError(
    isTlsFailure(error) ? "COMPATIBILITY_ARTIFACT_TLS" : "COMPATIBILITY_ARTIFACT_NETWORK",
    { cause: error },
  );
}

function isTlsFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (
      typeof code === "string" &&
      (TLS_ERROR_CODES.has(code) || code.startsWith("ERR_TLS_") || code.startsWith("ERR_SSL_"))
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function parseContentLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
