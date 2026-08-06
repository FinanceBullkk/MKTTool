"use server";

/**
 * Ghi danh **chiếc máy đang ngồi**: đăng ký nó vào sổ rồi trả về đúng hai giá trị mà cầu nối cần.
 *
 * ## Vì sao tách khỏi `relay-device-actions.ts`
 *
 * File kia là sổ đăng ký nhìn từ phía quản trị: thêm một máy bất kỳ, gạch tên một máy bất kỳ.
 * File này là **một luồng cài đặt** — nó biết trình duyệt vừa đọc khóa công khai từ `127.0.0.1`,
 * nên nó trả về cả `serverPublicKey` để trình duyệt đẩy ngược xuống cầu nối. Hai việc khác nhau
 * về cả đầu vào lẫn đầu ra.
 *
 * ## Ai đăng ký được, và vì sao ranh giới nằm ở CHỦ MÁY chứ không ở vai trò
 *
 * OPERATOR tự đăng ký được **máy của chính mình**; đăng ký hộ người khác thì vẫn phải là ADMIN
 * (đường đó ở `relay-device-actions.ts`), và thu hồi cũng vậy.
 *
 * Bản đầu để cả đường này là `adminAction`, với lý lẽ: server action không biết chuỗi hex kia có
 * thật sự đến từ cầu nối trên máy người bấm hay không. Lý lẽ ấy đúng nhưng **không dẫn tới kết
 * luận ấy** — vì thứ nó sợ là "mở thêm một chỗ nhận ciphertext", mà một chiếc máy mới đăng ký
 * **vẫn không đọc nổi gì**: ruột vé còn một lớp mã hóa nữa, mở bằng `VAULT_KEY_OPERATOR`, thứ
 * máy chủ không có và không phát cho ai. Kẻ đã cầm được khóa vùng operator thì đã ở trong rồi.
 *
 * Đổi lại là một nửa lý do của cả tính năng: **người ngồi ở máy chính là người cài nó**. Bắt họ
 * đợi ADMIN đăng nhập hộ trên máy mình là dựng lại đúng vòng chờ mà nút này sinh ra để dẹp.
 *
 * Thứ **không** nới: `userId` không đọc từ form khi người bấm là OPERATOR — ép bằng chính người
 * đang đăng nhập. Không có nó thì "tự đăng ký máy mình" thành "đăng ký một máy cho bất kỳ ai",
 * và đó mới đúng là chỗ đáng sợ ban đầu.
 *
 * ## Máy đã có trong sổ thì KHÔNG phải lỗi
 *
 * Cài lại máy, hoặc mất file cấu hình mà còn khóa cũ, là ca có thật. Lúc đó việc phải làm chỉ là
 * gửi lại cấu hình — bắt người ta đi thu hồi rồi đăng ký lại là bắt họ xoay một khóa còn tốt.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  RelayDeviceKeyError,
  assertRelayPublicKeyUsable,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "./relay-device-key";
import type { SealedOperatorKeyGrant } from "@/lib/relay/relay-endpoints";
import { loadServerSigningKeys } from "./server-signing-key";

/** Hai giá trị cầu nối cần, và chỉ máy chủ mới biết. */
export interface RelayEnrollment {
  deviceId: string;
  serverPublicKey: string;
}

export interface EnrollmentResult extends ActionResult {
  /** Có mặt khi đăng ký xong — trình duyệt đẩy nguyên khối này xuống `127.0.0.1/configure`. */
  enrollment?: RelayEnrollment;
}

const enrollmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Đặt tên cho máy — tới ngày phải thu hồi gấp thì đó là thứ duy nhất để nhận ra nó.")
    .max(80, "Tên máy dài quá 80 ký tự."),
  /** Chỉ ADMIN mới được nghe. Với OPERATOR thì bỏ qua, xem phần chọn chủ máy bên dưới. */
  userId: z.string().optional(),
  publicKey: z.string().min(1, "Không đọc được khóa công khai từ cầu nối trên máy này."),
});

