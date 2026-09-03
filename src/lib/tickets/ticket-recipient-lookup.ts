/**
 * Chọn **chiếc máy nào** sẽ nhận tấm vé sắp phát.
 *
 * ## Vì sao máy chủ chọn, chứ không phải trình duyệt khai
 *
 * Đường ngược lại nghe tự nhiên hơn: trình duyệt hỏi cầu nối *"anh là ai"* rồi báo khóa công
 * khai lên. Nhưng nó bắt **mọi** lời gọi phải đi qua `127.0.0.1` trước, kể cả đường lấy bí mật —
 * mà đường đó theo QĐ 3 vốn không cần chạm mạng nội bộ chút nào (tab nhỏ do chính cầu nối phục
 * vụ là **cùng nguồn** với cầu nối, không dính luật Local Network Access). Đổi lấy một lượt hỏi
 * là tự đưa cả đường bí mật vào phụ thuộc một hộp xin quyền của trình duyệt.
 *
 * Máy chủ đã có sẵn câu trả lời trong sổ đăng ký: người đang bấm nút là ai, và người đó có
 * những máy nào. Với 1-2 người vận hành Reddit, mỗi người một máy, câu trả lời là duy nhất.
 *
 * ## Chọn nhầm máy thì hỏng ở đâu
 *
 * Ở cầu nối, và **hỏng đúng chỗ**: `TicketEnvelope.deviceId` tồn tại chính vì việc này (xem chú
 * thích của nó). Vé sẽ nói *"vé này không phải của máy bạn"* thay vì chết ở bước giải mã.
 *
 * ## Vì sao bắt buộc máy phải thuộc về đúng người đang bấm
 *
 * Không phải vì mật mã — vé đã bọc cho khóa của máy đó, người khác cầm cũng không mở nổi. Mà vì
 * cuốn sổ này khai `userId` cho từng máy, và đường đăng ký đã dựng trên đúng giả định đó (nó từ
 * chối đăng ký máy cho người không còn trong `ALLOWED_EMAILS` với lý do *"máy đó sẽ không bao
 * giờ xin được vé"*). Hai chỗ mà đọc `userId` khác nghĩa nhau thì sớm muộn một chỗ sai.
 */
import { prisma } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/auth/require-actor";
import type { TicketRecipient } from "./ticket-issuer";

/** Máy nhận đã chọn xong, kèm tên để câu thông báo nói được nó là máy nào. */
export interface ResolvedRecipient extends TicketRecipient {
  deviceName: string;
}

export type RecipientLookup =
  | { ok: true; recipient: ResolvedRecipient }
  | { ok: false; message: string };

/**
 * Tìm máy nhận theo **người đang bấm**.
 *
 * `deviceId` chỉ cần khai khi người đó có **nhiều hơn một** máy đang dùng — lúc đó máy chủ
 * không đoán được họ đang ngồi ở đâu, và đoán bừa là phát một tấm vé chắc chắn hỏng.
 *
 * Từ 07/08/2026 đây **không còn là đường chính**: nick có ghim máy thì đi qua
 * `resolveNickDeviceRecipient` bên dưới. Hàm này còn lại cho nick **không có máy nào** — nick
 * Facebook chẳng hạn, vốn đăng bằng Graph API nên không có profile antidetect để ghim.
 */
export async function resolveTicketRecipient(
  actor: Actor,
  deviceId?: string,
): Promise<RecipientLookup> {
  const devices = await prisma.relayDevice.findMany({
    where: { userId: actor.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, publicKey: true },
  });

  if (devices.length === 0) {
    return {
      ok: false,
      message:
        `No Relay PC is registered for ${actor.email}, so a ticket cannot be issued. ` +
        `Install Relay on the PC you are using, then ask an administrator to register its ` +
        `public key in /relay-devices.`,
    };
  }

  if (deviceId) {
    const chosen = devices.find((device) => device.id === deviceId);
    if (!chosen) {
      return {
        ok: false,
        message:
          "The selected Relay PC is no longer registered, has been revoked, or belongs to another operator. " +
          "Reload the page to see the current Relay PC list.",
      };
    }
    return { ok: true, recipient: toRecipient(chosen) };
  }

  if (devices.length > 1) {
    return {
      ok: false,
      message:
        `You have ${devices.length} active Relay PCs in the registry. Select the Relay PC you are ` +
        `using, then try again. Each ticket is encrypted for exactly one Relay PC, so selecting ` +
        `the wrong one means only that other PC can open it.`,
    };
  }

  return { ok: true, recipient: toRecipient(devices[0]) };
}

