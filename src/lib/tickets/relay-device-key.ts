/**
 * Khóa công khai của một máy chạy cầu nối (X25519).
 *
 * ## Vì sao X25519 chứ không phải Ed25519
 *
 * Hai cặp khóa trong hệ vé làm hai việc ngược chiều nhau, và trộn chúng lại là hỏng:
 *
 * - Máy chủ giữ cặp **Ed25519** để **ký** vé — xem `server-signing-key.ts`. Ai cũng đối chiếu
 *   được chữ ký, không ai giả được nó.
 * - Mỗi máy giữ cặp **X25519** để máy chủ **mã hóa gửi tới**. Máy chủ dùng khóa công khai của
 *   máy để bọc nội dung vé; chỉ chiếc máy đó mở ra được.
 *
 * Ed25519 dùng để ký, không dùng để trao khóa. Có phép chuyển Ed25519 sang X25519, nhưng dùng
 * một cặp khóa cho cả hai việc là đúng thứ mà mọi tài liệu mật mã đều dặn đừng làm — và ở đây
 * chẳng đổi lại được gì, vì cầu nối tự sinh khóa của nó nên sinh thẳng loại đúng cũng bằng đó
 * việc.
 *
 * ## Khóa riêng không nằm ở đây
 *
 * File này chỉ biết phần **công khai**. Khóa riêng của máy sinh ra trên chính máy đó và không
 * bao giờ rời nó — đó là toàn bộ lý do trang web không đọc được nội dung vé nó đang chuyển tay.
 */
import { type KeyObject, createPublicKey, diffieHellman, generateKeyPairSync } from "node:crypto";

/** Khóa công khai X25519 luôn là 32 byte. */
export const RELAY_PUBLIC_KEY_BYTES = 32;

/** Độ dài chuỗi hex tương ứng — con số hiện thẳng trong thông báo lỗi cho người dán khóa. */
export const RELAY_PUBLIC_KEY_HEX_LENGTH = RELAY_PUBLIC_KEY_BYTES * 2;

export class RelayDeviceKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayDeviceKeyError";
  }
}

/**
 * Kiểm chuỗi người dán vào rồi trả về **dạng chuẩn** để đem đi ghi: hex chữ thường.
 *
 * Chuẩn hóa chữ thường không phải để cho đẹp. Cột `publicKey` là `@unique`, mà Postgres phân
 * biệt hoa thường — dán cùng một khóa hai lần với hai kiểu viết là ra hai hàng, và người thu
 * hồi một hàng sẽ tin là đã chặn xong trong khi hàng kia vẫn nhận vé.
 *
 * Bỏ luôn khoảng trắng bên trong: khóa chép từ cửa sổ terminal rất hay dính xuống dòng, và
 * bắt người ta tự dọn thì việc đầu tiên họ thử là dán lại lần nữa.
 */
export function normalizeRelayPublicKey(raw: string): string {
  const hex = raw.replace(/\s+/g, "").toLowerCase();

  if (hex === "") {
    throw new RelayDeviceKeyError("Chưa dán khóa công khai của máy.");
  }

  if (hex.length !== RELAY_PUBLIC_KEY_HEX_LENGTH) {
    throw new RelayDeviceKeyError(
      `Khóa công khai phải dài đúng ${RELAY_PUBLIC_KEY_HEX_LENGTH} ký tự hex ` +
        `(${RELAY_PUBLIC_KEY_BYTES} byte), đang có ${hex.length} ký tự. ` +
        `Chép lại nguyên dòng mà cầu nối in ra lúc cài.`,
    );
  }

  if (!/^[0-9a-f]+$/.test(hex)) {
    throw new RelayDeviceKeyError("Khóa công khai chỉ được chứa ký tự hex (0-9, a-f).");
  }

  return hex;
}

/**
 * Vỏ DER cố định của khóa công khai X25519 dạng SPKI.
 *
 * Giữ lại để đối chiếu trong test — phần dựng khóa ở dưới đi đường JWK, ngắn hơn và không phải
 * tự ghép byte. Hằng số này là 12 byte đầu của mọi khóa công khai X25519 xuất ra DER: X25519
 * không có tham số nào để thay đổi nên phần vỏ không bao giờ khác.
 */
