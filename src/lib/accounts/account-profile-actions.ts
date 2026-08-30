"use server";

/**
 * Tạo profile antidetect cho một nick — phần chạy trên **máy chủ**.
 *
 * Hai nửa, và ranh giới giữa chúng là điểm chính của cả file:
 *
 * | Half | Owner | Why |
 * |---|---|---|
 * | Issue a ticket with the decrypted proxy | Server (`requestCreateProfileTicket`) | The proxy password belongs to the server vault |
 * | Ask MKT Browser to create the profile | Relay on the operator machine | The profile exists on only one machine |
 * | Save the new ID to the vault | Server (`recordCreatedProfile`) | The vault belongs to the server |
 *
 * ## Vì sao cấu hình profile do TRÌNH DUYỆT tính rồi gửi lên
 *
 * The locale and device catalogs live in MKT Browser on the operator machine, so the server cannot
 * read them. The browser therefore runs the pure `planProfileFingerprint` function, and the server
 * only wraps its result in the ticket.
 *
 * The server intentionally **does not** check whether the locale matches the proxy country. It has
 * no catalog for validation, MKT Browser rejects the combinations it knows to be inconsistent, and
 * the caller is an authenticated colleague who could create a mismatched profile directly in MKT
 * Browser even faster. This layer prevents **accidents**; it does not try to stop insiders or prove
 * identity isolation.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { ProxyConfigError, buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { profileNameForNick } from "@/lib/antidetect/profile-fingerprint-plan";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { requireNickOwner } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { issueTicket } from "@/lib/tickets/ticket-issuer";
import { resolveTicketRecipient } from "@/lib/tickets/ticket-recipient-lookup";
import { TICKET_KINDS, type SignedTicket } from "@/lib/tickets/ticket-types";

/** Các trường cấu hình profile trình duyệt gửi lên. Chỉ kiểm hình dạng — xem chú thích đầu file. */
const fingerprintSchema = z.object({
  device: z.string().min(1),
  localeId: z.string().min(1),
  timezone: z.string().min(1),
  screen: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
});

export interface IssuedCreateProfileTicket {
  ticket: SignedTicket;
  deviceName: string;
  /** Máy nhận vé — trình duyệt gửi lại ở bước ghi kết quả để máy chủ đối chiếu. */
  deviceId: string;
}

/**
 * Phát vé tạo profile.
 *
 * Máy nhận là **máy người đang bấm** (`resolveTicketRecipient`), không phải máy giữ nick — nick
 * chưa có máy nào, và chính lượt này sẽ quyết định nó thuộc về đâu.
 *
 * Chính vì thế người bấm phải là **chủ nick**: lượt này ghim nick vào máy họ, và một nick ghim ở
 * máy người khác là nick mà chủ nó không mở nổi.
 */
export const requestCreateProfileTicket = guardedAction(async function requestCreateProfileTicket(
  actor,
  accountId: string,
  fingerprint: unknown,
  deviceId?: string,
): Promise<IssuedCreateProfileTicket | ActionResult> {
  await requireNickOwner(actor, accountId);

  const parsed = fingerprintSchema.safeParse(fingerprint);
  if (!parsed.success) {
    return { ok: false, message: "Cấu hình profile gửi lên không hợp lệ. Tải lại trang rồi thử lại." };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true, platform: true, ownerId: true, antidetectProfileId: true, proxy: true },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // Reject HERE, not only when saving the result, even though `recordCreatedProfile` checks again.
  //
  // `requireNickOwner` allows an ADMIN through for every account. Without this check, an ADMIN
  // acting for a colleague would receive a ticket, the Relay would create a real MKT Browser
  // profile, and ONLY THEN would the write be rejected, leaving an orphaned profile that nobody
  // knows to remove. Rejecting before ticket issuance means nothing is created.
  if (account.ownerId !== actor.userId) {
    return {
      ok: false,
      message:
        account.ownerId === null
          ? `Nick "${account.username}" chưa có người phụ trách. Gán chủ ở thẻ Phân công cụm ` +
            `trước — profile phải nằm trên máy của chủ nick.`
          : `Nick "${account.username}" do người khác phụ trách. Profile chỉ tồn tại trên đúng ` +
            `một máy, nên phải chính họ bấm nút này trên máy của họ.`,
    };
  }

  if (account.antidetectProfileId) {
    return {
      ok: false,
      message:
        `This account already has profile ${account.antidetectProfileId}. Creating another would ` +
        `leave an orphaned MKT Browser profile. Remove the old ID from the "Edit account" card ` +
        `first if you really want to recreate it.`,
    };
  }

  if (!account.proxy) {
    return {
      ok: false,
      message:
        "Nick chưa gắn proxy nên chưa biết căn cấu hình profile theo quốc gia nào. Gắn proxy ở thẻ " +
        '"Sửa nick" trước — profile tạo ra sẽ mang sẵn proxy đó.',
    };
  }

  const recipient = await resolveTicketRecipient(actor, deviceId);
  if (!recipient.ok) return { ok: false, message: recipient.message };

  let ticket: SignedTicket;
  try {
    ticket = issueTicket(
      {
        kind: TICKET_KINDS.CREATE_PROFILE,
        accountId,
        requestId: `create-profile:${accountId}`,
        profileName: profileNameForNick(account.platform, account.username),
        proxy: buildProxyConfig(account.proxy),
        fingerprint: parsed.data,
        seed: `mkttool-${accountId}`,
      },
      recipient.recipient,
    );
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ProxyConfigError
          ? error.message
          : "Không dựng được vé tạo profile. Xem log của máy chủ.",
    };
  }

  return {
    ticket,
    deviceName: recipient.recipient.deviceName,
    deviceId: recipient.recipient.deviceId,
  };
});

