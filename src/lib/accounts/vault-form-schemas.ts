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
import { isEncryptedCredentialShape } from "@/lib/crypto/credential-encryption";
import { parseDateTimeInput, parseLocalDateInput } from "@/lib/format/vietnamese-date-format";
import { TARGET_PLATFORMS } from "@/lib/platforms/platform-family";
import { ACCOUNT_STATUSES } from "./account-status";

/** Chuỗi rỗng từ form thành undefined để zod xử lý optional cho đúng. */
export const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

/**
 * Ngày từ `<input type="date">` — đọc theo MÚI GIỜ TEAM, không phải UTC, cũng không phải
 * giờ máy chủ.
 *
 * `z.coerce.date()` trên chuỗi `2026-08-16` cho nửa đêm UTC, tức 07:00 giờ Việt Nam:
 * cold-start hết muộn hơn nửa buổi so với ngày người dùng nhìn thấy, trong khi mọi phép
 * đếm ngày khác trong app đều cắt theo múi giờ team (xem startOfLocalDay).
 */
export const optionalDate = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return parseLocalDateInput(value);
}, z.coerce.date().optional());

/**
 * Giờ từ `<input type="datetime-local">` — đọc theo MÚI GIỜ TEAM.
 *
 * Chuỗi `2026-08-16T21:30` KHÔNG mang múi giờ, nên `z.coerce.date()` đọc nó theo giờ của
 * MÁY CHỦ: người dùng gõ 21:30 thì job rơi vào 21:30 của máy chủ, không phải 21:30 của họ.
 * Với máy chủ đặt ở nước ngoài, lệch đó là vài tiếng và không có gì báo.
 *
 * Chuỗi CÓ mang múi giờ (ISO kèm `Z`) là mốc tuyệt đối, không cần diễn giải lại — nó không
 * khớp mẫu nên rơi xuống `z.coerce.date()` xử lý, đúng như trước.
 */
export const dateTimeInput = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return parseDateTimeInput(value);
}, z.coerce.date());

export const requiredId = z.string().min(1, "Thiếu id bản ghi cần sửa");

/**
 * Ô bí mật của nick — form gửi lên **ciphertext**, không gửi mật khẩu.
 *
 * Từ GĐ3, ba cột bí mật của nick thuộc vùng khóa operator và máy chủ không giữ khóa đó nữa. Nên
 * việc mã hóa chuyển về cầu nối trên máy người dùng (xem `account-vault-form.tsx`), và thứ đi
 * qua dây là chuỗi đã bọc.
 *
 * Phép kiểm này **không** giải mã được — nó không có khóa. Nó chỉ trả lời *"đây có phải mật khẩu
 * dạng trần không"*, và đó chính là kiểu hỏng phải chặn: form bị sửa hỏng một ngày nào đó thì bí
 * mật đi thẳng vào database chưa mã hóa, im lặng, cho tới ngày ai đó mở bản sao lưu ra đọc. Chặn
 * ở đây thì hỏng ồn ào ngay lần lưu đầu tiên.
 */
function encryptedCredential(label: string) {
  return z.string().refine(isEncryptedCredentialShape, {
    message:
      `Ô "${label}" gửi lên không phải chuỗi đã mã hóa. Bí mật nick phải được cầu nối trên máy ` +
      `bạn mã hóa trước khi gửi đi — máy chủ không có khóa để tự làm việc đó. Tải lại trang; ` +
      `nếu vẫn vậy thì cầu nối chưa chạy.`,
  });
}

/** Như trên, nhưng ô để trống là hợp lệ (tạo nick chưa bật 2FA, hoặc sửa mà giữ nguyên). */
function optionalEncryptedCredential(label: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    encryptedCredential(label).optional(),
  );
}

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
  /**
   * `trim()` không phải để cho đẹp: username là KHÓA TRA CỨU của bộ dò shadowban
   * (`old.reddit.com/user/<username>`), và một khoảng trắng thừa thành `%20` trong URL.
   *
   * Đo thật 04/08/2026: một nick lưu là `" IllBlueberry5395"`. Lần đó Reddit vẫn trả đúng
   * trang, nhưng đó là may — cùng lớp lỗi với chuyện gõ sai username, mà lớp lỗi đó dẫn
   * thẳng tới kết luận 404 → tự cách ly một nick đang khỏe.
   */
  username: z.string().trim().min(1, "Username không được để trống"),
  emailAddress: z.string().email("Email gốc không hợp lệ"),
  // Bắt buộc hay không tùy nền tảng — xem validatePlatformIdentityFields() ngay dưới.
  antidetectProfileId: optionalText,
  personaId: z.string().min(1, "Chọn nhân vật"),
  proxyId: optionalText,
  status: z.enum(ACCOUNT_STATUSES),
  karma: z.coerce.number().int().min(0).default(0),
  quarantineReason: optionalText,
  coldStartUntil: optionalDate,
  platformCreatedAt: optionalDate,
  purchasedAt: optionalDate,
  purchaseNote: optionalText,
};

