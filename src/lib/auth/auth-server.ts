/**
 * Cấu hình Better Auth — đăng nhập bằng Google, không có mật khẩu, không có tự đăng ký.
 *
 * ## Vì sao chặn ở HAI chỗ chứ không một
 *
 * Danh sách trắng được kiểm cả lúc tạo tài khoản lẫn ở **mọi request** (`requireActor`).
 * Nghe thừa, nhưng hai chỗ đó trả lời hai câu khác nhau:
 *
 * - Chặn lúc tạo tài khoản chỉ chạy ở lần đăng nhập ĐẦU TIÊN. Nếu chỉ có nó, thì gỡ một
 *   người khỏi `ALLOWED_EMAILS` sau khi họ đã đăng nhập một lần sẽ **không đuổi được họ** —
 *   hàng `User` đã nằm trong database và phiên vẫn còn hiệu lực.
 * - Kiểm ở mỗi request thì gỡ tên khỏi biến môi trường là mất quyền ngay lập tức, kể cả khi
 *   người đó đang mở sẵn tab. Đây mới là thứ cần khi có người rời team.
 *
 * Chỗ thứ nhất tồn tại để báo lỗi tử tế và không để lại hàng rác trong database; chỗ thứ hai
 * mới là chốt chặn thật.
 *
 * ## Google chứng minh cái gì
 *
 * Google chỉ chứng minh "người này sở hữu email đó" — KHÔNG chứng minh "người này thuộc team".
 * Thiếu danh sách trắng thì bất kỳ ai có Gmail cũng vào được kho danh tính. Đó là lý do
 * `readEmailAccessList()` ném lỗi khi thiếu biến thay vì cho qua.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "../db/prisma-client";
import { isEmailAllowed, readEmailAccessList, roleForEmail } from "./allowed-emails";
import { readTrustedProxyConfig } from "./trusted-proxy-config";

/**
 * Đọc một biến bắt buộc, thiếu thì dừng kèm chỉ dẫn.
 *
 * Cùng nguyên tắc với `TEAM_TIMEZONE`: thiếu cấu hình thì dừng hẳn, không lặng lẽ chạy tiếp
 * ở chế độ yếu hơn. Với đăng nhập thì "chế độ yếu hơn" nghĩa là không có đăng nhập.
 */
