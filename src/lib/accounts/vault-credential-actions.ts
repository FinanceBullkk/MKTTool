"use server";

/**
 * Phát **vé** cho bí mật của nick: mật khẩu để chép, TOTP secret để sinh mã OTP.
 *
 * ## File này từng giải mã. Nay thì không, và đó là toàn bộ điểm của GĐ3
 *
 * Bản cũ đọc cột `...Enc` rồi mở ra bằng khóa vùng operator ngay tại máy chủ. Nghĩa là
 * chiếm được máy chủ — hoặc chỉ cần đọc được biến môi trường của nó — là đọc được mật khẩu mọi
 * nick. Nay máy chủ **không giữ khóa vùng operator nữa**: nó lấy nguyên văn ciphertext trong
 * database, bọc lại cho đúng chiếc máy sẽ dùng, ký tên, rồi đưa cho trình duyệt mang đi. Nó
 * không đọc được thứ nó vừa phát, và trình duyệt cũng không.
 *
 * Bốn lớp chặn, không lớp nào bị lược đi vì đổi cơ chế:
 *
 * | Lớp | Câu hỏi |
 * |---|---|
 * | `guardedAction` | đã đăng nhập chưa, còn trong `ALLOWED_EMAILS` không |
 * | `requireNickOwner` | nick này có phải của bạn không |
 * | `checkTicketRateLimit` | có phải bạn đang rút cả kho trong một phút không |
 * | `resolveNickDeviceRecipient` | bạn có đang ngồi đúng chiếc máy giữ nick này không |
 *
 * ## Lớp thứ tư: vé đi tới máy GIỮ NICK, không tới máy người bấm
 *
 * Thêm 07/08/2026. Mật khẩu nick được gõ vào profile antidetect, mà profile chỉ tồn tại trên
 * đúng một máy (MultiZen không đồng bộ). Gửi mật khẩu tới một chiếc máy không có profile đó là
 * gửi tới nơi không dùng được nó — và mở rộng vùng mà bí mật từng đi qua mà chẳng đổi lấy gì.
 *
 * Nick **không có máy nào** thì lùi về `resolveTicketRecipient`: nick Facebook không có profile
 * antidetect để ghim (Fanpage đăng bằng Graph API), nhưng mật khẩu của nó vẫn phải lấy được.
 *
 * ## `AuditLog` ghi lúc PHÁT VÉ, và đó là mốc đúng
 *
 * Bí mật rời kho đúng lúc tấm vé được ký, không phải lúc người dùng nhìn thấy mật khẩu. Máy chủ
 * tự biết mốc đó; mốc kia thì nó chỉ biết được nếu tin lời trình duyệt khai — mà cầu nối theo
 * QĐ 5 vốn không nối mạng để báo về.
 *
 * Đổi lại, hàng nhật ký nghĩa là *"đã cấp quyền đọc"* chứ không phải *"đã đọc"*. Vé hết hạn sau
 * 30 giây, nên chênh lệch đó chỉ tồn tại trong nửa phút — và lệch theo hướng an toàn: đếm thừa
 * một lần lộ tốt hơn đếm thiếu.
 */
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { type Actor, requireNickOwner } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { issueTicket } from "@/lib/tickets/ticket-issuer";
import { checkTicketRateLimit } from "@/lib/tickets/ticket-rate-limit";
import {
  resolveNickDeviceRecipient,
  resolveTicketRecipient,
} from "@/lib/tickets/ticket-recipient-lookup";
import { TICKET_KINDS, type CredentialField, type SignedTicket } from "@/lib/tickets/ticket-types";

/**
 * Tấm vé kèm tên máy nhận.
 *
 * Tên máy đi kèm để giao diện nói được *"đang mở ở Laptop Dell của Hà"*. Với người có hai máy
 * trong sổ, đó là thứ duy nhất cho biết vé vừa bay về đâu trước khi họ ngồi chờ một tab không
 * bao giờ mở.
 */
export interface IssuedTicket {
  ticket: SignedTicket;
  deviceName: string;
}

