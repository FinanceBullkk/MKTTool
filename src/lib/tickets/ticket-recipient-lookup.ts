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
        `Chưa có máy nào đăng ký cầu nối cho ${actor.email}, nên không phát vé được. ` +
        `Cài cầu nối trên máy bạn đang ngồi, rồi nhờ quản trị viên ghi khóa công khai của nó ` +
        `vào sổ ở /relay-devices.`,
    };
  }

  if (deviceId) {
    const chosen = devices.find((device) => device.id === deviceId);
    if (!chosen) {
      return {
        ok: false,
        message:
          "Máy bạn chọn không còn trong sổ, hoặc đã bị thu hồi, hoặc là máy của người khác. " +
          "Tải lại trang để xem danh sách máy hiện tại.",
      };
    }
    return { ok: true, recipient: toRecipient(chosen) };
  }

  if (devices.length > 1) {
    return {
      ok: false,
      message:
        `Bạn có ${devices.length} máy đang dùng trong sổ cầu nối — chọn máy bạn đang ngồi rồi ` +
        `bấm lại. Vé được mã hóa cho đúng một máy, nên chọn nhầm là máy kia không mở được.`,
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
 * `Account.antidetectProfileId` là khóa chính của một file SQLite trên đúng một máy: MultiZen
 * không đồng bộ profile. Nên "máy của người đang bấm" là một câu trả lời **đoán**, và nó sai
 * mỗi khi người bấm không phải chủ nick — cầu nối bên kia không có profile đó và chỉ báo được
 * một lỗi mơ hồ. Hỏi thẳng cuốn sổ thì câu trả lời là sự thật, và ca hỏng nói được nguyên nhân.
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

  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  const { device } = account;

  if (!device) {
    return {
      ok: false,
      message:
        `Nick "${account.username}" chưa được ghim vào máy nào, nên không biết gửi vé đi đâu. ` +
        `Nhờ quản trị viên gán cụm ở trang chi tiết nick — chọn cả người phụ trách lẫn máy giữ ` +
        `profile của nick.`,
    };
  }

  if (device.revokedAt) {
    return {
      ok: false,
      message:
        `Máy "${device.name}" đang giữ nick "${account.username}" đã bị thu hồi, nên nó không ` +
        `nhận được vé nào nữa. Nhờ quản trị viên gán cụm sang một máy khác.`,
    };
  }

  if (device.userId !== actor.userId) {
    return {
      ok: false,
      message:
        `Nick "${account.username}" nằm ở máy "${device.name}" của ${device.user.email} — vé ` +
        `được mã hóa cho đúng chiếc máy đó nên bấm ở đây không mở được gì. Cần chuyển sang máy ` +
        `khác thì nhờ quản trị viên gán lại cụm.`,
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
