/** Minimal JSON-RPC client for MKT Browser's Streamable HTTP MCP endpoint. */

import {
  isMktBrowserErrorCode,
  MKT_BROWSER_MCP_TOKEN_ENV,
} from "./mkt-browser-contract";

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 30_000;
const MCP_PATH = "/mcp";
/** MCP discovery and profile payloads are small; cap a hostile loopback peer before parsing. */
export const MCP_MAX_RESPONSE_BYTES = 1 * 1024 * 1024;

/** An absolute deadline keeps a read-only MCP sequence inside one Relay health budget. */
export type McpRequestDeadline = number | undefined;

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

/** A hostile or broken loopback peer exceeded the bounded MCP response allowance. */
export class McpResponseTooLargeError extends McpClientError {
  constructor() {
    super("MCP response exceeds the safety limit.");
    this.name = "McpResponseTooLargeError";
  }
}

/** A bounded observation ran out of time; it is not an authorization or mutation result. */
export class McpReadTimeoutError extends McpClientError {
  constructor() {
    super("The bounded MCP readiness observation timed out.");
    this.name = "McpReadTimeoutError";
  }
}

/** A sibling read ended this observation; it must not trigger a transport re-handshake. */
export class McpReadCancelledError extends McpClientError {
  constructor() {
    super("The bounded MCP readiness observation was cancelled.");
    this.name = "McpReadCancelledError";
  }
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
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
    readonly diagnostic?: unknown,
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
  return parseErrorBody(result).code;
}

export function extractErrorDiagnostic(result: McpToolResult): unknown {
  return parseErrorBody(result).diagnostic;
}

