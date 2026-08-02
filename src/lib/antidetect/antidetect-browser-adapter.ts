/**
 * Giao diện chung cho antidetect browser.
 *
 * Lý do tách interface: câu hỏi "Playwright có nối được MultiZen không?" chưa có
 * lời giải (xem Phase 00). Nếu câu trả lời là không, đổi sang AdsPower chỉ tốn
 * một dòng cấu hình chứ không phải viết lại toàn bộ.
 *
 * Mọi cài đặt phải bảo đảm: profile mở ra dùng ĐÚNG proxy đã gắn với nick.
 * Mở nhầm proxy là mất nick.
 */

export interface LaunchedProfile {
  /**
   * Endpoint CDP để Playwright gắn vào bằng `chromium.connectOverCDP(...)`.
   * Có thể là `http://127.0.0.1:<port>` hoặc `ws://...`.
   *
   * KHÔNG BẮT BUỘC. MultiZen lái trình duyệt bằng chính tool MCP của nó
   * (navigate/click/type/extract/screenshot) và không phơi CDP ra ngoài — vẫn mở
   * profile hoàn toàn bình thường. Chỉ AdsPower mới trả về endpoint này.
   */
  cdpEndpoint?: string;
  /** Id profile phía antidetect browser. */
  profileId: string;
}

/**
 * Cấu hình proxy đẩy sang antidetect browser.
 *
 * `protocol` là giao thức mạng (http/socks5), KHÔNG phải cách mua proxy
 * (STATIC_ISP/MOBILE trong DB). Hai khái niệm này hay bị lẫn.
 *
 * Mật khẩu ở đây là dạng TRẦN — đã giải mã. Không log, không đưa vào thông báo lỗi.
 */
export interface AntidetectProxyConfig {
  protocol: "http" | "socks5";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface AntidetectAdapter {
  /** Tên hiển thị, dùng cho log và thông báo lỗi. */
  readonly providerName: string;

  /** Kiểm tra ứng dụng antidetect có đang chạy và nghe API không. */
  isAvailable(): Promise<boolean>;

  /**
   * Ghi proxy vào profile TRƯỚC khi mở.
   *
   * Trước đây người dùng phải nhập proxy hai nơi (MKTTool và antidetect browser);
   * quên một nơi là profile chạy bằng IP nhà mà không ai hay. Đẩy tự động đóng khe hở đó.
   *
   * Gọi thất bại thì TUYỆT ĐỐI không được mở profile — thà không mở còn hơn mở sai IP.
   */
  applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void>;

  /** Mở profile, trả về endpoint CDP. */
  launchProfile(profileId: string): Promise<LaunchedProfile>;

  /** Đóng profile. Gọi được nhiều lần mà không lỗi. */
  closeProfile(profileId: string): Promise<void>;

  /** Profile có đang mở không. */
  isRunning(profileId: string): Promise<boolean>;
}

export class AntidetectError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AntidetectError";
  }
}

export class AntidetectUnavailableError extends AntidetectError {
  constructor(provider: string, endpoint: string, options?: { cause?: unknown }) {
    super(
      `Không kết nối được tới ${provider} tại ${endpoint}. ` +
        `Kiểm tra ứng dụng đã mở chưa và cổng có đúng không.`,
      provider,
      options,
    );
    this.name = "AntidetectUnavailableError";
  }
}
