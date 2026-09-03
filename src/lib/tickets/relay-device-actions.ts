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
import { randomUUID } from "node:crypto";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { hashOperatorKeyGrant } from "@/lib/relay/enrollment/grant-digests";
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
    .min(1, "Name this Relay PC. If it must be revoked urgently, the name is how you identify it.")
    .max(80, "Relay PC names must be 80 characters or fewer."),
  userId: z.string().min(1, "Select the person who uses this Relay PC."),
  publicKey: z.string().min(1, "Paste the public key that Relay printed during installation."),
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
    // Nói rõ **cách** sinh khóa mới, không chỉ nói là phải sinh. Câu cũ đúng nhưng cụt: người đọc
    // nó đang đứng trước một chiếc máy không đăng ký được và không có gợi ý nào về việc phải mở
    // thư mục nào, xóa file nào. Thu hồi nhầm rồi muốn làm lại là ca có thật.
    return (
      `This key was revoked with Relay PC "${existing.name}" owned by ${existing.user.email} and ` +
      `cannot be reused. Treat a revoked Relay PC's key as exposed.\n\n` +
      `Generate a NEW key pair on that Relay PC: stop Relay, delete "relay-device-key.json" from ` +
      `its data directory (%LOCALAPPDATA%\\MKTTool-Relay), then restart Relay. It will generate a ` +
      `new key pair automatically and can be registered again immediately. relay-config.json ` +
      `remains unchanged, so the operator key is retained.`
    );
  }

  return (
    `This key is already registered to Relay PC "${existing.name}" owned by ${existing.user.email}. ` +
    `Each Relay PC must have its own key pair; if two Relay PCs share a key, revoking one cannot ` +
    `block the other.`
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
  if (!owner) return { ok: false, message: "This user could not be found. Reload the page and try again." };

  // Cùng lý lẽ với `assignAccountOwner`: hàng `User` chỉ chứng minh họ TỪNG đăng nhập được.
  // Đăng ký máy cho người đã bị gỡ khỏi danh sách trắng là dựng một chiếc máy không bao giờ
  // xin được vé — mọi request của họ đều bị chặn ở `checkActor`.
  if (!isEmailAllowed(owner.email, readEmailAccessList())) {
    return {
      ok: false,
      message:
        `${owner.email} is no longer allowed to sign in, so a Relay PC registered to them will ` +
        `never receive a ticket. Restore their access or select another user.`,
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
        "Someone else just registered this key. Reload the page to see the current registry.",
    };
  }

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_DEVICE_REGISTERED,
      detail: `${actor.email} registered Relay PC "${name}" for ${owner.email} (${device.id})`,
      actorId: actor.userId,
    },
  });

  revalidatePath(RELAY_DEVICES_PATH);
  return {
    ok: true,
    message:
      `Registered Relay PC "${name}" for ${owner.email}. Tickets issued to them are now encrypted ` +
      `with this PC's key, so no other PC can open them.`,
  };
});

/**
 * Gạch tên một chiếc máy khỏi sổ.
 *
 * Không xóa hàng, chỉ đóng dấu ngày: hàng còn đó thì khóa còn bị `@unique` chặn đăng ký lại,
 * và câu hỏi "chiếc máy mất hôm ấy bị chặn từ lúc nào" còn chỗ để trả lời. Xóa hàng là mất cả
 * hai thứ cùng lúc.
 *
 * ## Nick đang ghim vào máy này bị gỡ ghim, và việc thu hồi KHÔNG bị chặn vì chúng
 *
 * Chỗ khác trong dự án chặn xóa khi còn thứ trỏ tới (xóa proxy, xóa nick). Ở đây thì ngược lại,
 * và cố ý: thu hồi là đường **khẩn cấp** — laptop vừa mất, và mỗi giây chần chừ là chiếc máy đó
 * còn xin được vé. Bắt người ta đi gỡ ghim từng nick trước là đặt thủ tục lên trước thiệt hại.
 *
 * Gỡ ghim nằm trong **cùng một transaction** với dấu thu hồi: hai lượt ghi rời nhau thì một lượt
 * hỏng giữa chừng để lại nick ghim vào một chiếc máy đã chết, và triệu chứng là "bấm mở profile
 * không ra gì" chứ không phải một câu lỗi đọc được.
 */
export const revokeRelayDevice = adminAction(async function revokeRelayDevice(
  actor,
  deviceId: string,
): Promise<ActionResult> {
  const device = await prisma.relayDevice.findUnique({
    where: { id: deviceId },
    select: { name: true, revokedAt: true, user: { select: { email: true } } },
  });

  if (!device) return { ok: false, message: "This Relay PC is not in the registry. Reload the page and try again." };

  if (device.revokedAt) {
    return {
      ok: false,
      message: `Relay PC "${device.name}" was already revoked at ${formatFullDateTime(device.revokedAt)}. No further action is required.`,
    };
  }

  const [, unpinned] = await prisma.$transaction([
    prisma.relayDevice.update({
      where: { id: deviceId },
      data: {
        revokedAt: new Date(),
        operatorKeyGrant: null,
        operatorKeyCompletionGrant: null,
        operatorKeyDeliveryAuthorization: null,
        operatorKeyDeliveryExpiresAt: null,
        bootstrapAuthorization: null,
        bootstrapAuthorizationExpiresAt: null,
      },
    }),
    prisma.account.updateMany({
      where: { deviceId },
      data: { deviceId: null },
    }),
    prisma.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.RELAY_DEVICE_REVOKED,
        detail: `${actor.email} revoked Relay PC "${device.name}" owned by ${device.user.email} (${deviceId})`,
        actorId: actor.userId,
      },
    }),
  ]);

  revalidatePath(RELAY_DEVICES_PATH);
  revalidatePath("/accounts");
  return {
    ok: true,
    message:
      `Revoked Relay PC "${device.name}". It can no longer receive new tickets. ` +
      (unpinned.count > 0
        ? `${unpinned.count} nick assigned to that PC ${unpinned.count === 1 ? "was" : "were"} ` +
          `unassigned. Assign ${unpinned.count === 1 ? "it" : "them"} to another Relay PC on ` +
          `each nick's detail page; until then, ` +
          (unpinned.count === 1
            ? `its browser profile cannot be opened and its secrets cannot be read. `
            : `their browser profiles cannot be opened and their secrets cannot be read. `)
        : "") +
      `Secrets previously retrieved by that PC remain on its drive. If the PC is actually lost, ` +
      `rotate VAULT_KEY_OPERATOR (npm run vault:rekey -- --domain=operator).`,
  };
});

