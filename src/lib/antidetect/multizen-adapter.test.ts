import { afterEach, describe, expect, it, vi } from "vitest";
import { MultizenAdapter } from "./multizen-adapter";

const BASE_URL = "http://127.0.0.1:7777";
const PROFILE_ID = "profile-abc";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

const PROXY = {
  protocol: "socks5",
  host: "5.6.7.8",
  port: 1080,
  username: "user01",
  password: "mat-khau-proxy",
} as const;

/** Lấy đối số của lời gọi tools/call đầu tiên tới tool có tên cho trước. */
function argsOf(calls: RecordedCall[], toolName: string): Record<string, unknown> {
  const call = calls.find((item) => item.method === "tools/call" && item.params?.name === toolName);
  if (!call) throw new Error(`Không thấy lời gọi tool "${toolName}".`);
  return call.params?.arguments ?? {};
}

/**
 * Giả lập MCP server của MultiZen: initialize -> tools/list -> tools/call.
 * Trả về danh sách lời gọi để kiểm tra header gửi đi.
 */
function installFakeMcpServer(
  options: { status?: number; tools?: string[]; launchText?: string; failingTool?: string } = {},
) {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as {
        id: number;
        method: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      calls.push({
        url,
        method: body.method,
        headers: init.headers as Record<string, string>,
        params: body.params,
      });

      if (options.status && options.status !== 200) {
        return new Response("từ chối", { status: options.status });
      }

      const isFailingTool =
        body.method === "tools/call" && body.params?.name === options.failingTool;

      const result = isFailingTool
        ? {
            isError: true,
            // Cố tình vọng lại tham số đã gửi — MCP thật cũng hay làm vậy.
            content: [{ type: "text", text: `Từ chối: ${JSON.stringify(body.params?.arguments)}` }],
          }
        : body.method === "tools/list"
          ? {
              tools: (options.tools ?? ["launch_profile", "close_profile", "update_profile"]).map(
                (name) => ({ name }),
              ),
            }
          : body.method === "tools/call"
            ? { content: [{ type: "text", text: options.launchText ?? "Profile đã mở." }] }
            : {};

      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("MultizenAdapter", () => {
  it("gửi bearer token — thiếu header này MultiZen trả 401", async () => {
    const calls = installFakeMcpServer();

    await new MultizenAdapter(BASE_URL, "token-bi-mat").launchProfile(PROFILE_ID);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.headers.Authorization).toBe("Bearer token-bi-mat");
    }
  });

  it("gọi đúng endpoint /mcp", async () => {
    const calls = installFakeMcpServer();
    await new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID);
    expect(calls[0].url).toBe(`${BASE_URL}/mcp`);
  });

  it("mở profile THÀNH CÔNG dù phản hồi không có endpoint CDP", async () => {
    // MultiZen lái trình duyệt bằng tool MCP của nó, không phơi CDP ra ngoài.
    // Trước đây adapter coi đây là lỗi và khuyên chuyển AdsPower — sai.
    installFakeMcpServer({ launchText: "Đã mở profile, không có thông tin nào khác." });

    const launched = await new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID);

    expect(launched.profileId).toBe(PROFILE_ID);
    expect(launched.cdpEndpoint).toBeUndefined();
  });

  it("vẫn bắt được endpoint CDP nếu bản MultiZen nào đó có trả về", async () => {
    installFakeMcpServer({ launchText: "CDP tại ws://127.0.0.1:41234/devtools/browser/xyz" });

    const launched = await new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID);

    expect(launched.cdpEndpoint).toBe("ws://127.0.0.1:41234/devtools/browser/xyz");
  });

  it("dùng được tool tên launch_profile theo README", async () => {
    installFakeMcpServer({ tools: ["list_profiles", "launch_profile", "close_profile"] });
    await expect(new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID)).resolves.toBeTruthy();
  });

  it("không có tool mở profile nào thì báo rõ tool hiện có", async () => {
    installFakeMcpServer({ tools: ["navigate", "click"] });
    await expect(new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID)).rejects.toThrow(
      /navigate, click/,
    );
  });

  it("401 báo thiếu token, KHÔNG đổ tại app chưa mở", async () => {
    installFakeMcpServer({ status: 401 });

    const error = await new MultizenAdapter(BASE_URL, "token-sai")
      .launchProfile(PROFILE_ID)
      .catch((caught: Error) => caught);

    expect((error as Error).message).toContain("MULTIZEN_MCP_TOKEN");
    expect((error as Error).message).not.toContain("đã mở chưa");
  });

  it("app chưa chạy thì vẫn báo đúng là không kết nối được", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    await expect(new MultizenAdapter(BASE_URL, "t").launchProfile(PROFILE_ID)).rejects.toThrow(
      /Không kết nối được/,
    );
  });

  it("isAvailable trả false thay vì ném lỗi khi app chưa chạy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    await expect(new MultizenAdapter(BASE_URL, "t").isAvailable()).resolves.toBe(false);
  });
});

describe("MultizenAdapter.applyProxy", () => {
  it("gửi object proxy đúng dạng MultiZen chờ đợi", async () => {
    const calls = installFakeMcpServer();

    await new MultizenAdapter(BASE_URL, "t").applyProxy(PROFILE_ID, PROXY);

    const args = argsOf(calls, "update_profile");
    // `type` bên MultiZen là GIAO THỨC, không phải cách mua proxy.
    expect(args.proxy).toEqual({
      type: "socks5",
      host: "5.6.7.8",
      port: 1080,
      username: "user01",
      password: "mat-khau-proxy",
    });
    expect(args.profile_id).toBe(PROFILE_ID);
  });

  it("proxy không cần xác thực thì bỏ hẳn username/password", async () => {
    const calls = installFakeMcpServer();

    await new MultizenAdapter(BASE_URL, "t").applyProxy(PROFILE_ID, {
      protocol: "http",
      host: "1.2.3.4",
      port: 8080,
    });

    expect(argsOf(calls, "update_profile").proxy).toEqual({
      type: "http",
      host: "1.2.3.4",
      port: 8080,
    });
  });

  it("thiếu tool cập nhật thì ném lỗi — không được im lặng bỏ qua proxy", async () => {
    installFakeMcpServer({ tools: ["launch_profile", "close_profile"] });

    await expect(new MultizenAdapter(BASE_URL, "t").applyProxy(PROFILE_ID, PROXY)).rejects.toThrow(
      /KHÔNG mở profile/,
    );
  });

  it("tool báo lỗi thì KHÔNG để mật khẩu proxy lọt vào thông báo", async () => {
    installFakeMcpServer({ failingTool: "update_profile" });

    const error = await new MultizenAdapter(BASE_URL, "t")
      .applyProxy(PROFILE_ID, PROXY)
      .catch((caught: Error) => caught);

    expect((error as Error).message).not.toContain(PROXY.password);
    expect((error as Error).message).toContain("KHÔNG mở profile");
  });
});
