/**
 * Mã hóa credential bằng AES-256-GCM.
 *
 * Mọi field kết thúc bằng `Enc` trong Prisma schema đều đi qua đây.
 * GCM cho cả tính bí mật lẫn tính toàn vẹn — sửa 1 bit ciphertext là giải mã ném lỗi,
 * không trả về rác.
 *
 * Định dạng chuỗi lưu trong DB:  v1.<iv_base64url>.<authTag_base64url>.<ciphertext_base64url>
 * Có tiền tố phiên bản để sau này đổi thuật toán vẫn đọc được dữ liệu cũ.
 *
 * ## Khóa là tham số BẮT BUỘC, không có giá trị mặc định
 *
 * Bản trước mặc định khóa vùng `server` vì phần lớn chỗ gọi dùng nó. Nhưng "phần lớn" là đúng
 * thứ nguy hiểm ở đây: quên tham số ở một cột vùng `operator` thì **không có gì hỏng** — chuỗi
 * vẫn mã hóa, hàng vẫn ghi, không test nào đỏ. Nó chỉ lộ ra vào ngày chạy
 * `vault:rekey --domain=operator`, và lúc đó cột ghi nhầm thành rác không mở lại được.
 *
 * Bắt khai rõ thì cái giá là một tham số ở mỗi chỗ gọi, đổi lại **vùng khóa của một cột hiện
 * ngay tại chỗ đọc mã** thay vì phải mở `encrypted-field-registry.ts` ra tra. Vùng của từng cột
 * vẫn khai ở registry đó — đây chỉ là chỗ nhắc lại.
 *
 * Cầu nối ở Phase 04 truyền thẳng khóa của máy nó vào, không đi qua `loadVaultKey`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12; // 96 bit — độ dài khuyến nghị cho GCM
const AUTH_TAG_BYTES = 16;

export class CredentialDecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CredentialDecryptionError";
  }
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/**
 * Mã hóa một chuỗi. Mỗi lần gọi sinh IV mới nên cùng một đầu vào
 * sẽ cho ra ciphertext khác nhau — đúng như mong muốn.
 */
export function encryptCredential(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_VERSION, toBase64Url(iv), toBase64Url(authTag), toBase64Url(ciphertext)].join(".");
}

/** Ba phần nhị phân của một chuỗi đã mã hóa, sau khi tách và kiểm hình dạng. */
interface EncryptedParts {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/**
 * Tách và kiểm hình dạng một chuỗi đã mã hóa — **không cần khóa**.
 *
 * Tách khỏi `decryptCredential` vì từ GĐ3 có một chỗ gọi không có khóa và cũng không được có:
 * máy chủ nhận ciphertext vùng operator do cầu nối dựng sẵn (xem `vault-create-actions.ts`) và
 * phải kiểm được rằng thứ vừa nhận **đúng là một chuỗi mã hóa**, chứ không phải mật khẩu dạng
 * trần mà một form hỏng gửi thẳng lên.
 *
 * Dùng chung một hàm cho cả hai đường có chủ ý: hai phép kiểm hình dạng viết rời sẽ trôi khỏi
 * nhau, và bên lỏng hơn luôn là bên nhận dữ liệu từ ngoài vào.
 */
export function parseEncryptedCredential(encoded: string): EncryptedParts {
  const parts = encoded.split(".");

  if (parts.length !== 4) {
    throw new CredentialDecryptionError(
      `Invalid encrypted value: expected 4 parts, received ${parts.length}.`,
    );
  }

  const [version, ivPart, authTagPart, ciphertextPart] = parts;

  if (version !== FORMAT_VERSION) {
    throw new CredentialDecryptionError(`Unsupported encryption version: "${version}".`);
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  if (iv.length !== IV_BYTES) {
    throw new CredentialDecryptionError(`The IV must be ${IV_BYTES} bytes; received ${iv.length}.`);
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialDecryptionError(
      `The authentication tag must be ${AUTH_TAG_BYTES} bytes; received ${authTag.length}.`,
    );
  }
  if (ciphertext.length === 0) {
    throw new CredentialDecryptionError("The encrypted value has an empty ciphertext section.");
  }

  return { iv, authTag, ciphertext };
}

/**
 * Chuỗi này có đúng hình dạng một credential đã mã hóa không.
 *
 * **Không chứng minh giải mã được** — nó không có khóa, và cố ý không có. Nó chỉ trả lời đúng
 * một câu: *"thứ vừa gửi lên có phải mật khẩu dạng trần không"*. Câu đó đủ để chặn kiểu hỏng
 * thật sự đáng sợ ở đây: một ngày nào đó form bị sửa và bí mật đi thẳng vào database chưa mã
 * hóa, im lặng, cho tới ngày ai đó mở bản sao lưu ra đọc.
 */
export function isEncryptedCredentialShape(encoded: string): boolean {
  try {
    parseEncryptedCredential(encoded);
    return true;
  } catch {
    return false;
  }
}

/** Giải mã. Ném CredentialDecryptionError nếu sai khóa hoặc dữ liệu bị sửa. */
export function decryptCredential(encoded: string, key: Buffer): string {
  const { iv, authTag, ciphertext } = parseEncryptedCredential(encoded);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (cause) {
    // Không lộ chi tiết kỹ thuật ra ngoài — sai khóa và dữ liệu hỏng cho cùng một thông báo.
    throw new CredentialDecryptionError(
      "Decryption failed because the domain key is wrong or the encrypted data was modified.",
      { cause },
    );
  }
}

/** Tiện ích cho field không bắt buộc (ví dụ totpSecretEnc). */
export function encryptOptionalCredential(
  plaintext: string | null | undefined,
  key: Buffer,
): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  return encryptCredential(plaintext, key);
}

export function decryptOptionalCredential(
  encoded: string | null | undefined,
  key: Buffer,
): string | null {
  if (encoded === null || encoded === undefined || encoded === "") return null;
  return decryptCredential(encoded, key);
}
