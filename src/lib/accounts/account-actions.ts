"use server";

/**
 * Server actions cho kho danh tính.
 *
 * Mọi credential đi qua đây đều được mã hóa TRƯỚC khi chạm vào database.
 * Mọi lần lộ credential ra ngoài đều ghi AuditLog.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  decryptCredential,
  decryptOptionalCredential,
  encryptCredential,
  encryptOptionalCredential,
} from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { generateTotpCode, isValidTotpSecret, normalizeTotpSecret } from "@/lib/totp/totp-code-generator";
import { ACCOUNT_STATUSES } from "./account-status";

/** Chuyển chuỗi rỗng từ form thành undefined để zod xử lý optional cho đúng. */
const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.date().optional(),
);

const personaSchema = z.object({
  name: z.string().min(1, "Tên nhân vật không được để trống"),
  voice: z.string().min(1, "Mô tả giọng điệu không được để trống"),
  contentAngle: z.string().min(1, "Mảng nội dung không được để trống"),
  notes: optionalText,
});

const proxySchema = z.object({
  label: z.string().min(1, "Nhãn không được để trống"),
  host: z.string().min(1, "Host không được để trống"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1, "Username không được để trống"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
  country: z.string().min(2, "Nhập mã quốc gia, ví dụ US"),
  type: z.enum(["STATIC_ISP", "MOBILE"]),
  notes: optionalText,
});

const accountSchema = z.object({
  platform: z.enum(["REDDIT", "FACEBOOK"]),
  username: z.string().min(1, "Username không được để trống"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
  emailAddress: z.string().email("Email gốc không hợp lệ"),
  emailPassword: z.string().min(1, "Mật khẩu email không được để trống"),
  totpSecret: optionalText,
  antidetectProfileId: z.string().min(1, "Thiếu id profile antidetect"),
  personaId: z.string().min(1, "Chọn nhân vật"),
  proxyId: z.string().min(1, "Chọn proxy"),
  status: z.enum(ACCOUNT_STATUSES),
  karma: z.coerce.number().int().min(0).default(0),
  coldStartUntil: optionalDate,
  platformCreatedAt: optionalDate,
  purchasedAt: optionalDate,
  purchaseNote: optionalText,
});

const targetSchema = z.object({
  platform: z.enum(["REDDIT", "FACEBOOK_PAGE", "FACEBOOK_GROUP"]),
  name: z.string().min(1, "Tên đích không được để trống"),
  url: z.string().url("URL không hợp lệ"),
  minKarma: z.coerce.number().int().min(0).default(0),
  minAccountAgeDays: z.coerce.number().int().min(0).default(0),
  promoRatio: z.coerce.number().int().min(0).default(9),
  allowsLinks: z.coerce.boolean().default(true),
  notes: optionalText,
});

export interface ActionResult {
  ok: boolean;
  message: string;
}

function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
}

export async function createPersona(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = personaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    await prisma.persona.create({ data: parsed.data });
  } catch {
    return { ok: false, message: `Tên nhân vật "${parsed.data.name}" đã tồn tại.` };
  }

  revalidatePath("/personas");
  return { ok: true, message: `Đã tạo nhân vật "${parsed.data.name}".` };
}

export async function createProxy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = proxySchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, ...rest } = parsed.data;
  try {
    await prisma.proxy.create({ data: { ...rest, passwordEnc: encryptCredential(password) } });
  } catch {
    return { ok: false, message: "Proxy trùng nhãn hoặc trùng host/port/username đã có." };
  }

  revalidatePath("/proxies");
  return { ok: true, message: `Đã thêm proxy "${parsed.data.label}".` };
}

export async function createAccount(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = accountSchema.safeParse(formToObject(formData));
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
  } catch {
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

export async function createTarget(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const raw = formToObject(formData);
  // Checkbox không được tick thì không xuất hiện trong FormData.
  raw.allowsLinks = raw.allowsLinks === "on" || raw.allowsLinks === "true";

  const parsed = targetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    await prisma.platformTarget.create({ data: parsed.data });
  } catch {
    return { ok: false, message: `Đích "${parsed.data.name}" đã tồn tại trên nền tảng này.` };
  }

  revalidatePath("/targets");
  return { ok: true, message: `Đã thêm đích "${parsed.data.name}".` };
}

export async function updateAccountStatus(accountId: string, status: string): Promise<ActionResult> {
  const parsed = z.enum(ACCOUNT_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, message: "Trạng thái không hợp lệ." };

  await prisma.account.update({ where: { id: accountId }, data: { status: parsed.data } });
  await prisma.auditLog.create({
    data: { accountId, action: "STATUS_CHANGED", detail: `-> ${parsed.data}` },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: `Đã đổi trạng thái sang ${parsed.data}.` };
}

export interface RevealedCredential {
  value: string;
}

/** Giải mã một credential để copy. Luôn ghi AuditLog. */
export async function revealCredential(
  accountId: string,
  field: "password" | "emailPassword",
): Promise<RevealedCredential | ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  await prisma.auditLog.create({
    data: { accountId, action: "CREDENTIAL_REVEALED", detail: field },
  });

  const encrypted = field === "password" ? account.passwordEnc : account.emailPasswordEnc;
  return { value: decryptCredential(encrypted) };
}

export interface OtpResult {
  code: string;
  secondsRemaining: number;
}

/** Sinh mã OTP hiện tại cho nick. */
export async function requestOtpCode(accountId: string): Promise<OtpResult | ActionResult> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  const secret = decryptOptionalCredential(account.totpSecretEnc);
  if (!secret) return { ok: false, message: "Nick này chưa lưu TOTP secret." };

  await prisma.auditLog.create({ data: { accountId, action: "OTP_GENERATED" } });
  return generateTotpCode(secret);
}
