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
      "Chưa cấu hình Meta App. Tạo app loại Business ở developers.facebook.com, " +
        "rồi điền FACEBOOK_APP_ID và FACEBOOK_APP_SECRET vào .env. " +
        `Nhớ khai redirect URI đúng bằng "${redirectUri()}".`,
    );
  }

  return { appId, appSecret, redirectUri: redirectUri(), graphVersion: graphVersion() };
}
