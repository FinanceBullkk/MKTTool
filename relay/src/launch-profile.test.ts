/**
 * Vé mở profile: hỏng ở tầng nào thì operator phải đọc ra việc cần làm ở tầng đó.
 *
 * Test này giữ đúng một luật: câu trả lời dựng từ **mã lỗi** của MKT Browser, không phải từ câu
 * chữ nội bộ của nó. Bản desktop được phép đổi câu chữ bất cứ lúc nào; đổi mã là đổi hợp đồng.
 */
import { describe, expect, it } from "vitest";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { launchProfileFromTicket } from "./launch-profile";
import {
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";

const INTERNAL_SENTENCE = "resolveBinaryPath failed: Chromium not ready: missing";

function payload() {
  return {
    kind: TICKET_KINDS.LAUNCH_PROFILE,
    accountId: "acc-1",
    antidetectProfileId: "profile-1",
    proxyLabel: "Webshare #3",
    proxy: {
      protocol: "socks5" as const,
      host: "5.6.7.8",
      port: 1080,
      username: "u",
      password: "p",
    },
  } as const;
}

function antidetectThatFails(
  stage: "applyProxy" | "launchProfile",
  error: unknown,
): RelayAntidetect {
  const adapter: AntidetectAdapter = {
    providerName: "MKT Browser",
    isAvailable: async () => true,
    applyProxy: async () => {
      if (stage === "applyProxy") throw error;
    },
    launchProfile: async (profileId: string) => {
      if (stage === "launchProfile") throw error;
      return { profileId };
    },
    closeProfile: async () => {},
    isRunning: async () => true,
    listProfiles: async () => [],
    fingerprintOptions: async () => ({ devices: [], locales: [] }),
    createProfile: async () => ({ profileId: "profile-1" }),
  };

  return {
    getAdapter: () => adapter,
    isReady: async () => true,
    requireOperationalRuntime: async () => ({}) as never,
    forgetProbe: () => {},
  } as unknown as RelayAntidetect;
}

describe("launchProfileFromTicket error copy", () => {
  it("returns a stable code when measured capacity is still recovering", async () => {
    const antidetect = {
      requireOperationalRuntime: async () => {
        throw new AntidetectRuntimeNotReadyError(
          "MKT Browser is recovering a prior browser session. Retry after recovery finishes.",
          "RECOVERY_PENDING",
        );
      },
    } as unknown as RelayAntidetect;

    const result = await launchProfileFromTicket(payload(), antidetect, "operation-capacity");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("RECOVERY_PENDING");
    expect(result.diagnostic).toMatchObject({
      stage: "browser-health",
      code: "RECOVERY_PENDING",
    });
  });

  it("points at the refusal without claiming the proxy is dead", async () => {
    const error = new AntidetectError(INTERNAL_SENTENCE, "MKT Browser", {
      code: "PROXY_REJECTED",
    });
    const result = await launchProfileFromTicket(
      payload(),
      antidetectThatFails("applyProxy", error),
      "operation-1",
    );

    expect(result.ok).toBe(false);
    expect(result.message).not.toContain(INTERNAL_SENTENCE);
    // PROXY_REJECTED cũng nổ khi chốt chặn WebRTC không xác minh được, lúc đó proxy vẫn sống.
    // Câu trả về không được kết luận proxy chết — chỉ được chỉ chỗ xem.
    expect(result.message).not.toMatch(/proxy is alive|account proxy/i);
    expect(result.message).toContain("Open MKT Browser on this PC");
    // Luật gốc vẫn phải hiện ra: đẩy proxy hỏng thì KHÔNG mở profile.
    expect(result.message).toContain("NOT opened");
  });

  it("names the engine when the engine is what failed", async () => {
    const error = new AntidetectError(INTERNAL_SENTENCE, "MKT Browser", {
      code: "ENGINE_UNAVAILABLE",
    });
    const result = await launchProfileFromTicket(
      payload(),
      antidetectThatFails("launchProfile", error),
      "operation-2",
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("browser engine");
    expect(result.message).not.toContain(INTERNAL_SENTENCE);
    // ENGINE_UNAVAILABLE cũng là mã trả về khi KHÔNG có licence key nào. Bảo người ta "chờ engine
    // xong" lúc đó là cử họ đi chờ một thứ không chạy, nên câu này không được nhắc tới việc chờ.
    expect(result.message).not.toMatch(/wait for the engine/i);
    expect(result.message).toContain("Settings");
  });

  it("falls back to the readable message when a legacy build sends no code", async () => {
    const error = new AntidetectError("Không mở được profile.", "MKT Browser");
    const result = await launchProfileFromTicket(
      payload(),
      antidetectThatFails("launchProfile", error),
      "operation-3",
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Không mở được profile.");
  });

  it("falls back rather than inventing copy for an unrecognised code", async () => {
    const error = new AntidetectError("Lỗi lạ từ máy.", "MKT Browser", {
      code: "SOMETHING_ADDED_LATER",
    });
    const result = await launchProfileFromTicket(
      payload(),
      antidetectThatFails("launchProfile", error),
      "operation-4",
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Lỗi lạ từ máy.");
  });

  it("explains an atomic rejection caused by a different active proxy", async () => {
    const error = new AntidetectError(INTERNAL_SENTENCE, "MKT Browser", {
      code: "PROFILE_ALREADY_RUNNING",
    });
    const adapter = antidetectThatFails("launchProfile", error).getAdapter();
    adapter.launchProfileWithProxy = async () => {
      throw error;
    };

    const result = await launchProfileFromTicket(payload(), {
      getAdapter: () => adapter,
      forgetProbe: () => {},
      requireOperationalRuntime: async () => ({}) as never,
    } as unknown as RelayAntidetect, "operation-5");

    expect(result.ok).toBe(false);
    expect(result.code).toBe("PROFILE_ALREADY_RUNNING");
    expect(result.message).toContain("already running with a different proxy");
    expect(result.message).not.toContain(INTERNAL_SENTENCE);
  });
});
