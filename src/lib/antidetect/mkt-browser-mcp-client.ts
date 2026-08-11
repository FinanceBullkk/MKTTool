/** Minimal JSON-RPC client for MKT Browser's Streamable HTTP MCP endpoint. */

import { MKT_BROWSER_MCP_TOKEN_ENV } from "./mkt-browser-contract";

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 30_000;
const MCP_PATH = "/mcp";

export interface McpToolResultContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpToolResult {
  content?: McpToolResultContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export class McpClientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "McpClientError";
  }
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

/** A tool-level failure means the MCP session remains valid and must not be replayed. */
export class McpToolError extends McpClientError {
  constructor(
    message: string,
    /**
     * The desktop's machine-readable failure code when it sent one. Older builds answer with a
     * bare sentence, so this stays optional — but callers must branch on it rather than on the
     * message whenever it is present.
     */
    readonly code?: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

/**
 * Read the stable error code out of a failed tool result. The desktop wraps it as
 * `{"error":{"code":…,"message":…}}`; anything else is a legacy or non-conforming build.
 */
export function extractErrorCode(result: McpToolResult): string | undefined {
  const text = extractText(result).trim();
  if (text === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return undefined;
    const error = (parsed as { error?: unknown }).error;
    if (!error || typeof error !== "object") return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && code !== "" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** Authentication failures need a specific recovery instruction, not an availability error. */
export class McpUnauthorizedError extends McpClientError {
  constructor(baseUrl: string) {
    super(
      `MKT Browser at ${baseUrl} rejected the bearer token (HTTP 401/403). ` +
        `Open MKT Browser, choose MCP → Connect an agent, and copy the token into ` +
        `${MKT_BROWSER_MCP_TOKEN_ENV}.`,
    );
    this.name = "McpUnauthorizedError";
  }
}

export class MktBrowserMcpClient {
  private sessionId: string | null = null;
  private nextRequestId = 1;

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  private async send(method: string, params?: unknown): Promise<unknown> {
    try {
      return await this.sendTo(method, params);
    } catch (error) {
      if (error instanceof McpUnauthorizedError) throw error;
      throw new McpClientError(
        `MCP method "${method}" failed at ${this.baseUrl}${MCP_PATH}.`,
        { cause: error },
      );
    }
  }

  private async sendTo(method: string, params?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const response = await fetch(`${this.baseUrl}${MCP_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method,
        ...(params !== undefined ? { params } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      throw new McpUnauthorizedError(this.baseUrl);
    }
    if (!response.ok) {
      throw new McpClientError(`MCP returned HTTP ${response.status} at ${MCP_PATH}.`);
    }

    const sessionHeader = response.headers.get("Mcp-Session-Id");
    if (sessionHeader) this.sessionId = sessionHeader;

    const payload = parseJsonOrSse(await response.text());
    if (payload.error) {
      throw new McpClientError(`MCP error ${payload.error.code}: ${payload.error.message}`);
    }
    return payload.result;
  }

  /** Forget a stale session after the desktop process restarts. */
  resetSession(): void {
    this.sessionId = null;
  }

  async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mkttool-relay", version: "1.0.0" },
    });
  }

  async listTools(): Promise<string[]> {
    const result = (await this.send("tools/list")) as { tools?: { name: string }[] } | undefined;
    return (result?.tools ?? []).map((tool) => tool.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = (await this.send("tools/call", { name, arguments: args })) as McpToolResult;
    if (result?.isError) {
      throw new McpToolError(
        `Tool "${name}" failed: ${extractText(result)}`,
        extractErrorCode(result),
      );
    }
    return result;
  }
}

/** Streamable HTTP may return a JSON body or a short SSE response. */
function parseJsonOrSse(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed === "") return {};

  if (!trimmed.startsWith("data:")) {
    try {
      return JSON.parse(trimmed) as JsonRpcResponse;
    } catch (cause) {
      throw new McpClientError("MCP returned invalid JSON.", { cause });
    }
  }

  const last = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .at(-1);
  if (!last) throw new McpClientError("The MCP SSE response did not contain data.");

  try {
    return JSON.parse(last) as JsonRpcResponse;
  } catch (cause) {
    throw new McpClientError("The MCP SSE response contained invalid JSON.", { cause });
  }
}

export function extractText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}
