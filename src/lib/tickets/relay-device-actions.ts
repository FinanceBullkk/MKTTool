"use server";

/**
 * Sổ đăng ký máy chạy cầu nối: cho một máy vào sổ, và gạch tên nó khi máy mất.
 *
 * ## Vì sao `adminAction` cho cả hai
 *
 * Đăng ký một chiếc máy là tự nhận thêm một chỗ mà bí mật nick sẽ được gửi tới. Để OPERATOR tự
 * làm thì ranh giới của cả phase này không còn nghĩa: một người chỉ cần đăng ký thêm khóa của
 * một cái máy bất kỳ — kể cả máy không phải của họ — là mở được một đường nhận ciphertext mới.
 *
 * Thu hồi cũng vậy, nhưng theo chiều ngược lại: để ai cũng thu hồi được thì một người bực mình
 * có thể gạch sạch máy của cả team ngay giữa giờ làm.
 *
 * ## Thu hồi làm được gì, và KHÔNG làm được gì
 *
 * Nó chặn **vé mới**. Ciphertext mà chiếc máy đó đã lấy về từ trước vẫn nằm trên ổ cứng của nó
 * và vẫn mở được bằng `VAULT_KEY_OPERATOR` — không lệnh nào ở đây với tới chỗ ấy được. Mất máy
 * thì vẫn phải xoay khóa vùng operator; thu hồi là cái chặn có hiệu lực trong vài giây, để dùng
 * trong lúc chờ xoay khóa xong. Mọi câu thông báo dưới đây đều phải nói đúng ranh giới đó.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import {
  RelayDeviceKeyError,
  assertRelayPublicKeyUsable,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "./relay-device-key";

const registrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Đặt tên cho máy — tới ngày phải thu hồi gấp thì đó là thứ duy nhất để nhận ra nó.")
    .max(80, "Tên máy dài quá 80 ký tự."),
  userId: z.string().min(1, "Chọn người dùng chiếc máy này."),
  publicKey: z.string().min(1, "Dán khóa công khai mà cầu nối in ra lúc cài."),
});

/** Đường dẫn màn hình sổ đăng ký — khai một chỗ để hai action không lệch nhau. */
const RELAY_DEVICES_PATH = "/relay-devices";

/**
 * Câu giải thích khi khóa đã có người khai, hoặc `null` nếu sổ chưa có khóa này.
 *
 * Tách ra vì gọi ở **hai chỗ**: lượt kiểm trước khi ghi, và lượt bắt P2002 khi hai người ghi
 * cùng lúc. Hai chỗ đó phải nói cùng một câu — người dùng không việc gì phải nhận hai lời giải
 * thích khác nhau cho cùng một tình huống chỉ vì họ chậm hơn người kia vài mili giây.
 */
async function describeDuplicateKey(publicKey: string): Promise<string | null> {
  const existing = await prisma.relayDevice.findUnique({
    where: { publicKey },
    select: { name: true, revokedAt: true, user: { select: { email: true } } },
  });

  if (!existing) return null;

  // Khóa đã thu hồi mà cho đăng ký lại thì lần thu hồi trước thành vô nghĩa: khóa của một
  // chiếc máy đã mất coi như đã lộ, và cái máy nhặt được nó vẫn giải mã được vé mới.
  if (existing.revokedAt) {
    return (
      `Khóa này đã bị thu hồi (máy "${existing.name}" của ${existing.user.email}) và không ` +
      `dùng lại được. Sinh cặp khóa MỚI trên máy đó rồi đăng ký khóa mới.`
    );
  }

  return (
    `Khóa này đã có trong sổ — máy "${existing.name}" của ${existing.user.email}. ` +
    `Mỗi máy sinh một cặp khóa riêng; hai máy dùng chung khóa thì thu hồi một cái không ` +
    `chặn được cái kia.`
  );
}

/**
 * Ghi một chiếc máy vào sổ.
 *
 * Kiểm khóa **trước khi** chạm database: khóa hỏng mà vẫn ghi vào sổ thì nó nằm im ở đó tới tận
 * ngày phát vé thật, và lúc ấy hỏng ở phía cầu nối, cách xa chỗ có thể sửa.
 */
