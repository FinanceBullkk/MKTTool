"use server";

/**
 * Lấy bí mật của nick ra dùng: mật khẩu để copy, mã OTP để đăng nhập lại.
 *
 * Tách khỏi nhóm thêm/sửa/xóa vì đây là mối quan tâm khác hẳn — không phải sửa dữ liệu mà là
 * MỞ KHÓA dữ liệu. Mỗi hàm ở đây là một lần credential rời khỏi lớp mã hóa, nên mỗi hàm đều
 * ghi AuditLog, và gom lại một chỗ thì soát "những đường nào làm lộ credential" chỉ cần đọc
 * đúng một file.
 */
import type { ActionResult } from "@/lib/actions/action-result";
import {
  decryptCredential,
  decryptOptionalCredential,
} from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { generateTotpCode } from "@/lib/totp/totp-code-generator";

export interface RevealedCredential {
  value: string;
}

export interface OtpResult {
  code: string;
  secondsRemaining: number;
}

/**
 * Thông báo cho người dùng khi giải mã hỏng.
 *
 * Phải trả về ActionResult chứ KHÔNG được để lỗi ném ra khỏi server action: lỗi ném ra thì
 * phía trình duyệt chỉ thấy một promise reject chung chung, nút trông như hỏng mà không có
 * chữ nào giải thích — trong khi nguyên nhân gần như luôn là sai VAULT_KEY, thứ người dùng
 * sửa được ngay nếu biết.
 */
const DECRYPT_FAILED_MESSAGE =
  "Không giải mã được dữ liệu của nick này. Gần như chắc chắn VAULT_KEY trong .env không phải " +
  "khóa đã dùng để lưu — kiểm tra lại .env rồi khởi động lại app.";

/** Giải mã một credential để copy. Luôn ghi AuditLog. */
export async function revealCredential(
  accountId: string,
  field: "password" | "emailPassword",
): Promise<RevealedCredential | ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // Giải mã TRƯỚC rồi mới ghi nhật ký: giải mã hỏng mà đã ghi thì nhật ký nói credential
  // đã lộ trong khi thật ra không ai đọc được gì — sai theo đúng hướng khó phát hiện nhất.
  const encrypted = field === "password" ? account.passwordEnc : account.emailPasswordEnc;

  let value: string;
  try {
    value = decryptCredential(encrypted);
  } catch {
    return { ok: false, message: DECRYPT_FAILED_MESSAGE };
  }

  await prisma.auditLog.create({
    data: { accountId, action: "CREDENTIAL_REVEALED", detail: field },
  });

  return { value };
}

/** Sinh mã OTP hiện tại cho nick. */
export async function requestOtpCode(accountId: string): Promise<OtpResult | ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  let secret: string | null;
  try {
    secret = decryptOptionalCredential(account.totpSecretEnc);
  } catch {
    return { ok: false, message: DECRYPT_FAILED_MESSAGE };
  }
  if (!secret) return { ok: false, message: "Nick này chưa lưu TOTP secret." };

  let code: OtpResult;
  try {
    code = await generateTotpCode(secret);
  } catch {
    return {
      ok: false,
      message: "TOTP secret của nick này không dùng được (phải là chuỗi base32 hợp lệ).",
    };
  }

  await prisma.auditLog.create({ data: { accountId, action: "OTP_GENERATED" } });
  return code;
}
