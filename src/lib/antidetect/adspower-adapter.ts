/**
 * Adapter AdsPower — phương án dự phòng, có tài liệu API đầy đủ.
 *
 * AdsPower chạy local API mặc định ở http://local.adspower.net:50325.
 * Endpoint dùng ở đây:
 *   GET /status                          kiểm tra ứng dụng có chạy không
 *   GET /api/v1/browser/start?user_id=   mở profile, trả về ws endpoint cho Playwright
 *   GET /api/v1/browser/stop?user_id=    đóng profile
 *   GET /api/v1/browser/active?user_id=  kiểm tra profile đang mở
 *
 * Quy ước phản hồi của AdsPower: { code: 0, msg: "success", data: {...} }.
 * code khác 0 nghĩa là lỗi, kể cả khi HTTP status vẫn là 200.
 */
import {
  type AntidetectAdapter,
  AntidetectError,
  AntidetectUnavailableError,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";

const PROVIDER = "AdsPower";
const REQUEST_TIMEOUT_MS = 30_000;

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

  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string): Promise<AdsPowerResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
}
