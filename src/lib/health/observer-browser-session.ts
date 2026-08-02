/**
 * Phiên trình duyệt "người lạ": Chromium sạch, đi qua proxy quan sát viên, không đăng nhập gì.
 *
 * Cố ý KHÔNG đi qua antidetect browser. Đây là truy cập trang công khai ở chế độ chưa đăng
 * nhập — không có danh tính nào để giấu, nên giả vân tay chỉ thêm thứ để hỏng. Thứ duy nhất
 * cần đúng là góc nhìn: một IP không dính tới nick nào của mình.
 *
 * Mỗi lần dò dựng browser mới rồi đóng hẳn: không cookie, không localStorage, không cache
 * mang từ nick này sang nick kia. Dò 8 nick bằng một phiên có trạng thái là tự nối chúng lại
 * với nhau trong mắt Reddit — đúng thứ bộ dò sinh ra để phát hiện.
 */
import { type Browser, chromium } from "playwright";
import {
  type ProxyRecordForLaunch,
  buildProxyConfig,
} from "@/lib/antidetect/proxy-config-builder";

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * User-Agent của Chrome ổn định trên Windows. Mặc định của Playwright headless có chuỗi
 * "HeadlessChrome" — Reddit chặn thẳng, và lúc đó bộ dò báo ERROR hàng loạt mà không rõ vì sao.
 */
const OBSERVER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Safari/537.36";

export class ObserverSessionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ObserverSessionError";
  }
}

export interface FetchedPage {
  /** URL cuối cùng sau mọi lần chuyển hướng — chính nó là tín hiệu checkpoint rõ nhất. */
  url: string;
  html: string;
  /**
   * Mã HTTP. Quan trọng hơn vẻ ngoài của nó: Reddit trả 404 cho nick bị shadowban, và mã HTTP
   * không đổi theo mỗi đợt Reddit thay câu chữ trong trang. `0` khi không đọc được phản hồi.
   */
  status: number;
  /** Ảnh trang, luôn chụp sẵn. Người gọi quyết định có ghi ra đĩa hay không. */
  screenshot: Buffer;
}

export interface ObserverSession {
  fetchPage(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

/**
 * Dựng chuỗi `server` cho Playwright.
 *
 * Chromium KHÔNG hỗ trợ xác thực cho SOCKS5 — user/pass bị bỏ qua im lặng và kết nối
 * hoặc hỏng, hoặc tệ hơn là đi thẳng bằng IP nhà. Chặn thẳng ở đây thay vì để lộ ra sau.
 */
export function buildPlaywrightProxy(proxy: ProxyRecordForLaunch): {
  server: string;
  username?: string;
  password?: string;
} {
  const config = buildProxyConfig(proxy);

  if (config.protocol === "socks5" && config.username) {
    throw new ObserverSessionError(
      `Proxy quan sát viên "${proxy.label}" khai socks5 kèm user/mật khẩu, nhưng Chromium ` +
        `không xác thực được với SOCKS5 — nó sẽ bỏ qua thông tin đăng nhập. ` +
        `Đổi giao thức sang http (hầu hết nhà bán phục vụ cả hai trên cùng cổng).`,
    );
  }

  return {
    server: `${config.protocol}://${config.host}:${config.port}`,
    username: config.username,
    password: config.password,
  };
}

export async function openObserverSession(proxy: ProxyRecordForLaunch): Promise<ObserverSession> {
  const playwrightProxy = buildPlaywrightProxy(proxy);

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, proxy: playwrightProxy });
  } catch (cause) {
    throw new ObserverSessionError(
      `Không mở được Chromium cho bộ dò. Nếu đây là lần chạy đầu, cài trình duyệt bằng ` +
        `"npx playwright install chromium".`,
      { cause },
    );
  }

  const context = await browser.newContext({
    userAgent: OBSERVER_USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    // Reddit chỉ hiện bản old cho khách khi có cookie này; thiếu nó thì bị đá sang giao diện mới.
    extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
  });
  context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

  return {
    async fetchPage(url: string): Promise<FetchedPage> {
      const page = await context.newPage();
      try {
        // `domcontentloaded` là đủ: bản old.reddit trả HTML đầy đủ ngay lượt đầu, và chờ
        // `networkidle` chỉ tổ dính vào mấy request quảng cáo không bao giờ dứt.
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        return {
          url: page.url(),
          html: await page.content(),
          status: response?.status() ?? 0,
          screenshot: await page.screenshot({ fullPage: false }),
        };
      } finally {
        await page.close();
      }
    },

    async close(): Promise<void> {
      await browser.close();
    },
  };
}
