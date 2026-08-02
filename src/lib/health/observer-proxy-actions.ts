"use server";

/**
 * Thêm / bật tắt / xóa proxy quan sát viên.
 *
 * Tách khỏi vault-*-actions.ts một cách có chủ ý, dù ô nhập gần giống proxy thường: đây là
 * thứ KHÔNG BAO GIỜ được gắn vào nick, và để nó ở cùng chỗ với proxy thường là mời người ta
 * nhầm. Bảng riêng, action riêng, trang riêng — muốn nhầm cũng khó.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { firstError, formToObject, optionalText } from "@/lib/accounts/vault-form-schemas";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError, isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";

const observerProxyCreateSchema = z.object({
  label: z.string().min(1, "Nhãn không được để trống"),
  host: z.string().min(1, "Host không được để trống"),
  port: z.coerce.number().int().min(1).max(65535, "Port phải nằm trong 1-65535"),
  username: z.string().min(1, "Username không được để trống"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
  country: z.string().min(1, "Quốc gia không được để trống"),
  // Chỉ cho http: Chromium không xác thực được với SOCKS5, xem observer-browser-session.ts.
  protocol: z.literal("http").default("http"),
  notes: optionalText,
});

export async function createObserverProxy(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = observerProxyCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, ...rest } = parsed.data;
  try {
    await prisma.observerProxy.create({
      data: { ...rest, passwordEnc: encryptCredential(password) },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "thêm proxy quan sát viên") };
    }
    return { ok: false, message: `Đã có proxy quan sát viên nhãn "${parsed.data.label}".` };
  }

  revalidatePath("/proxies");
  return {
    ok: true,
    message:
      `Đã thêm proxy quan sát viên "${parsed.data.label}". ` +
      `Tuyệt đối không dùng IP này để đăng nhập nick nào, kể cả một lần.`,
  };
}

export async function setObserverProxyActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const proxy = await prisma.observerProxy.update({ where: { id }, data: { active } });
    revalidatePath("/proxies");
    return {
      ok: true,
      message: `Proxy quan sát viên "${proxy.label}" ${active ? "đã bật" : "đã tắt"}.`,
    };
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "đổi trạng thái proxy") };
  }
}

export async function deleteObserverProxy(id: string): Promise<ActionResult> {
  try {
    const proxy = await prisma.observerProxy.delete({ where: { id } });
    revalidatePath("/proxies");
    return { ok: true, message: `Đã xóa proxy quan sát viên "${proxy.label}".` };
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa proxy quan sát viên") };
  }
}
