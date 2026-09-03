/**
 * Client Graph API tối giản: chỉ GET và POST, chỉ những gì Phase 04 cần.
 *
 * Hai quyết định về bảo mật:
 *  1. Token đi trong header `Authorization: Bearer`, KHÔNG đi trong query string.
 *     Query string lọt vào access log, vào lịch sử trình duyệt, vào ảnh chụp màn hình.
 *  2. Mọi thông báo lỗi đi qua `redactTokens()` trước khi trả ra ngoài — Facebook
 *     hay vọng lại tham số đã gửi, và ta cũng không tin mình sẽ nhớ điều đó ở mọi chỗ gọi.
 */
import { graphBaseUrl } from "./facebook-app-config";
import {
  type GraphErrorPayload,
  describeGraphError,
  isTokenError,
  isTransientError,
} from "./facebook-graph-error-messages";

const REQUEST_TIMEOUT_MS = 30_000;

export class FacebookGraphError extends Error {
  readonly payload: GraphErrorPayload | null;
  readonly tokenExpired: boolean;
  readonly transient: boolean;

  constructor(message: string, payload: GraphErrorPayload | null, options?: { cause?: unknown }) {
    super(redactTokens(message), options);
    this.name = "FacebookGraphError";
    this.payload = payload;
    this.tokenExpired = isTokenError(payload);
    this.transient = isTransientError(payload);
  }
}

/**
 * Che mọi thứ trông giống access token. Token Facebook là chuỗi dài không dấu cách,
 * user token bắt đầu bằng "EAA"; luật dưới đây bắt cả hai kiểu và cả dạng `access_token=...`.
 */
export function redactTokens(text: string): string {
  return text
    .replace(/(access_token|client_secret|fb_exchange_token)=[^&\s"']+/gi, "$1=***")
    .replace(/EAA[A-Za-z0-9_-]{20,}/g, "***");
}

interface GraphErrorEnvelope {
  error?: GraphErrorPayload;
}

/**
 * `accessToken` bỏ trống được: các endpoint đổi token (`/oauth/access_token`) xác thực
 * bằng cặp app id + app secret trong tham số chứ không bằng bearer token.
 */
async function request<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  accessToken?: string,
): Promise<T> {
  const url = new URL(`${graphBaseUrl()}/${path.replace(/^\//, "")}`);
  const init: RequestInit = {
    method,
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else {
    init.body = new URLSearchParams(params);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new FacebookGraphError(
      "Could not reach the Graph API. Check this machine's network connection.",
      null,
      { cause },
    );
  }

  const bodyText = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new FacebookGraphError(
      `The Graph API returned non-JSON content (HTTP ${response.status}).`,
      null,
    );
  }

  const errorPayload = (body as GraphErrorEnvelope).error ?? null;
  if (!response.ok || errorPayload) {
    throw new FacebookGraphError(
      describeGraphError(errorPayload, `The Graph API returned HTTP ${response.status}.`),
      errorPayload,
    );
  }

  return body as T;
}

export function graphGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken?: string,
): Promise<T> {
  return request<T>("GET", path, params, accessToken);
}

export function graphPost<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
): Promise<T> {
  return request<T>("POST", path, params, accessToken);
}

/** Câu chữ an toàn để hiện cho người dùng từ một lỗi bất kỳ. */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof FacebookGraphError) return error.message;
  if (error instanceof Error) return redactTokens(error.message);
  return fallback;
}
