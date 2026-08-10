import { afterEach, describe, expect, it, vi } from "vitest";
import { MktBrowserAdapter } from "./mkt-browser-adapter";
import { MKT_BROWSER_DEFAULT_MCP_URL } from "./mkt-browser-contract";

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
  username: "test-user",
  password: "test-proxy-password",
} as const;

const REQUIRED_TOOLS = [
  "launch_profile",
  "close_profile",
  "list_profiles",
  "update_profile",
  "create_profile",
  "list_fingerprint_options",
];

function argsOf(calls: RecordedCall[], toolName: string): Record<string, unknown> {
  const call = calls.find((item) => item.method === "tools/call" && item.params?.name === toolName);
  if (!call) throw new Error(`Tool "${toolName}" was not called.`);
  return call.params?.arguments ?? {};
}

function installFakeMcpServer(
  options: {
    status?: number;
    tools?: string[];
    launchText?: string;
    failingTool?: string;
    toolBodies?: Record<string, unknown>;
  } = {},
): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string) as {
        id: number;
        method: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      calls.push({
        url,
        method: request.method,
        headers: init.headers as Record<string, string>,
        params: request.params,
      });

      if (options.status && options.status !== 200) {
        return new Response("rejected", { status: options.status });
      }

      const toolName = request.params?.name;
      const isFailingTool = request.method === "tools/call" && toolName === options.failingTool;
      let result: unknown;
      if (isFailingTool) {
        result = {
          isError: true,
          content: [
            { type: "text", text: `Rejected: ${JSON.stringify(request.params?.arguments)}` },
          ],
        };
      } else if (request.method === "tools/list") {
        result = { tools: (options.tools ?? REQUIRED_TOOLS).map((name) => ({ name })) };
      } else if (request.method === "tools/call") {
        const body = toolName ? options.toolBodies?.[toolName] : undefined;
        result = {
          content: [
            {
              type: "text",
              text:
                body === undefined
                  ? (options.launchText ?? "Profile opened.")
                  : JSON.stringify(body),
            },
          ],
        };
      } else {
        result = {};
      }

      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("MktBrowserAdapter contract", () => {
  it("uses the dedicated default endpoint and bearer token", async () => {
    const calls = installFakeMcpServer();
    await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "test-token").launchProfile(
      PROFILE_ID,
    );

    expect(calls[0].url).toBe(`${MKT_BROWSER_DEFAULT_MCP_URL}/mcp`);
    expect(calls.every((call) => call.headers.Authorization === "Bearer test-token")).toBe(true);
  });

  it("accepts a successful launch without a public CDP endpoint", async () => {
    installFakeMcpServer({ launchText: "Profile opened." });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").launchProfile(PROFILE_ID),
    ).resolves.toEqual({ profileId: PROFILE_ID, cdpEndpoint: undefined });
  });

  it("captures a CDP endpoint when one is returned", async () => {
    installFakeMcpServer({
      launchText: "CDP at ws://127.0.0.1:41234/devtools/browser/example",
    });
    const launched = await new MktBrowserAdapter(
      MKT_BROWSER_DEFAULT_MCP_URL,
      "t",
    ).launchProfile(PROFILE_ID);
    expect(launched.cdpEndpoint).toBe("ws://127.0.0.1:41234/devtools/browser/example");
  });

  it("requires the exact MKT Browser tool name without legacy aliases", async () => {
    installFakeMcpServer({ tools: ["launch", "open_profile"] });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").launchProfile(PROFILE_ID),
    ).rejects.toThrow(/launch_profile/);
  });

  it("reports token rejection separately from application availability", async () => {
    installFakeMcpServer({ status: 401 });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "bad-token")
      .launchProfile(PROFILE_ID)
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected launch to fail.");
    expect(error.message).toContain("MKT_BROWSER_MCP_TOKEN");
    expect(error.message).toContain("rejected the bearer token");
  });

  it("reports an unavailable application and makes isAvailable fail closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");
    await expect(adapter.launchProfile(PROFILE_ID)).rejects.toThrow(/Could not connect/);
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it("re-handshakes once after a stale transport session", async () => {
    let toolCallsSeen = 0;
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as { id: number; method: string };
        methods.push(request.method);
        if (request.method === "tools/call" && ++toolCallsSeen === 1) {
          return new Response("stale session", { status: 404 });
        }
        const result =
          request.method === "tools/list"
            ? { tools: [{ name: "launch_profile" }] }
            : { content: [{ type: "text", text: "Profile opened." }] };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
          status: 200,
        });
      }),
    );

    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");
    await expect(adapter.launchProfile(PROFILE_ID)).resolves.toMatchObject({ profileId: PROFILE_ID });
    expect(methods.filter((method) => method === "initialize")).toHaveLength(2);
    expect(toolCallsSeen).toBe(2);
  });

  it("does not replay a tool-level failure", async () => {
    const calls = installFakeMcpServer({ failingTool: "launch_profile" });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").launchProfile(PROFILE_ID),
    ).rejects.toThrow();
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "tools/call")).toHaveLength(1);
  });
});

