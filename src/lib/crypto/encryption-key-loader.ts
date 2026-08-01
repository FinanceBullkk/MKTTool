/**
 * Nạp và kiểm tra khóa mã hóa kho danh tính.
 *
 * Khóa nằm ở biến môi trường VAULT_KEY, KHÔNG BAO GIỜ nằm trong database.
 * Mất khóa = mất toàn bộ mật khẩu và TOTP secret của mọi nick.
 * Sinh khóa mới bằng: npm run vault:keygen
 */

/** Độ dài khóa AES-256 tính theo byte. */
export const VAULT_KEY_BYTES = 32;

/** Độ dài chuỗi hex tương ứng (mỗi byte = 2 ký tự hex). */
export const VAULT_KEY_HEX_LENGTH = VAULT_KEY_BYTES * 2;

export class VaultKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultKeyError";
  }
}

/** Cache khóa sau lần đọc đầu để không parse lại mỗi lần mã hóa. */
let cachedKey: Buffer | null = null;

/**
 * Phân tích một chuỗi hex thành khóa 32 byte.
 * Tách riêng khỏi loadVaultKey để test được mà không cần đụng vào process.env.
 */
export function parseVaultKey(raw: string | undefined): Buffer {
  if (!raw || raw.trim() === "") {
    throw new VaultKeyError(
      "Thiếu VAULT_KEY. Chạy `npm run vault:keygen` rồi dán giá trị vào file .env.",
    );
  }

  const hex = raw.trim();

  if (hex.length !== VAULT_KEY_HEX_LENGTH) {
    throw new VaultKeyError(
      `VAULT_KEY phải dài đúng ${VAULT_KEY_HEX_LENGTH} ký tự hex (${VAULT_KEY_BYTES} byte), ` +
        `đang có ${hex.length} ký tự.`,
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new VaultKeyError("VAULT_KEY chỉ được chứa ký tự hex (0-9, a-f).");
  }

  return Buffer.from(hex, "hex");
}

/** Đọc khóa từ process.env, có cache. */
export function loadVaultKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = parseVaultKey(process.env.VAULT_KEY);
  return cachedKey;
}

/** Xóa cache — chỉ dùng trong test. */
export function resetVaultKeyCache(): void {
  cachedKey = null;
}
