/**
 * Mã hóa credential bằng AES-256-GCM.
 *
 * Mọi field kết thúc bằng `Enc` trong Prisma schema đều đi qua đây.
 * GCM cho cả tính bí mật lẫn tính toàn vẹn — sửa 1 bit ciphertext là giải mã ném lỗi,
 * không trả về rác.
 *
 * Định dạng chuỗi lưu trong DB:  v1.<iv_base64url>.<authTag_base64url>.<ciphertext_base64url>
 * Có tiền tố phiên bản để sau này đổi thuật toán vẫn đọc được dữ liệu cũ.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { loadVaultKey } from "./encryption-key-loader";

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
export function encryptCredential(plaintext: string, key: Buffer = loadVaultKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_VERSION, toBase64Url(iv), toBase64Url(authTag), toBase64Url(ciphertext)].join(".");
}

/** Giải mã. Ném CredentialDecryptionError nếu sai khóa hoặc dữ liệu bị sửa. */
export function decryptCredential(encoded: string, key: Buffer = loadVaultKey()): string {
  const parts = encoded.split(".");

  if (parts.length !== 4) {
    throw new CredentialDecryptionError(
      `Chuỗi mã hóa sai định dạng: cần 4 phần, nhận được ${parts.length}.`,
    );
  }

  const [version, ivPart, authTagPart, ciphertextPart] = parts;

  if (version !== FORMAT_VERSION) {
    throw new CredentialDecryptionError(`Phiên bản mã hóa không hỗ trợ: "${version}".`);
  }

  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(authTagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  if (iv.length !== IV_BYTES) {
    throw new CredentialDecryptionError(`IV phải dài ${IV_BYTES} byte, nhận được ${iv.length}.`);
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new CredentialDecryptionError(
      `Auth tag phải dài ${AUTH_TAG_BYTES} byte, nhận được ${authTag.length}.`,
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (cause) {
    // Không lộ chi tiết kỹ thuật ra ngoài — sai khóa và dữ liệu hỏng cho cùng một thông báo.
    throw new CredentialDecryptionError(
      "Giải mã thất bại: sai VAULT_KEY hoặc dữ liệu đã bị sửa đổi.",
      { cause },
    );
  }
}

/** Tiện ích cho field không bắt buộc (ví dụ totpSecretEnc). */
export function encryptOptionalCredential(
  plaintext: string | null | undefined,
  key?: Buffer,
): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  return encryptCredential(plaintext, key);
}

export function decryptOptionalCredential(
  encoded: string | null | undefined,
  key?: Buffer,
): string | null {
  if (encoded === null || encoded === undefined || encoded === "") return null;
  return decryptCredential(encoded, key);
}