describe("MktBrowserAdapter profile operations", () => {
  it("sends the exact proxy payload and snake_case profile id", async () => {
    const calls = installFakeMcpServer();
    await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").applyProxy(PROFILE_ID, PROXY);
    const args = argsOf(calls, "update_profile");
    expect(args).toEqual({
      profile_id: PROFILE_ID,
      proxy: {
        type: "socks5",
        host: "5.6.7.8",
        port: 1080,
        username: "test-user",
        password: "test-proxy-password",
      },
    });
  });

  it("omits absent proxy credentials", async () => {
    const calls = installFakeMcpServer();
    await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").applyProxy(PROFILE_ID, {
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

  it("fails closed when the proxy tool is missing", async () => {
    installFakeMcpServer({ tools: ["launch_profile"] });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").applyProxy(PROFILE_ID, PROXY),
    ).rejects.toThrow(/update_profile/);
  });

  it("redacts proxy host and credentials echoed by the MCP tool", async () => {
    installFakeMcpServer({ failingTool: "update_profile" });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .applyProxy(PROFILE_ID, PROXY)
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected proxy update to fail.");
    expect(error.message).not.toContain(PROXY.host);
    expect(error.message).not.toContain(PROXY.username);
    expect(error.message).not.toContain(PROXY.password);
    expect(error.message).toContain("was not launched");
  });

  it("redacts proxy details when profile creation fails", async () => {
    installFakeMcpServer({ failingTool: "create_profile" });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .createProfile({ name: "Disposable", proxy: PROXY })
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected profile creation to fail.");
    expect(error.message).not.toContain(PROXY.host);
    expect(error.message).not.toContain(PROXY.username);
    expect(error.message).not.toContain(PROXY.password);
  });

  it("fully redacts overlapping proxy values without leaking credential suffixes", async () => {
    installFakeMcpServer({ failingTool: "update_profile" });
    const overlappingProxy = {
      protocol: "http" as const,
      host: "shared",
      port: 8080,
      username: "shared-user",
      password: "shared-user-password",
    };
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .applyProxy(PROFILE_ID, overlappingProxy)
      .catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected proxy update to fail.");
    expect(error.message).not.toContain(overlappingProxy.host);
    expect(error.message).not.toContain(overlappingProxy.username);
    expect(error.message).not.toContain(overlappingProxy.password);
    expect(error.message).not.toContain("***-user");
    expect(error.message).not.toContain("***-user-password");
  });

  it("lists profiles, fingerprint options, and creates a profile", async () => {
    installFakeMcpServer({
      toolBodies: {
        list_profiles: {
          profiles: [{ id: PROFILE_ID, name: "Disposable", isRunning: true }],
        },
        list_fingerprint_options: {
          devices: [{ family: "windows-laptop-amd", label: "Windows laptop", screens: [] }],
          locales: [{ id: "en-US", label: "English", country: "us", timezones: [] }],
        },
        create_profile: { id: PROFILE_ID },
      },
    });
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    await expect(adapter.listProfiles()).resolves.toEqual([
      { id: PROFILE_ID, name: "Disposable", isRunning: true },
    ]);
    await expect(adapter.fingerprintOptions()).resolves.toMatchObject({
      devices: [{ family: "windows-laptop-amd" }],
      locales: [{ id: "en-US" }],
    });
    await expect(adapter.createProfile({ name: "Disposable" })).resolves.toBe(PROFILE_ID);
    await expect(adapter.isRunning(PROFILE_ID)).resolves.toBe(true);
  });
});
