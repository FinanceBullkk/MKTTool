"use server";

/**
 * Thêm mới bản ghi vào kho danh tính: proxy, nick, đích đăng.
 *
 * Mọi credential đi qua đây đều được mã hóa TRƯỚC khi chạm vào database.
 *
 * Bộ ba cùng họ: file này (thêm), vault-update-actions.ts (sửa), vault-delete-actions.ts (xóa).
 * Cả ba dùng chung schema ở vault-form-schemas.ts để không đường nào siết lỏng hơn đường kia.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { adminAction, guardedAction } from "@/lib/auth/guarded-action";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import { prisma } from "@/lib/db/prisma-client";
import {
  describeUnexpectedDbError,
  isUniqueConstraintError,
} from "@/lib/db/prisma-error-helpers";
import {
  accountCreateSchema,
  firstError,
  formToObject,
  normalizeCheckbox,
  proxyCreateSchema,
  targetCreateSchema,
} from "./vault-form-schemas";

/**
 * Chỉ ADMIN — xem chú thích ở `deleteProxy`.
 *
 * Thêm proxy cũng vào tay ADMIN dù nó không xóa gì: kho proxy chỉ có nghĩa khi một người chịu
 * trách nhiệm cả nó. Ai cũng thêm được thì sẽ có proxy trùng dải, trùng nhà cung cấp với proxy
 * quan sát viên, hoặc nhập nhầm giao thức — những thứ không báo lỗi ngay mà làm yếu đi âm thầm.
 */
export const createProxy = adminAction(async function createProxy(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = proxyCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { password, ...rest } = parsed.data;
  try {
    await prisma.proxy.create({
      data: {
        ...rest,
        passwordEnc: encryptCredential(password, loadVaultKey("server")),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return {
        ok: false,
        message: describeUnexpectedDbError(error, "thêm proxy"),
      };
    }
    return {
      ok: false,
      message: "Proxy trùng nhãn hoặc trùng host/port/username đã có.",
    };
  }

  revalidatePath("/proxies");
  return { ok: true, message: `Đã thêm proxy "${parsed.data.label}".` };
});

/**
 * Thêm nick — **chặng 1** của luồng nhập một nick, không phải cả luồng.
 *
 * Hàng sinh ra ở đây cố ý còn thiếu hai thứ, và cả hai chỉ có được ở chặng sau:
 *
 * | Thiếu | Điền ở đâu |
 * |---|---|
 * | `antidetectProfileId` + `deviceId` | nút "Tạo profile trên máy này" ở trang chi tiết |
 * | `firstLoginAt` | nút "Đã đăng nhập được", sau khi đăng nhập thật trong profile |
 *
 * Bản ghi nick **chính là** trạng thái của luồng nhập; `describeAccountReadiness()` đọc nó rồi
 * nói ra việc còn lại. Không có state tạm nào phải giữ giữa các chặng — onboarding một nick kéo
 * dài qua nhiều lượt ngồi (chờ MultiZen, chờ mã Google), và state tạm là thứ mất khi đóng tab.
 *
 * **Người tạo là chủ nick** (từ 07/08/2026). Trước đó nick sinh ra vô chủ, mà `requireNickOwner()`
 * chặn OPERATOR trên nick vô chủ — nên chính người vừa khai nick cũng không bấm được nút tạo
 * profile cho tới khi quản trị viên gán chủ. Hai lượt qua lại cho mỗi nick, không đổi lại gì:
 * người tạo vừa tự tay gõ chính những bí mật đó vào form một phút trước.
 *
 * **Ba cột bí mật đi vào đây đã ở dạng ciphertext** — cầu nối trên máy người dùng bọc chúng
 * trước khi form gửi lên (xem `account-vault-form.tsx`). Máy chủ không mã hóa, vì nó không giữ
 * `VAULT_KEY_OPERATOR` nữa; nó chỉ kiểm hình dạng rồi ghi thẳng.
 *
 * Hệ quả phải nói ra: **phép kiểm "TOTP secret có dùng được không" chuyển sang cầu nối**. Máy
 * chủ không đọc nổi chuỗi đó nên không kiểm được, và đoán mò thì tệ hơn không kiểm. Cầu nối
 * chuẩn hóa (bỏ khoảng trắng, viết hoa) rồi kiểm trước khi bọc — xem
 * `relay-endpoints.ts` và GĐ4 bước 7.
 */
export const createAccount = guardedAction(async function createAccount(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { totpSecretEnc, passwordEnc, ownerId, ...rest } = parsed.data;

  // Chỉ ADMIN giao được nick cho người khác. OPERATOR gửi lên id nào cũng thành id của chính họ:
  // không phải để phòng kẻ tấn công mà để form khỏi phải là bên giữ luật — ô đó ở phía họ vốn là
  // ô chỉ đọc, và một ô chỉ đọc là thứ sửa được bằng devtools trong ba giây.
  const owner = actor.role === "ADMIN" ? ownerId?.trim() || null : actor.userId;

  try {
    await prisma.account.create({
      data: {
        ...rest,
        // Ô để trống phải thành NULL chứ không phải chuỗi rỗng: `@unique` coi hai chuỗi rỗng là
        // trùng nhau, nên nick Facebook thứ hai sẽ ăn lỗi trùng ràng buộc mà không hiểu vì sao.
        antidetectProfileId: rest.antidetectProfileId?.trim() || null,
        proxyId: rest.proxyId?.trim() || null,
        // Nick Reddit đăng nhập bằng Google nên không có mật khẩu riêng — `validatePlatformAccountFields`
        // đã chặn trường hợp gửi lên một chuỗi, ở đây chỉ còn việc ghi NULL thay vì chuỗi rỗng.
        passwordEnc: passwordEnc ?? null,
        totpSecretEnc: totpSecretEnc ?? null,
        ownerId: owner,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      return {
        ok: false,
        message: describeUnexpectedDbError(error, "thêm nick"),
      };
    }
    return {
      ok: false,
      message:
        "Không tạo được nick. Kiểm tra: proxy đã gắn nick khác chưa, " +
        "profile antidetect đã dùng chưa, username đã tồn tại trên nền tảng này chưa.",
    };
  }

  revalidatePath("/accounts");
  // Nói ngay việc tiếp theo. Nick vừa tạo CHƯA dùng được, và không nói ra thì người ta đóng tab
  // rồi tưởng đã xong — cột "Sẵn sàng" ở trang danh sách là chỗ họ sẽ không nhìn tới.
  return {
    ok: true,
    message:
      `Đã thêm nick "${parsed.data.username}". Mở trang chi tiết của nó để dựng profile ` +
      `antidetect — nick chưa có profile thì chưa mở được trình duyệt riêng.`,
  };
});

export const createTarget = guardedAction(async function createTarget(
  _actor,
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
      return {
        ok: false,
        message: describeUnexpectedDbError(error, "thêm đích đăng"),
      };
    }
    return {
      ok: false,
      message: `Đích "${parsed.data.name}" đã tồn tại trên nền tảng này.`,
    };
  }

  revalidatePath("/targets");
  return { ok: true, message: `Đã thêm đích "${parsed.data.name}".` };
});
