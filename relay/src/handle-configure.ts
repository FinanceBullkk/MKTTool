/**
 * Web app ghi hộ cấu hình xuống máy này, sau khi ADMIN đăng ký nó vào sổ.
 *
 * Đây là đường thay cho việc người cài chép tay `deviceId` và `serverPublicKey` — hai giá trị mà
 * **chỉ máy chủ mới biết**, nên bắt người ta làm người đưa thư giữa hai màn hình là ma sát không
 * đổi lấy gì. Giá trị thứ ba (`vaultKeyOperator`) thì đi đường khác và phải đi đường khác: máy
 * chủ không có nó, xem `handle-set-operator-key.ts`.
 *
 * ## Vì sao phải tự kiểm `Origin`, dù đã có CORS
 *
 * CORS **không chặn request rời đi** — nó chặn trang web *đọc phản hồi*. Một trang độc gửi
 * `POST` với `content-type: text/plain` là một "simple request": không có preflight, request tới
 * nơi và **tác dụng phụ vẫn xảy ra**, chỉ có phản hồi là họ không đọc được.
 *
 * Với `/ticket` thì tác dụng phụ chỉ là mở một profile. Với đường này thì nó là **trỏ cầu nối
 * sang một máy chủ khác** — và một cầu nối trỏ nhầm vẫn giữ `VAULT_KEY_OPERATOR`, tức nó thành
 * máy giải mã thuê cho bất kỳ ciphertext nào kẻ tấn công lấy được từ một bản sao lưu rò rỉ.
 *
 * Nên đường này đối chiếu `Origin` **trong chính thân hàm**, không nhờ header CORS làm hộ.
 */
import type { IncomingMessage } from "node:http";
import type { RelayResponseBody } from "./relay-http-server";
import { writeRelayConfig } from "./relay-config";

/** Khóa công khai Ed25519 xuất ra hex là 32 byte. */
const SERVER_PUBLIC_KEY_HEX_LENGTH = 64;

export interface ConfigureDeps {
  /** Nguồn web được tin. Nung vào bản build, ghi đè được bằng file cấu hình. */
  allowedOrigin: string | null;
  /** Thư mục dữ liệu của cầu nối. */
  home?: string;
  /** Gọi sau khi ghi xong để tiến trình nạp lại cấu hình mà không cần tắt bật. */
  onConfigured: () => { ok: boolean; message: string };
}

export function handleConfigure(
  request: IncomingMessage,
  body: string,
  deps: ConfigureDeps,
): RelayResponseBody {
  const origin = request.headers.origin;

  // Không có nguồn tin nào thì không nhận cấu hình từ ai. Cầu nối dựng từ bản build đúng quy
  // trình luôn có `BUILT_IN_WEB_ORIGIN`, nên nhánh này chỉ chạy với bản build hỏng.
  if (!deps.allowedOrigin) {
    return {
      ok: false,
      message:
        "Bản cầu nối này không nung nguồn web nào vào lúc build, nên nó không nhận cấu hình từ " +
        "đâu cả. Tải lại bản mới ở trang Tải cầu nối.",
    };
  }

  if (origin !== deps.allowedOrigin) {
    return {
      ok: false,
      message:
        `Chỉ ${deps.allowedOrigin} mới cấu hình được cầu nối này. Lời gọi vừa rồi đến từ ` +
        `${origin ?? "một nguồn không khai tên"}.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, message: "Thân request không phải JSON hợp lệ." };
  }

  const raw = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim() : "";
  if (deviceId === "") {
    return { ok: false, message: 'Thiếu "deviceId" — mã chiếc máy này trong sổ đăng ký.' };
  }

  const serverPublicKey =
    typeof raw.serverPublicKey === "string" ? raw.serverPublicKey.trim().toLowerCase() : "";
  if (
    serverPublicKey.length !== SERVER_PUBLIC_KEY_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(serverPublicKey)
  ) {
    return {
      ok: false,
      message: `"serverPublicKey" phải là ${SERVER_PUBLIC_KEY_HEX_LENGTH} ký tự hex.`,
    };
  }

  try {
    writeRelayConfig({ deviceId, serverPublicKey }, deps.home);
  } catch (error) {
    return {
      ok: false,
      message: `Không ghi được file cấu hình: ${(error as Error).message}`,
    };
  }

  // Nạp lại ngay. Ghi file mà vẫn bắt tắt bật lại là dựng lại đúng bước mà cả đường này sinh ra
  // để dẹp — và tệ hơn, người dùng vừa thấy "đã cấu hình xong" nên họ sẽ không đi tắt bật.
  return deps.onConfigured();
}
