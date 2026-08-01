/**
 * Adapter MultiZen qua MCP server cục bộ (mặc định 127.0.0.1:7777).
 *
 * ĐIỂM CHƯA CHẮC CHẮN — đây chính là câu hỏi chặn đường của Phase 00:
 * MultiZen dùng CDP ở BÊN TRONG (chrome-remote-interface) nhưng KHÔNG công bố
 * endpoint CDP ra ngoài cho Playwright `connectOverCDP`. Nếu tool `launch` không
 * trả về endpoint nào, adapter này ném lỗi kèm hướng dẫn chuyển sang AdsPower.
 *
 * Kho danh tính (Phase 01) vẫn dùng được kể cả khi không có CDP: mở profile bằng
 * đúng proxy/vân tay rồi thao tác tay là đủ. CDP chỉ cần cho Phase 05 (tự động hóa).
 */
import {
  type AntidetectAdapter,
  AntidetectError,
  AntidetectUnavailableError,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";
import { MultizenMcpClient, extractText } from "./multizen-mcp-client";

const PROVIDER = "MultiZen";

/** Tên tool có thể khác giữa các bản MultiZen — thử lần lượt. */
const LAUNCH_TOOL_NAMES = ["launch", "launch_profile", "open_profile"];
const CLOSE_TOOL_NAMES = ["close", "close_profile", "stop_profile"];
const LIST_TOOL_NAMES = ["list_profiles", "profiles"];

/** Bắt ws://... hoặc http://127.0.0.1:<port> trong phản hồi của tool. */
const CDP_ENDPOINT_PATTERN = /(wss?:\/\/[^\s"']+|https?:\/\/127\.0\.0\.1:\d+[^\s"']*)/;

export class MultizenAdapter implements AntidetectAdapter {
  readonly providerName = PROVIDER;

  private client: MultizenMcpClient;
  private initialized = false;
  private availableTools: string[] = [];

  constructor(private readonly baseUrl: string) {
    this.client = new MultizenMcpClient(baseUrl);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.client.initialize();
      this.availableTools = await this.client.listTools();
      this.initialized = true;
    } catch (cause) {
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
    const responseText = extractText(result) + JSON.stringify(result.structuredContent ?? {});
    const cdpEndpoint = responseText.match(CDP_ENDPOINT_PATTERN)?.[0];

    if (!cdpEndpoint) {
      throw new AntidetectError(
        `${PROVIDER} đã mở profile "${profileId}" nhưng không trả về endpoint CDP nào, ` +
          `nên Playwright không gắn vào được.\n` +
          `Đây là kết luận cho câu hỏi chặn đường ở Phase 00: MultiZen không dùng được ` +
          `cho tự động hóa (Phase 05).\n` +
          `Cách xử lý: đặt ANTIDETECT_PROVIDER="adspower" trong .env và cài AdsPower. ` +
          `Kho danh tính vẫn dùng bình thường nếu chỉ cần mở profile thao tác tay.`,
        PROVIDER,
      );
    }

    return { cdpEndpoint, profileId };
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
