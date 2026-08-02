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
    return "Token đã hết hạn. Vào /facebook bấm kết nối lại để lấy token mới.";
  }
  if (code === 190 && subcode === 460) {
    return "Token bị vô hiệu vì nick Facebook đổi mật khẩu. Kết nối lại ở /facebook.";
  }
  if (code === 190 && subcode === 458) {
    return "Nick Facebook đã gỡ Meta App này. Vào /facebook kết nối lại và cấp quyền.";
  }
  if (code === 190 || code === 102) {
    return "Token không dùng được nữa. Vào /facebook kết nối lại.";
  }
  if (code === 200 || code === 10) {
    return (
      "Thiếu quyền. Nick đăng nhập phải là quản trị viên của Page, và Meta App phải được " +
      "cấp pages_manage_posts + pages_read_engagement + pages_show_list."
    );
  }
  if (code === 368) {
    return (
      "Facebook đang tạm khóa thao tác của Page/nick này vì vi phạm chính sách. " +
      "DỪNG đăng, vào Facebook xem thông báo trước khi thử lại."
    );
  }
  if (code === 506) {
    return "Facebook coi đây là bài trùng với bài vừa đăng. Sửa nội dung rồi đăng lại.";
  }
  if (code === 1609005) {
    return "Facebook không lấy được nội dung xem trước của link. Kiểm tra link còn sống không.";
  }
  if (TRANSIENT_ERROR_CODES.has(code ?? -1)) {
    return "Facebook đang giới hạn tần suất hoặc gặp lỗi tạm thời. Chờ vài phút rồi thử lại.";
  }
  if (code === 100) {
    return "Facebook từ chối tham số gửi lên. Thường là thiếu nội dung hoặc link sai định dạng.";
  }
  return null;
}

/** Ghép câu hoàn chỉnh: giải thích của mình + nguyên văn Facebook + mã để tra cứu. */
export function describeGraphError(payload: GraphErrorPayload | null, fallback: string): string {
  if (!payload) return fallback;

  const parts = [explain(payload) ?? fallback];
  if (payload.message) parts.push(`Facebook nói: "${payload.message}"`);

  const codes = [
    payload.code !== undefined ? `mã ${payload.code}` : null,
    payload.error_subcode !== undefined ? `mã phụ ${payload.error_subcode}` : null,
  ].filter(Boolean);
  if (codes.length > 0) parts.push(`(${codes.join(", ")})`);

  return parts.join(" ");
}
