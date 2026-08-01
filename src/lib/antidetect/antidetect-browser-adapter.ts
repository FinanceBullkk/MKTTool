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

export interface AntidetectAdapter {
  /** Tên hiển thị, dùng cho log và thông báo lỗi. */
  readonly providerName: string;

  /** Kiểm tra ứng dụng antidetect có đang chạy và nghe API không. */
  isAvailable(): Promise<boolean>;

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
