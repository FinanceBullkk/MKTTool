"use server";

/**
 * Thêm mới bản ghi vào kho danh tính: nhân vật, proxy, nick, đích đăng.
 *
 * Mọi credential đi qua đây đều được mã hóa TRƯỚC khi chạm vào database.
 *
 * Bộ ba cùng họ: file này (thêm), vault-update-actions.ts (sửa), vault-delete-actions.ts (xóa).
 * Cả ba dùng chung schema ở vault-form-schemas.ts để không đường nào siết lỏng hơn đường kia.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { encryptCredential, encryptOptionalCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError, isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { isValidTotpSecret, normalizeTotpSecret } from "@/lib/totp/totp-code-generator";
import {
  accountCreateSchema,
  firstError,
  formToObject,
  normalizeCheckbox,
  personaCreateSchema,
  proxyCreateSchema,
  targetCreateSchema,
} from "./vault-form-schemas";

export async function createPersona(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = personaCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    await prisma.persona.create({ data: parsed.data });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "tạo nhân vật") };
    }
    return { ok: false, message: `Tên nhân vật "${parsed.data.name}" đã tồn tại.` };
  }

  revalidatePath("/personas");
  return { ok: true, message: `Đã tạo nhân vật "${parsed.data.name}".` };
}

export async function createProxy(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = proxyCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, ...rest } = parsed.data;
  try {
    await prisma.proxy.create({ data: { ...rest, passwordEnc: encryptCredential(password) } });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "thêm proxy") };
    }
    return { ok: false, message: "Proxy trùng nhãn hoặc trùng host/port/username đã có." };
  }

  revalidatePath("/proxies");
  return { ok: true, message: `Đã thêm proxy "${parsed.data.label}".` };
}

export async function createAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, emailPassword, totpSecret, ...rest } = parsed.data;

  // Kiểm tra secret dùng được TRƯỚC khi lưu — phát hiện sai ngay lúc nhập,
  // không phải lúc đang cần đăng nhập gấp.
  if (totpSecret && !(await isValidTotpSecret(totpSecret))) {
    return { ok: false, message: "TOTP secret không hợp lệ (phải là chuỗi base32)." };
  }

  try {
    await prisma.account.create({
      data: {
        ...rest,
        passwordEnc: encryptCredential(password),
        emailPasswordEnc: encryptCredential(emailPassword),
        totpSecretEnc: encryptOptionalCredential(totpSecret ? normalizeTotpSecret(totpSecret) : null),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "thêm nick") };
    }
    return {
      ok: false,
      message:
        "Không tạo được nick. Kiểm tra: proxy đã gắn nick khác chưa, " +
        "profile antidetect đã dùng chưa, username đã tồn tại trên nền tảng này chưa.",
    };
  }

  revalidatePath("/accounts");
  return { ok: true, message: `Đã thêm nick "${parsed.data.username}".` };
}

export async function createTarget(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formToObject(formData);
  normalizeCheckbox(raw, "allowsLinks");

  const parsed = targetCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    await prisma.platformTarget.create({ data: parsed.data });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "thêm đích đăng") };
    }
    return { ok: false, message: `Đích "${parsed.data.name}" đã tồn tại trên nền tảng này.` };
  }

  revalidatePath("/targets");
  return { ok: true, message: `Đã thêm đích "${parsed.data.name}".` };
}
