/**
 * Adapter AdsPower — phương án dự phòng, có tài liệu API đầy đủ.
 *
 * AdsPower chạy local API mặc định ở http://local.adspower.net:50325.
 * Endpoint dùng ở đây:
 *   GET  /status                          kiểm tra ứng dụng có chạy không
 *   POST /api/v1/user/update              ghi proxy vào profile
 *   GET  /api/v1/browser/start?user_id=   mở profile, trả về ws endpoint cho Playwright
 *   GET  /api/v1/browser/stop?user_id=    đóng profile
 *   GET  /api/v1/browser/active?user_id=  kiểm tra profile đang mở
 *
 * Quy ước phản hồi của AdsPower: { code: 0, msg: "success", data: {...} }.
 * code khác 0 nghĩa là lỗi, kể cả khi HTTP status vẫn là 200.
 */
import {
  type AntidetectAdapter,
  AntidetectError,
  type AntidetectProxyConfig,
  AntidetectUnavailableError,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";

const PROVIDER = "AdsPower";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * API cục bộ của AdsPower chỉ nhận 1 lời gọi mỗi giây; vượt là trả code != 0.
 * Chuỗi "ghi proxy rồi mở profile" chắc chắn chạm ngưỡng này nếu không giãn ra.
 */
const MIN_REQUEST_INTERVAL_MS = 1_100;

interface AdsPowerResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface AdsPowerStartData {
  ws?: { puppeteer?: string; selenium?: string };
  debug_port?: string;
}

export class AdsPowerAdapter implements AntidetectAdapter {
  readonly providerName = PROVIDER;

  private lastRequestAt = 0;

  constructor(private readonly baseUrl: string) {}

  /** Giãn lời gọi cho đủ khoảng cách tối thiểu mà AdsPower đòi hỏi. */
  private async waitForRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private async request<T>(path: string, body?: unknown): Promise<AdsPowerResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    await this.waitForRateLimit();

    try {
      response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined
          ? {}
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AntidetectUnavailableError(PROVIDER, this.baseUrl, { cause });
    }

    if (!response.ok) {
      throw new AntidetectError(
        `${PROVIDER} trả về HTTP ${response.status} cho ${path}.`,
        PROVIDER,
      );
    }

    return (await response.json()) as AdsPowerResponse<T>;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.request<unknown>("/status");
      return result.code === 0;
    } catch {
      return false;
    }
  }

  /**
   * Ghi proxy vào profile qua `/api/v1/user/update`.
   *
   * `proxy_soft: "other"` = proxy tự nhập, không phải nhà cung cấp AdsPower tích hợp sẵn.
   * Đây là giá trị đúng cho mọi proxy mua ngoài (Webshare, IPRoyal…).
   */
  async applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void> {
    const result = await this.request<unknown>("/api/v1/user/update", {
      user_id: profileId,
      user_proxy_config: {
        proxy_soft: "other",
        proxy_type: proxy.protocol,
        proxy_host: proxy.host,
        proxy_port: String(proxy.port),
        proxy_user: proxy.username ?? "",
        proxy_password: proxy.password ?? "",
      },
    });

    if (result.code !== 0) {
      // `msg` của AdsPower có thể vọng lại tham số đã gửi, kể cả mật khẩu proxy — không ghép vào.
      throw new AntidetectError(
        `${PROVIDER} không nhận cấu hình proxy cho profile "${profileId}". ` +
          `Chưa đẩy được proxy nên KHÔNG mở profile.`,
        PROVIDER,
      );
    }
  }

  async launchProfile(profileId: string): Promise<LaunchedProfile> {
    const result = await this.request<AdsPowerStartData>(
      `/api/v1/browser/start?user_id=${encodeURIComponent(profileId)}`,
    );

    if (result.code !== 0) {
      throw new AntidetectError(
        `${PROVIDER} không mở được profile "${profileId}": ${result.msg ?? "lỗi không rõ"}.`,
        PROVIDER,
      );
    }

    // Playwright connectOverCDP nhận cả ws:// lẫn http://<host>:<port>.
    const cdpEndpoint =
      result.data?.ws?.puppeteer ??
      (result.data?.debug_port ? `http://127.0.0.1:${result.data.debug_port}` : undefined);

    if (!cdpEndpoint) {
      throw new AntidetectError(
        `${PROVIDER} mở profile "${profileId}" nhưng không trả về endpoint CDP.`,
        PROVIDER,
      );
    }

    return { cdpEndpoint, profileId };
  }

  async closeProfile(profileId: string): Promise<void> {
    const result = await this.request<unknown>(
      `/api/v1/browser/stop?user_id=${encodeURIComponent(profileId)}`,
    );

    // code 0 = đóng thành công. Profile vốn đã đóng cũng không coi là lỗi.
    if (result.code !== 0 && !/not.*(open|active|running)/i.test(result.msg ?? "")) {
      throw new AntidetectError(
        `${PROVIDER} không đóng được profile "${profileId}": ${result.msg ?? "lỗi không rõ"}.`,
        PROVIDER,
      );
    }
  }

  async isRunning(profileId: string): Promise<boolean> {
    try {
      const result = await this.request<{ status?: string }>(
        `/api/v1/browser/active?user_id=${encodeURIComponent(profileId)}`,
      );
      return result.code === 0 && result.data?.status === "Active";
    } catch {
      return false;
    }
  }

  /**
   * Ba việc dưới đây **chưa cài đặt cho AdsPower**, và chúng ném lỗi thay vì trả rỗng.
   *
   * AdsPower has its own profile-creation API (`/api/v1/user/create`) and a fingerprint model that
   * differs fundamentally from MKT Browser. It has no equivalent concepts for "locale group" or
   * "device family", so a direct mapping is unavailable. Inventing an unverified mapping could
   * produce inconsistent profile settings and must stay blocked.
   *
   * Trả mảng rỗng thì giao diện sẽ hiện "máy này chưa có profile nào" — một câu **nói dối**, và
   * người dùng sẽ đi tạo profile mới trong khi kho của họ đầy. Ném lỗi thì họ đọc được đúng lý do.
   */
  private chuaHoTro(viec: string): never {
    throw new AntidetectError(
      `${PROVIDER} chưa hỗ trợ ${viec} qua MKTTool. Làm trong app AdsPower rồi dán id profile ` +
        `vào ô "Id profile antidetect" ở trang chi tiết nick.`,
      PROVIDER,
    );
  }

  async listProfiles(): Promise<never> {
    return this.chuaHoTro("liệt kê profile");
  }

  async fingerprintOptions(): Promise<never> {
    return this.chuaHoTro("đọc danh mục vân tay");
  }

  async createProfile(): Promise<never> {
    return this.chuaHoTro("tạo profile");
  }
}
