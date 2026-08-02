/**
 * Luồng lấy token, làm một lần cho mỗi nick cá nhân quản trị Page:
 *
 *   1. Đẩy người dùng sang dialog OAuth của Facebook  → buildAuthorizeUrl()
 *   2. Facebook gọi ngược về kèm `code`               → exchangeCodeForToken()
 *   3. Đổi token 2 giờ thành token 60 ngày            → exchangeForLongLivedToken()
 *   4. Lấy Page token từ token 60 ngày                → fetchManagedPages()
 *
 * Bước 3 không được bỏ: token ở bước 2 sống đúng 2 tiếng, và Page token sinh ra từ nó
 * cũng chết theo. Page token sinh từ token long-lived thì không có hạn.
 */
import { REQUIRED_SCOPES, graphVersion, loadFacebookAppConfig } from "./facebook-app-config";
import { graphGet } from "./facebook-graph-client";

/**
 * Cookie giữ `state` giữa lúc bấm kết nối và lúc Facebook gọi ngược về.
 * Khai ở đây chứ không ở route: file route của Next.js chỉ được export handler HTTP.
 */
export const OAUTH_STATE_COOKIE = "fb_oauth_state";

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number; // giây
}

export interface FacebookIdentity {
  id: string;
  name: string;
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
}

export interface LongLivedToken {
  accessToken: string;
  /** null khi Facebook không trả `expires_in` — nghĩa là token không hết hạn. */
  expiresAt: Date | null;
}

/**
 * Dialog OAuth nằm ở www.facebook.com, không phải graph.facebook.com.
 *
 * Hai kiểu Facebook Login, khác nhau ở chỗ quyền được khai ở ĐÂU:
 *
 *  • **Facebook Login** (thường) — quyền khai trong URL bằng `scope`. App loại cũ dùng cái này.
 *  • **Facebook Login for Business** — quyền khai TRƯỚC trong một "configuration" ở Meta App,
 *    URL chỉ trỏ tới nó bằng `config_id`. App loại Business mới chỉ cho thêm bản này.
 *
 * Gửi cả hai cùng lúc là Facebook báo lỗi, nên `config_id` có thì `scope` phải rút lui. Quyền
 * lúc đó do configuration quyết định — nhớ tick đủ ba quyền trong REQUIRED_SCOPES ở Meta App,
 * vì thiếu quyền nào thì tới lúc đăng mới lộ ra.
 */
export function buildAuthorizeUrl(state: string): string {
  const config = loadFacebookAppConfig();
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  if (config.loginConfigId) {
    url.searchParams.set("config_id", config.loginConfigId);
  } else {
    url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  }

  return url.toString();
}

function toExpiryDate(expiresIn: number | undefined): Date | null {
  // `expires_in` 0 nghĩa là không hết hạn — đúng với Page token sinh từ user token long-lived.
  if (!expiresIn || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000);
}

/** Bước 2: `code` từ callback → user token ngắn hạn (2 giờ). */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const config = loadFacebookAppConfig();
  const result = await graphGet<TokenResponse>("oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  return result.access_token;
}

/** Bước 3: token ngắn hạn → token 60 ngày. */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const config = loadFacebookAppConfig();
  const result = await graphGet<TokenResponse>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  return { accessToken: result.access_token, expiresAt: toExpiryDate(result.expires_in) };
}

export function fetchIdentity(userToken: string): Promise<FacebookIdentity> {
  return graphGet<FacebookIdentity>("me", { fields: "id,name" }, userToken);
}

/**
 * Bước 4: danh sách Page nick này quản trị, kèm Page token của từng cái.
 * Page không có `access_token` nghĩa là nick thiếu quyền trên Page đó — bỏ qua,
 * đưa vào danh sách chỉ tổ để người dùng bấm đăng rồi ăn lỗi 200 sau.
 */
export async function fetchManagedPages(userToken: string): Promise<ManagedPage[]> {
  const result = await graphGet<{ data?: { id: string; name: string; access_token?: string }[] }>(
    "me/accounts",
    { fields: "id,name,access_token", limit: "100" },
    userToken,
  );

  return (result.data ?? [])
    .filter((page): page is { id: string; name: string; access_token: string } =>
      Boolean(page.access_token),
    )
    .map((page) => ({ id: page.id, name: page.name, accessToken: page.access_token }));
}
