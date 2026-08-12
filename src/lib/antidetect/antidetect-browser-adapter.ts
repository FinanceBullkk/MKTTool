/**
 * Giao diện chung cho antidetect browser.
 *
 * This interface is separate because whether Playwright can connect to MKT Browser remains
 * unresolved (see Phase 00). If it cannot, switching to AdsPower should require one configuration
 * change instead of a full rewrite.
 *
 * Mọi cài đặt phải bảo đảm: profile mở ra dùng ĐÚNG proxy đã gắn với nick.
 * Mở nhầm proxy là mất nick.
 */

export interface LaunchedProfile {
  /**
   * Endpoint CDP để Playwright gắn vào bằng `chromium.connectOverCDP(...)`.
   * Có thể là `http://127.0.0.1:<port>` hoặc `ws://...`.
   *
   * OPTIONAL. MKT Browser drives the browser through its own MCP tools
   * (navigate/click/type/extract/screenshot) without exposing CDP, while still launching profiles
   * normally. Only AdsPower returns this endpoint.
   */
  cdpEndpoint?: string;
  /** Id profile phía antidetect browser. */
  profileId: string;
  diagnostic?: AntidetectOperationDiagnostic;
}

export interface AntidetectOperationDiagnostic {
  operationId: string;
  requestId?: string;
  stage: string;
  code?: string;
  durationMs: number;
  runtime: {
    appVersion: string;
    contractVersion: number;
    profileSchemaVersion: number;
    engine: { kind: string; version: string | null; status: string };
  };
}

export interface CreatedProfile {
  profileId: string;
  diagnostic?: AntidetectOperationDiagnostic;
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
 * MKT Browser derives consistent UA, client hints, and WebGL values from these controls and
 * **rejects inconsistent combinations**. Constructing individual surfaces here would bypass that
 * protection, so this interface deliberately does not allow it.
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
  /** Stable MKTTool ownership key used to reconcile retries. */
  externalRef?: string;
  /** Stable idempotency key retained across new ticket attempts. */
  requestId?: string;
  /** Ticket jti for this one Web -> Relay -> MKT Browser attempt. */
  operationId?: string;
}

export interface AntidetectOperationContext {
  operationId: string;
  requestId?: string;
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
   * Set the proxy and fingerprint **during creation**, not by creating and then editing. The correct
   * MKT Browser workflow applies the proxy and aligns the fingerprint BEFORE the first sign-in, and
   * one call leaves no gap in which someone could open the profile between those operations.
   */
  createProfile(request: CreateProfileRequest): Promise<CreatedProfile>;

  /**
   * Ghi proxy vào profile TRƯỚC khi mở.
   *
   * Trước đây người dùng phải nhập proxy hai nơi (MKTTool và antidetect browser);
   * quên một nơi là profile chạy bằng IP nhà mà không ai hay. Đẩy tự động đóng khe hở đó.
   *
   * Gọi thất bại thì TUYỆT ĐỐI không được mở profile — thà không mở còn hơn mở sai IP.
   */
  applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void>;

  /**
   * Persist, verify, and launch with one provider-owned operation when supported.
   * Providers without an atomic contract omit this method and keep the legacy two-call path.
   */
  launchProfileWithProxy?(
    profileId: string,
    proxy: AntidetectProxyConfig,
    operation?: AntidetectOperationContext,
  ): Promise<LaunchedProfile>;

  /** Mở profile, trả về endpoint CDP. */
  launchProfile(profileId: string): Promise<LaunchedProfile>;

  /** Đóng profile. Gọi được nhiều lần mà không lỗi. */
  closeProfile(profileId: string): Promise<void>;

  /** Profile có đang mở không. */
  isRunning(profileId: string): Promise<boolean>;
}

export class AntidetectError extends Error {
  /**
   * Mã lỗi máy-đọc-được do ứng dụng desktop trả về, nếu bản đó có gửi. Chỗ gọi phải rẽ nhánh theo
   * mã này chứ không so khớp câu chữ — câu chữ bên desktop được phép đổi bất cứ lúc nào.
   */
  readonly code?: string;

  constructor(
    message: string,
    readonly provider: string,
    options?: { cause?: unknown; code?: string; diagnostic?: AntidetectOperationDiagnostic },
  ) {
    super(message, options);
    this.name = "AntidetectError";
    this.code = options?.code;
    this.diagnostic = options?.diagnostic;
  }

  readonly diagnostic?: AntidetectOperationDiagnostic;
}

export class AntidetectUnavailableError extends AntidetectError {
  constructor(provider: string, endpoint: string, options?: { cause?: unknown }) {
    super(
      `Could not connect to ${provider} at ${endpoint}. ` +
        `Make sure the application is running and the loopback endpoint is correct.`,
      provider,
      options,
    );
    this.name = "AntidetectUnavailableError";
  }
}