export const enrollThisMachine = guardedAction(async function enrollThisMachine(
  actor,
  _prev: EnrollmentResult | null,
  formData: FormData,
): Promise<EnrollmentResult> {
  const parsed = enrollmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { name, publicKey } = parsed.data;

  // Chủ máy: ADMIN chọn được (họ hay ngồi máy người khác để cài hộ), OPERATOR thì luôn là chính
  // mình. Ép ở đây chứ không ẩn ô trên giao diện — ẩn nút không phải là chặn, và người gọi thẳng
  // endpoint thì không thấy giao diện nào cả.
  const userId = actor.role === "ADMIN" ? (parsed.data.userId ?? actor.userId) : actor.userId;
  if (!userId) return { ok: false, message: "Chọn người dùng chiếc máy này." };

  // Đi vòng qua `KeyObject` rồi lấy hex ra lại, thay vì tin chuỗi client gửi lên: thứ vào
  // database phải là thứ OpenSSL đọc được thật.
  let normalizedKey: string;
  try {
    const key = relayPublicKeyToKeyObject(publicKey);
    assertRelayPublicKeyUsable(key);
    normalizedKey = relayPublicKeyToHex(key);
  } catch (error) {
    if (error instanceof RelayDeviceKeyError) return { ok: false, message: error.message };
    throw error;
  }

  const serverPublicKey = loadServerSigningKeys().publicKeyHex;

  const existing = await prisma.relayDevice.findUnique({
    where: { publicKey: normalizedKey },
    select: { id: true, name: true, revokedAt: true, user: { select: { email: true } } },
  });

  if (existing?.revokedAt) {
    // Khóa của một chiếc máy đã thu hồi coi như đã lộ. Cấp lại cấu hình cho nó là làm lần thu
    // hồi trước thành vô nghĩa.
    return {
      ok: false,
      message:
        `Khóa của máy này đã bị thu hồi (máy "${existing.name}" của ${existing.user.email}) — ` +
        `khóa của một máy đã gạch tên coi như đã lộ.\n\n` +
        `Sinh cặp khóa MỚI: tắt cầu nối, xóa file "relay-device-key.json" trong ` +
        `%LOCALAPPDATA%\\MKTTool-Relay, rồi bật lại và bấm "Tìm cầu nối" lần nữa. File ` +
        `relay-config.json giữ nguyên, không mất khóa vùng operator.`,
    };
  }

  if (existing) {
    return {
      ok: true,
      message: `Máy này đã có trong sổ ("${existing.name}"). Đang gửi lại cấu hình xuống cầu nối.`,
      enrollment: { deviceId: existing.id, serverPublicKey },
    };
  }

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!owner) return { ok: false, message: "Không tìm thấy người dùng này." };

  // Hàng `User` chỉ chứng minh họ TỪNG đăng nhập được. Đăng ký máy cho người đã bị gỡ khỏi danh
  // sách trắng là dựng một chiếc máy không bao giờ xin được vé.
  if (!isEmailAllowed(owner.email, readEmailAccessList())) {
    return {
      ok: false,
      message:
        `${owner.email} không còn trong ALLOWED_EMAILS nên không đăng nhập được nữa — máy đăng ` +
        `ký cho họ sẽ không bao giờ xin được vé. Thêm lại vào danh sách, hoặc chọn người khác.`,
    };
  }

  const device = await prisma.relayDevice.create({
    data: { name, userId, publicKey: normalizedKey },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_DEVICE_REGISTERED,
      detail: `${actor.email} đăng ký máy "${name}" cho ${owner.email} (${device.id}) từ luồng cài đặt`,
      actorId: actor.userId,
    },
  });

  revalidatePath("/relay-devices");

  return {
    ok: true,
    message: `Đã ghi máy "${name}" vào sổ cho ${owner.email}. Đang gửi cấu hình xuống cầu nối.`,
    enrollment: { deviceId: device.id, serverPublicKey },
  };
});

/** Khóa vùng operator của chiếc máy đang ngồi đang ở đâu. */
export interface OperatorKeyGrantResult extends ActionResult {
  /**
   * `ready` — có hộp, trình duyệt đẩy xuống cầu nối ngay.
   * `waiting` — chưa ai cấp; máy này phải đợi quản trị viên bấm.
   * `already` — máy đã báo có khóa từ trước, không phải làm gì.
   */
  state?: "ready" | "waiting" | "already";
  grant?: SealedOperatorKeyGrant;
}

const deviceIdSchema = z.object({ deviceId: z.string().min(1, "Thiếu mã máy.") });

