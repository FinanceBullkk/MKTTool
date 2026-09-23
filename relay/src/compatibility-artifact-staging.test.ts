import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerifiedCompatibilityManifest } from "../../src/lib/release/compatibility-manifest";
import type { CompatibilityManifest } from "../../src/lib/release/compatibility-manifest-schema";
import { updateRoot } from "./compatibility-update-marker";
import {
  CompatibilityArtifactDownloadError,
  stageCompatibilitySet,
} from "./compatibility-artifact-staging";

const writeStreamOverrides = vi.hoisted(
  () =>
    [] as Array<
      (
        ...args: Parameters<typeof import("node:fs").createWriteStream>
      ) => ReturnType<typeof import("node:fs").createWriteStream>
    >,
);

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createWriteStream: (...args: Parameters<typeof actual.createWriteStream>) => {
      const override = writeStreamOverrides.shift();
      return override ? override(...args) : actual.createWriteStream(...args);
    },
  };
});

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  writeStreamOverrides.length = 0;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("compatibility artifact staging", () => {
  it("stages the signed set with strict no-redirect fetches", async () => {
    const home = createHome();
    const fixture = createFixture();
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
      new Response(fixture.payloads[String(input)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const staged = await stageCompatibilitySet(home, fixture.verified);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ redirect: "error" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(existsSync(staged.artifacts.controlContract)).toBe(true);
  });

  it("classifies TLS failures without exposing the Node cause", async () => {
    const home = createHome();
    const fixture = createFixture();
    const secret = "https://artifact.example/?authorization=do-not-expose";
    const tlsCause = Object.assign(new Error(secret), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
    const fetchFailure = new TypeError("fetch failed", { cause: tlsCause });
    const fetchMock = vi.fn(async () => { throw fetchFailure; });
    vi.stubGlobal("fetch", fetchMock);

    const error = await stagingFailure(() => stageCompatibilitySet(home, fixture.verified));

    expect(error.code).toBe("COMPATIBILITY_ARTIFACT_TLS");
    expect(error.message).not.toContain(secret);
    expect(error.cause).toBe(fetchFailure);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(existsSync(stagingDirectory(home))).toBe(false);
  });

  it("classifies network and HTTP refusal without exposing endpoint details", async () => {
    const home = createHome();
    const fixture = createFixture();
    const secret = "https://artifact.example/?authorization=do-not-expose";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error(secret), { code: "ECONNRESET" });
      }),
    );

    const network = await stagingFailure(() => stageCompatibilitySet(home, fixture.verified));
    expect(network.code).toBe("COMPATIBILITY_ARTIFACT_NETWORK");
    expect(network.message).not.toContain(secret);
    expect(existsSync(stagingDirectory(home))).toBe(false);

    const httpHome = createHome();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    const http = await stagingFailure(() => stageCompatibilitySet(httpHome, fixture.verified));
    expect(http.code).toBe("COMPATIBILITY_ARTIFACT_HTTP");
    expect(http.message).not.toContain("403");
    expect(existsSync(stagingDirectory(httpHome))).toBe(false);
  });

  it("rejects signed size and hash mismatches and removes the partial staging directory", async () => {
    const sizeHome = createHome();
    const sizeFixture = createFixture({ installer: "a" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oversized")));
    const size = await stagingFailure(() => stageCompatibilitySet(sizeHome, sizeFixture.verified));
    expect(size.code).toBe("COMPATIBILITY_ARTIFACT_SIZE");
    expect(existsSync(stagingDirectory(sizeHome))).toBe(false);

    const truncatedHome = createHome();
    const truncatedFixture = createFixture({ installer: "expected" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("short")));
    const truncated = await stagingFailure(() =>
      stageCompatibilitySet(truncatedHome, truncatedFixture.verified),
    );
    expect(truncated.code).toBe("COMPATIBILITY_ARTIFACT_SIZE");
    expect(existsSync(stagingDirectory(truncatedHome))).toBe(false);

    const hashHome = createHome();
    const hashFixture = createFixture({ installer: "good" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("evil")));
    const hash = await stagingFailure(() => stageCompatibilitySet(hashHome, hashFixture.verified));
    expect(hash.code).toBe("COMPATIBILITY_ARTIFACT_HASH");
    expect(existsSync(stagingDirectory(hashHome))).toBe(false);
  });

  it("bounds header and body stalls, cancels the body, and removes partial staging", async () => {
    const headerHome = createHome();
    const fixture = createFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      ),
    );
    const header = await stagingFailure(() =>
      stageCompatibilitySet(headerHome, fixture.verified, undefined, {
        headerTimeoutMs: 1,
        bodyIdleTimeoutMs: 100,
        totalTimeoutMs: 100,
      }),
    );
    expect(header.code).toBe("COMPATIBILITY_ARTIFACT_TIMEOUT");
    expect(existsSync(stagingDirectory(headerHome))).toBe(false);

    const bodyHome = createHome();
    let cancelled = false;
    let releasePull: (() => void) | undefined;
    const stalledBody = new ReadableStream<Uint8Array>({
      pull: () =>
        new Promise<void>((resolve) => {
          releasePull = resolve;
        }),
      cancel: () => {
        cancelled = true;
        releasePull?.();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stalledBody)));
    const body = await stagingFailure(() =>
      stageCompatibilitySet(bodyHome, fixture.verified, undefined, {
        headerTimeoutMs: 100,
        bodyIdleTimeoutMs: 1,
        totalTimeoutMs: 100,
      }),
    );
    expect(body.code).toBe("COMPATIBILITY_ARTIFACT_TIMEOUT");
    expect(cancelled).toBe(true);
    expect(existsSync(stagingDirectory(bodyHome))).toBe(false);
  });

  it("cleans a writer failure that arrives after an accepted chunk while the next read stalls", async () => {
    const home = createHome();
    const fixture = createFixture();
    let cancelled = false;
    let releasePull: (() => void) | undefined;
    const firstChunk = new TextEncoder().encode(fixture.payloads["https://artifacts.example/installer"]);
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(firstChunk);
      },
      pull(_controller) {
        return new Promise<void>((resolve) => {
          releasePull = resolve;
        });
      },
      cancel() {
        cancelled = true;
        releasePull?.();
      },
    });
    let outputCreated = false;
    let writes = 0;
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        writes += 1;
        callback(); // Keep write() non-backpressured; the error must win while reader.read() stalls.
        queueMicrotask(() => output.emit("error", new Error("disk unavailable")));
      },
    });
    setImmediate(() => output.emit("open", 1));
    writeStreamOverrides.push(() => {
      outputCreated = true;
      return output as ReturnType<typeof import("node:fs").createWriteStream>;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stalledBody)));

    const error = await stagingFailure(() =>
      stageCompatibilitySet(home, fixture.verified, undefined, {
        headerTimeoutMs: 100,
        bodyIdleTimeoutMs: 1_000,
        totalTimeoutMs: 2_000,
      }),
    );

    expect(outputCreated).toBe(true);
    expect(writes).toBe(1);
    expect(error.code).toBe("COMPATIBILITY_ARTIFACT_IO");
    expect(cancelled).toBe(true);
    expect(existsSync(stagingDirectory(home))).toBe(false);
  });
});

