import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  readRelease: vi.fn(),
  readR2Config: vi.fn(),
}));

vi.mock("@/lib/db/prisma-client", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("@/lib/relay/relay-release-file", () => ({ readRelayRelease: mocks.readRelease }));
vi.mock("@/lib/relay/relay-release-r2", () => ({ readRelayReleaseR2Config: mocks.readR2Config }));

import { GET } from "./route";

const GOOD_RELEASE = {
  available: true,
  source: "r2" as const,
  sizeBytes: 1,
  builtAt: new Date("2026-08-30T00:00:00.000Z"),
  version: 16,
  checksum: "a".repeat(64),
};

describe("GET /api/healthz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ ok: 1 }]);
    mocks.readRelease.mockResolvedValue(GOOD_RELEASE);
    mocks.readR2Config.mockReturnValue(null);
  });

  it("returns a non-sensitive ready response without authentication", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "ready",
      relayVersion: 16,
      releaseSource: "r2",
      checks: { database: "ok", releaseMetadata: "ok", r2: "not_configured" },
    });
    expect(body).not.toHaveProperty("account");
    expect(body).not.toHaveProperty("proxy");
    expect(body).not.toHaveProperty("ticket");
    expect(body).not.toHaveProperty("secret");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when a readiness dependency fails and does not expose the cause", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("password=must-not-leak"));

    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      status: "not_ready",
      checks: { database: "failed", releaseMetadata: "ok" },
    });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("marks an unavailable release as not ready", async () => {
    mocks.readRelease.mockResolvedValue({ available: false, expectedPath: "redacted" });

    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      checks: { database: "ok", releaseMetadata: "failed" },
    });
    expect(JSON.stringify(body)).not.toContain("redacted");
  });
});

