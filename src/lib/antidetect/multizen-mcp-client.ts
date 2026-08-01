/**
 * Client MCP tối giản cho MultiZen (JSON-RPC 2.0 qua Streamable HTTP).
 *
 * Chỉ cài đặt đúng 3 thứ cần dùng: initialize, tools/list, tools/call.
 * Không kéo SDK MCP đầy đủ vào vì ta chỉ gọi vài tool — YAGNI.
 *
 * Đối chiếu với README của MultiZen (multizenteam/multizen-browser, 26/07/2026):
 * server nghe ở 127.0.0.1:7777, Streamable HTTP ở /mcp, SSE cũ ở /sse, và
 * BẮT BUỘC có bearer token sinh ra ở lần chạy đầu (app: MCP → Connect an agent).
 */

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 30_000;

/** Streamable HTTP ở /mcp; giữ "/" phòng bản cũ phục vụ ngay gốc. */
const PATH_CANDIDATES = ["/mcp", "/"];

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

/** Ném khi server từ chối token — tách riêng để báo đúng nguyên nhân, không đổ tại "app chưa mở". */
export class McpUnauthorizedError extends McpClientError {
  constructor(baseUrl: string) {
    super(
      `MultiZen tại ${baseUrl} từ chối token (HTTP 401/403).\n` +
        `Mở app MultiZen → MCP → "Connect an agent", copy bearer token, ` +
        `rồi dán vào MULTIZEN_MCP_TOKEN trong .env.`,
    );
    this.name = "McpUnauthorizedError";
  }
}

export class MultizenMcpClient {
  private sessionId: string | null = null;
  private resolvedPath: string | null = null;
  private nextRequestId = 1;

  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  /** Gửi một lời gọi JSON-RPC, tự dò đường dẫn endpoint ở lần đầu. */
  private async send(method: string, params?: unknown): Promise<unknown> {
    const paths = this.resolvedPath ? [this.resolvedPath] : PATH_CANDIDATES;
    let lastError: unknown;

    for (const path of paths) {
      try {
        const result = await this.sendTo(path, method, params);
        this.resolvedPath = path;
        return result;
      } catch (error) {
        // Token sai thì đổi đường dẫn cũng vô ích — dừng ngay để báo đúng nguyên nhân.
        if (error instanceof McpUnauthorizedError) throw error;
        lastError = error;
      }
    }

    throw new McpClientError(
      `Không gọi được "${method}" trên MCP server tại ${this.baseUrl}.`,
      { cause: lastError },
    );
  }

  private async sendTo(path: string, method: string, params?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Streamable HTTP cho phép server trả về JSON thường hoặc luồng SSE.
      Accept: "application/json, text/event-stream",
    };
    // MultiZen bắt buộc bearer token; thiếu header này là mọi lời gọi ăn 401.
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const response = await fetch(`${this.baseUrl}${path}`, {
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
      throw new McpClientError(`MCP trả về HTTP ${response.status} tại ${path}.`);
    }

    const sessionHeader = response.headers.get("Mcp-Session-Id");
    if (sessionHeader) this.sessionId = sessionHeader;

    const bodyText = await response.text();
    const payload = parseJsonOrSse(bodyText);

    if (payload.error) {
      throw new McpClientError(`MCP lỗi ${payload.error.code}: ${payload.error.message}`);
    }
    return payload.result;
  }

  /** Bắt tay với server. Phải gọi trước mọi tool call. */
  async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mkttool-identity-vault", version: "0.1.0" },
    });
  }

  /** Danh sách tool server hỗ trợ — dùng để dò tên tool thật khi tài liệu không khớp. */
  async listTools(): Promise<string[]> {
    const result = (await this.send("tools/list")) as { tools?: { name: string }[] } | undefined;
    return (result?.tools ?? []).map((tool) => tool.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = (await this.send("tools/call", { name, arguments: args })) as McpToolResult;
    if (result?.isError) {
      throw new McpClientError(`Tool "${name}" báo lỗi: ${extractText(result)}`);
    }
    return result;
  }
}

/**
 * Streamable HTTP có thể trả JSON thuần hoặc SSE (`data: {...}`).
 * Hàm này nhận cả hai.
 */
function parseJsonOrSse(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed === "") return {};

  if (!trimmed.startsWith("data:")) {
    try {
      return JSON.parse(trimmed) as JsonRpcResponse;
    } catch (cause) {
      throw new McpClientError("MCP trả về nội dung không phải JSON hợp lệ.", { cause });
    }
  }

  // Lấy sự kiện SSE cuối cùng có dữ liệu.
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  const last = dataLines.at(-1);
  if (!last) throw new McpClientError("Luồng SSE từ MCP không chứa dữ liệu.");

  try {
    return JSON.parse(last) as JsonRpcResponse;
  } catch (cause) {
    throw new McpClientError("Dữ liệu SSE từ MCP không phải JSON hợp lệ.", { cause });
  }
}

/** Gom toàn bộ phần text trong kết quả tool thành một chuỗi. */
export function extractText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");
}