function createHome(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "mkttool-artifact-staging-"));
  roots.push(root);
  return path.join(root, "Relay");
}

function stagingDirectory(home: string): string {
  return path.join(updateRoot(home), "staging", "1");
}

async function stagingFailure(action: () => Promise<unknown>): Promise<CompatibilityArtifactDownloadError> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(CompatibilityArtifactDownloadError);
    return error as CompatibilityArtifactDownloadError;
  }
  throw new Error("Expected compatibility artifact staging to fail.");
}

function createFixture(payloadOverrides: Partial<Record<"installer", string>> = {}) {
  const payloads = {
    installer: payloadOverrides.installer ?? "installer",
    relay: "relay",
    browser: "browser",
    engine: "engine",
  };
  const controlContract = JSON.stringify({
    schemaVersion: 1,
    type: "mktbrowser.windows-control-contract",
    appVersion: "1.0.0",
    contractVersion: 4,
    profileSchemaVersion: 3,
  });
  const url = (kind: string) => `https://artifacts.example/${kind}`;
  const artifact = (kind: string, contents: string) => ({
    version: "1.0.0",
    sha256: createHash("sha256").update(contents).digest("hex"),
    sizeBytes: Buffer.byteLength(contents),
    url: url(kind),
  });
  const manifest = {
    schemaVersion: 1,
    type: "mkttool.windows.compatibility-manifest",
    sequence: 1,
    channel: "pilot",
    platform: "windows-x64",
    issuedAt: "2026-09-24T00:00:00.000Z",
    expiresAt: "2026-09-25T00:00:00.000Z",
    delegatedKeyId: "a".repeat(64),
    transition: { fromSequences: [0], retainedSequence: null },
    artifacts: {
      installer: { ...artifact("installer", payloads.installer), kind: "installer" },
      relay: {
        ...artifact("relay", payloads.relay),
        kind: "relay",
        supportedBrowserContract: { min: 4, max: 4 },
        secureStoreSchemaVersion: 1,
      },
      browser: {
        ...artifact("browser", payloads.browser),
        kind: "browser",
        contractVersion: 4,
        profileSchemaVersion: 3,
        engineKind: "cloakbrowser",
      },
      controlContract: {
        ...artifact("control-contract", controlContract),
        kind: "control-contract",
        contractVersion: 4,
      },
      engine: { ...artifact("engine", payloads.engine), kind: "engine", engineKind: "cloakbrowser" },
    },
  } satisfies CompatibilityManifest;
  return {
    verified: {
      signed: { fixture: true },
      manifest,
      manifestDigest: "b".repeat(64),
      observedRevokedDelegatedKeyIds: [],
    } as unknown as VerifiedCompatibilityManifest,
    payloads: {
      [url("installer")]: payloads.installer,
      [url("relay")]: payloads.relay,
      [url("browser")]: payloads.browser,
      [url("control-contract")]: controlContract,
      [url("engine")]: payloads.engine,
    },
  };
}