const recordSchema = z.object({
  accountId: z.string().min(1),
  profileId: z.string().min(1),
  deviceId: z.string().min(1),
});

/**
 * Ghi profile vừa tạo vào kho, **và ghim nick vào chiếc máy vừa tạo nó**.
 *
 * ## Năm phép kiểm, và điều 3 với điều 4 là hai ranh giới an toàn
 *
 * Ghim máy quyết định vé bay về đâu. Nếu tự ghim được cả khi nick **đã** thuộc máy khác thì một
 * OPERATOR chỉ cần tạo một profile mới là kéo được nick của đồng nghiệp về máy mình — rồi đọc
 * mật khẩu proxy của nó qua vé mở profile (điều 4). Nên tự ghim chỉ mở cho nick **chưa có máy
 * nào**; đổi máy vẫn là việc của ADMIN ở thẻ Phân công cụm.
 *
 * Điều 3 canh hướng ngược lại và chỉ chạm tới ADMIN: ghim nick của người khác vào máy của mình.
 * Không phải chuyện chiếm đoạt — chỉ là một profile nằm sai máy, tức nick mà chủ nó không mở nổi.
 *
 * `profileId` do trình duyệt khai và **có thể khai bừa** — chấp nhận được, vì hôm nay giá trị đó
 * vốn do người dùng gõ tay vào form. Bốn điều còn lại thì máy chủ tự kiểm, không tin lời ai.
 */
export const recordCreatedProfile = guardedAction(async function recordCreatedProfile(
  actor,
  input: unknown,
): Promise<ActionResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Thiếu dữ liệu để ghi profile vừa tạo." };

  const { accountId, profileId, deviceId } = parsed.data;

  // 1. Nick này có phải của bạn không.
  await requireNickOwner(actor, accountId);

  const [account, device, trung] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId },
      select: {
        username: true,
        ownerId: true,
        deviceId: true,
        device: { select: { name: true } },
      },
    }),
    prisma.relayDevice.findUnique({
      where: { id: deviceId },
      select: { name: true, userId: true, revokedAt: true },
    }),
    prisma.account.findUnique({
      where: { antidetectProfileId: profileId },
      select: { id: true, username: true },
    }),
  ]);

  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // 2. Máy nhận có phải máy của bạn, và còn dùng được không.
  if (!device || device.revokedAt || device.userId !== actor.userId) {
    return {
      ok: false,
      message:
        "Máy vừa tạo profile không phải máy của bạn, hoặc đã bị thu hồi. Tải lại trang rồi thử lại.",
    };
  }

  // 3. Máy phải thuộc CHỦ NICK, không chỉ thuộc người đang bấm.
  //
  // Hai câu đó lệch nhau đúng ở một chỗ: ADMIN. `requireNickOwner` cho ADMIN đi qua mọi nick, nên
  // không có phép kiểm này thì một ADMIN nhập liệu hộ sẽ ghim nick của đồng nghiệp vào máy của
  // chính mình — profile nằm ở máy ADMIN trong khi người phải dùng nick ngồi máy khác, và bất biến
  // `deviceId != null ⟹ device.userId == ownerId` (xem `assignAccountCluster`) vỡ ngay lúc ghi.
  //
  // Nói cho gọn: profile phải do chính chủ nick tạo, trên máy của họ. Không có cách hiểu nào khác —
  // profile chỉ tồn tại trên một máy, và đó phải là máy của người sẽ mở nó hằng ngày.
  if (account.ownerId !== device.userId) {
    return {
      ok: false,
      message:
        account.ownerId === null
          ? `Nick "${account.username}" chưa có người phụ trách. Gán chủ ở thẻ Phân công cụm ` +
            `trước — máy giữ profile phải là máy của chủ nick.`
          : `Nick "${account.username}" do người khác phụ trách, nên profile của nó phải được tạo ` +
            `trên máy của người đó. Nhờ chính họ bấm nút này.`,
    };
  }

  // 4. Nick chưa thuộc máy nào khác — xem chú thích trên.
  if (account.deviceId && account.deviceId !== deviceId) {
    return {
      ok: false,
      message:
        `Account "${account.username}" is pinned to machine "${account.device?.name}". Moving it ` +
        `to another machine is an administrator task in the Cluster assignment card. Delete the ` +
        `newly created MKT Browser profile to avoid leaving an orphan.`,
    };
  }

  // 5. Profile chưa thuộc nick nào KHÁC. `@unique` đã ép, nhưng báo trước thì câu lỗi đọc được.
  //
  // Loại trừ chính nick này: ghi lại đúng cặp cũ phải là một lượt không-làm-gì thành công, chứ
  // không phải một câu từ chối khó hiểu. Trình duyệt gọi lại sau khi mất mạng giữa chừng là
  // chuyện thường, và lúc đó profile đã sinh ra thật rồi.
  if (trung && trung.id !== accountId) {
    return { ok: false, message: `Profile này đã gắn với nick "${trung.username}".` };
  }

  await prisma.$transaction([
    prisma.account.update({
      where: { id: accountId },
      data: { antidetectProfileId: profileId, deviceId },
    }),
    prisma.auditLog.create({
      data: {
        accountId,
        action: AUDIT_ACTIONS.ACCOUNT_PROFILE_CREATED,
        detail: `${actor.email} tạo profile ${profileId} trên máy "${device.name}"`,
        actorId: actor.userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        accountId,
        action: AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED,
        detail: `${actor.email} ghim nick vào máy "${device.name}" khi tạo profile`,
        actorId: actor.userId,
      },
    }),
  ]);

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  return {
    ok: true,
    message:
      `Đã gắn profile vào nick "${account.username}" và ghim nick vào máy "${device.name}". ` +
      `Mở profile rồi đăng nhập nick lần đầu ngay trong đó.`,
  };
});
