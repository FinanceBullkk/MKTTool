/**
 * Bọc ruột vé cho **riêng một chiếc máy** — máy chủ bọc, chỉ máy đó mở.
 *
 * ## Vì sao cần lớp này, khi vé đã có chữ ký
 *
 * Chữ ký trả lời *"vé này do máy chủ phát"*. Nó **không** giấu nội dung: ai mở devtools cũng
 * đọc được phần được ký. Mà ruột vé chứa mật khẩu proxy và ciphertext bí mật nick — thứ trang
 * web không được phép thấy. Hai câu hỏi khác nhau, hai cơ chế khác nhau.
 *
 * ## Cách bọc
 *
 * Máy chủ sinh một cặp khóa **dùng đúng một lần** cho mỗi tấm vé, bắt tay X25519 với khóa công
 * khai của máy nhận, rồi lấy bí mật chung nấu ra khóa AES-256 qua HKDF. Khóa công khai dùng một
 * lần đi kèm vé; khóa riêng của nó bị vứt ngay khi hàm trả về.
 *
 * Cặp dùng một lần chứ không phải cặp cố định của máy chủ, vì hai lý do:
 *
 * - Cặp cố định thì mọi vé gửi tới cùng một máy đều dùng chung một khóa AES. Lộ một lần là lộ
 *   toàn bộ lịch sử vé của máy đó.
 * - Máy chủ **không cần** chứng minh mình là ai ở lớp này — chữ ký Ed25519 đã làm việc đó rồi.
 *   Lớp này chỉ cần giấu nội dung.
 *
 * ## HKDF chứ không dùng thẳng bí mật chung
 *
 * Đầu ra X25519 không phải khóa phân bố đều — nó là tọa độ một điểm trên đường cong. Đưa thẳng
 * vào AES là lỗi kinh điển. HKDF trải nó thành 32 byte đều, và `info` đóng luôn vai trò buộc
 * khóa vào đúng mục đích: cùng một cặp khóa dùng cho việc khác sẽ nấu ra khóa khác.
 */
import { diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import { decryptCredential, encryptCredential } from "@/lib/crypto/credential-encryption";
import {
  RelayDeviceKeyError,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "./relay-device-key";

/** Khóa AES-256 cần đúng 32 byte. */
const DERIVED_KEY_BYTES = 32;

/**
 * Nhãn mục đích trộn vào HKDF.
 *
 * Đổi chuỗi này là đổi khóa dẫn xuất, tức **mọi cầu nối cũ giải mã hỏng**. Nếu có ngày phải
 * đổi thì tăng `TICKET_FORMAT_VERSION` cùng lúc, để cầu nối cũ nói được câu đúng thay vì chết
 * ở bước giải mã.
 */
const HKDF_INFO = "mkttool:ticket:v1";

export class SealedBoxError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SealedBoxError";
  }
}

/** Kết quả bọc: ruột đã mã hóa, kèm khóa công khai dùng một lần để bên kia mở. */
export interface SealedPayload {
  /** Khóa công khai dùng một lần của máy chủ, hex. */
  ephemeralPublicKey: string;
  /** Ruột đã mã hóa — định dạng `v1.iv.tag.ct` của `credential-encryption.ts`. */
  sealed: string;
}

/**
 * Nấu khóa AES từ một bí mật chung X25519.
 *
 * `salt` để rỗng có chủ ý: HKDF cho phép, và ở đây không có giá trị công khai nào hai bên cùng
 * biết trước mà lại thay đổi giữa các lần. Vai trò "mỗi lần một khác" đã do cặp khóa dùng một
 * lần đảm nhận — thêm salt chỉ là thêm một trường phải đồng bộ giữa hai chương trình viết rời.
 */
function deriveAesKey(sharedSecret: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", sharedSecret, Buffer.alloc(0), HKDF_INFO, DERIVED_KEY_BYTES),
  );
}

/**
 * Bọc ruột vé cho khóa công khai của máy nhận. Chạy trên **máy chủ**.
 *
 * Nhận object rồi tự chuyển sang JSON: chỗ gọi không phải nhớ tuần tự hóa, và quan trọng hơn,
 * hai bên không thể lệch nhau về cách tuần tự hóa.
 */
export function sealForDevice(payload: unknown, devicePublicKeyHex: string): SealedPayload {
  let devicePublicKey;
  try {
    devicePublicKey = relayPublicKeyToKeyObject(devicePublicKeyHex);
  } catch (cause) {
    if (cause instanceof RelayDeviceKeyError) {
      throw new SealedBoxError(`Khóa của máy nhận không dùng được: ${cause.message}`, { cause });
    }
    throw cause;
  }

  const ephemeral = generateKeyPairSync("x25519");
  const sharedSecret = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: devicePublicKey,
  });

  return {
    ephemeralPublicKey: relayPublicKeyToHex(ephemeral.publicKey),
    sealed: encryptCredential(JSON.stringify(payload), deriveAesKey(sharedSecret)),
  };
}

/**
 * Mở ruột vé. Chạy trên **cầu nối**, bằng khóa riêng của chính máy đó.
 *
 * Trả về `unknown` chứ không ép kiểu sẵn: nội dung vừa ra khỏi lớp mã hóa là dữ liệu chưa kiểm,
 * và chỗ gọi phải soi nó bằng schema trước khi tin. Ép kiểu ở đây là nói dối cả hai phía.
 */
export function openSealedPayload(
  sealed: SealedPayload,
  devicePrivateKey: Parameters<typeof diffieHellman>[0]["privateKey"],
): unknown {
  const sharedSecret = diffieHellman({
    privateKey: devicePrivateKey,
    publicKey: relayPublicKeyToKeyObject(sealed.ephemeralPublicKey),
  });

  let json: string;
  try {
    json = decryptCredential(sealed.sealed, deriveAesKey(sharedSecret));
  } catch (cause) {
    throw new SealedBoxError(
      "Không mở được ruột vé — vé này không dành cho máy này, hoặc đã bị sửa.",
      { cause },
    );
  }

  try {
    return JSON.parse(json);
  } catch (cause) {
    throw new SealedBoxError("Ruột vé mở ra được nhưng không phải JSON hợp lệ.", { cause });
  }
}
