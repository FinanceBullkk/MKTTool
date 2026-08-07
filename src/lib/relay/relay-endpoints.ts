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
  /** POST `{ ticket }` — vé thao tác với profile: mở, và từ bản 6 là tạo. */
  ticket: "/ticket",
  /**
   * GET — liệt kê profile antidetect **trên máy này**.
   *
   * Không cần vé, và đó là chủ ý: tên với id profile không phải bí mật, còn danh sách thì máy chủ
   * vốn không nhìn thấy nên không có gì để nó cho phép hay từ chối. Lớp gác vẫn là CORS
   * `webOrigin` như `/health` — chỉ web app của team gọi được.
   */
  profiles: "/profiles",
  /** Mở tab, vé nằm ở fragment — trang hiện mật khẩu / OTP. */
  secret: "/secret",
  /** POST — đổi bí mật dạng trần thành ciphertext vùng operator. */
  encryptForVault: "/encrypt-for-vault",
  /** POST `{ deviceId, serverPublicKey }` — web app ghi hộ cấu hình sau khi đăng ký máy. */
  configure: "/configure",
  /**
   * POST `{ vaultKeyOperator, multizenToken? }` — **chỉ trang của chính cầu nối gọi được**.
   *
   * Tách khỏi `/configure` vì hai đường đi từ hai phía và không bao giờ được gộp: máy chủ biết
   * `deviceId` nhưng **không** có khóa vùng operator, và ngày nó có thì GĐ3 mất nghĩa.
   */
  setOperatorKey: "/set-operator-key",
  /**
   * POST `{ recipientPublicKey }` — **cầu nối của ADMIN** bọc khóa vùng operator cho một máy khác.
   *
   * Trả về một cái hộp mà **chỉ chiếc máy nhận mở được**, không phải khóa. Đó là điểm phân biệt
   * với mọi đường khác ở đây, và là điều kiện để đường này an toàn mà không cần cầu nối biết ai
   * là ADMIN: thứ nó phát ra vô dụng với chính người vừa gọi nó.
   */
  sealOperatorKey: "/seal-operator-key",
  /** POST `{ ephemeralPublicKey, sealed }` — máy nhận mở hộp bằng khóa riêng của nó rồi lưu lại. */
  receiveOperatorKey: "/receive-operator-key",
} as const;

/**
 * Nguồn web mà cầu nối tin, **nung vào `.exe` lúc build**.
 *
 * ## Vì sao không để người cài dán vào như ba giá trị kia
 *
 * Chưa cấu hình thì `allowedOrigin` là `null`, và cầu nối **không trả header CORS nào** — chưa
 * biết ai được phép thì không cho ai cả. Đúng, nhưng nó khóa luôn đường mà GĐ6 cần: web app
 * không thể tự cấu hình hộ một chiếc máy mà nó chưa được phép nói chuyện. Con gà và quả trứng.
 *
 * Lối ra rẻ nhất là nới CORS trong lúc chưa cấu hình. **Không được** — lúc đó bất kỳ trang web
 * nào người dùng đang mở cũng trỏ được cầu nối sang máy chủ của nó, và một cầu nối trỏ nhầm là
 * một **máy giải mã thuê**: nó vẫn giữ `VAULT_KEY_OPERATOR`, nên kẻ cầm được một bản sao lưu rò
 * rỉ có chỗ để mở từng mật khẩu nick ra.
 *
 * Lối ra đúng là nhận ra `webOrigin` **chưa bao giờ là dữ liệu riêng của từng máy** — cả team
 * dùng chung một địa chỉ. Nung vào bản build thì cầu nối biết tin ai ngay từ giây đầu tiên, và
 * người cài bớt được một giá trị phải chép.
 *
 * Đổi domain thì **không phải build lại**: `webOrigin` trong `relay-config.json` vẫn ghi đè được.
 * Nung vào chỉ là đổi mặc định từ *"không tin ai"* thành *"tin đúng địa chỉ của team"*.
 */
export const BUILT_IN_WEB_ORIGIN = process.env.RELAY_WEB_ORIGIN?.trim() || "http://localhost:3000";

