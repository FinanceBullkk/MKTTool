/**
 * Bọc bí mật nick bằng khóa vùng operator, cho đường tạo/sửa nick.
 *
 * Chiều ngược của `handle-secret.ts`: ở kia vé mang ciphertext xuống để mở ra, ở đây bí mật
 * dạng trần đi vào và ciphertext đi lên. Cả hai đều chỉ chạy được trên chiếc máy giữ khóa.
 *
 * ## Vì sao đường này KHÔNG cần vé
 *
 * Vé trả lời câu *"máy chủ có cho phép việc này không"* — cần thiết khi thứ đi ra là bí mật của
 * kho. Ở đây chiều ngược lại: thứ đi vào là bí mật **người dùng vừa tự gõ**, và thứ đi ra là
 * ciphertext mà không có khóa thì không ai đọc được. Bắt phải có vé nghĩa là bắt máy chủ ký một
 * tờ giấy phép cho người ta mã hóa chuỗi của chính họ — không bảo vệ thêm gì, mà lại thêm một
 * vòng gọi vào đúng lúc form đang chờ.
 *
 * Cửa vào vẫn hẹp: CORS khai đúng một nguồn, và cầu nối chỉ nghe `127.0.0.1`.
 *
 * ## Phép kiểm TOTP nằm ở ĐÂY, vì máy chủ đã mất nó
 *
 * Trước GĐ3, máy chủ kiểm "TOTP secret có phải base32 không" trước khi ghi. Từ GĐ3 nó nhận
 * ciphertext nên không đọc nổi chuỗi để kiểm nữa. Không kiểm ở đây thì một secret rác nằm im
 * trong kho cho tới **ngày cần OTP gấp** — kiểu hỏng đắt nhất trong cả hệ, vì lúc phát hiện thì
 * người ta đang đứng trước màn hình đăng nhập của nick.
 */
import { encryptCredential } from "../../src/lib/crypto/credential-encryption";
import { isValidTotpSecret, normalizeTotpSecret } from "../../src/lib/totp/totp-code-generator";
import type { RelayResponseBody } from "./relay-http-server";

/**
 * Ô nhập → cột trong `Account`.
 *
 * Đúng bảng mà `account-vault-form.tsx` bên web dùng. Hai bảng này phải khớp nhau; lệch một tên
 * là ciphertext về tới form rồi bị bỏ qua lặng lẽ, và người dùng thấy "đã lưu" trong khi mật
 * khẩu không hề được ghi.
 */
const SECRET_FIELDS = [
  ["password", "passwordEnc"],
  ["emailPassword", "emailPasswordEnc"],
  ["totpSecret", "totpSecretEnc"],
] as const;

export interface EncryptForVaultDeps {
  /** Khóa vùng operator, 32 byte. `null` khi cấu hình chưa đủ. */
  vaultKeyOperator: Buffer | null;
  notConfiguredMessage: string;
}

export async function handleEncryptForVault(
  body: string,
  deps: EncryptForVaultDeps,
): Promise<RelayResponseBody> {
  if (!deps.vaultKeyOperator) {
    return { ok: false, message: deps.notConfiguredMessage };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, message: "Thân request không phải JSON." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, message: "Thân request phải là một object JSON." };
  }

  const source = parsed as Record<string, unknown>;
  const result: RelayResponseBody = { ok: true, message: "Đã bọc bí mật bằng khóa của máy này." };
  let sealedAny = false;

  for (const [field, column] of SECRET_FIELDS) {
    const raw = source[field];
    // Ô để trống nghĩa là "giữ nguyên giá trị cũ" — đó là quy ước của form sửa nick, không
    // phải thiếu sót. Bỏ qua, đừng ghi một chuỗi rỗng đã mã hóa đè lên mật khẩu thật.
    if (typeof raw !== "string" || raw.trim() === "") continue;

    if (field === "totpSecret") {
      const normalized = normalizeTotpSecret(raw);
      if (!(await isValidTotpSecret(normalized))) {
        return {
          ok: false,
          message:
            "TOTP secret không phải chuỗi base32 hợp lệ, nên chưa lưu gì cả. Chép lại chuỗi mà " +
            "trang bật 2FA của nền tảng hiện ra (thường 16-32 ký tự A-Z và 2-7).",
        };
      }
      // Ghi bản ĐÃ CHUẨN HÓA: bản gốc hay dính khoảng trắng do người ta chép từ ảnh QR, và
      // chuỗi đã mã hóa thì sau này không ai sửa lại được nữa mà không nhập lại từ đầu.
      result[column] = encryptCredential(normalized, deps.vaultKeyOperator);
      sealedAny = true;
      continue;
    }

    result[column] = encryptCredential(raw, deps.vaultKeyOperator);
    sealedAny = true;
  }

  if (!sealedAny) {
    return {
      ok: false,
      message:
        "Không có bí mật nào để bọc. Nếu bạn không định đổi mật khẩu thì form không cần gọi " +
        "xuống cầu nối — đây gần như chắc chắn là lỗi của giao diện.",
    };
  }

  return result;
}
