import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma-client";
import { readRelayRelease } from "@/lib/relay/relay-release-file";
import { readRelayReleaseR2Config } from "@/lib/relay/relay-release-r2";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 450;

/**
 * Public liveness/readiness signal for the service platform.
 *
 * This route intentionally has no auth wrapper and never returns account,
 * proxy, ticket, or secret data. A healthy response means the process can
 * reach Postgres and has the exact Relay release metadata it is configured to
 * serve. Failures return 503 so Railway does not keep routing to a half-ready
 * container; no migration or repair is attempted here.
 */
export async function GET(): Promise<NextResponse> {
  const [database, release] = await Promise.all([checkDatabase(), checkRelease()]);
  const ready = database.ok && release.ok;
  const body = {
    ok: ready,
    status: ready ? "ready" : "not_ready",
    checks: {
      database: database.ok ? "ok" : "failed",
      releaseMetadata: release.ok ? "ok" : "failed",
      r2: release.r2Configured ? (release.ok ? "ok" : "failed") : "not_configured",
    },
    relayVersion: release.version,
    releaseSource: release.source,
    checkedAt: new Date().toISOString(),
  } as const;

  return NextResponse.json(body, {
    status: ready ? 200 : 503,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function checkDatabase(): Promise<{ ok: boolean }> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function checkRelease(): Promise<{
  ok: boolean;
  version: number | null;
  source: "disk" | "r2" | "unknown";
  r2Configured: boolean;
}> {
  let r2Configured = false;
  try {
    r2Configured = readRelayReleaseR2Config() !== null;
    const release = await withTimeout(readRelayRelease(RELAY_VERSION), CHECK_TIMEOUT_MS);
    if (!release.available || release.version !== RELAY_VERSION || !release.checksum) {
      return { ok: false, version: release.available ? release.version : null, source: "unknown", r2Configured };
    }
    return { ok: true, version: release.version, source: release.source, r2Configured };
  } catch {
    // Keep the route's response stable and non-sensitive. The detailed cause
    // belongs in server logs/observability, never in a public health body.
    return { ok: false, version: null, source: "unknown", r2Configured };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health check timeout")), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
