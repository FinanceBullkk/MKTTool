/**
 * Bọc khóa vùng operator cho **một chiếc máy khác**. Chạy trên cầu nối của ADMIN.
 *
 * ## Vì sao đường này an toàn dù cầu nối không biết ai là ADMIN
 *
 * Cầu nối không có phiên đăng nhập, nên nó không phân biệt nổi trình duyệt của quản trị viên với
 * trình duyệt của người khác. Đường này không cần điều đó, vì thứ nó phát ra **vô dụng với chính
 * người vừa gọi nó**: một cái hộp chỉ mở được bằng khóa riêng của máy nhận.
 *
 * Ca xấu nhất là ai đó bọc khóa cho khóa công khai của chính họ — nhưng muốn làm thế thì họ phải
 * gọi được cầu nối **trên máy của họ**, mà cầu nối ấy đã giữ sẵn khóa vùng operator dạng trần
 * trong `relay-config.json` ngay cạnh `.exe`. Không leo thang được gì.
 *
 * Đó là ranh giới phân biệt đường này với bản bị thay thế (`/wrap-vault-key`), thứ trả **cả hộp
 * lẫn chìa** về cho trang web gọi nó. Bất biến phải giữ: *cầu nối không bao giờ phát ra thứ mà
 * chính dữ liệu trong phản hồi đó mở được.*
 *
 * ## Vẫn kiểm `Origin`, cùng lý lẽ với `handle-configure.ts`
 *
 * CORS chặn việc *đọc phản hồi*, không chặn request rời đi. Ở đây tác dụng phụ bằng không (hàm
 * thuần, không ghi gì), nên kiểm `Origin` không phải để chặn mất mát — nó chặn việc một trang lạ
 * bắt cầu nối nghiền X25519 liên tục, và giữ cho mọi đường vào cùng một hình dạng.
 */
import type { IncomingMessage } from "node:http";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { SealedBoxError, sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import type { RelayResponseBody } from "./relay-http-server";

export interface SealOperatorKeyDeps {
  /** Nguồn web được tin. Nung vào bản build, ghi đè được bằng file cấu hình. */
  allowedOrigin: string | null;
  /** Khóa vùng operator đang nằm trong bộ nhớ, hoặc `null` khi máy này chưa cấu hình xong. */
  vaultKeyOperator: Buffer | null;
  notConfiguredMessage: string;
}

export function handleSealOperatorKey(
  request: IncomingMessage,
  body: string,
  deps: SealOperatorKeyDeps,
): RelayResponseBody {
  const origin = request.headers.origin;

  // Trang trạng thái của chính cầu nối cũng được gọi — nó không dùng đường này hôm nay, nhưng
  // chặn nó lại thì ngày cần thêm một nút ở đó sẽ hỏng theo kiểu không ai đoán ra.
  if (origin !== deps.allowedOrigin && origin !== RELAY_ORIGIN) {
    return {
      ok: false,
      message:
        `Chỉ ${deps.allowedOrigin ?? "web app của team"} mới nhờ cầu nối này bọc khóa được. ` +
        `Lời gọi vừa rồi đến từ ${origin ?? "một nguồn không khai tên"}.`,
    };
  }

  // Máy chưa có khóa thì không bọc hộ ai được. Đây là ca có thật và là ca đầu tiên của cả hệ:
  // chiếc máy ĐẦU TIÊN không được cấp khóa từ đâu cả — nó phải dán tay ở trang trạng thái, vì
  // lúc đó chưa tồn tại cầu nối thứ hai nào để bọc từ đó.
  if (!deps.vaultKeyOperator) {
    return { ok: false, message: deps.notConfiguredMessage };
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
  const recipientPublicKey =
    typeof raw.recipientPublicKey === "string" ? raw.recipientPublicKey.trim() : "";

  if (recipientPublicKey === "") {
    return { ok: false, message: 'Thiếu "recipientPublicKey" — khóa công khai của máy nhận.' };
  }

  try {
    // Bọc chính chuỗi hex, không bọc Buffer: hai chương trình viết rời phải thống nhất một cách
    // biểu diễn, và hex là thứ cả file cấu hình lẫn `vault:keygen` đang dùng.
    const grant = sealForDevice(
      { vaultKeyOperator: deps.vaultKeyOperator.toString("hex") },
      recipientPublicKey,
    );

    return {
      ok: true,
      message: "Đã bọc khóa cho máy nhận.",
      ephemeralPublicKey: grant.ephemeralPublicKey,
      sealed: grant.sealed,
    };
  } catch (error) {
    if (error instanceof SealedBoxError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
