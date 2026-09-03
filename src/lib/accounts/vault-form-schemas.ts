/**
 * Schema của mọi form trong kho danh tính, dùng chung cho cả thêm mới lẫn sửa.
 *
 * Tách khỏi các file `"use server"` vì hai lẽ: ở đó mọi thứ export ra đều thành endpoint HTTP,
 * và vì đây chính là chỗ create/update dễ trôi khỏi nhau nhất — ô bí mật để trống lúc nhập mới
 * nghĩa là *không có*, còn lúc sửa nghĩa là *giữ nguyên*, nhưng MỌI luật còn lại phải giống hệt.
 * Khai hai lần là sớm muộn cũng có một ô bị siết ở đường này mà lỏng ở đường kia.
 *
 * Đúng một luật được phép lệch giữa hai đường, và nó đi qua cờ `creating` của
 * `validatePlatformAccountFields()` chứ không qua hai bản sao — xem chú thích ở đó.
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

/** Revision emitted by the server-rendered form for optimistic concurrency checks. */
export const accountRevisionSchema = z
  .iso.datetime({ offset: true })
  .transform((value) => new Date(value));

export const STALE_ACCOUNT_WRITE_MESSAGE =
  "This record was changed after you opened it. Reload the page before saving.";

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
  /**
   * Luôn tùy chọn ở cả hai đường, kể cả với nick Reddit.
   *
   * Ô này chỉ còn là **đường lùi**: dán tay cho máy chạy cầu nối bản cũ, hoặc cho người nhập liệu
   * hộ từ một chiếc máy không có profile. Đường chính là nút "Tạo profile trên máy này" ở trang
   * chi tiết nick. Xem `validatePlatformAccountFields()` về chuyện vì sao nó rời khỏi luật.
   */
  antidetectProfileId: optionalText,
  /**
   * Giọng viết và mảng nội dung — tùy chọn ở cả hai đường, cùng lý do với `antidetectProfileId`.
   *
   * Chúng từng là một khóa ngoại bắt buộc trỏ sang bảng `Persona`. Bắt buộc ở đây nghĩa là kho
   * chưa có nhân vật nào thì không thêm nổi một nick — một cánh cửa khóa ngay đầu luồng nhập, đổi
   * lại hai dòng chữ mà không đường code nào đọc. Thiếu giọng nay chấm ở
   * `describeAccountReadiness()` (`NO_VOICE`) chứ không chặn lúc nhập.
   */
  voice: optionalText,
  contentAngle: optionalText,
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
 * Những gì luật theo nền tảng cần nhìn. Rời khỏi model Prisma để test khỏi dựng database.
 */
export interface PlatformAccountFields {
  proxyId?: string | null;
  /** Ciphertext mật khẩu **của chính nick** — không phải mật khẩu email/Google. */
  passwordEnc?: string | null;
}

/**
 * Hai luật khác nhau theo nền tảng, gom về một chỗ.
 *
 * | | Proxy | Mật khẩu nick |
 * |---|---|---|
 * | REDDIT | bắt buộc | phải **trống** |
 * | FACEBOOK | không đòi | bắt buộc (lúc tạo) |
 *
 * **Proxy:** nick Reddit phải lén, thiếu proxy là nick đi bằng IP nhà. Fanpage đăng bằng Graph API
 * với token chính thức — không mở trình duyệt, không giả vân tay, không qua proxy — nên ép nó khai
 * proxy là bắt người dùng đốt một proxy thật chỉ để thỏa ràng buộc.
 *
 * **Mật khẩu nick:** nick Reddit của team đăng nhập bằng nút *Continue with Google*, tức **không
 * tồn tại** một mật khẩu Reddit nào; thứ mở được nick là mật khẩu Google, nằm ở `emailPasswordEnc`.
 * Bắt buộc ô đó là bắt bịa một chuỗi, rồi chuỗi giả nằm lại trong kho và phải được canh giữ y như
 * bí mật thật. Nên với Reddit, có giá trị mới là **sai** — không phải thiếu giá trị.
 *
 * ## `antidetectProfileId` KHÔNG còn ở đây (07/08/2026)
 *
 * Nó từng là điều kiện bắt buộc của nick Reddit. Nhưng id profile chỉ có được sau khi bấm nút
 * "Tạo profile trên máy này" ở **trang chi tiết**, mà trang đó cần nick tồn tại trước — ép lúc tạo
 * là dựng một vòng luẩn quẩn không lối ra. Điều kiện ấy nay chấm ở `describeAccountReadiness()`
 * (cột "Sẵn sàng") và thi hành ở `launch/route.ts`: chuyển từ *chặn lúc nhập* sang *chấm điểm sẵn
 * sàng*, không nới lỏng gì trên thực tế.
 *
 * Hàm thuần, và là nguồn sự thật DUY NHẤT cho luật này — cả đường tạo lẫn đường sửa đều gọi nó.
 * Khai hai lần là sớm muộn có một đường bị siết còn đường kia lỏng, đúng cái bẫy mà chú thích
 * đầu file này nói tới.
 */
