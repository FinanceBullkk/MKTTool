import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma-client";
import { readRelayRelease } from "@/lib/relay/relay-release-file";
import { readRelayReleaseR2Config } from "@/lib/relay/relay-release-r2";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Readiness budgets are per dependency, not shared.  Postgres is in-region and answers
// `SELECT 1` in well under a millisecond, so it keeps the original tight bound.  The release
// check reads Relay metadata from R2 -- a cross-network object-storage round trip whose own
// client budgets 60 s (`src/lib/r2/r2-client.ts`).  Holding that call to the database's 450 ms
// made ordinary R2 latency present as `not_ready`, and because this route is Railway's
// healthcheckPath, a slow object store could fail an otherwise healthy deployment promotion.
// This bound is provisional: it is an order of magnitude above observed request latency and far
// below any deploy healthcheck limit, but it is not yet backed by a measured R2 latency
// distribution from the serving region.  Measure before tightening or widening it again.
const DATABASE_CHECK_TIMEOUT_MS = 450;
const RELEASE_CHECK_TIMEOUT_MS = 3_000;

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


/**
 * Ghi nguyên nhân một phép kiểm tra hỏng ra log máy chủ.
 *
 * Thân phản hồi cố tình không mang nguyên nhân — nó công khai, không cần xác thực. Nhưng nuốt
 * luôn nguyên nhân thì sự cố trở nên vô hình: ngày 30/08/2026 dịch vụ trả 503 ngắt quãng suốt
 * nhiều giờ và **không để lại một dòng log nào**, nên không ai truy được nó từ log. Chỉ ghi tên và
 * thông điệp của lỗi; cấu hình R2 và chuỗi kết nối không bao giờ đi vào đây.
 */
function logCheckFailure(check: string, cause: unknown): void {
  const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  console.error(`[healthz] ${check} check failed -- ${detail}`);
}

async function checkDatabase(): Promise<{ ok: boolean }> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DATABASE_CHECK_TIMEOUT_MS);
    return { ok: true };
  } catch (cause) {
    logCheckFailure("database", cause);
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
    // Hủy thật, không chỉ thôi chờ.  `withTimeout` là `Promise.race`: nó bỏ cuộc ở phía ngoài
    // nhưng request R2 vẫn chạy tới hết hạn riêng của nó (15 s).  Probe chạy mỗi 10–30 giây, nên
    // những request mồ côi đó chồng lên nhau đúng vào lúc R2 đang chậm và tự làm nó chậm thêm.
    // Truyền hạn xuống dưới dạng tín hiệu hủy để hết hạn là dừng.
    const release = await readRelayRelease(
      RELAY_VERSION,
      AbortSignal.timeout(RELEASE_CHECK_TIMEOUT_MS),
    );
    if (!release.available || release.version !== RELAY_VERSION || !release.checksum) {
      return { ok: false, version: release.available ? release.version : null, source: "unknown", r2Configured };
    }
    return { ok: true, version: release.version, source: release.source, r2Configured };
  } catch (cause) {
    // Thân phản hồi giữ nguyên hình dạng và không mang chi tiết — nó công khai. Nguyên nhân đi ra
    // log máy chủ, đúng chỗ nó thuộc về.
    logCheckFailure("release", cause);
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