const grantSchema = z.object({
  deviceId: z.string().min(1, "The receiving Relay PC ID is missing."),
  ephemeralPublicKey: z.string().min(1, "The key grant is missing its one-time public key."),
  sealed: z.string().min(1, "The key grant is empty."),
});

/**
 * Nhận cái hộp mà cầu nối của ADMIN vừa bọc, giữ hộ cho tới khi máy nhận tới lấy.
 *
 * ## Vì sao máy chủ giữ hộ được mà không phá ranh giới của GĐ3
 *
 * Ruột hộp là `VAULT_KEY_OPERATOR`, nhưng nó đã được bọc bằng bắt tay X25519 với **khóa công khai
 * của đúng chiếc máy nhận** (`ticket-sealed-box.ts`). Muốn mở phải có khóa riêng của máy đó, thứ
 * chưa bao giờ rời khỏi ổ cứng của nó. Máy chủ cầm nguyên cái hộp và vẫn không mở nổi một mật
 * khẩu nick nào — đúng lời hứa của README.
 *
 * ## Vì sao chỉ kiểm hình dạng, không kiểm nội dung
 *
 * Cùng lý lẽ với ciphertext bí mật nick: máy chủ **không được** có khả năng đọc, nên thứ duy nhất
 * nó kiểm được là vỏ. Ruột sai thì máy nhận phát hiện lúc mở và từ chối ghi — và đó là chỗ đúng
 * để phát hiện, vì chỉ ở đó mới có khóa để mở ra mà nhìn.
 */
export const grantOperatorKeyToDevice = adminAction(async function grantOperatorKeyToDevice(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = grantSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { deviceId, ephemeralPublicKey, sealed } = parsed.data;

  const device = await prisma.relayDevice.findUnique({
    where: { id: deviceId },
    include: { user: { select: { email: true } } },
  });
  if (!device) return { ok: false, message: "This Relay PC is not in the registry. Reload the page and try again." };

  if (device.retirementId) {
    return {
      ok: false,
      message: `Device "${device.name}" is already in the retirement flow; no new key grant was stored.`,
    };
  }

  // Máy đã gạch tên thì không cấp. Cấp cho một chiếc máy đã thu hồi là tự tay dựng lại đúng thứ
  // vừa chặn đi — và tệ hơn, nó không xin được vé nên chẳng ai thấy gì bất thường cho tới lúc
  // đọc lại sổ.
  if (device.revokedAt) {
    return {
      ok: false,
      message:
        `Relay PC "${device.name}" was revoked at ${formatFullDateTime(device.revokedAt)}, so it ` +
        `cannot receive an operator key. If the PC is recovered, reinstall Relay to generate a ` +
        `new key pair, then register it again.`,
    };
  }

  if (!isEmailAllowed(device.user.email, readEmailAccessList())) {
    return {
      ok: false,
      message:
        `${device.user.email} is no longer allowed to sign in, so this Relay PC cannot receive ` +
        `tickets. Restore that user's access before granting an operator key.`,
    };
  }

  const grant = { ephemeralPublicKey, sealed };
  const committed = await prisma.relayDevice.updateMany({
    where: { id: deviceId, revokedAt: null, retirementId: null },
    data: {
      operatorKeyGrant: JSON.stringify(grant),
      operatorKeyGrantedAt: new Date(),
      operatorKeyGrantGeneration: { increment: 1 },
      operatorKeyGrantId: randomUUID(),
      operatorKeyGrantHash: hashOperatorKeyGrant(grant),
      operatorKeyCompletionHash: null,
      operatorKeyCompletionGrant: null,
      operatorKeyDeliveryAuthorization: null,
      operatorKeyDeliveryExpiresAt: null,
      operatorKeyReadyAt: null,
    },
  });
  if (committed.count === 0) {
    return {
      ok: false,
      message: `Device "${device.name}" became unavailable before the new key grant was stored.`,
    };
  }

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTIONS.RELAY_OPERATOR_KEY_GRANTED,
      detail:
        `${actor.email} granted the operator key to Relay PC "${device.name}" ` +
        `(${deviceId}) owned by ${device.user.email}`,
      actorId: actor.userId,
    },
  });

  revalidatePath("/relay-devices");

  return {
    ok: true,
    message:
      `Granted the operator key to Relay PC "${device.name}". The key will arrive automatically ` +
      `the next time ${device.user.email} opens the web app on that PC; do not send them anything.`,
  };
});
