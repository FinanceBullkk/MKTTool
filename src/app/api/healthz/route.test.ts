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

  // Sự cố 30/08/2026 chạy nhiều giờ mà không để lại dòng log nào, vì hai catch ở đây nuốt sạch
  // nguyên nhân. Thân phản hồi vẫn phải sạch, nhưng log máy chủ thì phải có.
  it("ghi nguyên nhân ra log máy chủ mà không đưa vào thân phản hồi", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readRelease.mockRejectedValue(new Error("must-not-leak-to-body"));

    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("must-not-leak-to-body");
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("[healthz] release check failed -- Error: must-not-leak-to-body"),
    );
    logged.mockRestore();
  });

  // Regression guard for the 2026-08-30 intermittent 503s: the release check reads R2 over the
  // network and must not share the database's sub-millisecond budget.  An R2 round trip slower
  // than the database bound but well inside the release bound is ordinary latency, not an
  // unready service, and must not take the instance out of rotation or fail a deployment
  // promotion.  See plans/reports/analysis-260830-1840-healthz-r2-timeout-budget.md.
  it("stays ready when the release read is slower than the database budget", async () => {
    mocks.readR2Config.mockReturnValue({ bucket: "relay" });
    mocks.readRelease.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(GOOD_RELEASE), 1_200)),
    );

    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "ready",
      checks: { database: "ok", releaseMetadata: "ok", r2: "ok" },
    });
  });
});