/**
 * Máy đang ngồi hỏi xem có hộp khóa nào đang chờ nó không.
 *
 * ## Vì sao vẫn kiểm chủ máy, dù hộp đã bọc cho đúng một máy
 *
 * Kiểm ở đây không chặn được việc đọc ruột — bọc rồi thì người lạ lấy về cũng chỉ có một khối
 * rác. Nó chặn thứ khác: **đọc sổ bằng cách dò**. Không kiểm thì bất kỳ ai đăng nhập được cũng
 * quét được `deviceId` để biết máy nào đã được cấp khóa lúc nào, tức là dựng lại được lịch làm
 * việc của đồng nghiệp từ một endpoint vốn không sinh ra để trả lời câu đó.
 */
export const readOperatorKeyGrant = guardedAction(async function readOperatorKeyGrant(
  actor,
  _prev: OperatorKeyGrantResult | null,
  formData: FormData,
): Promise<OperatorKeyGrantResult> {
  const parsed = deviceIdSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const device = await prisma.relayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: {
      userId: true,
      name: true,
      revokedAt: true,
      operatorKeyGrant: true,
      operatorKeyReadyAt: true,
    },
  });
  if (!device) {
    return {
      ok: false,
      message:
        "Máy này không có trong sổ. Nhiều khả năng nó đã bị xóa khỏi sổ sau khi cấu hình — bấm " +
        '"Tìm cầu nối" rồi đăng ký lại.',
    };
  }

  if (actor.role !== "ADMIN" && device.userId !== actor.userId) {
    return { ok: false, message: "Máy này không phải máy của bạn." };
  }

  if (device.revokedAt) {
    return { ok: false, message: `Máy "${device.name}" đã bị thu hồi.` };
  }

  if (device.operatorKeyGrant) {
    let grant: unknown;
    try {
      grant = JSON.parse(device.operatorKeyGrant);
    } catch {
      return { ok: false, message: "Hộp khóa lưu trong sổ đã hỏng — xin quản trị viên cấp lại." };
    }

    const raw = (typeof grant === "object" && grant !== null ? grant : {}) as Record<
      string,
      unknown
    >;
    if (typeof raw.ephemeralPublicKey !== "string" || typeof raw.sealed !== "string") {
      return { ok: false, message: "Hộp khóa lưu trong sổ thiếu phần — xin quản trị viên cấp lại." };
    }

    return {
      ok: true,
      message: "Có khóa đang chờ máy này.",
      state: "ready",
      grant: { ephemeralPublicKey: raw.ephemeralPublicKey, sealed: raw.sealed },
    };
  }

  return device.operatorKeyReadyAt
    ? { ok: true, message: "Máy này đã báo có khóa từ trước.", state: "already" }
    : { ok: true, message: "Chưa có khóa nào được cấp cho máy này.", state: "waiting" };
});

/**
 * Chiếc máy tự báo rằng nó **đã có** khóa vùng operator.
 *
 * ## Vì sao là "máy tự báo" chứ không phải "đã giao xong"
 *
 * Có hai đường để một máy có khóa: được cấp, và người dùng dán tay ở trang trạng thái của cầu
 * nối. Đường thứ hai là đường bootstrap — và là đường **duy nhất** cho chiếc máy đầu tiên của cả
 * team, vì lúc đó chưa tồn tại cầu nối nào khác để bọc từ đó. Máy chủ không thấy được đường ấy.
 *
 * Nên hàm này ghi đúng thứ nó biết: *chiếc máy đó vừa khai là nó đã đủ cấu hình*. Suy ra trạng
 * thái từ việc "đã cấp hay chưa" thì sổ sẽ nói một chiếc máy đang chạy tốt là chưa sẵn sàng.
 */
export const markOperatorKeyReady = guardedAction(async function markOperatorKeyReady(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deviceIdSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const device = await prisma.relayDevice.findUnique({
    where: { id: parsed.data.deviceId },
    select: { userId: true },
  });
  if (!device) return { ok: false, message: "Máy này không có trong sổ." };

  if (actor.role !== "ADMIN" && device.userId !== actor.userId) {
    return { ok: false, message: "Máy này không phải máy của bạn." };
  }

  await prisma.relayDevice.update({
    where: { id: parsed.data.deviceId },
    data: {
      // Xóa hộp ngay khi nó tới nơi. Giữ lại một bản sao đã dùng xong chỉ là thêm một thứ để rò
      // nếu có ngày bản sao lưu database lọt ra ngoài.
      operatorKeyGrant: null,
      operatorKeyReadyAt: new Date(),
    },
  });

  revalidatePath("/relay-devices");

  return { ok: true, message: "Máy này đã sẵn sàng." };
});