export const registerRelayDevice = adminAction(async function registerRelayDevice(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = registrationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { name, userId, publicKey } = parsed.data;

  // Đi vòng qua `KeyObject` rồi lấy hex ra lại, thay vì ghi thẳng chuỗi người dùng dán vào:
  // thứ vào database phải là thứ OpenSSL đọc được thật, không phải chuỗi vừa qua một hàm kiểm.
  // Trên thực tế hai đường ra cùng một kết quả — cho tới ngày ai đó sửa hàm kiểm.
  let normalizedKey: string;
  try {
    const key = relayPublicKeyToKeyObject(publicKey);
    assertRelayPublicKeyUsable(key);
    normalizedKey = relayPublicKeyToHex(key);
  } catch (error) {
    if (error instanceof RelayDeviceKeyError) return { ok: false, message: error.message };
    throw error;
  }

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!owner) return { ok: false, message: "Không tìm thấy người dùng này." };

  // Cùng lý lẽ với `assignAccountOwner`: hàng `User` chỉ chứng minh họ TỪNG đăng nhập được.
  // Đăng ký máy cho người đã bị gỡ khỏi danh sách trắng là dựng một chiếc máy không bao giờ
  // xin được vé — mọi request của họ đều bị chặn ở `checkActor`.
  if (!isEmailAllowed(owner.email, readEmailAccessList())) {
    return {
      ok: false,
      message:
        `${owner.email} không còn trong ALLOWED_EMAILS nên không đăng nhập được nữa — máy đăng ` +
        `ký cho họ sẽ không bao giờ xin được vé. Thêm lại vào .env, hoặc chọn người khác.`,
    };
  }

  const duplicate = await describeDuplicateKey(normalizedKey);
  if (duplicate) return { ok: false, message: duplicate };

  let device: { id: string };
  try {
    device = await prisma.relayDevice.create({
      data: { name, userId, publicKey: normalizedKey },
      select: { id: true },
    });
  } catch (error) {
    // Giữa lượt `findUnique` ở trên và lượt `create` này có một khe: hai admin dán cùng một khóa
    // cùng lúc thì cả hai đều thấy sổ trống rồi cùng ghi. `@unique` chặn đúng người thứ hai —
    // nhưng nếu để P2002 ném ra khỏi server action thì trình duyệt chỉ thấy promise reject, nút
    // trông như hỏng mà không có chữ nào. Hỏi lại sổ để trả về đúng câu đã soạn cho tình huống đó.
    if (!isUniqueConstraintError(error)) throw error;

    return {
      ok: false,
      message:
        (await describeDuplicateKey(normalizedKey)) ??
        "Khóa này vừa được người khác ghi vào sổ. Tải lại trang để xem.",
    };
  }

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_DEVICE_REGISTERED,
      detail: `${actor.email} đăng ký máy "${name}" cho ${owner.email} (${device.id})`,
      actorId: actor.userId,
    },
  });

  revalidatePath(RELAY_DEVICES_PATH);
  return {
    ok: true,
    message:
      `Đã ghi máy "${name}" vào sổ cho ${owner.email}. Từ giờ vé phát cho họ được mã hóa bằng ` +
      `khóa của máy này — không máy nào khác mở được.`,
  };
});

/**
 * Gạch tên một chiếc máy khỏi sổ.
 *
 * Không xóa hàng, chỉ đóng dấu ngày: hàng còn đó thì khóa còn bị `@unique` chặn đăng ký lại,
 * và câu hỏi "chiếc máy mất hôm ấy bị chặn từ lúc nào" còn chỗ để trả lời. Xóa hàng là mất cả
 * hai thứ cùng lúc.
 */
export const revokeRelayDevice = adminAction(async function revokeRelayDevice(
  actor,
  deviceId: string,
): Promise<ActionResult> {
  const device = await prisma.relayDevice.findUnique({
    where: { id: deviceId },
    select: { name: true, revokedAt: true, user: { select: { email: true } } },
  });

  if (!device) return { ok: false, message: "Không tìm thấy máy này trong sổ." };

  if (device.revokedAt) {
    return {
      ok: false,
      message: `Máy "${device.name}" đã bị thu hồi lúc ${formatFullDateTime(device.revokedAt)}.`,
    };
  }

  await prisma.relayDevice.update({
    where: { id: deviceId },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_DEVICE_REVOKED,
      detail: `${actor.email} thu hồi máy "${device.name}" của ${device.user.email} (${deviceId})`,
      actorId: actor.userId,
    },
  });

  revalidatePath(RELAY_DEVICES_PATH);
  return {
    ok: true,
    message:
      `Đã thu hồi máy "${device.name}" — nó không nhận được vé mới nữa. Nhưng bí mật mà máy đó ` +
      `đã lấy về trước đây vẫn nằm trên ổ cứng của nó: nếu máy thật sự mất, hãy xoay ` +
      `VAULT_KEY_OPERATOR (npm run vault:rekey -- --domain=operator).`,
  };
});
