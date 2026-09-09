import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  headObject: vi.fn(),
  getObject: vi.fn(),
  readR2Config: vi.fn(),
}));

vi.mock("@/lib/r2/r2-client", () => ({
  headObject: mocks.headObject,
  getObject: mocks.getObject,
}));
vi.mock("@/lib/r2/r2-config", () => ({
  readR2Config: mocks.readR2Config,
  RELAY_RELEASE_R2_ENV: {
    accountId: "RELAY_RELEASE_R2_ACCOUNT_ID",
    bucket: "RELAY_RELEASE_R2_BUCKET",
    accessKeyId: "RELAY_RELEASE_R2_ACCESS_KEY_ID",
    secretAccessKey: "RELAY_RELEASE_R2_SECRET_ACCESS_KEY",
  },
}));

const { openWindowsInstallerStream, readWindowsInstallerRelease } = await import(
  "./windows-installer-release"
);

const CONFIG = {
  accountId: "account",
  bucket: "bucket",
  accessKeyId: "access",
  secretAccessKey: "secret",
};
const BYTES = Buffer.from("verified-installer");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const COMPLETE_METADATA = {
  "candidate-id": "20260909-browser-0.3.16-relay-17-nonblocking-relay-cft",
  "browser-version": "0.3.16",
  sha256: SHA,
  "bundled-relay-version": "17",
  "bundled-relay-sha256": "b".repeat(64),
  "payload-manifest-sha256": "c".repeat(64),
  "payload-file-count": "130",
  "browser-source-sha": "d".repeat(40),
  "browser-source-tree": "e".repeat(40),
  "engine-kind": "cft",
  "engine-channel": "chrome-for-testing",
  "engine-version": "152.0.7977.64",
  "engine-sha256": "f".repeat(64),
  "signing-status": "unsigned-internal-exception",
  "signing-exception-expires-at": "2099-01-01T00:00:00.000Z",
};

const APPROVED_TUPLE_ENV = "MKT_WINDOWS_INSTALLER_APPROVED_TUPLE_JSON";

function info(metadata = COMPLETE_METADATA, sizeBytes = BYTES.length) {
  return {
    sizeBytes,
    lastModified: new Date("2026-08-30T00:00:00.000Z"),
    metadata,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    APPROVED_TUPLE_ENV,
    JSON.stringify({ sizeBytes: BYTES.length, metadata: COMPLETE_METADATA }),
  );
  mocks.readR2Config.mockReturnValue(CONFIG);
  mocks.headObject.mockResolvedValue(info());
  mocks.getObject.mockResolvedValue({
    info: info(),
    body: new Response(BYTES).body,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("R2 Windows installer tuple", () => {
  it("accepts the explicitly approved current Relay tuple", async () => {
    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(true);
    expect(release.bundledRelayVersion).toBe(17);
    expect(release.metadataMissing).toEqual([]);
  });

  it.each([16, 18])("rejects Relay %i even when its tuple is explicitly approved", async (version) => {
    const metadata = { ...COMPLETE_METADATA, "bundled-relay-version": String(version) };
    vi.stubEnv(APPROVED_TUPLE_ENV, JSON.stringify({ sizeBytes: BYTES.length, metadata }));
    mocks.headObject.mockResolvedValue(info(metadata));

    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("stale-bundled-relay-version");
  });

  it("does not serve a syntactically complete but stale tuple", async () => {
    mocks.headObject.mockResolvedValue(info({ ...COMPLETE_METADATA, "browser-version": "0.3.12" }));

    const release = await readWindowsInstallerRelease();

    expect(release.available).toBe(true);
    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("stale-browser-version");
  });

  it("keeps an object unavailable when no explicit approval tuple is configured", async () => {
    vi.unstubAllEnvs();

    const release = await readWindowsInstallerRelease();

    expect(release.available).toBe(true);
    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("missing-approved-release-tuple");
  });

  it("keeps an object unavailable when the approval tuple is malformed", async () => {
    vi.stubEnv(APPROVED_TUPLE_ENV, "not-json");

    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("invalid-approved-release-tuple");
  });

  it("requires a positive HEAD size", async () => {
    mocks.headObject.mockResolvedValue(info(COMPLETE_METADATA, 0));

    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("invalid-installer-size");
  });

  it("marks an expired unsigned object unavailable during the HEAD parse", async () => {
    mocks.headObject.mockResolvedValue(
      info({ ...COMPLETE_METADATA, "signing-exception-expires-at": "2020-01-01T00:00:00.000Z" }),
    );

    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("expired-signing-exception");
  });

  it("binds every metadata field to the explicit approval tuple", async () => {
    mocks.headObject.mockResolvedValue(
      info({ ...COMPLETE_METADATA, "browser-source-tree": "1".repeat(40) }),
    );

    const release = await readWindowsInstallerRelease();

    expect(release.metadataComplete).toBe(false);
    expect(release.metadataMissing).toContain("unapproved-release-tuple");
  });

  it("spools and verifies the complete GET before exposing a stream", async () => {
    const release = await readWindowsInstallerRelease();
    const opened = await openWindowsInstallerStream(release);

    expect(Buffer.from(await new Response(opened.stream).arrayBuffer())).toEqual(BYTES);
    expect(opened.sizeBytes).toBe(BYTES.length);
  });

  it("fails closed when the mutable-key GET body differs from HEAD metadata", async () => {
    mocks.getObject.mockResolvedValue({
      info: info(),
      body: new Response(Buffer.from("different-bytes")).body,
    });
    const release = await readWindowsInstallerRelease();

    await expect(openWindowsInstallerStream(release)).rejects.toThrow(/could not be verified/i);
  });

  it("rechecks unsigned-exception expiry at serve time", async () => {
    const release = await readWindowsInstallerRelease();
    const expired = {
      ...release,
      signingExceptionExpiresAt: "2020-01-01T00:00:00.000Z",
      metadataComplete: true,
    };

    await expect(openWindowsInstallerStream(expired)).rejects.toThrow(/exception.*expired/i);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("fails closed when mutable-key GET metadata differs from the approved HEAD tuple", async () => {
    const release = await readWindowsInstallerRelease();
    mocks.getObject.mockResolvedValue({
      info: info({ ...COMPLETE_METADATA, "browser-source-tree": "1".repeat(40) }),
      body: new Response(BYTES).body,
    });

    await expect(openWindowsInstallerStream(release)).rejects.toThrow(/could not be verified/i);
  });
});
