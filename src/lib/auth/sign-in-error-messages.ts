/**
 * Tách lỗi OAuth thành copy cho người dùng và diagnostic dành riêng cho log server.
 *
 * Google chuyển hướng người dùng về `/login?error=<mã>` khi hỏng, và mã đó là chuỗi kỹ thuật
 * bằng tiếng Anh (`invalid_code`, `state_not_found`). Operator chỉ cần biết chuyện gì xảy ra,
 * thử lại thế nào và liên hệ ai; tên biến, lệnh CLI và Google Cloud diagnostics ở lại server.
 *
 * ## Vì sao `invalid_code` là mã đáng chú ý nhất
 *
 * Nó là **cách duy nhất `GOOGLE_CLIENT_SECRET` sai lộ ra**. `npm run auth:check` kiểm được
 * hình dạng của secret và hỏi Google về cặp (client_id, redirect_uri), nhưng nó không bao giờ
 * gửi secret đi đâu — nên không có cách nào biết secret đúng hay sai trước lúc này. Secret sai
 * đi lọt hết mọi bước trước đó: màn hình Google hiện ra bình thường, người dùng chọn tài khoản
 * bình thường, rồi hỏng ở nhịp đổi code lấy token — nhịp duy nhất cần tới secret.
 *
 * Mã lấy từ `redirectOnError()` trong `better-auth/dist/api/routes/callback.mjs`.
 */

export interface SignInErrorContext {
  adminContactEmail: string;
  description?: string;
}

/** Copy dành cho người dùng; chi tiết cấu hình nằm trong `SERVER_DIAGNOSTICS`. */
const USER_MESSAGES: Record<string, string> = {
  invalid_code: "Google chưa hoàn tất bước xác nhận đăng nhập. Bấm đăng nhập lại để thử lần nữa.",
  user_creation_failed:
    "Không thể tạo phiên dùng công cụ từ tài khoản Google này. Bấm đăng nhập lại để thử lần nữa.",
  access_denied: "Bạn đã hủy ở màn hình Google. Bấm đăng nhập lại nếu muốn tiếp tục.",
  state_not_found:
    "Phiên xác nhận đăng nhập đã hết hoặc không còn hợp lệ. Quay lại đây và bấm đăng nhập lại.",
  state_mismatch:
    "Phiên xác nhận đăng nhập không còn khớp. Quay lại đây và bấm đăng nhập lại từ đầu.",
  unable_to_get_user_info:
    "Google chưa trả đủ thông tin tài khoản để đăng nhập. Bấm đăng nhập lại để thử lần nữa.",
  email_not_found:
    "Google không trả về email cho tài khoản này nên công cụ chưa thể xác định người dùng.",
  oauth_provider_not_found: "Đăng nhập Google hiện chưa sẵn sàng trên máy chủ.",
  no_code: "Google chưa hoàn tất lượt đăng nhập. Bấm đăng nhập lại để thử lần nữa.",
  invalid_callback_request:
    "Lượt đăng nhập quay về không hợp lệ. Quay lại đây và bấm đăng nhập lại từ đầu.",
};

/** Chỉ ghi ở server; không trả các tên biến hoặc lệnh này về màn hình login. */
const SERVER_DIAGNOSTICS: Record<string, string> = {
  invalid_code:
    "OAuth token exchange failed. Verify GOOGLE_CLIENT_SECRET against the configured client; npm run auth:check cannot validate the secret value.",
  EMAIL_NOT_ALLOWED:
    "The attempted email is not authorized. Review ALLOWED_EMAILS without logging the attempted address or allowlist contents.",
  user_creation_failed:
    "User creation failed. Check the Google OAuth consent-screen publishing state and configured test users.",
  access_denied: "The user cancelled or Google denied the OAuth authorization request.",
  state_not_found:
    "OAuth state cookie was not returned. Verify the public host, BETTER_AUTH_URL, and cookie scope.",
  state_mismatch: "OAuth state validation failed. Inspect stale login links and cookie handling.",
  unable_to_get_user_info:
    "Google user info could not be read. Verify the email and profile scopes on the OAuth client.",
  email_not_found: "Google user info omitted the email claim required by MKTTool.",
  oauth_provider_not_found:
    "Google OAuth provider is unavailable. Run npm run auth:check and verify server configuration.",
  no_code: "Google callback did not include an authorization code.",
  invalid_callback_request: "Better Auth rejected the OAuth callback request shape.",
};

function errorKey(code: string): string {
  return code.split(":", 1)[0] ?? "unknown";
}

function attemptedEmail(code: string, description?: string): string | null {
  const fromCode = code.includes(":") ? code.slice(code.indexOf(":") + 1) : "";
  const fromDescription = description?.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  const candidate = fromCode || fromDescription;
  return candidate.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)
    ? candidate
    : null;
}

function contactInstruction(adminContactEmail: string): string {
  return `Nếu vẫn không vào được, liên hệ quản trị viên tại ${adminContactEmail}.`;
}

export function signInErrorDiagnostic(code: string): string {
  const key = errorKey(code);
  const safeKey = key.replace(/[^A-Za-z0-9_-]/g, "?").slice(0, 80);
  return (
    SERVER_DIAGNOSTICS[key] ??
    `Unrecognized sign-in error code: ${safeKey || "unknown"}. Run npm run auth:check and inspect Better Auth server logs.`
  );
}

/**
 * Câu tiếng Việt cho một lần đăng nhập hỏng.
 *
 * `description` chỉ được dùng để lấy lại email vừa đăng nhập trong nhánh bị thu hồi quyền;
 * không bao giờ in nguyên mô tả kỹ thuật từ query string. Mã lạ cũng chỉ nằm trong log server.
 */
export function signInErrorMessage(code: string, context: SignInErrorContext): string {
  /**
   * `EMAIL_NOT_ALLOWED:ai@đó.com` — email đính kèm để chỉ đúng tên vừa bị từ chối.
   *
   * Nêu lại email là phần có ích nhất của thông báo này: hai ca gặp nhiều nhất là gõ nhầm một
   * chữ, và đăng nhập nhầm sang tài khoản Google khác đang mở sẵn trong trình duyệt. Cả hai
   * chỉ nhìn ra khi thấy đúng chuỗi email mà máy chủ đã đọc được.
   */
  const key = errorKey(code);
  if (key === "EMAIL_NOT_ALLOWED") {
    const email = attemptedEmail(code, context.description);
    return (
      `${email ? `Email ${email}` : "Email vừa dùng"} chưa được cấp quyền dùng công cụ này. ` +
      `Đăng nhập lại bằng đúng tài khoản đã được mời, hoặc liên hệ quản trị viên tại ` +
      `${context.adminContactEmail}.`
    );
  }

  const message = USER_MESSAGES[key] ?? "Không thể hoàn tất lượt đăng nhập này.";
  return `${message} ${contactInstruction(context.adminContactEmail)}`;
}
