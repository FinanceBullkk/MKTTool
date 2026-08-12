/**
 * Nhận khóa vùng operator đã được một cầu nối khác bọc cho **chính máy này**.
 *
 * ## Vì sao đường này ĐƯỢC phép nhận từ web app, còn `/set-operator-key` thì không
 *
 * `handle-set-operator-key.ts` chặn mọi nguồn trừ trang của chính cầu nối, vì thứ đi qua nó là
 * khóa **dạng trần** — để nó đi qua một ô nhập trên trang web là để nó đi qua máy chủ, và cả
 * kiến trúc mất nghĩa trong đúng một form.
 *
 * Ở đây thứ đi qua là một cái **hộp đã khóa**. Web app cầm nó, chuyển nó, nhưng mở không nổi:
 * muốn mở phải có khóa riêng X25519 của chính máy này, thứ chưa bao giờ rời khỏi ổ cứng của nó.
 * Nên trình duyệt ở đường này đúng vai nó vẫn làm với vé — người đưa thư, không phải người đọc.
 *
 * ## Vì sao không cần kiểm `Origin` để giữ an toàn
 *
 * Một trang lạ gửi "simple request" xuống đây thì tác dụng phụ duy nhất có thể xảy ra là **ghi
 * được một khóa hợp lệ vào máy này** — mà muốn dựng được một cái hộp mở ra bằng khóa riêng của
 * máy này thì họ đã phải có khóa công khai của nó *và* có sẵn khóa vùng operator. Kẻ đã cầm được
 * khóa vùng operator thì đã ở trong rồi.
 *
 * Hộp không mở được thì hàm dừng **trước khi ghi**. Đó mới là thứ giữ an toàn cho đường này, chứ
 * không phải header — nên nó được viết ra thành một nhánh rõ ràng, không phải một hệ quả tình cờ.
 */
import { SealedBoxError, openSealedPayload } from "../../src/lib/tickets/ticket-sealed-box";
import { writeRelayConfig } from "./relay-config";
import type { RelayResponseBody } from "./relay-http-server";
import type { KeyObject } from "node:crypto";

/** Cùng con số với `VAULT_KEY_HEX_LENGTH` phía máy chủ. */
const VAULT_KEY_HEX_LENGTH = 64;

export interface ReceiveOperatorKeyDeps {
  /** Khóa riêng X25519 của chính máy này — thứ duy nhất mở được hộp. */
  devicePrivateKey: KeyObject;
  home?: string;
  onConfigured: () => { ok: boolean; message: string };
}

export function handleReceiveOperatorKey(
  body: string,
  deps: ReceiveOperatorKeyDeps,
): RelayResponseBody {
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
  const ephemeralPublicKey =
    typeof raw.ephemeralPublicKey === "string" ? raw.ephemeralPublicKey.trim() : "";
  const sealed = typeof raw.sealed === "string" ? raw.sealed.trim() : "";

  if (ephemeralPublicKey === "" || sealed === "") {
    return {
      ok: false,
      message: 'Thiếu "ephemeralPublicKey" hoặc "sealed" — hộp khóa operator không đầy đủ.',
    };
  }

  let opened: unknown;
  try {
    opened = openSealedPayload({ ephemeralPublicKey, sealed }, deps.devicePrivateKey);
  } catch (error) {
    if (error instanceof SealedBoxError) {
      return {
        ok: false,
        message:
          "Hộp khóa này không mở được bằng khóa của máy đang ngồi — nhiều khả năng nó được cấp " +
          "cho một máy khác. Kiểm lại xem đang bấm ở đúng máy chưa, hoặc xin quản trị viên cấp lại.",
      };
    }
    throw error;
  }

  // Mở được KHÔNG có nghĩa là ruột dùng được. Ghi một chuỗi rác vào chỗ này là làm hỏng một chiếc
  // máy đang chạy tốt, và triệu chứng sẽ là "mọi bí mật đều không mở nổi" — câu không chỉ về đây.
  const content = (typeof opened === "object" && opened !== null ? opened : {}) as Record<
    string,
    unknown
  >;
  const key =
    typeof content.vaultKeyOperator === "string"
      ? content.vaultKeyOperator.trim().toLowerCase()
      : "";

  if (key.length !== VAULT_KEY_HEX_LENGTH || !/^[0-9a-f]+$/.test(key)) {
    return {
      ok: false,
      message:
        `Hộp mở ra được nhưng ruột không phải khóa hợp lệ (${VAULT_KEY_HEX_LENGTH} ký tự hex). ` +
        `Không ghi gì cả — xin quản trị viên cấp lại.`,
    };
  }

  try {
    // `writeRelayConfig` patches one field and **preserves everything else**. Replacing the file
    // here would delete `mktBrowserToken` on an already configured machine and surface later as a
    // misleading profile-launch failure rather than an operator-key update failure.
    writeRelayConfig({ vaultKeyOperator: key }, deps.home);
  } catch (error) {
    return { ok: false, message: `Không ghi được file cấu hình: ${(error as Error).message}` };
  }

  return deps.onConfigured();
}