/**
 * Chọn máy nhận: nick đã ghim máy thì gửi tới đúng máy đó, chưa ghim thì hỏi người đang bấm.
 *
 * Không export — file này là `"use server"`, nên mỗi export là một endpoint POST mà người lạ
 * gọi thẳng được. Hàm phụ thì phải ở lại trong nhà.
 */
function pickRecipient(
  actor: Actor,
  accountId: string,
  nickDeviceId: string | null,
  fallbackDeviceId?: string,
) {
  return nickDeviceId === null
    ? resolveTicketRecipient(actor, fallbackDeviceId)
    : resolveNickDeviceRecipient(actor, accountId);
}

/**
 * Phát vé để chép một mật khẩu của nick.
 *
 * `deviceId` chỉ cần khai khi người gọi có nhiều hơn một máy đang dùng — xem
 * `resolveTicketRecipient`.
 */
export const requestCredentialTicket = guardedAction(async function requestCredentialTicket(
  actor,
  accountId: string,
  field: CredentialField,
  deviceId?: string,
): Promise<IssuedTicket | ActionResult> {
  // Kiểm quyền TRƯỚC hạn nhịp: người không có quyền với nick này đáng nhận câu "nick của người
  // khác", không phải câu "bạn bấm nhanh quá". Lỗi ném ra được `guardedAction` đổi thành
  // ActionResult — xem chú thích ở đó.
  await requireNickOwner(actor, accountId);

  const rate = checkTicketRateLimit(actor.userId);
  if (!rate.allowed) return { ok: false, message: rate.message };

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true, passwordEnc: true, emailPasswordEnc: true, deviceId: true },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  const recipient = await pickRecipient(actor, accountId, account.deviceId, deviceId);
  if (!recipient.ok) return { ok: false, message: recipient.message };

  const ticket = issueTicket(
    {
      kind: TICKET_KINDS.CREDENTIAL,
      accountId,
      field,
      // Nguyên văn cột trong database. Máy chủ chuyển tiếp chứ không mở — nó không có khóa.
      credentialCiphertext: field === "password" ? account.passwordEnc : account.emailPasswordEnc,
    },
    recipient.recipient,
  );

  await prisma.auditLog.create({
    data: {
      accountId,
      action: AUDIT_ACTIONS.CREDENTIAL_REVEALED,
      detail: `${field} → máy "${recipient.recipient.deviceName}"`,
      actorId: actor.userId,
    },
  });

  return { ticket, deviceName: recipient.recipient.deviceName };
});

/** Phát vé để cầu nối sinh mã OTP. Cùng ba lớp chặn với `requestCredentialTicket`. */
export const requestOtpTicket = guardedAction(async function requestOtpTicket(
  actor,
  accountId: string,
  deviceId?: string,
): Promise<IssuedTicket | ActionResult> {
  await requireNickOwner(actor, accountId);

  const rate = checkTicketRateLimit(actor.userId);
  if (!rate.allowed) return { ok: false, message: rate.message };

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { totpSecretEnc: true, deviceId: true },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // Cột rỗng là thứ máy chủ VẪN kiểm được dù không đọc nổi nội dung — và phải kiểm ở đây, không
  // thì người dùng đợi một tab mở ra chỉ để đọc "nick này chưa có 2FA".
  if (!account.totpSecretEnc) return { ok: false, message: "Nick này chưa lưu TOTP secret." };

  const recipient = await pickRecipient(actor, accountId, account.deviceId, deviceId);
  if (!recipient.ok) return { ok: false, message: recipient.message };

  const ticket = issueTicket(
    {
      kind: TICKET_KINDS.OTP,
      accountId,
      totpSecretCiphertext: account.totpSecretEnc,
    },
    recipient.recipient,
  );

  await prisma.auditLog.create({
    data: {
      accountId,
      action: AUDIT_ACTIONS.OTP_GENERATED,
      detail: `máy "${recipient.recipient.deviceName}"`,
      actorId: actor.userId,
    },
  });

  return { ticket, deviceName: recipient.recipient.deviceName };
});
