import { afterEach, describe, expect, it, vi } from "vitest";
import { AntidetectError } from "./antidetect-browser-adapter";
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
  "launch_managed_profile",
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
    /** Contract-shaped failure body, as a build that speaks the error taxonomy would send. */
    failingToolCode?: string;
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
            {
              type: "text",
              text: options.failingToolCode
                ? JSON.stringify({
                    error: {
                      code: options.failingToolCode,
                      message: `Rejected: ${JSON.stringify(request.params?.arguments)}`,
                    },
                  })
                : `Rejected: ${JSON.stringify(request.params?.arguments)}`,
            },
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
  it("uses the atomic managed-launch tool when the desktop exposes it", async () => {
    const calls = installFakeMcpServer();
    await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").launchProfileWithProxy(
      PROFILE_ID,
      PROXY,
    );

    expect(argsOf(calls, "launch_managed_profile")).toEqual({
      profile_id: PROFILE_ID,
      proxy: {
        type: "socks5",
        host: "5.6.7.8",
        port: 1080,
        username: "test-user",
        password: "test-proxy-password",
      },
    });
    expect(calls.some((call) => call.params?.name === "update_profile")).toBe(false);
    expect(calls.some((call) => call.params?.name === "launch_profile")).toBe(false);
  });

  it("falls back to update then launch only when the atomic tool is absent", async () => {
    const calls = installFakeMcpServer({
      tools: REQUIRED_TOOLS.filter((tool) => tool !== "launch_managed_profile"),
    });
    await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").launchProfileWithProxy(
      PROFILE_ID,
      PROXY,
    );

    const toolCalls = calls
      .filter((call) => call.method === "tools/call")
      .map((call) => call.params?.name);
    expect(toolCalls).toEqual(["update_profile", "launch_profile"]);
  });

  it("does not fall back after an atomic launch rejection", async () => {
    const calls = installFakeMcpServer({
      failingTool: "launch_managed_profile",
      failingToolCode: "PROFILE_ALREADY_RUNNING",
    });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .launchProfileWithProxy(PROFILE_ID, PROXY)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AntidetectError);
    if (!(error instanceof AntidetectError)) throw new Error("Expected launch to fail.");
    expect(error.code).toBe("PROFILE_ALREADY_RUNNING");
    expect(error.message).not.toContain(PROXY.host);
    expect(error.message).not.toContain(PROXY.password);
    expect(calls.filter((call) => call.method === "tools/call")).toHaveLength(1);
  });

  it("drops unrecognized failure codes at the local Browser boundary", async () => {
    installFakeMcpServer({
      failingTool: "launch_managed_profile",
      failingToolCode: "cb_live_secret_key",
    });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .launchProfileWithProxy(PROFILE_ID, PROXY)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AntidetectError);
    if (!(error instanceof AntidetectError)) throw new Error("Expected launch to fail.");
    expect(error.code).toBeUndefined();
  });

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
    await expect(adapter.createProfile({ name: "Disposable" })).resolves.toEqual({
      profileId: PROFILE_ID,
    });
    await expect(adapter.isRunning(PROFILE_ID)).resolves.toBe(true);
  });

  it("passes managed correlation fields and accepts only the matching diagnostic", async () => {
    const diagnostic = {
      operationId: "operation-1",
      requestId: "request-1",
      stage: "complete",
      durationMs: 12,
      runtime: {
        appVersion: "0.3.1",
        contractVersion: 3,
        profileSchemaVersion: 2,
        engine: { kind: "cft", version: "148.0.0.0", status: "ready" },
      },
    };
    const calls = installFakeMcpServer({
      toolBodies: { create_profile: { id: PROFILE_ID, diagnostic } },
    });
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    await expect(
      adapter.createProfile({
        name: "Managed",
        externalRef: "account-1",
        requestId: "request-1",
        operationId: "operation-1",
      }),
    ).resolves.toEqual({ profileId: PROFILE_ID, diagnostic });
    expect(argsOf(calls, "create_profile")).toMatchObject({
      external_ref: "account-1",
      request_id: "request-1",
      operation_id: "operation-1",
    });
  });

  it("fails closed when MKT Browser returns an uncorrelated diagnostic", async () => {
    installFakeMcpServer({
      toolBodies: {
        create_profile: {
          id: PROFILE_ID,
          diagnostic: {
            operationId: "wrong-operation",
            requestId: "request-1",
            stage: "complete",
            durationMs: 1,
            runtime: {
              appVersion: "0.3.1",
              contractVersion: 3,
              profileSchemaVersion: 2,
              engine: { kind: "cft", version: null, status: "ready" },
            },
          },
        },
      },
    });
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    await expect(
      adapter.createProfile({
        name: "Managed",
        externalRef: "account-1",
        requestId: "request-1",
        operationId: "operation-1",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});

describe("MktBrowserAdapter runtime reporting", () => {
  const RUNTIME_TOOLS = [
    ...REQUIRED_TOOLS,
    "get_runtime_info",
    "refresh_license_capacity",
  ];

  it("reports what the device says about itself", async () => {
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        get_runtime_info: {
          provider: "mkt-browser",
          appVersion: "0.3.1",
          contractVersion: 1,
          profileSchemaVersion: 1,
          engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
          capabilities: ["profile-contract-v1", "runtime-info-v1"],
        },
      },
    });

    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toEqual({
      provider: "mkt-browser",
      appVersion: "0.3.1",
      contractVersion: 1,
      profileSchemaVersion: 1,
      engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
      capabilities: ["profile-contract-v1", "runtime-info-v1"],
      licenseCapacity: null,
    });
  });

  it("accepts a complete aggregate license-capacity report", async () => {
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        get_runtime_info: {
          provider: "mkt-browser",
          appVersion: "0.3.1",
          contractVersion: 1,
          profileSchemaVersion: 1,
          engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
          capabilities: ["profile-contract-v1", "runtime-info-v1", "license-capacity-v1"],
          licenseCapacity: {
            total: 4,
            free: 1,
            active: 1,
            pendingRecovery: 1,
            cooling: 1,
          },
        },
      },
    });

    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toMatchObject({
      licenseCapacity: {
        total: 4,
        free: 1,
        active: 1,
        pendingRecovery: 1,
        cooling: 1,
      },
    });
  });

  it("refreshes capacity without launching and returns only the sanitized aggregate", async () => {
    const calls = installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        refresh_license_capacity: {
          licenseCapacity: {
            total: 1,
            free: 1,
            active: 0,
            pendingRecovery: 0,
            cooling: 0,
            availability: "ready",
            reason: "CAPACITY_AVAILABLE",
            observedAt: "2026-09-21T05:00:00.000Z",
            freshUntil: "2026-09-21T05:00:05.000Z",
            vendorActive: 0,
            vendorLimit: 1,
            keyFingerprint: "private",
          },
        },
      },
    });

    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").refreshLicenseCapacity(),
    ).resolves.toEqual({
      total: 1,
      free: 1,
      active: 0,
      pendingRecovery: 0,
      cooling: 0,
      availability: "ready",
      reason: "CAPACITY_AVAILABLE",
      observedAt: "2026-09-21T05:00:00.000Z",
      freshUntil: "2026-09-21T05:00:05.000Z",
      vendorActive: 0,
      vendorLimit: 1,
    });
    expect(calls.some((call) => call.params?.name === "launch_profile")).toBe(false);
    expect(calls.some((call) => call.params?.name === "refresh_license_capacity")).toBe(true);
  });

  it("rejects malformed license-capacity counts without discarding runtime identity", async () => {
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        get_runtime_info: {
          provider: "mkt-browser",
          appVersion: "0.3.1",
          contractVersion: 1,
          profileSchemaVersion: 1,
          engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
          capabilities: ["profile-contract-v1", "runtime-info-v1", "license-capacity-v1"],
          licenseCapacity: {
            total: 3,
            free: 1,
            active: 1,
            pendingRecovery: 1,
            cooling: 1,
          },
        },
      },
    });

    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toMatchObject({ provider: "mkt-browser", licenseCapacity: null });
  });

  it("retains the aggregate retry time without a capability flag and strips private fields", async () => {
    const capacity = {
      total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1,
      retryAt: "2026-09-21T04:45:00.000Z",
    };
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        get_runtime_info: {
          provider: "mkt-browser", appVersion: "0.3.1", contractVersion: 4, profileSchemaVersion: 1,
          engine: { kind: "cloakbrowser", version: "151", status: "ready" },
          capabilities: ["runtime-info-v1"],
          licenseCapacity: { ...capacity, key: "private-key", leaseId: "private-lease" },
        },
      },
    });

    const runtime = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo();
    expect(runtime?.licenseCapacity).toEqual(capacity);
    expect(JSON.stringify(runtime)).not.toMatch(/private-key|private-lease/);
  });

  it("drops an invalid retry timestamp without echoing untrusted data", async () => {
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: {
        get_runtime_info: {
          provider: "mkt-browser", appVersion: "0.3.1", contractVersion: 4, profileSchemaVersion: 1,
          engine: { kind: "cloakbrowser", version: "151", status: "ready" },
          capabilities: [],
          licenseCapacity: {
            total: 1, free: 0, active: 0, pendingRecovery: 0, cooling: 1, retryAt: "private-key",
          },
        },
      },
    });

    const runtime = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo();
    expect(runtime).toMatchObject({ provider: "mkt-browser", licenseCapacity: null });
    expect(JSON.stringify(runtime)).not.toContain("private-key");
  });

  it("reports null for a build that predates the runtime tool", async () => {
    installFakeMcpServer({ tools: REQUIRED_TOOLS });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toBeNull();
  });

  it("treats a partial report as no report", async () => {
    // Half a report still looks authoritative. Accepting it would let a caller act on a version
    // number while the engine half is missing.
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      toolBodies: { get_runtime_info: { provider: "mkt-browser", appVersion: "0.3.1" } },
    });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toBeNull();
  });

  it("does not turn an unreachable device into a thrown health read", async () => {
    installFakeMcpServer({ tools: RUNTIME_TOOLS, failingTool: "get_runtime_info" });
    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").runtimeInfo(),
    ).resolves.toBeNull();
  });

  it("carries the machine-readable failure code out of a refused launch", async () => {
    installFakeMcpServer({
      tools: RUNTIME_TOOLS,
      failingTool: "launch_profile",
      failingToolCode: "ENGINE_UNAVAILABLE",
    });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .launchProfile(PROFILE_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AntidetectError);
    if (!(error instanceof AntidetectError)) throw new Error("Expected the launch to fail.");
    expect(error.code).toBe("ENGINE_UNAVAILABLE");
  });

  it("leaves the code undefined when a legacy build answers with a bare sentence", async () => {
    installFakeMcpServer({ tools: REQUIRED_TOOLS, failingTool: "launch_profile" });
    const error = await new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t")
      .launchProfile(PROFILE_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AntidetectError);
    if (!(error instanceof AntidetectError)) throw new Error("Expected the launch to fail.");
    expect(error.code).toBeUndefined();
  });
});
