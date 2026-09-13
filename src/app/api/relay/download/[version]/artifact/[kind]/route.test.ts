import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readRelease: vi.fn(),
  readSource: vi.fn(),
}));
vi.mock("@/lib/relay/relay-compatibility-manifest-file", () => ({
  readRelayCompatibilityRelease: mocks.readRelease,
}));
vi.mock("@/lib/relay/relay-compatibility-artifact-source", () => ({
  readRelayCompatibilityArtifactSource: mocks.readSource,
}));

process.env.TICKET_SIGNING_KEY =
  "bd28078ecf461400eac90b567bf4a4f875b42f40ffbe2b0f9b8f178a473b8177";

const { encodeCompatibilityArtifactAuthorization, signCompatibilityUpdateAuthorization } =
  await import("@/lib/release/compatibility-update-authorization");
const { loadServerSigningKeys, resetServerSigningKeysCache } = await import(
  "@/lib/tickets/server-signing-key"
);
const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TICKET_SIGNING_KEY =
  "bd28078ecf461400eac90b567bf4a4f875b42f40ffbe2b0f9b8f178a473b8177";
  resetServerSigningKeysCache();
  mocks.readRelease.mockResolvedValue(release());
  mocks.readSource.mockResolvedValue({
    sizeBytes: 5,
    sha256: "a".repeat(64),
    open: async () => new Response("relay").body!,
  });
});

describe("authenticated immutable compatibility artifact route", () => {
  it("serves the signed path only with a valid path-scoped authorization", async () => {
    const path = "/api/relay/download/v12/artifact/relay";
    const response = await GET(
      new Request(`https://mkt.example${path}`, {
        headers: { authorization: authorization(path) },
      }),
      { params: Promise.resolve({ version: "v12", kind: "relay" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("relay");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(mocks.readRelease).toHaveBeenCalledWith(12, 1);
    expect(mocks.readSource).toHaveBeenCalledWith(
      12,
      "relay",
      expect.objectContaining({ url: `https://mkt.example${path}` }),
      1,
    );
  });

  it("serves the licensed engine through the same authenticated route", async () => {
    const path = "/api/relay/download/v12/artifact/engine";
    const response = await GET(
      new Request(`https://mkt.example${path}`, {
        headers: { authorization: authorization(path) },
      }),
      { params: Promise.resolve({ version: "v12", kind: "engine" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.readSource).toHaveBeenCalledWith(
      12,
      "engine",
      expect.objectContaining({ url: `https://mkt.example${path}` }),
      1,
    );
  });

  it("rejects missing credentials and a valid credential scoped to another artifact", async () => {
    const path = "/api/relay/download/v12/artifact/relay";
    const missing = await GET(new Request(`https://mkt.example${path}`), {
      params: Promise.resolve({ version: "v12", kind: "relay" }),
    });
    const wrongPath = await GET(
      new Request(`https://mkt.example${path}`, {
        headers: {
          authorization: authorization("/api/relay/download/v12/artifact/browser"),
        },
      }),
      { params: Promise.resolve({ version: "v12", kind: "relay" }) },
    );

    expect(missing.status).toBe(401);
    expect(wrongPath.status).toBe(401);
    expect(mocks.readRelease).not.toHaveBeenCalled();
  });
});

function authorization(path: string): string {
  const now = new Date();
  return encodeCompatibilityArtifactAuthorization(
    signCompatibilityUpdateAuthorization(loadServerSigningKeys().privateKey, {
      schemaVersion: 1,
      type: "mkttool.compatibility-update-authorization",
      authorizationId: "741d4377-4c55-4fb0-8c41-133aaa15057a",
      actorUserId: "admin",
      authorizedRole: "ADMIN",
      deviceId: "device-1",
      sequence: 1,
      manifestDigest: "b".repeat(64),
      repairMissingState: false,
      authenticatedArtifactPaths: [path],
      issuedAt: now.toISOString(),
      commandExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
      artifactExpiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    }),
  );
}

function release() {
  const base = "https://mkt.example/api/relay/download/v12/artifact";
  const artifact = (kind: string) => ({
    kind,
    version: "1",
    sha256: "a".repeat(64),
    sizeBytes: 5,
    url: `${base}/${kind}`,
  });
  return {
    revocations: [],
    manifest: {
      manifest: {
        sequence: 1,
        artifacts: {
          installer: artifact("installer"),
          relay: artifact("relay"),
          browser: artifact("browser"),
          controlContract: artifact("control-contract"),
          engine: artifact("engine"),
        },
      },
    },
  };
}
