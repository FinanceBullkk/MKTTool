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
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { requireNickOwner } from "@/lib/auth/require-actor";
import {
  decryptCredential,
  decryptOptionalCredential,
} from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
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
 * chữ nào giải thích — trong khi nguyên nhân gần như luôn là sai khóa, thứ người dùng
 * sửa được ngay nếu biết.
 */
const DECRYPT_FAILED_MESSAGE =
  "Không giải mã được dữ liệu của nick này. Gần như chắc chắn VAULT_KEY_OPERATOR trong .env " +
  "không phải khóa đã dùng để lưu — kiểm tra lại .env rồi khởi động lại app.";

/**
 * Giải mã một credential để copy. Luôn ghi AuditLog kèm người thực hiện.
 *
 * Hai lớp chặn, không phải một: `guardedAction` hỏi "đã đăng nhập chưa", `requireNickOwner`
 * hỏi "nick này có phải của bạn không". Lớp thứ hai là thứ ngăn người này đọc mật khẩu nick
 * của người kia, và nó nằm ở **tầng dữ liệu** chứ không phải ở chỗ ẩn nút trên giao diện —
 * ẩn nút chỉ chặn người dùng lịch sự, còn server action thì gọi thẳng được nếu biết tên.
 */
export const revealCredential = guardedAction(async function revealCredential(
  actor,
  accountId: string,
  field: "password" | "emailPassword",
): Promise<RevealedCredential | ActionResult> {
  await requireNickOwner(actor, accountId);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // Giải mã TRƯỚC rồi mới ghi nhật ký: giải mã hỏng mà đã ghi thì nhật ký nói credential
  // đã lộ trong khi thật ra không ai đọc được gì — sai theo đúng hướng khó phát hiện nhất.
  const encrypted = field === "password" ? account.passwordEnc : account.emailPasswordEnc;

  let value: string;
  try {
    // Vùng operator — xem encrypted-field-registry.ts. Chỗ này biến mất khi luồng chuyển sang
    // phát vé cho cầu nối (GĐ3 bước 5): lúc đó máy chủ không còn giữ khóa operator nữa.
    value = decryptCredential(encrypted, loadVaultKey("operator"));
  } catch {
    return { ok: false, message: DECRYPT_FAILED_MESSAGE };
  }

  await prisma.auditLog.create({
    data: { accountId, action: AUDIT_ACTIONS.CREDENTIAL_REVEALED, detail: field, actorId: actor.userId },
  });

  return { value };
});

/** Sinh mã OTP hiện tại cho nick. Cùng hai lớp chặn với `revealCredential`. */
export const requestOtpCode = guardedAction(async function requestOtpCode(
  actor,
  accountId: string,
): Promise<OtpResult | ActionResult> {
  await requireNickOwner(actor, accountId);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  let secret: string | null;
  try {
    // Vùng operator — cùng ghi chú với revealCredential ở trên.
    secret = decryptOptionalCredential(account.totpSecretEnc, loadVaultKey("operator"));
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

  await prisma.auditLog.create({
    data: { accountId, action: AUDIT_ACTIONS.OTP_GENERATED, actorId: actor.userId },
  });
  return code;
});