function parseErrorBody(result: McpToolResult): { code?: string; diagnostic?: unknown } {
  const text = extractText(result).trim();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return {};
    const error = (parsed as { error?: unknown }).error;
    if (!error || typeof error !== "object") return {};
    const code = (error as { code?: unknown }).code;
    return {
      ...(isMktBrowserErrorCode(code) ? { code } : {}),
      diagnostic: (parsed as { diagnostic?: unknown }).diagnostic,
    };
  } catch {
    return {};
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

  private async send(
    method: string,
    params?: unknown,
    deadline?: McpRequestDeadline,
    signal?: AbortSignal,
  ): Promise<unknown> {
    try {
      return await this.sendTo(method, params, deadline, signal);
    } catch (error) {
      if (
        error instanceof McpUnauthorizedError ||
        error instanceof McpReadTimeoutError ||
        error instanceof McpReadCancelledError ||
        error instanceof McpResponseTooLargeError
      ) {
        throw error;
      }
      throw new McpClientError(
        `MCP method "${method}" failed at ${this.baseUrl}${MCP_PATH}.`,
        { cause: error },
      );
    }
  }

  private async sendTo(
    method: string,
    params?: unknown,
    deadline?: McpRequestDeadline,
    externalSignal?: AbortSignal,
  ): Promise<unknown> {
    if (externalSignal?.aborted) throw new McpReadCancelledError();
    const timeoutSignal = AbortSignal.timeout(requestTimeout(deadline));
    const signal = externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    try {
      const requestId = this.nextRequestId++;
      const response = await fetch(`${this.baseUrl}${MCP_PATH}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method,
          ...(params !== undefined ? { params } : {}),
        }),
        signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new McpUnauthorizedError(this.baseUrl);
      }
      if (!response.ok) {
        throw new McpClientError(`MCP returned HTTP ${response.status} at ${MCP_PATH}.`);
      }

      const payload = parseJsonOrSse(await readMcpResponseBody(response), requestId);
      if (payload.error) {
        throw new McpClientError(`MCP error ${payload.error.code}: ${payload.error.message}`);
      }
      // A header from an aborted or malformed body is not an authenticated session transition.
      // Keeping it would let a cancelled readiness read poison the next profile mutation.
      const sessionHeader = response.headers.get("Mcp-Session-Id");
      if (sessionHeader) this.sessionId = sessionHeader;
      return payload.result;
    } catch (error) {
      if (externalSignal?.aborted) throw new McpReadCancelledError();
      if (timeoutSignal.aborted) throw new McpReadTimeoutError();
      throw error;
    }
  }

  /** Forget a stale session after the desktop process restarts. */
  resetSession(): void {
    this.sessionId = null;
  }

  async initialize(deadline?: McpRequestDeadline, signal?: AbortSignal): Promise<void> {
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mkttool-relay", version: "1.0.0" },
    }, deadline, signal);
  }

  async listTools(deadline?: McpRequestDeadline, signal?: AbortSignal): Promise<string[]> {
    const result = (await this.send("tools/list", undefined, deadline, signal)) as {
      tools?: { name: string }[];
    } | undefined;
    return (result?.tools ?? []).map((tool) => tool.name);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    deadline?: McpRequestDeadline,
    signal?: AbortSignal,
  ): Promise<McpToolResult> {
    const result = (await this.send("tools/call", { name, arguments: args }, deadline, signal)) as McpToolResult;
    if (result?.isError) {
      throw new McpToolError(
        `Tool "${name}" failed: ${extractText(result)}`,
        extractErrorCode(result),
        extractErrorDiagnostic(result),
      );
    }
    return result;
  }
}

function requestTimeout(deadline: McpRequestDeadline): number {
  if (deadline === undefined) return REQUEST_TIMEOUT_MS;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new McpReadTimeoutError();
  return Math.min(REQUEST_TIMEOUT_MS, Math.max(1, Math.ceil(remaining)));
}

async function readMcpResponseBody(response: Response): Promise<string> {
  const announcedSize = parseResponseLength(response.headers.get("content-length"));
  if (announcedSize !== null && announcedSize > MCP_MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new McpResponseTooLargeError();
  }

  // Native fetch responses have a stream. The fallback retains compatibility with narrow test
  // doubles and a genuinely body-less response, neither of which can stream unbounded bytes.
  if (!response.body) return await response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let receivedBytes = 0;
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (!value) continue;
      receivedBytes += value.byteLength;
      if (receivedBytes > MCP_MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new McpResponseTooLargeError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    if (!completed) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  return chunks.join("") + decoder.decode();
}

function parseResponseLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

/** Streamable HTTP may return a JSON body or a short SSE response. */
function parseJsonOrSse(body: string, requestId: number): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed === "") throw new McpClientError("MCP returned an empty JSON-RPC response.");

  if (!trimmed.startsWith("data:")) {
    try {
      return validateJsonRpcResponse(JSON.parse(trimmed) as unknown, requestId);
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
    return validateJsonRpcResponse(JSON.parse(last) as unknown, requestId);
  } catch (cause) {
    throw new McpClientError("The MCP SSE response contained invalid JSON.", { cause });
  }
}

function validateJsonRpcResponse(value: unknown, requestId: number): JsonRpcResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpClientError("MCP returned an invalid JSON-RPC response.");
  }

  const response = value as Record<string, unknown>;
  const hasResult = Object.hasOwn(response, "result");
  const hasError = Object.hasOwn(response, "error");
  if (
    response.jsonrpc !== "2.0" ||
    response.id !== requestId ||
    hasResult === hasError
  ) {
    throw new McpClientError("MCP returned an uncorrelated JSON-RPC response.");
  }

  if (!hasError) {
    return { jsonrpc: "2.0", id: requestId, result: response.result };
  }

  const error = response.error;
  if (
    !error ||
    typeof error !== "object" ||
    Array.isArray(error) ||
    typeof (error as { code?: unknown }).code !== "number" ||
    typeof (error as { message?: unknown }).message !== "string"
  ) {
    throw new McpClientError("MCP returned an invalid JSON-RPC error.");
  }

  return {
    jsonrpc: "2.0",
    id: requestId,
    error: {
      code: (error as { code: number }).code,
      message: (error as { message: string }).message,
    },
  };
}

export function extractText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}