export const SPKI_X25519_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

/**
 * Dựng `KeyObject` từ hex đã chuẩn hóa, để đem đi mã hóa nội dung vé.
 *
 * Đi đường JWK chứ không ghép DER bằng tay: cùng ra một khóa, nhưng ghép byte thì lúc sai chỉ
 * hiện ra bằng một câu lỗi của OpenSSL không chỉ vào chỗ nào.
 */
export function relayPublicKeyToKeyObject(hexKey: string): KeyObject {
  const hex = normalizeRelayPublicKey(hexKey);

  try {
    return createPublicKey({
      key: {
        kty: "OKP",
        crv: "X25519",
        x: Buffer.from(hex, "hex").toString("base64url"),
      },
      format: "jwk",
    });
  } catch (cause) {
    throw new RelayDeviceKeyError(
      `Chuỗi này đúng độ dài nhưng không phải khóa X25519 hợp lệ. ` +
        `Kiểm lại xem có chép nhầm khóa loại khác không. (${(cause as Error).message})`,
    );
  }
}

/** Khóa công khai dạng 64 ký tự hex — dạng để người chép tay, và dạng ghi vào database. */
export function relayPublicKeyToHex(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { crv?: string; x?: string };

  if (jwk.crv !== "X25519" || !jwk.x) {
    throw new RelayDeviceKeyError("Khóa này không phải X25519.");
  }

  return Buffer.from(jwk.x, "base64url").toString("hex");
}

/**
 * Thử trao khóa một lần với khóa vừa nhận — **phép thử duy nhất chứng minh nó dùng được**.
 *
 * Đúng độ dài và đúng ký tự hex chưa đủ. Trong 2^255 chuỗi hợp lệ về hình thức có một nhóm nhỏ
 * điểm bậc thấp: dùng chúng thì bí mật chung ra toàn số 0 với **mọi** khóa đối diện, tức là ai
 * cũng giải được vé mà không cần khóa riêng của máy nào. OpenSSL từ chối dẫn xuất khi gặp kết
 * quả đó, nên chỉ cần thử trao khóa một lần với một cặp tạm là chặn được cả nhóm — không phải
 * chép bảng điểm xấu vào đây rồi mong nó đủ.
 *
 * Chi phí là một phép X25519 lúc đăng ký, tức mỗi máy một lần trong đời. Đổi lại: một khóa
 * hỏng bị chặn ngay ở màn hình đăng ký, thay vì nằm im trong sổ tới ngày phát vé thật.
 */
export function assertRelayPublicKeyUsable(publicKey: KeyObject): void {
  const probe = generateKeyPairSync("x25519");

  try {
    diffieHellman({ privateKey: probe.privateKey, publicKey });
  } catch {
    throw new RelayDeviceKeyError(
      "Khóa này không mã hóa được — nó nằm trong nhóm khóa yếu bị từ chối. " +
        "Sinh lại cặp khóa trên máy đó rồi dán khóa mới.",
    );
  }
}

/**
 * Sinh một cặp khóa cho máy chạy cầu nối.
 *
 * Dùng ở `scripts/generate-relay-device-key.ts` và ở test. **Không** dùng trong đường chạy của
 * máy chủ: sinh khóa hộ một cái máy nghĩa là khóa riêng của nó đã từng nằm trên máy chủ, đúng
 * thứ cả phase này dựng ra để tránh.
 */
export function generateRelayDeviceKeyPair(): { publicKeyHex: string; privateKeyHex: string } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const jwk = privateKey.export({ format: "jwk" }) as { d?: string };

  if (!jwk.d) throw new RelayDeviceKeyError("Không lấy được khóa riêng vừa sinh.");

  return {
    publicKeyHex: relayPublicKeyToHex(publicKey),
    privateKeyHex: Buffer.from(jwk.d, "base64url").toString("hex"),
  };
}
