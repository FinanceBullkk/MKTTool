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

/**
 * Một profile như antidetect browser khai ra.
 *
 * Chỉ giữ những trường **mọi** nhà cung cấp đều có, cộng hai trường chẩn đoán (`proxyCountry`,
 * `timezone`) mà giao diện cần để cảnh báo vân tay lệch proxy. Thiếu thì để trống — đừng bịa.
 */
export interface AntidetectProfileSummary {
  id: string;
  name: string;
  isRunning?: boolean;
  /** Quốc gia của proxy đang gắn, chữ thường (`"us"`). */
  proxyCountry?: string;
  /** IANA timezone của vân tay. Lệch với `proxyCountry` là dấu hiệu quên căn proxy. */
  timezone?: string;
}

/**
 * Vân tay ở dạng **núm cao cấp** — không phải từng bề mặt.
 *
 * MultiZen tự suy ra UA / client hints / WebGL nhất quán từ mấy núm này và **từ chối tổ hợp mâu
 * thuẫn**. Tự ghép bề mặt ở phía mình là bỏ đi lớp bảo vệ đó, nên interface cố ý không cho.
 */
export interface AntidetectFingerprintSpec {
  device: string;
  localeId: string;
  timezone: string;
  screen: { width: number; height: number };
}

export interface CreateProfileRequest {
  name: string;
  notes?: string;
  tags?: string[];
  proxy?: AntidetectProxyConfig;
  fingerprint?: AntidetectFingerprintSpec;
  /** Hạt giống nhiễu canvas/audio/WebGL. Mỗi profile một giá trị. */
  seed?: string;
}

/** Danh mục giá trị hợp lệ để dựng vân tay — lấy từ chính nhà cung cấp, không tự bịa bảng. */
export interface FingerprintOptions {
  devices: { family: string; label: string; screens: { width: number; height: number }[] }[];
  locales: { id: string; label: string; country: string; timezones: string[] }[];
}

export interface AntidetectAdapter {
  /** Tên hiển thị, dùng cho log và thông báo lỗi. */
  readonly providerName: string;

  /** Kiểm tra ứng dụng antidetect có đang chạy và nghe API không. */
  isAvailable(): Promise<boolean>;

  /** Mọi profile trên máy này. Dùng cho ô chọn thay vì bắt người dùng chép id bằng tay. */
  listProfiles(): Promise<AntidetectProfileSummary[]>;

  /** Danh mục họ thiết bị và nhóm locale hợp lệ. */
  fingerprintOptions(): Promise<FingerprintOptions>;

  /**
   * Tạo profile mới, trả về id.
   *
   * Đặt proxy và vân tay **ngay lúc tạo** chứ không tạo rồi sửa: quy trình đúng của MultiZen là
   * gắn proxy và căn vân tay TRƯỚC lần đăng nhập đầu tiên, và một lời gọi thì không có khe hở
   * nào để ai đó mở profile vào giữa hai bước.
   */
  createProfile(request: CreateProfileRequest): Promise<string>;

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