/**
 * Khóa vùng operator đã bọc cho **riêng một chiếc máy**.
 *
 * Cùng hình dạng với `SealedPayload` của `ticket-sealed-box.ts`, và cố ý dùng lại đúng cơ chế đó
 * thay vì nghĩ ra cái mới: nó đã được soi kỹ, đã có test, và đã chạy trên mọi tấm vé. Khai lại ở
 * file hợp đồng này vì đây là thứ **web app cầm và chuyển tiếp** — nó không được import từ
 * `tickets/` để rồi kéo theo cả cây phụ thuộc của máy chủ vào bundle trình duyệt.
 */
export interface SealedOperatorKeyGrant {
  /** Khóa công khai dùng một lần của bên bọc, hex. */
  ephemeralPublicKey: string;
  /** Khóa vùng operator đã mã hóa — định dạng `v1.iv.tag.ct`. */
  sealed: string;
}

/** Thân của `POST /seal-operator-key`: khóa công khai của chiếc máy sẽ nhận. */
export interface SealOperatorKeyRequest {
  /** `RelayDevice.publicKey` của máy nhận, hex. Công khai đúng nghĩa — lộ cũng không mất gì. */
  recipientPublicKey: string;
}

/** Hộp đã bọc, để web app đẩy lên máy chủ giữ hộ. */
export interface SealOperatorKeyReply extends RelayReply, Partial<SealedOperatorKeyGrant> {}

/** Thân của `POST /configure` — hai giá trị mà chỉ máy chủ mới biết. */
export interface ConfigureRelayRequest {
  /** `RelayDevice.id` vừa sinh ra lúc đăng ký máy này. */
  deviceId: string;
  /** Khóa công khai Ed25519 của máy chủ, hex. */
  serverPublicKey: string;
}

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

/**
 * Hạn giờ cho những lời gọi **bắt MultiZen làm việc nặng**: tạo profile, và mở profile.
 *
 * ## Vì sao 4 giây sai ở đúng hai chỗ này
 *
 * Con số kia đo *"một lượt gọi trong cùng máy"* — ping, bọc bí mật, liệt kê profile đều xong trong
 * vài chục mili giây (đo 07/08/2026: `GET /profiles` mất **78 ms**). Hai việc dưới đây thì không:
 *
 * | Việc | MultiZen phải làm gì |
 * |---|---|
 * | Tạo profile | dựng cả một hồ sơ Chromium trên đĩa, kèm proxy và vân tay |
 * | Mở profile | đẩy proxy vào profile, **rồi** bật một cửa sổ Chromium thật |
 *
 * Cả hai vượt 4 giây một cách bình thường, và càng lâu hơn khi proxy chậm.
 *
 * ## Đã vấp thật 07/08/2026, cả hai lần trên máy thật
 *
 * Lượt tạo: profile sinh ra đầy đủ và đúng bên MultiZen, trình duyệt bỏ cuộc ở giây thứ tư. Lượt
 * mở: cửa sổ Chromium hiện lên bình thường, trình duyệt vẫn báo hỏng. Cả hai lần đều ra câu
 * *"trình duyệt không cho trang này gọi xuống máy của bạn"* — **đoán sai hoàn toàn**, vì suy luận
 * *"hết hạn giờ ⟹ bị luật mạng nội bộ nuốt"* chỉ đúng khi lời gọi vốn nhanh.
 *
 * Ở lượt tạo, hệ quả còn nặng hơn câu chữ: lượt ghi id vào kho không chạy tới nơi.
 *
 * 60 giây: đủ cho lượt chậm nhất từng đo, vẫn đủ ngắn để không treo giao diện vĩnh viễn khi
 * MultiZen thật sự chết. Kèm theo nó là **đường dò lại** ở `antidetect-profile-card.tsx` — nới hạn
 * giờ chỉ làm ca hỏng hiếm đi, không làm nó biến mất.
 */
export const RELAY_PROFILE_WORK_TIMEOUT_MS = 60_000;

