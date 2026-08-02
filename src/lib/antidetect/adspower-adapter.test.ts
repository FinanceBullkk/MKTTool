import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsPowerAdapter } from "./adspower-adapter";

const BASE_URL = "http://local.adspower.net:50325";
const PROFILE_ID = "user-abc";

const PROXY = {
  protocol: "http",
  host: "1.2.3.4",
  port: 8080,
  username: "user01",
  password: "mat-khau-proxy",
} as const;

interface RecordedCall {
  url: string;
  method: string;
  body?: Record<string, unknown>;
}

/** Giả lập API cục bộ của AdsPower: luôn trả { code, msg, data }. */
function installFakeAdsPower(options: { code?: number; msg?: string; data?: unknown } = {}) {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
      });

      return new Response(
        JSON.stringify({ code: options.code ?? 0, msg: options.msg ?? "success", data: options.data }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );

  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("AdsPowerAdapter.applyProxy", () => {
  it("POST /api/v1/user/update với user_proxy_config đúng dạng", async () => {
    const calls = installFakeAdsPower();

    await new AdsPowerAdapter(BASE_URL).applyProxy(PROFILE_ID, PROXY);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE_URL}/api/v1/user/update`);
    expect(calls[0].body).toEqual({
      user_id: PROFILE_ID,
      user_proxy_config: {
        // "other" = proxy tự nhập, không phải nhà cung cấp tích hợp sẵn của AdsPower.
        proxy_soft: "other",
        proxy_type: "http",
        proxy_host: "1.2.3.4",
        proxy_port: "8080",
        proxy_user: "user01",
        proxy_password: "mat-khau-proxy",
      },
    });
  });

  it("code khác 0 thì ném lỗi và không lộ mật khẩu proxy", async () => {
    installFakeAdsPower({ code: -1, msg: `sai tham số: ${PROXY.password}` });

    const error = await new AdsPowerAdapter(BASE_URL)
      .applyProxy(PROFILE_ID, PROXY)
      .catch((caught: Error) => caught);

    expect((error as Error).message).toContain("KHÔNG mở profile");
    expect((error as Error).message).not.toContain(PROXY.password);
  });

  it("giãn lời gọi liên tiếp cho khỏi vượt hạn mức 1 lời gọi/giây của AdsPower", async () => {
    vi.useFakeTimers();
    try {
      installFakeAdsPower({ data: { debug_port: "9222" } });
      const adapter = new AdsPowerAdapter(BASE_URL);

      await adapter.applyProxy(PROFILE_ID, PROXY);

      // Lời gọi thứ hai phải bị giữ lại; chỉ chạy tiếp khi đồng hồ nhảy đủ.
      let launched = false;
      const pending = adapter.launchProfile(PROFILE_ID).then(() => {
        launched = true;
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(launched).toBe(false);

      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(launched).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
