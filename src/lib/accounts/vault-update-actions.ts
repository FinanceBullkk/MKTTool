"use server";

/**
 * Sửa bản ghi trong kho danh tính.
 *
 * Hai quy ước xuyên suốt file này:
 *
 *  1. **Ô bí mật để trống là giữ nguyên.** Mật khẩu không bao giờ được render ra màn hình
 *     (xem account-vault-actions-panel.tsx), nên form sửa không thể đổ giá trị cũ vào ô —
 *     và nếu coi ô trống là "xóa mật khẩu" thì mỗi lần sửa karma là một lần mất credential.
 *
 *  2. **Sửa xong thì chấm lại luật.** Đổi karma nick, đổi `minKarma` của sub, sửa thân bài —
 *     tất cả đều làm cũ đi verdict đã lưu trong job đang chờ. Verdict cũ trông y hệt verdict
 *     đúng, nên phải chấm lại ngay và nói rõ đã chấm mấy job (xem recheck-jobs-batch.ts).
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { encryptCredential, encryptOptionalCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError, isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { describeRecheck, recheckJobsMatching } from "@/lib/queue/recheck-jobs-batch";
import { isValidTotpSecret, normalizeTotpSecret } from "@/lib/totp/totp-code-generator";
import { isQuarantinedStatus } from "./account-status";
import {
  accountUpdateSchema,
  firstError,
  formToObject,
  normalizeCheckbox,
  personaUpdateSchema,
  proxyUpdateSchema,
  targetUpdateSchema,
  validatePlatformIdentityFields,
} from "./vault-form-schemas";

export const updatePersona = guardedAction(async function updatePersona(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = personaUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, ...data } = parsed.data;

  try {
    await prisma.persona.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, message: `Tên nhân vật "${data.name}" đã tồn tại.` };
    }
    return { ok: false, message: describeUnexpectedDbError(error, "sửa nhân vật") };
  }

  revalidatePath("/personas");
  revalidatePath(`/personas/${id}`);
  return { ok: true, message: `Đã lưu nhân vật "${data.name}".` };
});

export const updateProxy = guardedAction(async function updateProxy(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = proxyUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, password, ...data } = parsed.data;

  try {
    await prisma.proxy.update({
      where: { id },
      // Chỉ đụng vào cột mật khẩu khi người dùng thật sự gõ mật khẩu mới.
      data: { ...data, ...(password ? { passwordEnc: encryptCredential(password) } : {}) },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, message: "Proxy trùng nhãn hoặc trùng host/port/username đã có." };
    }
    return { ok: false, message: describeUnexpectedDbError(error, "sửa proxy") };
  }

  revalidatePath("/proxies");
  revalidatePath(`/proxies/${id}`);
  revalidatePath("/accounts");
  return {
    ok: true,
    message:
      `Đã lưu proxy "${data.label}".` +
      (password ? " Mật khẩu mới sẽ được đẩy sang profile ở lần mở tiếp theo." : ""),
  };
});

export const updateAccount = guardedAction(async function updateAccount(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, password, emailPassword, totpSecret, ...data } = parsed.data;

  // `platform` không sửa được nên form không gửi lên — phải đọc từ DB thì mới chấm được luật
  // "Reddit bắt buộc proxy + profile antidetect".
  const existing = await prisma.account.findUnique({ where: { id }, select: { platform: true } });
  if (!existing) return { ok: false, message: "Không tìm thấy nick cần sửa." };

  const identityError = validatePlatformIdentityFields(existing.platform, data);
  if (identityError) return { ok: false, message: identityError };

  // Kiểm secret dùng được TRƯỚC khi lưu — phát hiện sai ngay lúc nhập, không phải lúc
  // đang cần đăng nhập gấp.
  if (totpSecret && !(await isValidTotpSecret(totpSecret))) {
    return { ok: false, message: "TOTP secret không hợp lệ (phải là chuỗi base32)." };
  }

  const operatorKey = loadVaultKey("operator");

  try {
    await prisma.account.update({
      where: { id },
      data: {
        ...data,
        // Với Prisma, `undefined` nghĩa là GIỮ NGUYÊN — nên ô để trống phải ép về `null`, không
        // thì gỡ proxy khỏi một nick Facebook sẽ im lặng không có tác dụng gì.
        antidetectProfileId: data.antidetectProfileId?.trim() || null,
        proxyId: data.proxyId?.trim() || null,
        // Gỡ cách ly thì lý do cách ly phải đi theo. Để lại là dựng ra một màn hình tự mâu
        // thuẫn: nhãn "Khỏe" nằm ngay trên hộp đỏ "dừng đăng ngay" — xem isQuarantinedStatus().
        quarantineReason: isQuarantinedStatus(data.status)
          ? data.quarantineReason?.trim() || null
          : null,
        // Vùng operator — xem encrypted-field-registry.ts. Khóa phải truyền rõ, mặc định của
        // encryptCredential là khóa vùng server.
        ...(password ? { passwordEnc: encryptCredential(password, operatorKey) } : {}),
        ...(emailPassword
          ? { emailPasswordEnc: encryptCredential(emailPassword, operatorKey) }
          : {}),
        ...(totpSecret
          ? {
              totpSecretEnc: encryptOptionalCredential(
                normalizeTotpSecret(totpSecret),
                operatorKey,
              ),
            }
          : {}),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        message:
          "Không lưu được. Kiểm tra: proxy đã gắn nick khác chưa, " +
          "profile antidetect đã dùng chưa, username đã tồn tại trên nền tảng này chưa.",
      };
    }
    return { ok: false, message: describeUnexpectedDbError(error, "sửa nick") };
  }

  // Karma, trạng thái và cold-start đều là đầu vào của luật 1, 2 và 3.
  const recheck = await recheckJobsMatching({ accountId: id });

  await prisma.auditLog.create({
    data: {
      accountId: id,
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      detail: `karma ${data.karma}, ${data.status}`,
      actorId: actor.userId,
    },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/queue");
  return { ok: true, message: `Đã lưu nick "${data.username}".${describeRecheck(recheck)}` };
});

export const updateTarget = guardedAction(async function updateTarget(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formToObject(formData);
  normalizeCheckbox(raw, "allowsLinks");
  normalizeCheckbox(raw, "active");

  const parsed = targetUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, ...data } = parsed.data;

  try {
    await prisma.platformTarget.update({ where: { id }, data });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, message: `Đích "${data.name}" đã tồn tại trên nền tảng này.` };
    }
    return { ok: false, message: describeUnexpectedDbError(error, "sửa đích đăng") };
  }

  // minKarma, minAccountAgeDays, promoRatio và allowsLinks là đầu vào của luật 3, 6 và 9.
  const recheck = await recheckJobsMatching({ targetId: id });

  revalidatePath("/targets");
  revalidatePath(`/targets/${id}`);
  revalidatePath("/queue");
  return { ok: true, message: `Đã lưu đích "${data.name}".${describeRecheck(recheck)}` };
});
