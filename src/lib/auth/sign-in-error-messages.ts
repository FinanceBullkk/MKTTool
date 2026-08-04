/**
 * Dịch mã lỗi của luồng OAuth thành câu tiếng Việt nói rõ phải sửa gì.
 *
 * Google chuyển hướng người dùng về `/login?error=<mã>` khi hỏng, và mã đó là chuỗi kỹ thuật
 * bằng tiếng Anh (`invalid_code`, `state_not_found`). Để nguyên thì người đọc chỉ biết là hỏng,
 * không biết hỏng ở đâu — mà mỗi mã lại ứng với một chỗ sửa hoàn toàn khác nhau: cái thì sửa
 * `.env`, cái thì sửa Google Cloud Console, cái thì chỉ cần bấm lại.
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

/** Mã Better Auth ném ra, kèm câu giải thích và việc phải làm. */
const MESSAGES: Record<string, string> = {
  /**
   * Đổi authorization code lấy token thất bại. Gần như luôn là secret sai, vì mọi nguyên nhân
   * khác (client_id sai, redirect_uri lệch) đã bị Google chặn từ trước khi tới được đây.
   */
  invalid_code:
    "Google từ chối ở bước đổi mã lấy token. Nguyên nhân gần như chắc chắn là " +
    "GOOGLE_CLIENT_SECRET trong .env không khớp với Client ID — đây là bước duy nhất dùng tới " +
    "secret, nên cũng là chỗ duy nhất secret sai lộ ra. Vào Google Cloud Console → Credentials " +
    "→ bấm vào OAuth client → lấy lại Client secret, dán vào .env rồi khởi động lại app.",

  EMAIL_NOT_ALLOWED:
    "Email này không nằm trong danh sách được phép dùng công cụ. Thêm vào ALLOWED_EMAILS " +
    "trong .env rồi khởi động lại app.",

  /** Người dùng bấm Hủy, hoặc Google chặn vì app đang ở chế độ Testing mà email chưa là test user. */
  user_creation_failed:
    "Không tạo được tài khoản. Nếu OAuth consent screen đang ở chế độ Testing thì email phải " +
    "nằm trong danh sách Test users — hoặc bấm Publish app (app chỉ xin email/profile nên " +
    "Google không bắt xét duyệt).",

  access_denied: "Bạn đã bấm hủy ở màn hình Google. Bấm đăng nhập lại nếu muốn tiếp tục.",

  /**
   * Cookie `state` không quay về được. Bẫy kinh điển của dự án này: mở app bằng `127.0.0.1`
   * trong khi Better Auth đặt cookie cho `localhost` — đúng cái bẫy mà luồng Facebook đã dính.
   */
  state_not_found:
    "Mất cookie chống CSRF giữa đường. Kiểm hai thứ: (1) đang mở app bằng đúng " +
    "http://localhost:3000 chứ không phải 127.0.0.1 — trình duyệt coi hai địa chỉ này là hai " +
    "host khác nhau khi lưu cookie; (2) BETTER_AUTH_URL trong .env cũng phải là localhost.",

  state_mismatch:
    "Tham số chống CSRF không khớp. Thường là do bấm lại một link đăng nhập cũ — " +
    "quay về /login bấm lại từ đầu.",

  unable_to_get_user_info:
    "Đăng nhập được nhưng không đọc được thông tin tài khoản từ Google. Kiểm lại ở OAuth " +
    "consent screen rằng scope `email` và `profile` vẫn còn.",

  email_not_found:
    "Google không trả về email cho tài khoản này. Công cụ định danh người dùng bằng email nên " +
    "không có email thì không vào được.",

  oauth_provider_not_found:
    "Máy chủ chưa cấu hình nhà cung cấp Google. Chạy `npm run auth:check` để xem thiếu biến nào.",

  no_code: "Google không trả về mã ủy quyền. Bấm đăng nhập lại.",

  invalid_callback_request: "Địa chỉ quay về không hợp lệ. Bấm đăng nhập lại từ /login.",
};

/**
 * Câu tiếng Việt cho một lần đăng nhập hỏng.
 *
 * `description` là câu do chính máy chủ đặt nên nó cụ thể hơn bảng tra — ưu tiên dùng. Luồng
 * OAuth của Better Auth **không** gửi kèm nó (xem chú thích `EMAIL_NOT_ALLOWED` bên dưới),
 * nhưng `proxy.ts` thì có khi đá người đã bị gỡ khỏi danh sách trắng về đây.
 *
 * Mã lạ thì **nói thẳng là mã lạ và in nguyên nó ra**, không nuốt thành "có lỗi xảy ra": bản
 * nâng cấp Better Auth có thể thêm mã mới, và lúc đó chuỗi gốc là manh mối duy nhất còn lại.
 */
export function signInErrorMessage(code: string, description?: string): string {
  if (description) return description;

  /**
   * `EMAIL_NOT_ALLOWED:ai@đó.com` — email đính kèm để chỉ đúng tên vừa bị từ chối.
   *
   * Nêu lại email là phần có ích nhất của thông báo này: hai ca gặp nhiều nhất là gõ nhầm một
   * chữ, và đăng nhập nhầm sang tài khoản Google khác đang mở sẵn trong trình duyệt. Cả hai
   * chỉ nhìn ra khi thấy đúng chuỗi email mà máy chủ đã đọc được.
   */
  const [prefix, email] = code.split(":", 2);
  if (prefix === "EMAIL_NOT_ALLOWED" && email) {
    return (
      `Email ${email} không nằm trong danh sách được phép dùng công cụ này. ` +
      `Thêm nó vào ALLOWED_EMAILS trong .env rồi khởi động lại app — hoặc đăng nhập lại bằng ` +
      `đúng tài khoản đã khai.`
    );
  }

  const known = MESSAGES[code];
  if (known) return known;

  /**
   * Đường lùi cho câu bị nối bằng gạch dưới.
   *
   * `callback.mjs` của Better Auth làm `result.error.split(" ").join("_")` trước khi gắn vào
   * `?error=`, nên bất kỳ `APIError` nào ném ra từ tầng dưới cũng tới đây dưới dạng một câu
   * dài đã bị nối. In nguyên như vậy thì gần như không đọc nổi. Trả dấu cách lại là đọc được
   * ngay, và câu đó vốn do chính mình viết nên nó vẫn là tiếng Việt tử tế.
   *
   * Chỉ áp cho chuỗi **dài**: mã thật (`invalid_code`, `state_not_found`) cũng có gạch dưới,
   * và biến chúng thành "invalid code" là làm hỏng thứ đang đúng.
   */
  if (code.length > 40 && code.includes("_")) {
    return `${code.replace(/_/g, " ")} (thông báo từ máy chủ)`;
  }

  return (
    `Đăng nhập hỏng với mã lỗi "${code}" — mã này chưa có giải thích tiếng Việt. ` +
    `Chạy \`npm run auth:check\` để loại trừ lỗi cấu hình, và xem log máy chủ để biết thêm.`
  );
}
