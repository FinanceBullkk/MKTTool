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
import { guardedAction } from "@/lib/auth/guarded-action";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError, isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { checkObserverProxyLiveness } from "@/lib/proxies/proxy-liveness-check";

const observerProxyCreateSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  country: z.string().min(1, "Country is required"),
  // Chỉ cho http: Chromium không xác thực được với SOCKS5, xem observer-browser-session.ts.
  protocol: z.literal("http").default("http"),
  notes: optionalText,
});

export const createObserverProxy = guardedAction(async function createObserverProxy(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = observerProxyCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, ...rest } = parsed.data;
  try {
    await prisma.observerProxy.create({
      data: { ...rest, passwordEnc: encryptCredential(password, loadVaultKey("server")) },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return { ok: false, message: describeUnexpectedDbError(error, "add the observer proxy") };
    }
    return {
      ok: false,
      message: `An observer proxy with the label "${parsed.data.label}" already exists. Use a different label.`,
    };
  }

  revalidatePath("/proxies");
  return {
    ok: true,
    message:
      `Added observer proxy "${parsed.data.label}". ` +
      `Never use this IP to sign in to any nick, even once.`,
  };
});

export const setObserverProxyActive = guardedAction(async function setObserverProxyActive(
  _actor,
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const proxy = await prisma.observerProxy.update({ where: { id }, data: { active } });
    revalidatePath("/proxies");
    return {
      ok: true,
      message: `Observer proxy "${proxy.label}" ${active ? "enabled" : "disabled"}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeUnexpectedDbError(error, "change the observer proxy status"),
    };
  }
});

/**
 * Kiểm proxy quan sát viên còn sống không, bằng đúng bộ kiểm của proxy thường.
 *
 * Đáng bấm trước mỗi lượt dò quan trọng: proxy này chết thì mọi nick ra kết luận "Không dò
 * được" — trung thực nhưng vô dụng, và người đọc sẽ đi tìm lỗi ở phía Reddit. Còn nếu nó rơi
 * vào nhánh "không đổi IP" thì tệ hơn nhiều: bộ dò đang nhìn Reddit bằng chính IP nhà, kết
 * luận trông vẫn hợp lý mà thật ra vô nghĩa.
 */
export const checkObserverProxy = guardedAction(async function checkObserverProxy(
  _actor,
  id: string,
): Promise<ActionResult> {
  const proxy = await prisma.observerProxy.findUnique({ where: { id } });
  if (!proxy) {
    return { ok: false, message: "Observer proxy not found. Reload the page and try again." };
  }

  const liveness = await checkObserverProxyLiveness(proxy);
  revalidatePath("/proxies");
  revalidatePath("/");

  return { ok: liveness.verdict === "OK", message: liveness.message };
});

export const deleteObserverProxy = guardedAction(async function deleteObserverProxy(
  _actor,
  id: string,
): Promise<ActionResult> {
  try {
    const proxy = await prisma.observerProxy.delete({ where: { id } });
    revalidatePath("/proxies");
    return { ok: true, message: `Deleted observer proxy "${proxy.label}".` };
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "delete the observer proxy") };
  }
});
