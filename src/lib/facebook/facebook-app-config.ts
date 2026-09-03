/**
 * Cấu hình Meta App, đọc từ biến môi trường.
 *
 * `FACEBOOK_APP_SECRET` chỉ được đọc ở server. Không có file nào trong `components/`
 * import module này — lộ app secret xuống trình duyệt là mất quyền lên mọi Page.
 *
 * Chưa tạo Meta App vẫn chạy được cả app: mọi thứ khác không phụ thuộc vào đây,
 * và trang /facebook tự hiện hướng dẫn thay vì đổ lỗi kỹ thuật.
 */

/** Quyền tối thiểu để đăng bài lên Fanpage mình sở hữu. Xin thêm là tự chuốc App Review. */
export const REQUIRED_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const;

const DEFAULT_GRAPH_VERSION = "v21.0";
const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/facebook/oauth/callback";

export interface FacebookAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  /** Chỉ có khi dùng "Facebook Login for Business" — xem buildAuthorizeUrl(). */
  loginConfigId: string | null;
}

/**
 * Id của configuration bên "Facebook Login for Business", hoặc `null` nếu dùng Facebook Login
 * thường. App loại Business tạo từ 2025 chỉ thêm được bản for Business, nên phần lớn app mới
 * sẽ cần biến này; app cũ để trống là đúng.
 */
export function loginConfigId(): string | null {
  return process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim() || null;
}

export class FacebookConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookConfigError";
  }
}

export function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

export function graphBaseUrl(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

/**
 * Redirect URI phải khớp TỪNG KÝ TỰ với giá trị khai trong Meta App —
 * Facebook so sánh chuỗi thô, lệch dấu `/` cuối là ăn lỗi `redirect_uri` không hợp lệ.
 */
export function redirectUri(): string {
  return process.env.FACEBOOK_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

/** Có đủ cấu hình để chạy luồng OAuth không. Dùng để quyết định hiện nút hay hiện hướng dẫn. */
export function isFacebookAppConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim());
}

export function loadFacebookAppConfig(): FacebookAppConfig {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new FacebookConfigError(
      "Meta App is not configured. Create a Business app at developers.facebook.com, " +
        "then set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env. " +
        `Register the redirect URI exactly as "${redirectUri()}".`,
    );
  }

  return {
    appId,
    appSecret,
    redirectUri: redirectUri(),
    graphVersion: graphVersion(),
    loginConfigId: loginConfigId(),
  };
}
