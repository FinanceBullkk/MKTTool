/**
 * Adapter MultiZen qua MCP server cục bộ (mặc định 127.0.0.1:7777).
 *
 * ĐÃ GIẢI XONG câu hỏi chặn đường của Phase 00 (đối chiếu README của
 * multizenteam/multizen-browser, 26/07/2026):
 *
 * MultiZen dùng CDP ở BÊN TRONG (chrome-remote-interface) và KHÔNG công bố endpoint
 * CDP ra ngoài. Đổi lại, nó phơi thẳng bộ tool điều khiển trình duyệt qua MCP —
 * navigate, click, type, extract, screenshot. Nên Phase 05 KHÔNG cần Playwright,
 * cũng KHÔNG cần chuyển sang AdsPower: gọi tool MCP là đủ, lại được thêm human
 * handoff (người vào tay khi gặp 2FA/CAPTCHA) và mô phỏng hành vi người ở tầng CDP.
 *
 * Vì vậy `launchProfile` KHÔNG coi việc thiếu endpoint CDP là lỗi — profile mở ra
 * là thành công. Chỉ AdsPower mới trả về endpoint đó.
 */
import {
  type AntidetectAdapter,
  AntidetectError,
  AntidetectUnavailableError,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";
import { McpUnauthorizedError, MultizenMcpClient, extractText } from "./multizen-mcp-client";

const PROVIDER = "MultiZen";

/** README công bố `launch_profile`/`close_profile`/`list_profiles`; giữ tên khác phòng bản cũ. */
const LAUNCH_TOOL_NAMES = ["launch_profile", "launch", "open_profile"];
const CLOSE_TOOL_NAMES = ["close_profile", "close", "stop_profile"];
const LIST_TOOL_NAMES = ["list_profiles", "profiles"];

/**
 * Bắt ws://... hoặc http://127.0.0.1:<port> trong phản hồi của tool.
 * Loại cả ngoặc nhọn: phản hồi được ghép từ text và JSON, không được nuốt `{}` vào đuôi endpoint.
 */
const CDP_ENDPOINT_PATTERN = /(wss?:\/\/[^\s"'{}]+|https?:\/\/127\.0\.0\.1:\d+[^\s"'{}]*)/;

export class MultizenAdapter implements AntidetectAdapter {
  readonly providerName = PROVIDER;

  private client: MultizenMcpClient;
  private initialized = false;
  private availableTools: string[] = [];

  constructor(
    private readonly baseUrl: string,
    token?: string,
  ) {
    this.client = new MultizenMcpClient(baseUrl, token);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.client.initialize();
      this.availableTools = await this.client.listTools();
      this.initialized = true;
    } catch (cause) {
      // Token sai không phải "app chưa mở" — giữ nguyên lời nhắc lấy token ở đâu.
      if (cause instanceof McpUnauthorizedError) {
        throw new AntidetectError(cause.message, PROVIDER, { cause });
      }
      throw new AntidetectUnavailableError(PROVIDER, this.baseUrl, { cause });
    }
  }

  /** Chọn tên tool đầu tiên mà server thật sự có. */
  private resolveTool(candidates: string[]): string | null {
    return candidates.find((name) => this.availableTools.includes(name)) ?? null;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  async launchProfile(profileId: string): Promise<LaunchedProfile> {
    await this.ensureInitialized();

    const toolName = this.resolveTool(LAUNCH_TOOL_NAMES);
    if (!toolName) {
      throw new AntidetectError(
        `${PROVIDER} không có tool mở profile nào trong số [${LAUNCH_TOOL_NAMES.join(", ")}]. ` +
          `Tool hiện có: [${this.availableTools.join(", ")}]. ` +
          `Cập nhật LAUNCH_TOOL_NAMES trong multizen-adapter.ts.`,
        PROVIDER,
      );
    }

    const result = await this.client.callTool(toolName, { profileId, profile_id: profileId });
    // Ngăn bằng xuống dòng: nối thẳng thì "{}" của structuredContent dính vào đuôi endpoint.
    const responseText = [extractText(result), JSON.stringify(result.structuredContent ?? {})].join("\n");

    // Thiếu endpoint CDP là chuyện bình thường với MultiZen — xem chú thích đầu file.
    // Vẫn bắt lấy nếu có, phòng bản tương lai công bố ra.
    return { cdpEndpoint: responseText.match(CDP_ENDPOINT_PATTERN)?.[0], profileId };
  }

  async closeProfile(profileId: string): Promise<void> {
    await this.ensureInitialized();

    const toolName = this.resolveTool(CLOSE_TOOL_NAMES);
    if (!toolName) return; // không có tool đóng thì bỏ qua, người dùng tự đóng cửa sổ

    await this.client.callTool(toolName, { profileId, profile_id: profileId });
  }

  async isRunning(profileId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const toolName = this.resolveTool(LIST_TOOL_NAMES);
      if (!toolName) return false;

      const result = await this.client.callTool(toolName, {});
      const text = extractText(result) + JSON.stringify(result.structuredContent ?? {});
      // Phản hồi liệt kê profile đang mở — tìm id trong đó là đủ cho nhu cầu hiện tại.
      return text.includes(profileId);
    } catch {
      return false;
    }
  }
}
