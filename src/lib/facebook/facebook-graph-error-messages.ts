/**
 * Dịch lỗi Graph API sang câu tiếng Việt nói rõ phải làm gì.
 *
 * Hàm thuần, không chạm mạng — vì đây là chỗ dễ sai nhất và cũng dễ test nhất.
 * Nguyên tắc: người dùng đọc xong biết bước tiếp theo, không phải đi tra mã lỗi.
 * Mã gốc vẫn được ghép vào cuối để tra cứu khi cần.
 */

export interface GraphErrorPayload {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/** Lỗi token — gọi lại bao nhiêu lần cũng vô ích, phải kết nối lại. */
const TOKEN_ERROR_CODES = new Set([102, 190, 458, 459, 460, 463, 467]);

/** Lỗi tạm thời — thử lại sau thì có cơ hội qua. */
const TRANSIENT_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export function isTokenError(payload: GraphErrorPayload | null): boolean {
  if (!payload) return false;
  return (
    TOKEN_ERROR_CODES.has(payload.code ?? -1) ||
    TOKEN_ERROR_CODES.has(payload.error_subcode ?? -1) ||
    payload.type === "OAuthException"
  );
}

export function isTransientError(payload: GraphErrorPayload | null): boolean {
  return payload ? TRANSIENT_ERROR_CODES.has(payload.code ?? -1) : false;
}

/**
 * Câu giải thích theo mã lỗi. Chỉ liệt kê những mã thật sự gặp khi đăng Fanpage —
 * thêm mã lạ vào đây chỉ làm loãng, phần `message` gốc của Facebook lo phần còn lại.
 */
function explain(payload: GraphErrorPayload): string | null {
  const { code, error_subcode: subcode } = payload;

  if (code === 190 && subcode === 463) {
    return "The token has expired. Reconnect on /facebook to obtain a new token.";
  }
  if (code === 190 && subcode === 460) {
    return "The token was invalidated because the Facebook nick changed its password. Reconnect on /facebook.";
  }
  if (code === 190 && subcode === 458) {
    return "The Facebook nick removed this Meta App. Reconnect on /facebook and grant access again.";
  }
  if (code === 190 || code === 102) {
    return "The token is no longer usable. Reconnect on /facebook.";
  }
  if (code === 200 || code === 10) {
    return (
      "Missing permissions. The signed-in nick must be a Page administrator, and the Meta App " +
      "must have pages_manage_posts + pages_read_engagement + pages_show_list."
    );
  }
  if (code === 368) {
    return (
      "Facebook has temporarily blocked actions for this Page or nick because of a policy violation. " +
      "STOP posting and review the Facebook notice before trying again."
    );
  }
  if (code === 506) {
    return "Facebook considers this a duplicate of a recent post. Edit the content before posting again.";
  }
  if (code === 1609005) {
    return "Facebook could not fetch the link preview. Check that the link is still reachable.";
  }
  if (TRANSIENT_ERROR_CODES.has(code ?? -1)) {
    return "Facebook is rate-limiting requests or has a temporary error. Wait a few minutes and try again.";
  }
  if (code === 100) {
    return "Facebook rejected the submitted parameters. The content may be missing or the link may be malformed.";
  }
  return null;
}

/** Ghép câu hoàn chỉnh: giải thích của mình + nguyên văn Facebook + mã để tra cứu. */
export function describeGraphError(payload: GraphErrorPayload | null, fallback: string): string {
  if (!payload) return fallback;

  const parts = [explain(payload) ?? fallback];
  if (payload.message) parts.push(`Facebook says: "${payload.message}"`);

  const codes = [
    payload.code !== undefined ? `code ${payload.code}` : null,
    payload.error_subcode !== undefined ? `subcode ${payload.error_subcode}` : null,
  ].filter(Boolean);
  if (codes.length > 0) parts.push(`(${codes.join(", ")})`);

  return parts.join(" ");
}
