import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleLicenseCapacityRefresh } from "./handle-license-capacity-refresh";

const WEB_ORIGIN = "https://mkt.example";

function request(origin?: string): IncomingMessage {
  return { headers: { ...(origin ? { origin } : {}) } } as IncomingMessage;
}

describe("handleLicenseCapacityRefresh", () => {
  it("rejects an untrusted origin before calling MKT Browser", async () => {
    const refreshLicenseCapacity = vi.fn(async () => null);
    const result = await handleLicenseCapacityRefresh(request("https://evil.example"), {
      allowedOrigin: WEB_ORIGIN,
      antidetect: { refreshLicenseCapacity },
    });

    expect(result.ok).toBe(false);
    expect(refreshLicenseCapacity).not.toHaveBeenCalled();
  });

  it("returns sanitized aggregate capacity from one explicit refresh", async () => {
    const capacity = {
      total: 1,
      free: 1,
      active: 0,
      pendingRecovery: 0,
      cooling: 0,
      availability: "ready" as const,
      reason: "CAPACITY_AVAILABLE",
    };
    const refreshLicenseCapacity = vi.fn(async () => capacity);
    const result = await handleLicenseCapacityRefresh(request(WEB_ORIGIN), {
      allowedOrigin: WEB_ORIGIN,
      antidetect: { refreshLicenseCapacity },
    });

    expect(result).toMatchObject({ ok: true, licenseCapacity: capacity });
    expect(refreshLicenseCapacity).toHaveBeenCalledOnce();
  });
});
