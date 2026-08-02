/**
 * Schema của mọi form trong kho danh tính, dùng chung cho cả thêm mới lẫn sửa.
 *
 * Tách khỏi các file `"use server"` vì hai lẽ: ở đó mọi thứ export ra đều thành endpoint HTTP,
 * và vì đây chính là chỗ create/update dễ trôi khỏi nhau nhất — nhập mới bắt buộc nhập mật khẩu
 * còn sửa thì để trống là giữ nguyên, nhưng MỌI luật còn lại phải giống hệt. Khai hai lần là
 * sớm muộn cũng có một ô bị siết ở đường này mà lỏng ở đường kia.
 */
import { z } from "zod";
import { CONTENT_TYPES } from "@/lib/content/content-types";
import { parseLocalDateInput } from "@/lib/format/vietnamese-date-format";
import { TARGET_PLATFORMS } from "@/lib/platforms/platform-family";
import { ACCOUNT_STATUSES } from "./account-status";

/** Chuỗi rỗng từ form thành undefined để zod xử lý optional cho đúng. */
export const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

/**
 * Ngày từ `<input type="date">` — đọc theo GIỜ MÁY, không phải UTC.
 *
 * `z.coerce.date()` trên chuỗi `2026-08-16` cho nửa đêm UTC, tức 07:00 giờ Việt Nam:
 * cold-start hết muộn hơn nửa buổi so với ngày người dùng nhìn thấy, trong khi mọi phép
 * đếm ngày khác trong app đều tính theo giờ máy (xem startOfLocalDay).
 */
export const optionalDate = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return parseLocalDateInput(value);
}, z.coerce.date().optional());

export const requiredId = z.string().min(1, "Thiếu id bản ghi cần sửa");

export function formToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
}

/** Checkbox không được tick thì không xuất hiện trong FormData — phải tự bù về boolean. */
export function normalizeCheckbox(raw: Record<string, unknown>, name: string): void {
  raw[name] = raw[name] === "on" || raw[name] === "true";
}

// ─── Nhân vật ────────────────────────────────────────────────────────────────

const personaShape = {
  name: z.string().min(1, "Tên nhân vật không được để trống"),
  voice: z.string().min(1, "Mô tả giọng điệu không được để trống"),
  contentAngle: z.string().min(1, "Mảng nội dung không được để trống"),
  notes: optionalText,
};

export const personaCreateSchema = z.object(personaShape);
export const personaUpdateSchema = z.object({ ...personaShape, id: requiredId });

// ─── Proxy ───────────────────────────────────────────────────────────────────

const proxyShape = {
  label: z.string().min(1, "Nhãn không được để trống"),
  host: z.string().min(1, "Host không được để trống"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1, "Username không được để trống"),
  country: z.string().min(2, "Nhập mã quốc gia, ví dụ US"),
  type: z.enum(["STATIC_ISP", "MOBILE"]),
  // Giao thức mạng — thứ được đẩy sang antidetect browser. Khác `type` (cách mua proxy).
  protocol: z.enum(["http", "socks5"]),
  notes: optionalText,
};

export const proxyCreateSchema = z.object({
  ...proxyShape,
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

/** Sửa proxy: để trống ô mật khẩu là giữ nguyên mật khẩu cũ. */
export const proxyUpdateSchema = z.object({
  ...proxyShape,
  id: requiredId,
  password: optionalText,
});

// ─── Nick ────────────────────────────────────────────────────────────────────

/**
 * `platform` KHÔNG nằm trong phần sửa được.
 *
 * Đổi nền tảng của một nick đã có job là biến mọi job đó thành nick-nền-tảng-này đăng vào
 * đích-nền-tảng-kia — thứ mà isPlatformCompatible chặn ngay từ lúc tạo. Muốn đổi thì xóa
 * nick lúc chưa có gì trỏ tới rồi nhập lại.
 */
const accountShape = {
  username: z.string().min(1, "Username không được để trống"),
  emailAddress: z.string().email("Email gốc không hợp lệ"),
  antidetectProfileId: z.string().min(1, "Thiếu id profile antidetect"),
  personaId: z.string().min(1, "Chọn nhân vật"),
  proxyId: z.string().min(1, "Chọn proxy"),
  status: z.enum(ACCOUNT_STATUSES),
  karma: z.coerce.number().int().min(0).default(0),
  quarantineReason: optionalText,
  coldStartUntil: optionalDate,
  platformCreatedAt: optionalDate,
  purchasedAt: optionalDate,
  purchaseNote: optionalText,
};

export const accountCreateSchema = z.object({
  ...accountShape,
  platform: z.enum(["REDDIT", "FACEBOOK"]),
  password: z.string().min(1, "Mật khẩu không được để trống"),
  emailPassword: z.string().min(1, "Mật khẩu email không được để trống"),
  totpSecret: optionalText,
});

/** Sửa nick: ba ô bí mật để trống đều là giữ nguyên giá trị cũ. */
export const accountUpdateSchema = z.object({
  ...accountShape,
  id: requiredId,
  password: optionalText,
  emailPassword: optionalText,
  totpSecret: optionalText,
});

// ─── Đích đăng ───────────────────────────────────────────────────────────────

const targetShape = {
  name: z.string().min(1, "Tên đích không được để trống"),
  url: z.string().url("URL không hợp lệ"),
  minKarma: z.coerce.number().int().min(0).default(0),
  minAccountAgeDays: z.coerce.number().int().min(0).default(0),
  promoRatio: z.coerce.number().int().min(0).default(9),
  allowsLinks: z.coerce.boolean().default(true),
  notes: optionalText,
};

export const targetCreateSchema = z.object({
  ...targetShape,
  platform: z.enum(TARGET_PLATFORMS),
});

/** `platform` cố định sau khi tạo, cùng lý do với nick — xem chú thích ở accountShape. */
export const targetUpdateSchema = z.object({
  ...targetShape,
  id: requiredId,
  active: z.coerce.boolean().default(true),
});

// ─── Content ─────────────────────────────────────────────────────────────────

const contentItemShape = {
  title: z.string().min(1, "Tiêu đề không được để trống"),
  body: z.string().min(1, "Thân bài không được để trống"),
  type: z.enum(CONTENT_TYPES),
  authorName: z.string().min(1, "Ghi tên người viết để sau còn truy được"),
  linksText: z.string().optional(),
};

export const contentItemCreateSchema = z.object(contentItemShape);
export const contentItemUpdateSchema = z.object({ ...contentItemShape, id: requiredId });
