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
 *
 * Đây là **sàn chung** cho mọi loại vé. Loại nào đòi cao hơn thì khai riêng ở
 * `MIN_RELAY_VERSION_BY_KIND` — đừng nâng số này lên vì một loại vé mới.
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
  /** Tạo MỚI một profile antidetect cho nick, kèm proxy và vân tay dựng sẵn. */
  CREATE_PROFILE: "CREATE_PROFILE",
  /** Prepare one signed compatibility-set activation on the enrolled device. */
  COMPATIBILITY_UPDATE: "COMPATIBILITY_UPDATE",
} as const;

export type TicketKind = (typeof TICKET_KINDS)[keyof typeof TICKET_KINDS];

/**
 * Phiên bản cầu nối tối thiểu **theo từng loại vé**.
 *
 * ## Vì sao không dùng chung một con số
 *
 * Loại vé mới chỉ cầu nối đủ mới mới hiểu. Nếu chỉ có một hằng số chung thì đúng hai lối, và cả
 * hai đều sai:
 *
 * | Lối | Hậu quả |
 * |---|---|
 * | Giữ sàn ở `1` | Cầu nối cũ nhận một loại vé nó chưa biết, chết bằng một câu vô nghĩa |
 * | Nâng sàn lên | **Mọi** vé — mật khẩu, OTP, mở profile — bị cầu nối cũ từ chối. Cả team đứng hình cho tới khi từng người cài lại `.exe` |
 *
 * Lối thứ hai đặc biệt tệ vì nó biến một tính năng **thêm vào** thành một lượt ngừng dịch vụ cho
 * những người còn chưa cần tới nó. Khai theo loại thì bản cũ mất đúng thứ nó không hiểu, còn ba
 * việc hằng ngày vẫn chạy nguyên.
 *
 * Cầu nối không phải đổi gì để hiểu bảng này: nó vốn đã so `envelope.minRelayVersion` với phiên
 * bản của chính nó, và máy chủ là bên điền số đó vào từng tấm vé.
 */
export const MIN_RELAY_VERSION_BY_KIND: Record<TicketKind, number> = {
  [TICKET_KINDS.CREDENTIAL]: MIN_RELAY_VERSION,
  [TICKET_KINDS.OTP]: MIN_RELAY_VERSION,
  /** Requires managed launch correlation and the v3 MKT Browser contract. */
  [TICKET_KINDS.LAUNCH_PROFILE]: 7,
  /** Requires managed create correlation and the v3 MKT Browser contract. */
  [TICKET_KINDS.CREATE_PROFILE]: 7,
  /** Requires the protected Phase 05 updater and dedicated smoke-profile contract. */
  [TICKET_KINDS.COMPATIBILITY_UPDATE]: 12,
};

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
      /** Nhãn proxy, để cầu nối nói được "đã đẩy proxy nào" mà không phải hỏi máy chủ. */
      proxyLabel: string;
      /**
       * Cấu hình proxy **đã dựng sẵn** ở máy chủ — mật khẩu proxy thuộc vùng server nên máy chủ
       * mở được. Nằm trong ruột vì nó vẫn là bí mật: để hở ở bao ngoài là dán mật khẩu proxy
       * vào devtools của bất cứ ai mở tab đó.
       *
       * Hình dạng khớp đúng `AntidetectProxyConfig` để cầu nối chuyển thẳng vào adapter, không
       * qua bước ánh xạ nào — mỗi bước ánh xạ giữa hai chương trình viết rời là một chỗ lệch được.
       */
      proxy: {
        protocol: "http" | "socks5";
        host: string;
        port: number;
        username?: string;
        password?: string;
      };
    }
  | {
      kind: typeof TICKET_KINDS.CREATE_PROFILE;
      accountId: string;
      /** Retry-stable idempotency key; a new ticket jti keeps this value. */
      requestId: string;
      /** MKT Browser profile name. The server makes it predictable via `profileNameForNick`. */
      profileName: string;
      /** Như `LAUNCH_PROFILE`: mật khẩu proxy thuộc vùng server nên máy chủ mở được. */
      proxy: {
        protocol: "http" | "socks5";
        host: string;
        port: number;
        username?: string;
        password?: string;
      };
      /**
       * Fingerprint expressed as **high-level controls**, matching the shape accepted by MKT Browser `create_profile`.
       *
       * It does not describe individual surfaces (UA, client hints, WebGL). MKT Browser derives one
       * consistent fingerprint from these controls and **rejects inconsistent combinations**
       * (`INVALID_INPUT`). Measured on 2026-08-07: `localeId: en-US` with
       * `timezone: Europe/London` returned an error listing the four valid timezones. Constructing
       * surfaces here would bypass that protection.
       */
      fingerprint: {
        device: string;
        localeId: string;
        timezone: string;
        screen: { width: number; height: number };
      };
      /** Hạt giống nhiễu canvas/audio/WebGL — mỗi nick một giá trị, để hai nick không trùng nhiễu. */
      seed: string;
    }
  | {
      kind: typeof TICKET_KINDS.COMPATIBILITY_UPDATE;
      manifest: unknown;
      revocations: unknown[];
      authorization: unknown;
      smokeProfile: {
        proxyLabel: string;
        proxyCountry: string;
        proxy: {
          protocol: "http" | "socks5";
          host: string;
          port: number;
          username?: string;
          password?: string;
        };
      };
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
