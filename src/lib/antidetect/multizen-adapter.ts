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
  type AntidetectProfileSummary,
  type AntidetectProxyConfig,
  AntidetectUnavailableError,
  type CreateProfileRequest,
  type FingerprintOptions,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";
import {
  McpToolError,
  type McpToolResult,
  McpUnauthorizedError,
  MultizenMcpClient,
  extractText,
} from "./multizen-mcp-client";

const PROVIDER = "MultiZen";

/** README công bố `launch_profile`/`close_profile`/`list_profiles`; giữ tên khác phòng bản cũ. */
const LAUNCH_TOOL_NAMES = ["launch_profile", "launch", "open_profile"];
const CLOSE_TOOL_NAMES = ["close_profile", "close", "stop_profile"];
const LIST_TOOL_NAMES = ["list_profiles", "profiles"];
const UPDATE_TOOL_NAMES = ["update_profile", "edit_profile", "set_profile"];
const CREATE_TOOL_NAMES = ["create_profile", "new_profile"];
const FINGERPRINT_OPTION_TOOL_NAMES = ["list_fingerprint_options", "fingerprint_options"];

/**
 * Đọc thân JSON của một kết quả tool.
 *
 * MultiZen trả dữ liệu ở `content[].text` dạng JSON, **không** ở `structuredContent` — đo
 * 07/08/2026 trên `create_profile` và `list_fingerprint_options`. Đọc nhầm chỗ thì lấy được
 * `undefined` mà không có lỗi nào, nên hàm này là chỗ duy nhất biết quy ước đó.
 */
function parseToolBody(result: McpToolResult): Record<string, unknown> {
  const text = extractText(result).trim();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    // Bản cũ có thể trả văn xuôi. Không phải lỗi ở đây — chỗ gọi tự quyết thiếu dữ liệu thì nói gì.
    return {};
  }
}

/**
 * Bắt ws://... hoặc http://127.0.0.1:<port> trong phản hồi của tool.
 * Loại cả ngoặc nhọn: phản hồi được ghép từ text và JSON, không được nuốt `{}` vào đuôi endpoint.
 */
