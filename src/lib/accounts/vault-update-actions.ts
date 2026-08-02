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
import { encryptCredential, encryptOptionalCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError, isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { describeRecheck, recheckJobsMatching } from "@/lib/queue/recheck-jobs-batch";
import { isValidTotpSecret, normalizeTotpSecret } from "@/lib/totp/totp-code-generator";
import {
  accountUpdateSchema,
  firstError,
  formToObject,
  normalizeCheckbox,
  personaUpdateSchema,
  proxyUpdateSchema,
  targetUpdateSchema,
} from "./vault-form-schemas";

export async function updatePersona(
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
}

export async function updateProxy(
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
}

export async function updateAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, password, emailPassword, totpSecret, ...data } = parsed.data;

  // Kiểm secret dùng được TRƯỚC khi lưu — phát hiện sai ngay lúc nhập, không phải lúc
  // đang cần đăng nhập gấp.
  if (totpSecret && !(await isValidTotpSecret(totpSecret))) {
    return { ok: false, message: "TOTP secret không hợp lệ (phải là chuỗi base32)." };
  }

  try {
    await prisma.account.update({
      where: { id },
      data: {
        ...data,
        ...(password ? { passwordEnc: encryptCredential(password) } : {}),
        ...(emailPassword ? { emailPasswordEnc: encryptCredential(emailPassword) } : {}),
        ...(totpSecret
          ? { totpSecretEnc: encryptOptionalCredential(normalizeTotpSecret(totpSecret)) }
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
    data: { accountId: id, action: "ACCOUNT_UPDATED", detail: `karma ${data.karma}, ${data.status}` },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/queue");
  return { ok: true, message: `Đã lưu nick "${data.username}".${describeRecheck(recheck)}` };
}

export async function updateTarget(
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
}
