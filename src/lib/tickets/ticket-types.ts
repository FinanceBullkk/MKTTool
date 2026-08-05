/**
 * Hình dạng của một tấm vé — **hợp đồng giữa máy chủ và cầu nối**.
 *
 * File này là thứ duy nhất hai bên cùng đọc. Cầu nối ở GĐ4 là một chương trình riêng, đóng gói
 * thành `.exe` và **không tự cập nhật** (QĐ 11), nên bản cũ sẽ còn chạy ngoài kia rất lâu sau
 * khi máy chủ đổi định dạng. Mọi quyết định dưới đây phải đọc được dưới ánh sáng đó.
 *
 * ## Hai lớp, và vì sao phải là hai
 *
 * Bao ngoài đọc được, ruột thì mã hóa. Cầu nối cần biết **vé này có phải của mình không** và
 * **mình có đủ mới để hiểu nó không** TRƯỚC khi thử giải mã — nhét cả hai thứ đó vào phần mã
 * hóa thì cầu nối bản cũ chỉ còn cách thất bại ở bước giải mã kèm một câu vô nghĩa, thay vì
 * nói thẳng *"bản cầu nối quá cũ, tải lại"*.
 *
 * ## Vì sao `minRelayVersion` phải có ngay từ vé đầu tiên
 *
 * Thêm một trường vào định dạng đã chốt **chính nó là thay đổi phá vỡ tương thích** — đúng thứ
 * trường này sinh ra để tránh. Nên nó có mặt từ vé số một, kể cả khi hôm nay chưa ai cũ.
 */

/**
 * Phiên bản định dạng vé. Tăng khi bao ngoài đổi hình dạng theo kiểu bản cũ không đọc nổi.
 *
 * Cầu nối từ chối thẳng vé mang số nó không biết — đoán mò một định dạng lạ là cách chắc chắn
 * để hỏng ở chỗ xa nơi có thể sửa.
 */
export const TICKET_FORMAT_VERSION = 1;

/**
 * Phiên bản cầu nối tối thiểu đọc được vé máy chủ đang phát.
 *
 * Máy chủ tăng số này khi **nội dung** vé đòi hỏi khả năng mà cầu nối cũ không có. Cầu nối tự
 * so với phiên bản của chính nó; nhỏ hơn thì từ chối kèm câu bảo người dùng tải bản mới.
 */
export const MIN_RELAY_VERSION = 1;

/** Vé sống bao lâu. Đủ để bấm nút rồi cầu nối nhận, không đủ để ai đó nhặt lại dùng sau. */
export const TICKET_LIFETIME_MS = 30_000;

/**
 * Việc mà tấm vé cho phép làm. Mỗi loại một hình dạng ruột riêng.
 *
 * Chuỗi chứ không phải số: vé là thứ người ta sẽ phải đọc bằng mắt trong devtools vào ngày đi
 * tìm lỗi, và `"CREDENTIAL"` nói được điều mà `2` không nói được.
 */
export const TICKET_KINDS = {
  /** Hiện một bí mật của nick để người dùng chép. */
  CREDENTIAL: "CREDENTIAL",
  /** Sinh mã OTP từ TOTP secret của nick. */
  OTP: "OTP",
  /** Mở profile antidetect kèm cấu hình proxy dựng sẵn. */
  LAUNCH_PROFILE: "LAUNCH_PROFILE",
} as const;

export type TicketKind = (typeof TICKET_KINDS)[keyof typeof TICKET_KINDS];

/** Bí mật nào của nick đang được hỏi. Khớp tên cột trong `Account`. */
export type CredentialField = "password" | "emailPassword";

/**
 * Ruột vé — phần **mã hóa cho riêng máy nhận**, trang web không đọc được.
 *
 * Ciphertext ở đây là **nguyên văn cột trong database**, chưa giải mã: máy chủ không có khóa
 * vùng operator nên nó chuyển tiếp chứ không mở ra. Cầu nối mới là nơi có khóa.
 */
export type TicketPayload =
  | {
      kind: typeof TICKET_KINDS.CREDENTIAL;
      accountId: string;
      /** Nhãn để cầu nối hiện đúng chữ, không dùng để chọn khóa. */
      field: CredentialField;
      /** Nguyên văn `Account.passwordEnc` hoặc `Account.emailPasswordEnc`. */
      credentialCiphertext: string;
    }
  | {
      kind: typeof TICKET_KINDS.OTP;
      accountId: string;
      /** Nguyên văn `Account.totpSecretEnc`. */
      totpSecretCiphertext: string;
    }
  | {
      kind: typeof TICKET_KINDS.LAUNCH_PROFILE;
      accountId: string;
      antidetectProfileId: string;
      /**
       * Cấu hình proxy **đã dựng sẵn** ở máy chủ — mật khẩu proxy thuộc vùng server nên máy chủ
       * mở được. Nằm trong ruột vì nó vẫn là bí mật: để hở ở bao ngoài là dán mật khẩu proxy
       * vào devtools của bất cứ ai mở tab đó.
       */
      proxy: { server: string; username?: string; password?: string };
    };

/**
 * Bao ngoài — đọc được, và **chữ ký phủ lên đúng phần này**.
 *
 * Không có bí mật nào ở đây. Mọi trường tồn tại vì cầu nối cần nó trước khi giải mã được ruột.
 */
export interface TicketEnvelope {
  /** Xem `TICKET_FORMAT_VERSION`. */
  v: number;
  /** Xem `MIN_RELAY_VERSION`. */
  minRelayVersion: number;
  /**
   * Id vé, duy nhất. Cầu nối nhớ các jti đã tiêu để từ chối lượt thứ hai.
   *
   * Chống dùng lại phải nằm ở **cầu nối**, không phải máy chủ: theo QĐ 5 cầu nối không nối
   * mạng ra ngoài, nên nó không hỏi máy chủ được "vé này tiêu chưa". Máy chủ cũng không biết —
   * nó phát vé rồi thôi.
   */
  jti: string;
  /**
   * Máy nào được nhận. Cầu nối đối chiếu với id của chính nó.
   *
   * Thừa về mặt mật mã — vé mã hóa cho khóa của máy đó nên máy khác giải mã cũng hỏng. Có mặt
   * để **hỏng đúng chỗ**: "vé này không phải của máy bạn" nói được nguyên nhân, còn lỗi giải mã
   * thì trông y hệt lúc dữ liệu bị sửa.
   */
  deviceId: string;
  kind: TicketKind;
  /** Mốc hết hạn, epoch ms. */
  exp: number;
  /** Khóa công khai dùng một lần của máy chủ cho riêng tấm vé này, hex. */
  epk: string;
  /** Ruột đã mã hóa — định dạng của `credential-encryption.ts`. */
  sealed: string;
}

/** Vé hoàn chỉnh trên dây: `<bao ngoài base64url>.<chữ ký base64url>`. */
export type SignedTicket = string;
