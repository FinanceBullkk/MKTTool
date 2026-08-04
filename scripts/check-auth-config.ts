/**
 * Kiểm cấu hình đăng nhập Google mà KHÔNG in ra bí mật.
 *
 * Chạy: npm run auth:check
 *
 * Vì sao cần một lệnh riêng thay vì "cứ mở app rồi bấm thử": luồng OAuth hỏng ở bước cuối
 * cùng, sau khi đã chuyển hướng sang Google và quay về — lúc đó thông báo lỗi là của Google,
 * bằng tiếng Anh, và nói về `redirect_uri` chứ không nói file nào dòng nào. Lệnh này bắt lỗi
 * TRƯỚC khi mở trình duyệt, và nói bằng tiếng Việt phải sửa gì.
 *
 * **Không bao giờ in giá trị bí mật ra màn hình.** Chỉ in độ dài và vài ký tự đầu — đủ để
 * đối chiếu "có phải chuỗi mình vừa dán không", không đủ để ai đọc lỏm màn hình dùng được.
 * Người ta hay chạy lệnh kiểm cấu hình lúc đang chia sẻ màn hình để nhờ trợ giúp.
 */
import { readEmailAccessList } from "../src/lib/auth/allowed-emails";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

let hasError = false;

function pass(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, huongDan: string) {
  hasError = true;
  console.log(`  ❌ ${label}`);
  console.log(`     → ${huongDan}`);
}

function warn(label: string, detail: string) {
  console.log(`  ⚠️  ${label} — ${detail}`);
}

/** Vài ký tự đầu + độ dài. Đủ để đối chiếu, không đủ để dùng lại. */
function mask(value: string): string {
  return `${value.slice(0, 8)}… (${value.length} ký tự)`;
}

function checkRequired(name: string, huongDan: string): string | null {
  const value = process.env[name];
  if (!value) {
    fail(`Thiếu ${name}`, huongDan);
    return null;
  }
  return value;
}

function checkSecret() {
  const secret = checkRequired(
    "BETTER_AUTH_SECRET",
    'Sinh bằng: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
  if (!secret) return;

  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    fail(
      `BETTER_AUTH_SECRET không đúng dạng (${secret.length} ký tự)`,
      "Phải là 64 ký tự hex. Sinh lại bằng lệnh trong .env.example.",
    );
    return;
  }
  pass("BETTER_AUTH_SECRET", "64 ký tự hex");
}

function checkGoogleCredentials(): { clientId: string } | null {
  const clientId = checkRequired("GOOGLE_CLIENT_ID", "Google Cloud Console → Credentials.");
  const clientSecret = checkRequired("GOOGLE_CLIENT_SECRET", "Lấy cùng chỗ với GOOGLE_CLIENT_ID.");
  if (!clientId || !clientSecret) return null;

  // Dạng thật: "<số dự án>-<chuỗi>.apps.googleusercontent.com", tổng ~72 ký tự.
  //
  // Kiểm cả phần đầu chứ không chỉ phần đuôi, vì lỗi hay gặp nhất KHÔNG phải dán nhầm ô mà là
  // **dán nguyên chuỗi mẫu trong tài liệu** (`...apps.googleusercontent.com`). Chuỗi mẫu đó
  // qua được phép kiểm "kết thúc bằng .apps.googleusercontent.com" — nên phép kiểm đó một mình
  // là vô dụng đúng vào ca cần nó nhất.
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    fail(
      `GOOGLE_CLIENT_ID không đúng dạng: ${mask(clientId)}`,
      clientId.startsWith("...") || clientId.length < 40
        ? "Đây là chuỗi MẪU trong tài liệu, không phải Client ID thật. Lấy giá trị thật ở\n" +
          "     Google Cloud Console → APIs & Services → Credentials → bấm vào OAuth client."
        : "Dạng đúng: <số>-<chuỗi>.apps.googleusercontent.com (khoảng 72 ký tự).",
    );
    return null;
  }
  pass("GOOGLE_CLIENT_ID", mask(clientId));

  // Client secret của Google: "GOCSPX-" + 28 ký tự, tổng 35.
  if (!/^GOCSPX-[\w-]{20,}$/.test(clientSecret)) {
    fail(
      `GOOGLE_CLIENT_SECRET không đúng dạng: ${mask(clientSecret)}`,
      clientSecret.length < 20
        ? "Đây là chuỗi MẪU trong tài liệu, không phải secret thật. Lấy ở cùng màn hình với Client ID."
        : "Dạng đúng: GOCSPX- kèm khoảng 28 ký tự nữa (tổng ~35).",
    );
    return null;
  }
  pass("GOOGLE_CLIENT_SECRET", mask(clientSecret));

  return { clientId };
}

function checkBaseUrl(): string {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  if (baseUrl.includes("127.0.0.1")) {
    fail(
      `BETTER_AUTH_URL đang dùng 127.0.0.1: ${baseUrl}`,
      "Đổi thành localhost. Trình duyệt coi hai địa chỉ này là hai host khác nhau khi lưu " +
        "cookie, nên cookie phiên đặt ở một bên không tới được bên kia và luồng đăng nhập hỏng.",
    );
  } else {
    pass("BETTER_AUTH_URL", baseUrl);
  }

  return baseUrl;
}