export function validatePlatformAccountFields(
  platform: string,
  values: PlatformAccountFields,
  /**
   * `false` = đường **sửa**, nơi ô để trống nghĩa là *giữ nguyên giá trị cũ*.
   *
   * Chỉ một luật lệ thuộc vào cờ này: "Facebook phải có mật khẩu nick" không chấm được lúc sửa,
   * vì ô trống ở đó không phải là thiếu. Luật của Reddit thì áp cho cả hai đường — gửi lên một
   * mật khẩu cho nick Reddit là sai ở mọi ngữ cảnh.
   */
  options: { creating: boolean },
): string | null {
  if (platform === "REDDIT") {
    if (values.passwordEnc?.trim()) {
      return (
        "Nick Reddit đăng nhập bằng tài khoản Google nên không có mật khẩu riêng — " +
        'thứ mở được nick nằm ở ô "Mật khẩu Google".'
      );
    }
    if (!values.proxyId?.trim()) {
      return "Nick Reddit bắt buộc gắn một proxy — thiếu nó là nick chạy bằng IP nhà.";
    }
    return null;
  }

  /**
   * TikTok (19/08/2026) — nick chạy bằng trình duyệt như Reddit, nhưng có mật khẩu riêng.
   *
   * Proxy bắt buộc, cùng lý do với Reddit: mở nick bằng IP nhà là cách nhanh nhất để cả cụm
   * dính chùm. Mật khẩu thì **không** bắt buộc — nick TikTok đăng nhập được bằng mật khẩu,
   * bằng số điện thoại, hoặc bằng Google, và ép một cách ở đây là chặn hai cách còn lại ngay
   * ô nhập đầu tiên. Thiếu bí mật là chuyện chấm ở `describeAccountReadiness()`, không phải
   * chuyện chặn lúc khai — đúng ranh giới mà chú thích đầu hàm này nói tới.
   */
  if (platform === "TIKTOK") {
    if (!values.proxyId?.trim()) {
      return "Nick TikTok bắt buộc gắn một proxy — thiếu nó là nick chạy bằng IP nhà.";
    }
    return null;
  }

  if (options.creating && !values.passwordEnc?.trim()) {
    return "Nick Facebook phải có mật khẩu nick.";
  }
  return null;
}

/** Gắn luật trên vào một schema zod, để lỗi hiện ra cùng chỗ với mọi lỗi form khác. */
function withPlatformAccountCheck<T extends z.ZodTypeAny>(schema: T, platform: string) {
  return schema.superRefine((value, ctx) => {
    const message = validatePlatformAccountFields(platform, value as PlatformAccountFields, {
      creating: false,
    });
    if (message) ctx.addIssue({ code: "custom", message, path: ["proxyId"] });
  });
}

const accountCreateBase = z.object({
  ...accountShape,
  platform: z.enum(["REDDIT", "FACEBOOK", "TIKTOK"]),
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
  /**
   * Tùy chọn ở tầng schema, bắt buộc-theo-nền-tảng ở `validatePlatformAccountFields`.
   *
   * Không đánh dấu `required` ngay đây được: nick Reddit **phải** để trống ô này, nên một luật
   * cứng ở tầng schema sẽ chặn đúng trường hợp thường gặp nhất.
   */
  passwordEnc: optionalEncryptedCredential("Mật khẩu nick"),
  emailPasswordEnc: encryptedCredential("Mật khẩu email"),
  totpSecretEnc: optionalEncryptedCredential("TOTP secret"),
  /**
   * Người phụ trách, đặt ngay lúc tạo — **chỉ có ở đường tạo**.
   *
   * Đổi chủ về sau vẫn là việc của `assignAccountCluster()`, chỗ duy nhất biết đối chiếu chủ với
   * máy. Ô này chỉ quyết định giá trị ban đầu, và nó tồn tại vì `requireNickOwner()` chặn
   * OPERATOR trên nick vô chủ: nick sinh ra không chủ thì chính người vừa khai nó cũng không bấm
   * được nút "Tạo profile", phải chờ quản trị viên gán rồi mới đi tiếp được.
   */
  ownerId: optionalText,
});

export const accountCreateSchema = accountCreateBase.superRefine((value, ctx) => {
  const message = validatePlatformAccountFields(value.platform, value, { creating: true });
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
  revision: accountRevisionSchema,
  passwordEnc: optionalEncryptedCredential("Mật khẩu nick"),
  emailPasswordEnc: optionalEncryptedCredential("Mật khẩu email"),
  totpSecretEnc: optionalEncryptedCredential("TOTP secret"),
});

export function accountUpdateSchemaFor(platform: string) {
  return withPlatformAccountCheck(accountUpdateSchema, platform);
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
