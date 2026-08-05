/**
 * Hợp đồng HTTP giữa **trang web** và **cầu nối** chạy trên `127.0.0.1`.
 *
 * Cùng vai trò với `ticket-types.ts` nhưng ở tầng dưới: file kia tả *hình dạng tấm vé*, file này
 * tả *đường đi của nó*. Cả hai đều là thứ hai chương trình viết rời cùng đọc — GĐ4 viết phía
 * cầu nối dựa đúng vào đây, nên đổi một hằng số ở file này là đổi giao kèo với mọi `.exe` đang
 * chạy ngoài kia (QĐ 11: **không có bộ tự cập nhật**).
 *
 * ## Ba đường, và vì sao chúng khác nhau
 *
 * | Đường | Kiểu gọi | Vì sao |
 * |---|---|---|
 * | `/health` | fetch ngầm | Hỏi cầu nối còn sống không, và đang chạy bản nào |
 * | `/ticket` | fetch ngầm | Mở profile — việc không có gì để hiện ra cho người dùng xem |
 * | `/secret` | **mở tab** | Bí mật hiện ở tab của chính cầu nối, không bao giờ vào trang web |
 * | `/encrypt-for-vault` | fetch ngầm | Dựng ciphertext vùng operator lúc tạo/sửa nick |
 *
 * Đường `/secret` là **quyết định 3 của plan**: mật khẩu và OTP đi qua một tab nhỏ do cầu nối
 * phục vụ. Tab đó cùng nguồn với cầu nối nên nó **không dính luật Local Network Access** — tức
 * là lấy được mật khẩu kể cả trên chiếc máy chưa từng bấm "Cho phép". Đó là đường lùi mà plan
 * gọi là *"mất mượt, không mất an toàn"*, và ở đây nó là đường chính.
 *
 * ## Vé nằm ở FRAGMENT của URL, không nằm ở query
 *
 * Fragment (`#...`) không được trình duyệt gửi lên máy chủ nào, không vào `Referer`, và không
 * nằm trong dòng log request nào. Query (`?...`) thì có mặt ở cả ba chỗ. Vé sống 30 giây và
 * dùng một lần nên chênh lệch này nhỏ, nhưng nó miễn phí.
 */

/** Cổng cầu nối nghe. Chọn số lạ để không đụng thứ gì có sẵn trên máy Windows. */
export const RELAY_PORT = 47821;

/**
 * Gốc địa chỉ cầu nối.
 *
 * `127.0.0.1` chứ không phải `localhost`: `localhost` phân giải ra `::1` trước trên Windows, và
 * một máy chủ chỉ bind IPv4 sẽ từ chối nối — đúng kiểu hỏng khó đoán nhất, vì nó phụ thuộc cấu
 * hình mạng của từng máy chứ không phụ thuộc code.
 */
export const RELAY_ORIGIN = `http://127.0.0.1:${RELAY_PORT}`;

export const RELAY_PATHS = {
  /** GET — cầu nối còn sống không, bản mấy, khóa công khai của máy này. */
  health: "/health",
  /** POST `{ ticket }` — vé mở profile. */
  ticket: "/ticket",
  /** Mở tab, vé nằm ở fragment — trang hiện mật khẩu / OTP. */
  secret: "/secret",
  /** POST — đổi bí mật dạng trần thành ciphertext vùng operator. */
  encryptForVault: "/encrypt-for-vault",
} as const;

/**
 * Hạn giờ cho **mọi** lời gọi ngầm xuống cầu nối. Ràng buộc 2 của spike GĐ0.
 *
 * Bị luật mạng nội bộ chặn thì fetch **treo, không ném lỗi, console trắng trơn** — không tự đặt
 * hạn giờ là giao diện đứng im vĩnh viễn mà không log lại được gì. Đây không phải tinh chỉnh
 * hiệu năng, và **không bao giờ được gỡ**: người dùng bấm Chặn hoặc xóa dữ liệu site là quay
 * lại đúng cảnh đó.
 *
 * 4 giây: đủ dài cho một lượt gọi trong cùng máy kể cả lúc máy đang tải, đủ ngắn để người bấm
 * nút không nghĩ là đã treo.
 */
export const RELAY_TIMEOUT_MS = 4_000;

/** Phiên bản cầu nối mà bản web này biết cách nói chuyện. Xem `MIN_RELAY_VERSION`. */
export interface RelayHealth {
  relayVersion: number;
  /** Khóa công khai X25519 của máy này, hex — để đối chiếu với sổ đăng ký khi nghi dán nhầm. */
  publicKey: string;
  /** Cầu nối có nối được MultiZen trên cùng máy không. */
  antidetectReady: boolean;
}

/** Phản hồi chung của cầu nối cho một lời gọi ngầm. */
export interface RelayReply {
  ok: boolean;
  message: string;
  /** Cầu nối gửi kèm phiên bản trong **mọi** phản hồi — QĐ 11. */
  relayVersion: number;
}

/** Thân của `POST /encrypt-for-vault`: bí mật dạng trần, chỉ đi trong cùng một máy. */
export interface EncryptForVaultRequest {
  password?: string;
  emailPassword?: string;
  totpSecret?: string;
}

/** Ciphertext trả về — đúng tên cột trong `Account`, để chỗ gọi không phải ánh xạ lại. */
export interface EncryptForVaultReply extends RelayReply {
  passwordEnc?: string;
  emailPasswordEnc?: string;
  totpSecretEnc?: string;
}

/** Địa chỉ đầy đủ của một đường. */
export function relayUrl(path: (typeof RELAY_PATHS)[keyof typeof RELAY_PATHS]): string {
  return `${RELAY_ORIGIN}${path}`;
}

/** Địa chỉ tab hiện bí mật, vé gắn ở fragment. */
export function relaySecretUrl(ticket: string): string {
  return `${relayUrl(RELAY_PATHS.secret)}#${ticket}`;
}