function requiredEnv(name: string, huong_dan: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu ${name}. ${huong_dan}`);
  }
  return value;
}

/**
 * Khởi tạo TRỄ, không phải hằng số cấp module.
 *
 * Bản đầu viết `export const auth = betterAuth({...})`, và nó đọc biến môi trường ngay lúc
 * file được nạp. Hai chỗ hỏng vì vậy:
 *
 * 1. `next build` nạp mọi route để phân tích. Build trên Railway (GĐ5) chạy trong Docker
 *    **không có secret lúc build** — app sẽ không build nổi, và thông báo lỗi lại trỏ vào
 *    một route ngẫu nhiên chứ không nói là thiếu cấu hình.
 * 2. Bất kỳ test nào chạm gián tiếp vào tầng auth đều phải có sẵn credential Google thật.
 *
 * Gọi trễ thì biến chỉ cần có mặt lúc thật sự phục vụ một request — đúng lúc nó thật sự cần.
 */
let cachedAuth: ReturnType<typeof createAuth> | null = null;

/** Exported for the two-process Postgres probe; production uses this exact immutable contract. */
export const AUTH_RATE_LIMIT = {
  enabled: true,
  storage: "database",
  window: 10,
  max: 100,
} as const;

/** Lấy thể hiện Better Auth, dựng ở lần gọi đầu rồi dùng lại. */
export function getAuth(): ReturnType<typeof createAuth> {
  cachedAuth ??= createAuth();
  return cachedAuth;
}

function createAuth() {
  const proxyConfig = readTrustedProxyConfig();
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),

    /** Keep counters durable across restarts and Railway replicas. */
    rateLimit: AUTH_RATE_LIMIT,

    /**
     * Only explicitly configured proxy headers are considered. With no CIDR,
     * Better Auth accepts a single forwarded address and rejects multi-hop
     * chains; a production deployment must record exact edge CIDRs before
     * enabling a multi-hop list.
     */
    advanced: {
      ipAddress: proxyConfig,
      /**
       * Cookie phiên: `httpOnly` để JavaScript không đọc được, `sameSite: lax` để chặn CSRF
       * mà vẫn quay về được sau khi Google chuyển hướng.
       *
       * `secure` bật theo production: trên Railway là HTTPS nên bắt buộc, còn máy dev chạy
       * `http://localhost` thì cookie `secure` sẽ không bao giờ được gửi đi.
       */
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },

    /**
     * Khóa ký cookie phiên. Đổi khóa này là đăng xuất toàn bộ team — đó cũng là cách
     * đuổi hết mọi phiên khi nghi bị lộ.
     */
    secret: requiredEnv(
      "BETTER_AUTH_SECRET",
      "Sinh bằng: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    ),

    /**
     * Địa chỉ gốc của app. Phải khớp từng ký tự với thứ đã khai ở Google Cloud Console,
     * và phải là `localhost` chứ không phải `127.0.0.1` — trình duyệt coi hai cái đó là hai
     * host khác nhau khi lưu cookie, đúng cái bẫy mà luồng Facebook đã dính (xem README).
     */
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

    socialProviders: {
      google: {
        clientId: requiredEnv("GOOGLE_CLIENT_ID", "Lấy ở Google Cloud Console — xem README."),
        clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET", "Lấy cùng chỗ với GOOGLE_CLIENT_ID."),
      },
    },

    /**
     * Better Auth mặc định muốn đặt tên bảng liên kết OAuth là `Account` — trùng đúng tên
     * model nick mạng xã hội đã có từ Phase 01. Đổi tên bảng của Better Auth chứ KHÔNG đổi
     * cái đang có: `Account` đã nằm trong 37 server action, mọi truy vấn của bộ luật và toàn
     * bộ tài liệu.
     */
    account: { modelName: "AuthAccount" },

    user: {
      additionalFields: {
        /**
         * `input: false` — vai trò KHÔNG nhận từ phía client. Thiếu cờ này thì người đăng nhập
         * có thể tự khai `role: "ADMIN"` trong request đăng ký. Vai trò luôn tính từ
         * `ADMIN_EMAILS` ở phía máy chủ.
         */
        role: { type: "string", required: false, defaultValue: "OPERATOR", input: false },
      },
    },

    databaseHooks: {
      user: {
        create: {
          /**
           * Chặn ngay trước khi tạo hàng `User`, và gán vai trò theo `ADMIN_EMAILS`.
           *
           * Đây KHÔNG phải chốt chặn chính (xem chú thích đầu file) — chốt chặn chính là
           * `requireActor()`. Chỗ này để báo lỗi sớm và không để lại hàng rác.
           */
          before: async (user) => {
            const list = readEmailAccessList();

            if (!isEmailAllowed(user.email, list)) {
              /**
               * Ném `APIError`, và **thông điệp phải là một mã ngắn không có dấu cách**.
               *
               * Hai ràng buộc này đều do đường đi của Better Auth quy định, và cả hai đều đã
               * sai một lần trước khi viết được dòng này:
               *
               * 1. `new Error` thường thì `handleOAuthUserInfo` nuốt mất và trả về đúng chuỗi
               *    `"unable to create user"` — người dùng không biết mình vướng danh sách trắng.
               *    Chỉ `APIError` mới giữ được thông điệp của mình (`link-account.mjs`:
               *    `if (isAPIError(e)) return { error: e.message }`).
               * 2. Nhưng thông điệp đó **không đi vào chỗ hiển thị**, nó đi vào chỗ **mã lỗi**:
               *    `callback.mjs` làm `result.error.split(" ").join("_")` rồi gắn vào
               *    `?error=`. Viết cả câu tiếng Việt vào đây thì người dùng nhận nguyên câu đó
               *    với mọi dấu cách biến thành gạch dưới, cụt đuôi ở rìa màn hình.
               *
               * Nên chỗ này chỉ gửi **mã**, còn câu tiếng Việt nằm ở `sign-in-error-messages.ts`.
               * Email đính sau dấu hai chấm và đi qua được vì bản thân email không có dấu cách —
               * giữ nó lại để người gõ nhầm một chữ nhìn ra ngay mình vừa gõ gì.
               */
              throw APIError.from("FORBIDDEN", {
                code: "EMAIL_NOT_ALLOWED",
                message: `EMAIL_NOT_ALLOWED:${user.email}`,
              });
            }

            return { data: { ...user, role: roleForEmail(user.email, list) } };
          },
        },
      },
    },

    session: {
      /**
       * 7 ngày. Đủ dài để không phải đăng nhập lại mỗi sáng, đủ ngắn để một máy bị mất không
       * mở được kho danh tính vô thời hạn. Ngắn hơn nữa cũng ít tác dụng vì `requireActor()`
       * kiểm danh sách trắng ở mọi request — gỡ tên là mất quyền ngay, không phải chờ hết hạn.
       */
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

  });
}