/**
 * Phiên bản của bản cầu nối **dựng ra từ cây mã nguồn này**.
 *
 * Ba con số phiên bản trong hệ, đừng lẫn (hai cái kia ở `src/lib/tickets/ticket-types.ts`):
 *
 *   `TICKET_FORMAT_VERSION`  hình dạng bao ngoài của vé. Máy chủ khai, cầu nối đối chiếu.
 *   `MIN_RELAY_VERSION`      bản cầu nối tối thiểu máy chủ đòi. Máy chủ khai vào từng tấm vé.
 *   `RELAY_VERSION` (đây)    bản cầu nối. Cầu nối tự khai, gửi kèm **mọi** phản hồi.
 *
 * ## Vì sao số này nằm ở file hợp đồng, không nằm trong `relay/`
 *
 * Nó có **hai người đọc**: cầu nối tự khai mình bản mấy, và web app so con số nhận được với
 * bản mà máy chủ đang phát hành để hiện dải *"cầu nối bản cũ, tải bản mới ở đây"* (QĐ 11 — không
 * có bộ tự cập nhật). Để hai bản sao ở hai nơi thì có ngày một bên tăng còn bên kia quên, và
 * kiểu hỏng đó là **cảnh báo im lặng**: mọi người chạy bản cũ mà không dải nào kêu.
 *
 * File này vốn đã là chỗ hai bên cùng đọc — cầu nối lấy `RELAY_ORIGIN`, `RELAY_PATHS` từ đây.
 *
 * **Tăng khi phát hành một bản `.exe` mới có thay đổi người dùng thấy được.** Đây là số phải nhớ
 * tăng bằng tay: tự sinh theo git hash thì nó đổi ở mọi lượt build, và một số đổi liên tục thì
 * cảnh báo "bản cũ" kêu liên tục cho tới lúc không ai còn nhìn.
 */
export const RELAY_VERSION = 6;

/**
 * Một profile antidetect như cầu nối khai ra ở `GET /profiles`.
 *
 * Khai lại ở file hợp đồng này thay vì import từ `antidetect/` với cùng lý do như
 * `SealedOperatorKeyGrant`: đây là thứ **trình duyệt** cầm, và kéo cây phụ thuộc của máy chủ vào
 * bundle client là cái giá không cần trả cho năm cái trường.
 */
export interface RelayProfileSummary {
  id: string;
  name: string;
  isRunning?: boolean;
  /** Quốc gia proxy đang gắn, chữ thường. Lệch với `timezone` là dấu hiệu quên căn proxy. */
  proxyCountry?: string;
  timezone?: string;
}

/**
 * Danh mục giá trị hợp lệ để dựng vân tay, lấy từ chính MultiZen.
 *
 * **Không** phải bảng cứng viết trong code: bảng cứng mục đúng vào ngày họ thêm một locale, và
 * lúc đó nó sẽ chặn nhầm những tổ hợp vốn hợp lệ.
 */
export interface RelayFingerprintOptions {
  devices: { family: string; label: string; screens: { width: number; height: number }[] }[];
  locales: { id: string; label: string; country: string; timezones: string[] }[];
}

/** Những gì `GET /profiles` trả về — danh sách profile CỘNG danh mục để dựng cái mới. */
export interface RelayProfilesReply extends RelayReply {
  profiles?: RelayProfileSummary[];
  fingerprintOptions?: RelayFingerprintOptions;
}

/** Những gì `/health` trả về. */
export interface RelayHealth {
  relayVersion: number;
  /** Khóa công khai X25519 của máy này, hex — để đối chiếu với sổ đăng ký khi nghi dán nhầm. */
  publicKey: string;
  /** Cầu nối có nối được MultiZen trên cùng máy không. */
  antidetectReady: boolean;
  /** Cấu hình đã đủ chưa. Web app dùng để vẽ đúng nút thay vì đoán. */
  configured?: boolean;
  /**
   * Nguồn web mà cầu nối này tin — nung vào bản build, ghi đè được bằng file cấu hình.
   *
   * Khai ra để chẩn đoán được ca hỏng khó đoán nhất: một bản `.exe` dựng nhầm nguồn thì **mọi**
   * lời gọi chết theo kiểu CORS, và không câu lỗi nào của trình duyệt chỉ về phía này. Đây không
   * phải bí mật — nó là địa chỉ công khai của chính web app đang hỏi.
   */
  webOrigin?: string;
  /**
   * Mã máy mà **chính chiếc máy này** nghĩ là của nó, hoặc `null` khi chưa được cấu hình.
   *
   * Không suy ra được từ sổ trên máy chủ: sổ trả lời *"khóa này thuộc máy nào"*, còn câu web app
   * cần là *"chiếc máy đang ngồi đã biết mình là ai chưa"*. Hai câu lệch nhau đúng vào lúc đáng
   * quan tâm nhất — máy đã đăng ký nhưng chưa nhận được cấu hình.
   */
  deviceId?: string | null;
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
