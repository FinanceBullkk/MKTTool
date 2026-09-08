import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readRelease: vi.fn() }));

vi.mock("@/lib/relay/relay-release-file", () => ({ readRelayRelease: mocks.readRelease }));

import { readReleaseProvenance } from "./release-provenance";

const RELAY = {
  available: true,
  source: "r2" as const,
  sizeBytes: 100,
  builtAt: new Date("2026-08-30T00:00:00.000Z"),
  version: 17,
  checksum: "a".repeat(64),
};

describe("release provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readRelease.mockResolvedValue(RELAY);
  });

  it("returns a complete published tuple from sanitized deployment metadata", async () => {
    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "20260909-browser-0.3.14-relay-17-activation-repair-cft",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(64),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-123",
      MKT_RELEASE_BROWSER_VERSION: "0.3.14",
      MKT_RELEASE_BROWSER_SIZE_BYTES: "200",
      MKT_RELEASE_BROWSER_SHA256: "c".repeat(64),
      MKT_RELEASE_ENGINE_KIND: "cft",
      MKT_RELEASE_ENGINE_CHANNEL: "chrome-for-testing",
      MKT_RELEASE_ENGINE_VERSION: "152.0.7977.64",
      MKT_RELEASE_ENGINE_SHA256: "d".repeat(64),
      MKT_RELEASE_SIGNING_STATUS: "unsigned-internal-exception",
      MKT_RELEASE_SIGNING_EXCEPTION_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "published",
      candidateId: "20260909-browser-0.3.14-relay-17-activation-repair-cft",
      sourceSha: "b".repeat(64),
      deploymentId: "deploy-123",
      relay: { version: 17, sizeBytes: 100, sha256: "a".repeat(64), source: "r2" },
      browser: { version: "0.3.14", sizeBytes: 200, sha256: "c".repeat(64) },
      engine: { kind: "cft", channel: "chrome-for-testing", version: "152.0.7977.64" },
      signing: "unsigned-internal-exception",
      signingExceptionExpiresAt: "2099-01-01T00:00:00.000Z",
      missing: [],
    });
  });

  it("fails closed when deployment metadata or Relay facts are missing", async () => {
    mocks.readRelease.mockResolvedValue({ available: false, expectedPath: "must-not-leak" });

    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "bad value",
      MKT_RELEASE_SOURCE_SHA: "not-a-sha",
    });

    expect(result.status).toBe("unpublished");
    expect(result.missing).toEqual(expect.arrayContaining(["candidateId", "sourceSha", "deploymentId", "relay"]));
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("bad value");
  });

  it("requires every Browser and engine tuple field instead of treating partial metadata as published", async () => {
    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "candidate-1",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(40),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-1",
      MKT_RELEASE_BROWSER_VERSION: "0.3.13",
      MKT_RELEASE_ENGINE_VERSION: "151.0.7922.108.2",
      MKT_RELEASE_SIGNING_STATUS: "authenticode",
    });

    expect(result.status).toBe("unpublished");
    expect(result.browser).toBeNull();
    expect(result.engine).toBeNull();
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "browser.sizeBytes",
        "browser.sha256",
        "engine.kind",
        "engine.channel",
        "engine.sha256",
      ]),
    );
  });

  it("rejects unknown values and does not echo them in the sanitized record", async () => {
    const secret = "not safe/secret";
    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "candidate-1",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(40),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-1",
      MKT_RELEASE_BROWSER_VERSION: "not-semver",
      MKT_RELEASE_BROWSER_SIZE_BYTES: "0",
      MKT_RELEASE_BROWSER_SHA256: secret,
      MKT_RELEASE_ENGINE_KIND: secret,
      MKT_RELEASE_ENGINE_CHANNEL: "licensed-channel",
      MKT_RELEASE_ENGINE_VERSION: "151.0.7922.108.2",
      MKT_RELEASE_ENGINE_SHA256: "d".repeat(64),
      MKT_RELEASE_SIGNING_STATUS: "mystery",
    });

    expect(result.status).toBe("unpublished");
    expect(result.browser).toBeNull();
    expect(result.engine).toBeNull();
    expect(result.signing).toBe("unknown");
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "browser.version",
        "browser.sizeBytes",
        "browser.sha256",
        "engine.kind",
        "signing.status",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("does not accept an explicit unknown sentinel as a required tuple value", async () => {
    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "candidate-1",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(40),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-1",
      MKT_RELEASE_BROWSER_VERSION: "0.3.13",
      MKT_RELEASE_BROWSER_SIZE_BYTES: "200",
      MKT_RELEASE_BROWSER_SHA256: "c".repeat(64),
      MKT_RELEASE_ENGINE_KIND: "unknown",
      MKT_RELEASE_ENGINE_CHANNEL: "licensed-channel",
      MKT_RELEASE_ENGINE_VERSION: "151.0.7922.108.2",
      MKT_RELEASE_ENGINE_SHA256: "d".repeat(64),
      MKT_RELEASE_SIGNING_STATUS: "authenticode",
    });

    expect(result.status).toBe("unpublished");
    expect(result.engine).toBeNull();
    expect(result.missing).toContain("engine.kind");
  });

  it("requires a future expiry for an unsigned internal exception", async () => {
    const base = {
      MKT_RELEASE_CANDIDATE_ID: "candidate-1",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(40),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-1",
      MKT_RELEASE_BROWSER_VERSION: "0.3.13",
      MKT_RELEASE_BROWSER_SIZE_BYTES: "200",
      MKT_RELEASE_BROWSER_SHA256: "c".repeat(64),
      MKT_RELEASE_ENGINE_KIND: "cloakbrowser",
      MKT_RELEASE_ENGINE_CHANNEL: "licensed-channel",
      MKT_RELEASE_ENGINE_VERSION: "151.0.7922.108.2",
      MKT_RELEASE_ENGINE_SHA256: "d".repeat(64),
      MKT_RELEASE_SIGNING_STATUS: "unsigned-internal-exception",
    };

    const missingExpiry = await readReleaseProvenance(base);
    expect(missingExpiry.status).toBe("unpublished");
    expect(missingExpiry.missing).toContain("signing.exceptionExpiresAt");
    expect(missingExpiry.signingExceptionExpiresAt).toBeNull();

    const expired = await readReleaseProvenance({
      ...base,
      MKT_RELEASE_SIGNING_EXCEPTION_EXPIRES_AT: "2020-01-01T00:00:00.000Z",
    });
    expect(expired.status).toBe("unpublished");
    expect(expired.missing).toContain("signing.exceptionExpiresAt");
    expect(expired.signingExceptionExpiresAt).toBeNull();
  });

  it("rejects malformed Relay facts rather than exposing an incomplete release", async () => {
    mocks.readRelease.mockResolvedValue({
      available: true,
      source: "r2",
      version: 15,
      sizeBytes: 0,
      checksum: "not-a-sha",
    });

    const result = await readReleaseProvenance({
      MKT_RELEASE_CANDIDATE_ID: "candidate-1",
      MKT_RELEASE_SOURCE_SHA: "b".repeat(40),
      MKT_RELEASE_DEPLOYMENT_ID: "deploy-1",
      MKT_RELEASE_BROWSER_VERSION: "0.3.13",
      MKT_RELEASE_BROWSER_SIZE_BYTES: "200",
      MKT_RELEASE_BROWSER_SHA256: "c".repeat(64),
      MKT_RELEASE_ENGINE_KIND: "cloakbrowser",
      MKT_RELEASE_ENGINE_CHANNEL: "licensed-channel",
      MKT_RELEASE_ENGINE_VERSION: "151.0.7922.108.2",
      MKT_RELEASE_ENGINE_SHA256: "d".repeat(64),
      MKT_RELEASE_SIGNING_STATUS: "authenticode",
    });

    expect(result.status).toBe("unpublished");
    expect(result.relay).toBeNull();
    expect(result.missing).toEqual(
      expect.arrayContaining(["relay", "relay.version", "relay.sizeBytes", "relay.sha256"]),
    );
  });
});