/**
 * Proxy và profile antidetect: Reddit bắt buộc, Facebook không.
 *
 * Nick Reddit phải lén — thiếu proxy là nick đi bằng IP nhà, thiếu profile antidetect là không
 * mở nổi trình duyệt riêng cho nó. Fanpage đăng bằng Graph API với token chính thức: không mở
 * trình duyệt, không giả vân tay, không qua proxy. Ép hai trường đó là bắt người dùng đốt một
 * proxy thật và bịa một id chỉ để thỏa ràng buộc.
 *
 * Hàm thuần, và là nguồn sự thật DUY NHẤT cho luật này — cả đường tạo lẫn đường sửa đều gọi nó.
 * Khai hai lần là sớm muộn có một đường bị siết còn đường kia lỏng, đúng cái bẫy mà chú thích
 * đầu file này nói tới.
 */
export function validatePlatformIdentityFields(
  platform: string,
  values: { antidetectProfileId?: string | null; proxyId?: string | null },
): string | null {
  if (platform !== "REDDIT") return null;
  if (!values.antidetectProfileId?.trim()) {
    return "Nick Reddit bắt buộc có id profile antidetect — thiếu nó thì không mở được profile riêng.";
  }
  if (!values.proxyId?.trim()) {
    return "Nick Reddit bắt buộc gắn một proxy — thiếu nó là nick chạy bằng IP nhà.";
  }
  return null;
}

/** Gắn luật trên vào một schema zod, để lỗi hiện ra cùng chỗ với mọi lỗi form khác. */
function withPlatformIdentityCheck<T extends z.ZodTypeAny>(schema: T, platform: string) {
  return schema.superRefine((value, ctx) => {
    const message = validatePlatformIdentityFields(
      platform,
      value as { antidetectProfileId?: string; proxyId?: string },
    );
    if (message) ctx.addIssue({ code: "custom", message, path: ["proxyId"] });
  });
}

const accountCreateBase = z.object({
  ...accountShape,
  platform: z.enum(["REDDIT", "FACEBOOK"]),
  /**
   * Nick mới **luôn** bắt đầu ở `COLD_START`, nên form tạo không hỏi nữa (07/08/2026).
   *
   * Ô đó từng nằm trong form tạo cùng "Lý do cách ly" — hai ô **vận hành** đứng lẫn giữa các ô
   * danh tính, và chúng chỉ có nghĩa cho một nick đã sống một thời gian. Người nhập liệu phải
   * quyết định một thứ chưa có câu trả lời nào khác ngoài mặc định.
   *
   * `default` chứ không bỏ hẳn khỏi schema: form **sửa** vẫn gửi ô này lên và vẫn phải đổi được.
   */
  status: z.enum(ACCOUNT_STATUSES).default("COLD_START"),
  passwordEnc: encryptedCredential("Mật khẩu nick"),
  emailPasswordEnc: encryptedCredential("Mật khẩu email"),
  totpSecretEnc: optionalEncryptedCredential("TOTP secret"),
});

export const accountCreateSchema = accountCreateBase.superRefine((value, ctx) => {
  const message = validatePlatformIdentityFields(value.platform, value);
  if (message) ctx.addIssue({ code: "custom", message, path: ["proxyId"] });
});

/**
 * Sửa nick: ba ô bí mật để trống đều là giữ nguyên giá trị cũ.
 *
 * `platform` không sửa được nên form không gửi nó lên — luật theo nền tảng phải chấm bằng nền
 * tảng đọc từ DB. Dùng `accountUpdateSchemaFor(platform)` thay vì schema trần khi đã biết nick.
 */
export const accountUpdateSchema = z.object({
  ...accountShape,
  id: requiredId,
  passwordEnc: optionalEncryptedCredential("Mật khẩu nick"),
  emailPasswordEnc: optionalEncryptedCredential("Mật khẩu email"),
  totpSecretEnc: optionalEncryptedCredential("TOTP secret"),
});

export function accountUpdateSchemaFor(platform: string) {
  return withPlatformIdentityCheck(accountUpdateSchema, platform);
}

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
