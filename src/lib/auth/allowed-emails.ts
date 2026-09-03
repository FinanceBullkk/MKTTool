/**
 * Danh sách email được phép đăng nhập, và ai trong số đó là quản trị viên.
 *
 * Đọc từ biến môi trường chứ KHÔNG từ database. Lý do: danh sách này là thứ chặn người lạ
 * vào kho danh tính, nên nó không được phép sửa từ bên trong chính app. Để trong database
 * thì bất kỳ lỗ hổng nào cho ghi được một dòng cũng là lỗ hổng cấp quyền đăng nhập; để ở
 * biến môi trường thì phải chạm được vào máy chủ mới sửa nổi.
 *
 * Hệ quả có chủ ý: thêm người mới phải sửa biến rồi khởi động lại. Với team 5-6 người,
 * vài lần một năm, đó là cái giá đúng.
 *
 * **Không có tự đăng ký.** Google chỉ chứng minh "người này sở hữu email đó", không chứng
 * minh "người này thuộc team". Thiếu danh sách trắng thì bất kỳ ai có Gmail cũng vào được.
 */

/** Tách chuỗi "a@x.com, b@y.com" thành danh sách đã chuẩn hóa, bỏ mục rỗng. */
function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map(normalizeEmail)
    .filter((email) => email.length > 0);
}

/**
 * Chuẩn hóa để so sánh: bỏ khoảng trắng thừa và hạ chữ thường.
 *
 * Cố ý KHÔNG xử lý mẹo riêng của Gmail (bỏ dấu chấm, cắt phần sau dấu +). Nghe thì tiện
 * nhưng nó nới danh sách trắng theo hướng khó thấy: `a.b@gmail.com` và `ab@gmail.com` thành
 * một, và người viết danh sách không hề biết mình vừa cho thêm ai vào. So khớp đúng từng ký
 * tự (sau khi hạ chữ thường) là thứ người đọc danh sách nhìn thấy được.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Kết quả đọc cấu hình danh sách trắng. */
export interface EmailAccessList {
  /** Mọi email được phép đăng nhập (đã gồm cả quản trị viên). */
  allowed: string[];
  /** Tập con của `allowed` mang vai trò ADMIN. */
  admins: string[];
}

/**
 * Chỉ hai biến hàm này thật sự đọc.
 *
 * Cố ý hẹp hơn `NodeJS.ProcessEnv`: test dựng được cấu hình giả bằng một object hai khóa,
 * không phải bịa cả `NODE_ENV` lẫn mọi biến khác chỉ để gọi được hàm.
 */
export interface EmailAccessEnv {
  ALLOWED_EMAILS?: string;
  ADMIN_EMAILS?: string;
  /** Cho phép truyền thẳng `process.env` vào — nó có index signature y hệt. */
  [key: string]: string | undefined;
}

/**
 * Đọc và kiểm tra hai biến `ALLOWED_EMAILS` và `ADMIN_EMAILS`.
 *
 * Ném lỗi thay vì trả về danh sách rỗng khi thiếu cấu hình — **hỏng đóng, không hỏng mở**.
 * Một danh sách rỗng hiểu theo nghĩa "chưa cấu hình" thì rất dễ trở thành "cho qua hết" ở
 * một nhánh code nào đó sau này; ném lỗi lúc khởi động thì không có nhánh nào để lọt.
 */
export function readEmailAccessList(env: EmailAccessEnv = process.env): EmailAccessList {
  const allowed = parseEmailList(env.ALLOWED_EMAILS ?? "");
  const admins = parseEmailList(env.ADMIN_EMAILS ?? "");

  if (allowed.length === 0) {
    throw new Error(
      "ALLOWED_EMAILS is missing. Without it, anyone with a Google account could sign in.\n" +
        'Add it to .env, for example: ALLOWED_EMAILS="you@example.com,colleague@example.com"',
    );
  }

  if (admins.length === 0) {
    throw new Error(
      "ADMIN_EMAILS is missing. At least one administrator is required so someone can assign\n" +
        'nicks to teammates. For example: ADMIN_EMAILS="you@example.com"',
    );
  }

  // Quản trị viên không có trong danh sách cho phép là lỗi cấu hình im lặng kiểu tệ nhất:
  // người đó đăng nhập bị từ chối, còn người viết cấu hình thì đinh ninh đã cấp quyền cao
  // nhất. Bắt ngay lúc khởi động, đừng để lộ ra ở màn hình đăng nhập của người khác.
  const missing = admins.filter((admin) => !allowed.includes(admin));
  if (missing.length > 0) {
    throw new Error(
      `ADMIN_EMAILS contains email addresses that are not in ALLOWED_EMAILS: ${missing.join(", ")}.\n` +
        "Administrators must also be allowed to sign in. Add them to ALLOWED_EMAILS.",
    );
  }

  return { allowed, admins };
}

/** Đầu mối hỗ trợ duy nhất lấy từ thứ tự đã cấu hình trong `ADMIN_EMAILS`. */
export function readAdminContactEmail(env: EmailAccessEnv = process.env): string {
  const [contact] = readEmailAccessList(env).admins;
  if (!contact) throw new Error("No administrator email is available as a support contact.");
  return contact;
}

/** Email này có được phép đăng nhập không. */
export function isEmailAllowed(email: string, list: EmailAccessList): boolean {
  return list.allowed.includes(normalizeEmail(email));
}

/**
 * Vai trò của email. Gọi sau khi đã biết email được phép.
 *
 * Trả về `OPERATOR` cho email không nằm trong danh sách admin — kể cả email không được phép
 * đăng nhập. Việc chặn đăng nhập là của `isEmailAllowed`; hàm này cố ý không kiêm luôn, để
 * không ai nhầm rằng gọi nó là đã kiểm tra quyền vào.
 */
export function roleForEmail(email: string, list: EmailAccessList): "ADMIN" | "OPERATOR" {
  return list.admins.includes(normalizeEmail(email)) ? "ADMIN" : "OPERATOR";
}