/**
 * Tìm máy nhận cho một nick **đã ghim máy** — vé bay tới chiếc máy giữ nick, không tới máy của
 * người đang bấm.
 *
 * ## Vì sao đảo chiều so với `resolveTicketRecipient`
 *
 * `Account.antidetectProfileId` is the primary key of a SQLite file on exactly one machine. MKT
 * Browser does not synchronize profiles, so "the machine of the person clicking" is a **guess**.
 * It fails whenever that person is not the account owner because the other Relay does not have the
 * profile and can report only a vague error. Reading the registry directly yields the true machine
 * and an actionable failure reason.
 *
 * Mật khẩu nick cũng đi đường này: nó được gõ vào chính profile ấy, tức chỉ có nghĩa ở đúng
 * chiếc máy ấy. Phụ phẩm là mật khẩu proxy trong ruột vé `LAUNCH_PROFILE` chỉ tới được chiếc
 * máy vốn đã phải biết nó, thay vì tới máy của bất cứ ai bấm nút.
 *
 * ## ADMIN KHÔNG có ngoại lệ ở đây
 *
 * Khác `requireNickOwner`, vốn cho ADMIN qua để còn đường khôi phục. Ở đây ngoại lệ là vô
 * nghĩa: vé bọc mật mã cho khóa của máy kia, nên ADMIN có phát được cũng không mở nổi. Cho qua
 * chỉ tạo ra một tấm vé chắc chắn hỏng cộng một hàng nhật ký nói dối.
 *
 * Đường khôi phục của ADMIN là **gán lại cụm** sang máy của mình — một thao tác có tên, có
 * `AuditLog`, chứ không phải một tác dụng phụ của nút copy mật khẩu.
 */
export async function resolveNickDeviceRecipient(
  actor: Actor,
  accountId: string,
): Promise<RecipientLookup> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      username: true,
      device: {
        select: {
          id: true,
          name: true,
          publicKey: true,
          revokedAt: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!account) return { ok: false, message: "This nick could not be found. Reload the page and try again." };

  const { device } = account;

  if (!device) {
    return {
      ok: false,
      message:
        `Nick "${account.username}" is not assigned to a Relay PC, so there is nowhere to send ` +
        `the ticket. Ask an administrator to set the Nick assignment on the nick's detail page: ` +
        `select both the nick owner and the Relay PC that stores its browser profile.`,
    };
  }

  if (device.revokedAt) {
    return {
      ok: false,
      message:
        `Relay PC "${device.name}", which stores nick "${account.username}", has been revoked ` +
        `and cannot receive any more tickets. Ask an administrator to assign the nick to another ` +
        `Relay PC.`,
    };
  }

  if (device.userId !== actor.userId) {
    return {
      ok: false,
      message:
        `Nick "${account.username}" is stored on Relay PC "${device.name}" owned by ` +
        `${device.user.email}. The ticket is encrypted for that exact PC, so this action cannot ` +
        `open anything here. To move the nick, ask an administrator to update its Nick assignment.`,
    };
  }

  return { ok: true, recipient: toRecipient(device) };
}

function toRecipient(device: { id: string; name: string; publicKey: string }): ResolvedRecipient {
  return { deviceId: device.id, deviceName: device.name, publicKey: device.publicKey };
}

/** Máy đang dùng của một người — để giao diện dựng ô chọn khi họ có nhiều hơn một. */
export async function listActiveRelayDevices(
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.relayDevice.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
}