function checkEmailLists() {
  try {
    const list = readEmailAccessList();
    pass(`ALLOWED_EMAILS`, `${list.allowed.length} email: ${list.allowed.join(", ")}`);
    pass(`ADMIN_EMAILS`, `${list.admins.length} quản trị viên: ${list.admins.join(", ")}`);
  } catch (error) {
    fail(
      "Danh sách email chưa đúng",
      error instanceof Error ? error.message.replace(/\n/g, "\n     ") : String(error),
    );
  }
}

/**
 * Hỏi thẳng Google xem cặp (client_id, redirect_uri) đã khai đúng chưa.
 *
 * Đây là phép kiểm giá trị nhất trong cả lệnh này: `redirect_uri_mismatch` là lỗi phổ biến
 * nhất khi dựng OAuth, và nếu không kiểm ở đây thì nó chỉ lộ ra sau khi người dùng đã bấm
 * đăng nhập và bị Google chặn giữa đường.
 *
 * Không gửi client secret đi đâu cả — URL cấp quyền vốn là thứ công khai, chính trình duyệt
 * người dùng cũng mở đúng URL này.
 */
async function checkRedirectUriWithGoogle(clientId: string, baseUrl: string) {
  const redirectUri = `${baseUrl.replace(/\/$/, "")}/api/auth/callback/google`;
  const url =
    `${GOOGLE_AUTHORIZE_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=openid%20email%20profile`;

  console.log("");
  console.log(`Hỏi Google về redirect URI: ${redirectUri}`);

  let body: string;
  let status: number;
  try {
    const response = await fetch(url, { redirect: "manual" });
    status = response.status;
    body = await response.text();
  } catch (error) {
    warn(
      "Không hỏi được Google",
      `mất mạng hoặc bị chặn (${error instanceof Error ? error.message : error}). ` +
        "Chưa kết luận được gì — KHÔNG phải là đã đúng.",
    );
    return;
  }

  if (body.includes("redirect_uri_mismatch")) {
    fail(
      "Google từ chối: redirect_uri_mismatch",
      `Vào Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs,\n` +
        `     thêm CHÍNH XÁC chuỗi này (không thừa dấu / ở cuối):\n     ${redirectUri}`,
    );
    return;
  }

  if (body.includes("invalid_client") || body.includes("Error 401")) {
    fail(
      "Google từ chối: invalid_client",
      "GOOGLE_CLIENT_ID không tồn tại hoặc thuộc project đã xóa. Tạo lại OAuth client.",
    );
    return;
  }

  if (body.includes("deleted_client")) {
    fail("Google từ chối: deleted_client", "OAuth client này đã bị xóa. Tạo cái mới.");
    return;
  }

  /**
   * Chốt cuối: dựa vào MÃ TRẠNG THÁI, không chỉ dựa vào việc tìm thấy chuỗi lỗi.
   *
   * Bản đầu của hàm này chỉ dò mấy chuỗi `redirect_uri_mismatch` / `invalid_client` trong thân
   * trả về, và nếu không thấy thì báo ✅. Nó đã báo ✅ cho một client_id hoàn toàn bịa — vì
   * Google trả trang lỗi bằng chữ khác. Một phép kiểm chỉ biết nói "sai" khi nhận đúng chữ nó
   * chờ, còn lại luôn nói "đúng", thì nó không phải phép kiểm.
   *
   * Yêu cầu hẳn 2xx/3xx: request hợp lệ thì Google chuyển hướng sang màn hình đăng nhập (302)
   * hoặc trả thẳng màn hình chấp thuận (200). 4xx là từ chối, bất kể chữ nghĩa bên trong.
   */
  if (status >= 400) {
    fail(
      `Google từ chối với HTTP ${status}`,
      "client_id hoặc redirect_uri chưa đúng. Đối chiếu lại hai giá trị ở\n" +
        "     Google Cloud Console → Credentials → OAuth client.",
    );
    return;
  }

  pass(`Google chấp nhận client_id và redirect_uri`, `HTTP ${status}`);
}

async function main() {
  console.log("");
  console.log("Kiểm cấu hình đăng nhập Google");
  console.log("");

  checkSecret();
  const google = checkGoogleCredentials();
  const baseUrl = checkBaseUrl();
  checkEmailLists();

  if (google) {
    await checkRedirectUriWithGoogle(google.clientId, baseUrl);
  }

  console.log("");
  if (hasError) {
    console.log("❌ Còn lỗi phải sửa — xem các dòng ❌ ở trên.");
    process.exitCode = 1;
  } else {
    console.log("✅ Cấu hình đăng nhập đã sẵn sàng.");
  }
  console.log("");
}

main().catch((error) => {
  console.error("Lệnh kiểm dừng lại:", error);
  process.exitCode = 1;
});
