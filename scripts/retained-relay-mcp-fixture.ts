import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const MAX_REQUEST_BYTES = 64 * 1024;
const REQUIRED_TOOLS = ["list_profiles", "list_fingerprint_options", "create_profile"] as const;
const EXPECTED_PRE_DOWNLOAD_TOOL_FLOW = [
  "list_profiles",
  "list_fingerprint_options",
  "create_profile",
  "list_profiles",
] as const;
const EXPECTED_STAGED_UPDATE_TOOL_FLOW = [
  ...EXPECTED_PRE_DOWNLOAD_TOOL_FLOW,
  "list_profiles",
] as const;
type RequiredTool = (typeof REQUIRED_TOOLS)[number];

export interface RetainedRelayMcpFixture {
  readonly origin: string;
  readonly token: string;
  resetObservation(): void;
  assertSingleCompatibilityUpdateFlow(staged: boolean): void;
  close(): Promise<void>;
}

/** A loopback-only MCP endpoint for the retained Relay compatibility smoke profile. */
export async function startRetainedRelayMcpFixture(): Promise<RetainedRelayMcpFixture> {
  const token = randomBytes(32).toString("hex");
  const sessionId = randomUUID();
  const calls: RequiredTool[] = [];
  let initialized = false;
  const server = createServer((request, response) => {
    void handleRequest(request, response, { token, sessionId, calls, initialized: () => initialized, markInitialized: () => {
      initialized = true;
    } });
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await close(server);
    throw new Error("The retained Relay MCP fixture did not bind a loopback port.");
  }

  return {
    origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
    token,
    resetObservation: () => {
      calls.length = 0;
    },
    assertSingleCompatibilityUpdateFlow: (staged) => {
      // A successful download performs two additional open-profile guards before staging.
      const expected = staged ? EXPECTED_STAGED_UPDATE_TOOL_FLOW : EXPECTED_PRE_DOWNLOAD_TOOL_FLOW;
      if (
        calls.length !== expected.length ||
        calls.some((name, index) => name !== expected[index])
      ) {
        throw new Error(
          `The retained Relay did not follow the one-attempt MCP smoke-profile flow (observed: ${calls.join(",")}).`,
        );
      }
    },
    close: () => close(server),
  };
}

interface FixtureState {
  token: string;
  sessionId: string;
  calls: RequiredTool[];
  initialized(): boolean;
  markInitialized(): void;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: FixtureState,
): Promise<void> {
  if (request.method !== "POST" || request.url !== "/mcp") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.authorization !== `Bearer ${state.token}`) {
    response.writeHead(401).end();
    return;
  }

  let message: { id?: unknown; method?: unknown; params?: unknown };
  try {
    message = JSON.parse(await readRequestBody(request)) as { id?: unknown; method?: unknown; params?: unknown };
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (typeof message.id !== "number" || typeof message.method !== "string") {
    response.writeHead(400).end();
    return;
  }

  if (message.method === "initialize") {
    state.markInitialized();
    send(response, message.id, { protocolVersion: "2025-06-18", capabilities: {} }, state.sessionId);
    return;
  }
  if (!state.initialized() || request.headers["mcp-session-id"] !== state.sessionId) {
    response.writeHead(400).end();
    return;
  }
  if (message.method === "tools/list") {
    send(response, message.id, { tools: REQUIRED_TOOLS.map((name) => ({ name })) });
    return;
  }
  if (message.method !== "tools/call") {
    send(response, message.id, undefined, undefined, { code: -32601, message: "Method not found" });
    return;
  }

  const params = message.params as { name?: unknown; arguments?: unknown } | undefined;
  const toolName = params?.name;
  if (typeof toolName !== "string" || !REQUIRED_TOOLS.includes(toolName as (typeof REQUIRED_TOOLS)[number])) {
    send(response, message.id, undefined, undefined, { code: -32601, message: "Tool not found" });
    return;
  }
  const typedToolName = toolName as RequiredTool;
  state.calls.push(typedToolName);
  const body = toolResult(typedToolName, params?.arguments);
  send(response, message.id, { content: [{ type: "text", text: JSON.stringify(body) }] });
}

function toolResult(name: RequiredTool, argumentsValue: unknown): Record<string, unknown> {
  if (name === "list_profiles") return { profiles: [] };
  if (name === "list_fingerprint_options") {
    return {
      devices: [
        {
          family: "windows-desktop-fixture",
          label: "Windows desktop fixture",
          screens: [{ width: 1920, height: 1080 }],
        },
      ],
      locales: [
        {
          id: "en-US",
          label: "English (United States)",
          country: "US",
          timezones: ["America/New_York"],
        },
      ],
    };
  }
  const argumentsRecord = argumentsValue && typeof argumentsValue === "object"
    ? argumentsValue as Record<string, unknown>
    : {};
  const operationId = typeof argumentsRecord.operation_id === "string" ? argumentsRecord.operation_id : "";
  const requestId = typeof argumentsRecord.request_id === "string" ? argumentsRecord.request_id : "";
  return {
    id: "retained-relay-tls-smoke-profile",
    diagnostic: {
      operationId,
      requestId,
      stage: "created",
      durationMs: 1,
      runtime: {
        appVersion: "0.0.0-fixture",
        contractVersion: 6,
        profileSchemaVersion: 3,
        engine: { kind: "fixture-engine", version: "fixture", status: "ready" },
      },
    },
  };
}

function send(
  response: ServerResponse,
  id: number,
  result?: unknown,
  sessionId?: string,
  error?: { code: number; message: string },
): void {
  response.writeHead(200, {
    "content-type": "application/json",
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  });
  response.end(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }));
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("MCP fixture request is too large.");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
