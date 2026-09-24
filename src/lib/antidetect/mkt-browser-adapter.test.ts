import { afterEach, describe, expect, it, vi } from "vitest";
import { AntidetectError } from "./antidetect-browser-adapter";
import { MktBrowserAdapter } from "./mkt-browser-adapter";
import { MKT_BROWSER_DEFAULT_MCP_URL } from "./mkt-browser-contract";
import { MCP_MAX_RESPONSE_BYTES } from "./mkt-browser-mcp-client";

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

  it("does not re-handshake or retry a read cancelled by its caller", async () => {
    const methods: string[] = [];
    let markToolCallStarted!: () => void;
    const toolCallStarted = new Promise<void>((resolve) => {
      markToolCallStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as { id: number; method: string };
        methods.push(request.method);
        if (request.method === "tools/call") {
          markToolCallStarted();
          return new Promise<Response>((_resolve, reject) => {
            const signal = init.signal;
            if (signal?.aborted) {
              reject(new DOMException("Read cancelled", "AbortError"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Read cancelled", "AbortError")),
              { once: true },
            );
          });
        }
        const result = request.method === "tools/list"
          ? { tools: [{ name: "list_profiles" }] }
          : {};
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
          status: 200,
        });
      }),
    );
    const controller = new AbortController();
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    const read = adapter.listProfiles({ signal: controller.signal });
    await toolCallStarted;
    controller.abort();

    await expect(read).rejects.toMatchObject({ name: "McpReadCancelledError" });
    expect(methods).toEqual(["initialize", "tools/list", "tools/call"]);
  });

  it("does not adopt a session header from a cancelled profile read", async () => {
    const calls: { method: string; tool?: string; sessionId: string | null }[] = [];
    let resolveMutation!: () => void;
    let markMutationStarted!: () => void;
    let markReadBodyStarted!: () => void;
    const mutationStarted = new Promise<void>((resolve) => {
      markMutationStarted = resolve;
    });
    const readBodyStarted = new Promise<void>((resolve) => {
      markReadBodyStarted = resolve;
    });
    let listCalls = 0;
    let createCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as {
          id: number;
          method: string;
          params?: { name?: string };
        };
        const tool = request.params?.name;
        calls.push({
          method: request.method,
          ...(tool ? { tool } : {}),
          sessionId: new Headers(init.headers).get("Mcp-Session-Id"),
        });
        const response = (result: unknown) => new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result,
        }), {
          status: 200,
          headers: { "Mcp-Session-Id": "session-stable" },
        });

        if (request.method === "initialize") return response({});
        if (request.method === "tools/list") {
          return response({ tools: [{ name: "list_profiles" }, { name: "create_profile" }] });
        }
        if (tool === "list_profiles" && ++listCalls === 2) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "Mcp-Session-Id": "session-untrusted" }),
            text: () => new Promise<string>((_resolve, reject) => {
              markReadBodyStarted();
              const signal = init.signal;
              if (signal?.aborted) {
                reject(new DOMException("Read cancelled", "AbortError"));
                return;
              }
              signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Read cancelled", "AbortError")),
                { once: true },
              );
            }),
          } as Response;
        }
        if (tool === "create_profile" && ++createCalls === 1) {
          markMutationStarted();
          return new Promise<Response>((resolve) => {
            resolveMutation = () => resolve(new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: { content: [{ type: "text", text: JSON.stringify({ id: PROFILE_ID }) }] },
            }), { status: 200 }));
          });
        }
        if (tool === "create_profile") {
          return response({ content: [{ type: "text", text: JSON.stringify({ id: PROFILE_ID }) }] });
        }
        return response({ content: [{ type: "text", text: JSON.stringify({ profiles: [] }) }] });
      }),
    );
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");
    const controller = new AbortController();

    await expect(adapter.listProfiles()).resolves.toEqual([]);
    const mutation = adapter.createProfile({ name: "Profile during read" });
    await mutationStarted;
    const cancelledRead = adapter.listProfiles({ signal: controller.signal });
    await readBodyStarted;
    controller.abort();

    await expect(cancelledRead).rejects.toMatchObject({ name: "McpReadCancelledError" });
    resolveMutation();
    await expect(mutation).resolves.toEqual({ profileId: PROFILE_ID });
    await expect(adapter.createProfile({ name: "Profile after read" })).resolves.toEqual({
      profileId: PROFILE_ID,
    });

    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    expect(calls.filter((call) => call.tool === "create_profile").every(
      (call) => call.sessionId === "session-stable",
    )).toBe(true);
  });

  it("coalesces concurrent cold profile reads into one initialization", async () => {
    const calls = installFakeMcpServer({
      toolBodies: {
        list_profiles: { profiles: [] },
        list_fingerprint_options: { devices: [], locales: [] },
      },
    });
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    await expect(Promise.all([adapter.listProfiles(), adapter.fingerprintOptions()])).resolves.toEqual([
      [],
      { devices: [], locales: [] },
    ]);
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "tools/list")).toHaveLength(1);
  });

  it("keeps a shared cold handshake alive when one read is cancelled", async () => {
    let releaseInitialize!: () => void;
    let markInitializeStarted!: () => void;
    const initializeStarted = new Promise<void>((resolve) => {
      markInitializeStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as {
          id: number;
          method: string;
          params?: { name?: string };
        };
        if (request.method === "initialize") {
          markInitializeStarted();
          return new Promise<Response>((resolve) => {
            releaseInitialize = () => resolve(new Response(JSON.stringify({
              jsonrpc: "2.0", id: request.id, result: {},
            }), { status: 200 }));
          });
        }
        if (request.method === "tools/list") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              tools: [
                { name: "list_profiles" },
                { name: "list_fingerprint_options" },
                { name: "create_profile" },
              ],
            },
          }), { status: 200 });
        }
        const body = request.params?.name === "list_fingerprint_options"
          ? { devices: [], locales: [] }
          : request.params?.name === "create_profile"
            ? { id: PROFILE_ID }
            : { profiles: [] };
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: JSON.stringify(body) }] },
        }), { status: 200 });
      }),
    );
    const cancelled = new AbortController();
    const stillWaiting = new AbortController();
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    const cancelledRead = adapter.listProfiles({ signal: cancelled.signal });
    const survivingRead = adapter.fingerprintOptions({ signal: stillWaiting.signal });
    const mutation = adapter.createProfile({ name: "Manual profile" });
    await initializeStarted;
    cancelled.abort();

    await expect(cancelledRead).rejects.toMatchObject({ name: "McpReadCancelledError" });
    releaseInitialize();
    await expect(survivingRead).resolves.toEqual({ devices: [], locales: [] });
    await expect(mutation).resolves.toEqual({ profileId: PROFILE_ID });
  });

  it.each(["initialize", "tools/list"] as const)(
    "forgets a partial session when %s response-body reading is cancelled",
    async (cancelledMethod) => {
      const calls: { method: string; headers: Headers }[] = [];
      let markBodyStarted!: () => void;
      const bodyStarted = new Promise<void>((resolve) => {
        markBodyStarted = resolve;
      });
      let stall = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(init.body as string) as { id: number; method: string };
          const headers = new Headers(init.headers);
          calls.push({ method: request.method, headers });

          if (stall && request.method === cancelledMethod) {
            return {
              ok: true,
              status: 200,
              headers: new Headers({ "Mcp-Session-Id": `partial-${cancelledMethod}` }),
              text: () => new Promise<string>((_resolve, reject) => {
                markBodyStarted();
                const signal = init.signal;
                if (signal?.aborted) {
                  reject(new DOMException("Read cancelled", "AbortError"));
                  return;
                }
                signal?.addEventListener(
                  "abort",
                  () => reject(new DOMException("Read cancelled", "AbortError")),
                  { once: true },
                );
              }),
            } as Response;
          }

          const result = request.method === "tools/list"
            ? { tools: [{ name: "list_profiles" }] }
            : request.method === "tools/call"
              ? { content: [{ type: "text", text: JSON.stringify({ profiles: [] }) }] }
              : {};
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
            status: 200,
          });
        }),
      );
      const controller = new AbortController();
      const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

      const cancelledRead = adapter.listProfiles({ signal: controller.signal });
      await bodyStarted;
      controller.abort();
      await expect(cancelledRead).rejects.toMatchObject({ name: "McpReadCancelledError" });

      stall = false;
      await expect(adapter.listProfiles()).resolves.toEqual([]);
      const retryInitialize = calls.filter((call) => call.method === "initialize").at(-1);
      expect(retryInitialize?.headers.has("Mcp-Session-Id")).toBe(false);
    },
  );

  it.each([
    ["empty body", () => ""],
    ["empty object", () => "{}"],
    ["wrong response id", (id: number) => JSON.stringify({ jsonrpc: "2.0", id: id + 1, result: {} })],
    ["malformed SSE", () => "data: {not-json"],
  ] as Array<[string, (id: number) => string]>)(
    "does not adopt a session header from a %s MCP response",
    async (_label, malformedBody) => {
      const calls: Headers[] = [];
      let sendMalformedResponse = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(init.body as string) as {
            id: number;
            method: string;
            params?: { name?: string };
          };
          calls.push(new Headers(init.headers));
          if (sendMalformedResponse && request.method === "initialize") {
            sendMalformedResponse = false;
            return new Response(malformedBody(request.id), {
              status: 200,
              headers: { "Mcp-Session-Id": "session-poison" },
            });
          }

          const result = request.method === "tools/list"
            ? { tools: [{ name: "list_profiles" }, { name: "create_profile" }] }
            : request.method === "tools/call"
              ? { content: [{ type: "text", text: JSON.stringify({ id: PROFILE_ID }) }] }
              : {};
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
            status: 200,
            headers: { "Mcp-Session-Id": "session-stable" },
          });
        }),
      );
      const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

      await expect(adapter.listProfiles()).rejects.toThrow();
      await expect(adapter.createProfile({ name: "Fresh session" })).resolves.toEqual({ profileId: PROFILE_ID });
      expect(calls.every((headers) => headers.get("Mcp-Session-Id") !== "session-poison")).toBe(true);
    },
  );

  it("rejects an announced oversized MCP body before reading it", async () => {
    let bodyRead = false;
    let bodyCancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-length": String(MCP_MAX_RESPONSE_BYTES + 1),
          "Mcp-Session-Id": "session-poison",
        }),
        body: {
          getReader: () => {
            bodyRead = true;
            throw new Error("The announced oversized body must not be read.");
          },
          cancel: () => {
            bodyCancelled = true;
            return Promise.resolve();
          },
        } as unknown as ReadableStream<Uint8Array>,
        text: async () => "",
      }) as Response),
    );

    await expect(new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").listProfiles())
      .rejects.toThrow();
    expect(bodyRead).toBe(false);
    expect(bodyCancelled).toBe(true);
  });

  it.each([
    ["JSON", "{", undefined],
    ["SSE", "data: ", "1"],
  ] as const)(
    "rejects an oversized %s stream without adopting its session header",
    async (_kind, prefix, announcedSize) => {
      const calls: Headers[] = [];
      let bodyCancelled = false;
      let sendOversizedResponse = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(init.body as string) as {
            id: number;
            method: string;
            params?: { name?: string };
          };
          calls.push(new Headers(init.headers));
          if (sendOversizedResponse && request.method === "initialize") {
            sendOversizedResponse = false;
            const body = new TextEncoder().encode(prefix + "x".repeat(MCP_MAX_RESPONSE_BYTES));
            return {
              ok: true,
              status: 200,
              headers: new Headers({
                "Mcp-Session-Id": "session-poison",
                ...(announcedSize ? { "content-length": announcedSize } : {}),
              }),
              body: new ReadableStream<Uint8Array>({
                start: (controller) => controller.enqueue(body),
                cancel: () => { bodyCancelled = true; },
              }),
              text: async () => new TextDecoder().decode(body),
            } as Response;
          }

          const result = request.method === "tools/list"
            ? { tools: [{ name: "list_profiles" }, { name: "create_profile" }] }
            : { content: [{ type: "text", text: JSON.stringify({ id: PROFILE_ID }) }] };
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
            status: 200,
            headers: { "Mcp-Session-Id": "session-stable" },
          });
        }),
      );
      const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

      await expect(adapter.listProfiles()).rejects.toThrow();
      await expect(adapter.createProfile({ name: "Fresh session" })).resolves.toEqual({
        profileId: PROFILE_ID,
      });
      expect(bodyCancelled).toBe(true);
      expect(calls.every((headers) => headers.get("Mcp-Session-Id") !== "session-poison")).toBe(true);
    },
  );

  it("does not re-handshake or replay a mutation after an oversized MCP result", async () => {
    const calls: { method: string; tool?: string; headers: Headers }[] = [];
    let bodyCancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as {
          id: number;
          method: string;
          params?: { name?: string };
        };
        const tool = request.params?.name;
        calls.push({ method: request.method, ...(tool ? { tool } : {}), headers: new Headers(init.headers) });
        if (tool === "create_profile") {
          const body = new TextEncoder().encode(`{"id":"${"x".repeat(MCP_MAX_RESPONSE_BYTES)}"}`);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "Mcp-Session-Id": "session-poison" }),
            body: new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(body),
              cancel: () => { bodyCancelled = true; },
            }),
            text: async () => new TextDecoder().decode(body),
          } as Response;
        }

        const result = request.method === "tools/list"
          ? { tools: [{ name: "create_profile" }] }
          : {};
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
          status: 200,
        });
      }),
    );
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    await expect(adapter.createProfile({ name: "One attempt only" })).rejects.toThrow();
    expect(bodyCancelled).toBe(true);
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    expect(calls.filter((call) => call.tool === "create_profile")).toHaveLength(1);
    expect(calls.every((call) => call.headers.get("Mcp-Session-Id") !== "session-poison")).toBe(true);
  });

  it("starts a fresh handshake when the last bounded read is cancelled before a mutation", async () => {
    const calls: { method: string; headers: Headers }[] = [];
    let markFirstBodyStarted!: () => void;
    const firstBodyStarted = new Promise<void>((resolve) => {
      markFirstBodyStarted = resolve;
    });
    let firstInitialize = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as {
          id: number;
          method: string;
          params?: { name?: string };
        };
        calls.push({ method: request.method, headers: new Headers(init.headers) });
        if (firstInitialize && request.method === "initialize") {
          firstInitialize = false;
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            text: () => new Promise<string>((_resolve, reject) => {
              markFirstBodyStarted();
              const signal = init.signal;
              signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Read cancelled", "AbortError")),
                { once: true },
              );
            }),
          } as Response;
        }

        const result = request.method === "tools/list"
          ? { tools: [{ name: "list_profiles" }, { name: "create_profile" }] }
          : request.method === "tools/call"
            ? { content: [{ type: "text", text: JSON.stringify({ id: PROFILE_ID }) }] }
            : {};
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { status: 200 });
      }),
    );
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");
    const controller = new AbortController();

    const cancelledRead = adapter.listProfiles({ signal: controller.signal });
    await firstBodyStarted;
    controller.abort();
    const mutation = adapter.createProfile({ name: "Profile after cancelled read" });

    await expect(cancelledRead).rejects.toMatchObject({ name: "McpReadCancelledError" });
    await expect(mutation).resolves.toEqual({ profileId: PROFILE_ID });
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(2);
    expect(calls.at(-1)?.headers.get("Mcp-Session-Id")).not.toBe("session-poison");
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

  it.each([
    { body: {}, tool: "list_profiles", operation: "listProfiles" },
    { body: { profiles: [{ id: PROFILE_ID }] }, tool: "list_profiles", operation: "listProfiles" },
    {
      body: {
        devices: [],
        locales: [{ id: "en-US", label: "English", country: "us", timezones: [42] }],
      },
      tool: "list_fingerprint_options",
      operation: "fingerprintOptions",
    },
    {
      body: { devices: "not-an-array", locales: [] },
      tool: "list_fingerprint_options",
      operation: "fingerprintOptions",
    },
  ] as const)("rejects malformed $tool MCP payloads", async ({ body, tool, operation }) => {
    installFakeMcpServer({ toolBodies: { [tool]: body } });
    const adapter = new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t");

    const read = operation === "listProfiles" ? adapter.listProfiles() : adapter.fingerprintOptions();
    await expect(read).rejects.toBeInstanceOf(AntidetectError);
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

  it("keeps a real runtime-info read deadline distinct from an offline Browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const request = JSON.parse(init.body as string) as {
          id: number;
          method: string;
          params?: { name?: string };
        };
        if (request.method === "tools/call" && request.params?.name === "get_runtime_info") {
          return new Promise<Response>((_resolve, reject) => {
            const signal = init.signal;
            if (signal?.aborted) {
              reject(new DOMException("Timed out", "AbortError"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Timed out", "AbortError")),
              { once: true },
            );
          });
        }
        const result = request.method === "tools/list"
          ? { tools: [{ name: "get_runtime_info" }] }
          : {};
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
          status: 200,
        });
      }),
    );

    await expect(
      new MktBrowserAdapter(MKT_BROWSER_DEFAULT_MCP_URL, "t").observeRuntimeInfo(20),
    ).resolves.toEqual({ reachable: false, info: null, timedOut: true });
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
