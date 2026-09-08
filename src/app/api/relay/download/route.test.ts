import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  readRelayRelease: vi.fn(),
  AuthorizationError: class extends Error {
    constructor(message: string, readonly needsLogin: boolean) {
      super(message);
    }
  },
}));

vi.mock("@/lib/auth/require-actor", () => ({
  requireActor: mocks.requireActor,
  requireAdmin: vi.fn(),
  AuthorizationError: mocks.AuthorizationError,
}));
vi.mock("@/lib/relay/relay-release-file", () => ({
  readRelayRelease: mocks.readRelayRelease,
}));

const { GET } = await import("./route");
const { RELAY_VERSION } = await import("@/lib/relay/relay-endpoints");

function request(host = "mkttool-web-production.up.railway.app", protocol = "https") {
  // Railway's public Host differs from Next's internal request URL.
  return new Request("http://localhost:3000/api/relay/download", {
    headers: { host, "x-forwarded-proto": protocol },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActor.mockResolvedValue({ userId: "operator", role: "OPERATOR" });
  mocks.readRelayRelease.mockResolvedValue({ available: true, version: RELAY_VERSION });
});

afterEach(() => vi.unstubAllEnvs());

describe("authenticated Relay download redirect", () => {
  it.each([
    ["mkttool-web-production.up.railway.app", "https"],
    ["mkt.example", "https, http"],
    ["127.0.0.1:38117", "http"],
  ])("keeps the browser-visible origin for %s", async (host, protocol) => {
    const response = await GET(request(host, protocol));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${protocol.split(",")[0]}://${host}/api/relay/download/v${RELAY_VERSION}`,
    );
    expect(mocks.readRelayRelease).toHaveBeenCalledExactlyOnceWith(RELAY_VERSION);
  });

  it("keeps production redirects on HTTPS when the forwarded protocol is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const input = request("mkt.example");
    input.headers.delete("x-forwarded-proto");

    const response = await GET(input);

    expect(response.headers.get("location")).toBe(
      `https://mkt.example/api/relay/download/v${RELAY_VERSION}`,
    );
  });

  it.each([[true, 401], [false, 403]] as const)(
    "preserves authorization rejection (needsLogin=%s)",
    async (needsLogin, status) => {
      mocks.requireActor.mockRejectedValue(new mocks.AuthorizationError("Access denied.", needsLogin));

      const response = await GET(request());

      expect(response.status).toBe(status);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.json()).toEqual({ ok: false, message: "Access denied." });
      expect(mocks.readRelayRelease).not.toHaveBeenCalled();
    },
  );

  it("does not redirect when the release is unavailable", async () => {
    mocks.readRelayRelease.mockResolvedValue({ available: false, expectedPath: "test-release" });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toMatchObject({ ok: false });
  });
});