const CDP_ENDPOINT_PATTERN = /(wss?:\/\/[^\s"'{}]+|https?:\/\/127\.0\.0\.1:\d+[^\s"'{}]*)/;

/** Thay mật khẩu bằng dấu sao trong chuỗi sắp hiển thị cho người dùng. */
function redact(text: string, secret?: string): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}

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

  /**
   * Gọi tool, bắt tay lại đúng MỘT lần nếu hỏng.
   *
   * Adapter là singleton sống cùng tiến trình Next. MultiZen khởi động lại là session id
   * đang giữ thành vô hiệu, mà `initialized` vẫn true nên `ensureInitialized` return ngay —
   * không có gì bắt tay lại, và "Mở profile" hỏng vĩnh viễn tới khi restart cả app.
   * Mở lại phiên rồi thử lại một lần là đủ; hỏng tiếp thì đúng là MultiZen có vấn đề thật.
   */
  private async callToolWithRehandshake(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    try {
      return await this.client.callTool(name, args);
    } catch (cause) {
      // Token sai thì bắt tay lại cũng vô ích — để lỗi đi thẳng ra với lời nhắc lấy token.
      if (cause instanceof McpUnauthorizedError) throw cause;
      // Tool đã chạy và trả lời "không": phiên vẫn tốt, gọi lại chỉ tốn thêm một vòng —
      // mà với launch_profile còn có nguy cơ mở profile lần thứ hai.
      if (cause instanceof McpToolError) throw cause;

      this.initialized = false;
      this.client.resetSession();
      await this.ensureInitialized();
      return await this.client.callTool(name, args);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ghi proxy vào profile qua `update_profile`.
   *
   * MultiZen nhận nguyên object proxy `{ type, host, port, username?, password? }` và tự
   * dựng SOCKS5 bridge để DNS phân giải ở đầu xa — không rò tên miền ra ISP nhà.
   * Nó tự căn múi giờ theo IP proxy, nhưng **không** căn ngôn ngữ (đo 02/08/2026: proxy GB cho
   * `Europe/London` mà `navigator.language` vẫn là `sv-SE` của vân tay gốc).
   *
   * `update_profile` có nhận `fingerprint.localeId` nhưng ta CỐ Ý không đụng vào: đổi ngôn ngữ
   * của một nick đang nuôi còn đáng ngờ hơn là để lệch. Ngôn ngữ căn một lần lúc tạo profile,
   * bằng nút "Match proxy" trong GUI của MultiZen.
   *
   * Field tên `type` bên MultiZen là GIAO THỨC (http/socks5), không phải cách mua proxy.
   */
  async applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void> {
    await this.ensureInitialized();

    const toolName = this.resolveTool(UPDATE_TOOL_NAMES);
    if (!toolName) {
      throw new AntidetectError(
        `${PROVIDER} không có tool cập nhật profile nào trong số [${UPDATE_TOOL_NAMES.join(", ")}]. ` +
          `Tool hiện có: [${this.availableTools.join(", ")}]. ` +
          `Không đẩy được proxy nên KHÔNG mở profile — nhập proxy tay trong MultiZen, ` +
          `hoặc cập nhật UPDATE_TOOL_NAMES trong multizen-adapter.ts.`,
        PROVIDER,
      );
    }

    const proxyPayload = {
      type: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      ...(proxy.username ? { username: proxy.username } : {}),
      ...(proxy.password ? { password: proxy.password } : {}),
    };

    try {
      // Gửi cả camelCase lẫn snake_case cho id giống launchProfile — các bản MultiZen
      // khác nhau nhận tên khác nhau, gửi thừa một khoá vô hại.
      await this.callToolWithRehandshake(toolName, {
        profileId,
        profile_id: profileId,
        proxy: proxyPayload,
      });
    } catch (cause) {
      // Thông báo của MCP hay vọng lại tham số đã gửi — trong đó có mật khẩu proxy.
      // Vẫn giữ lý do gốc để còn gỡ lỗi, nhưng che mật khẩu đi trước.
      const reason = redact(cause instanceof Error ? cause.message : String(cause), proxy.password);

      throw new AntidetectError(
        `${PROVIDER} không nhận cấu hình proxy cho profile "${profileId}". ` +
          `Chưa đẩy được proxy nên KHÔNG mở profile. Lý do: ${reason}`,
        PROVIDER,
      );
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

    const result = await this.callToolWithRehandshake(toolName, {
      profileId,
      profile_id: profileId,
    });
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

    await this.callToolWithRehandshake(toolName, { profileId, profile_id: profileId });
  }

  /** Tìm tool theo danh sách tên, hoặc ném lỗi nói rõ server này có tool gì. */
  private requireTool(candidates: string[], viec: string): string {
    const name = this.resolveTool(candidates);
    if (name) return name;

    throw new AntidetectError(
      `${PROVIDER} không có tool ${viec} nào trong số [${candidates.join(", ")}]. ` +
        `Tool hiện có: [${this.availableTools.join(", ")}]. Nhiều khả năng MultiZen đang chạy ` +
        `bản cũ — cập nhật app, hoặc bổ sung tên tool trong multizen-adapter.ts.`,
      PROVIDER,
    );
  }

  async listProfiles(): Promise<AntidetectProfileSummary[]> {
    await this.ensureInitialized();
    const toolName = this.requireTool(LIST_TOOL_NAMES, "liệt kê profile");

    const body = parseToolBody(await this.callToolWithRehandshake(toolName, {}));
    const rows = Array.isArray(body.profiles) ? body.profiles : [];

    return rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .filter((row) => typeof row.id === "string" && typeof row.name === "string")
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        isRunning: typeof row.isRunning === "boolean" ? row.isRunning : undefined,
        proxyCountry: typeof row.proxyCountry === "string" ? row.proxyCountry : undefined,
        timezone: typeof row.timezone === "string" ? row.timezone : undefined,
      }));
  }

  async fingerprintOptions(): Promise<FingerprintOptions> {
    await this.ensureInitialized();
    const toolName = this.requireTool(FINGERPRINT_OPTION_TOOL_NAMES, "liệt kê tùy chọn vân tay");

    const body = parseToolBody(await this.callToolWithRehandshake(toolName, {}));
    return {
      devices: Array.isArray(body.devices) ? (body.devices as FingerprintOptions["devices"]) : [],
      locales: Array.isArray(body.locales) ? (body.locales as FingerprintOptions["locales"]) : [],
    };
  }

  /**
   * Tạo profile mới.
   *
   * Proxy và vân tay đi cùng lời gọi tạo. MultiZen kiểm tính nhất quán và từ chối tổ hợp mâu
   * thuẫn — đo 07/08/2026: `localeId: en-US` kèm `timezone: Europe/London` trả về
   * `INVALID_INPUT` liệt kê đủ bốn timezone hợp lệ. Câu lỗi đó đáng giữ nguyên cho người đọc.
   */
  async createProfile(request: CreateProfileRequest): Promise<string> {
    await this.ensureInitialized();
    const toolName = this.requireTool(CREATE_TOOL_NAMES, "tạo profile");

    const args: Record<string, unknown> = { name: request.name };
    if (request.notes) args.notes = request.notes;
    if (request.tags?.length) args.tags = request.tags;
    if (request.seed) args.seed = request.seed;
    if (request.fingerprint) args.fingerprint = request.fingerprint;
    if (request.proxy) {
      args.proxy = {
        type: request.proxy.protocol,
        host: request.proxy.host,
        port: request.proxy.port,
        ...(request.proxy.username ? { username: request.proxy.username } : {}),
        ...(request.proxy.password ? { password: request.proxy.password } : {}),
      };
    }

    let body: Record<string, unknown>;
    try {
      body = parseToolBody(await this.callToolWithRehandshake(toolName, args));
    } catch (cause) {
      const reason = redact(
        cause instanceof Error ? cause.message : String(cause),
        request.proxy?.password,
      );
      throw new AntidetectError(
        `${PROVIDER} không tạo được profile "${request.name}". Lý do: ${reason}`,
        PROVIDER,
      );
    }

    // Không có id thì coi như hỏng, dù tool báo thành công: profile có thể đã sinh ra bên MultiZen
    // nhưng kho không biết id của nó — một profile mồ côi còn tệ hơn một lần tạo hỏng hẳn.
    if (typeof body.id !== "string" || body.id === "") {
      throw new AntidetectError(
        `${PROVIDER} tạo profile xong nhưng không trả về id, nên không ghi vào kho được. ` +
          `Mở MultiZen kiểm xem có profile tên "${request.name}" vừa sinh ra không — có thì xóa ` +
          `đi rồi thử lại, hoặc gắn nó vào nick bằng cách dán id thủ công.`,
        PROVIDER,
      );
    }

    return body.id;
  }

  async isRunning(profileId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const toolName = this.resolveTool(LIST_TOOL_NAMES);
      if (!toolName) return false;

      const result = await this.callToolWithRehandshake(toolName, {});
      const text = extractText(result) + JSON.stringify(result.structuredContent ?? {});
      // Phản hồi liệt kê profile đang mở — tìm id trong đó là đủ cho nhu cầu hiện tại.
      return text.includes(profileId);
    } catch {
      return false;
    }
  }
}
