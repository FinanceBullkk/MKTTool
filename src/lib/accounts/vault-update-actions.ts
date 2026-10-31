"use server";

/**
 * Sửa bản ghi trong kho danh tính.
 *
 * Hai quy ước xuyên suốt file này:
 *
 *  1. **Ô bí mật để trống là giữ nguyên.** Mật khẩu không bao giờ được render ra màn hình
 *     (xem account-vault-actions-panel.tsx), nên form sửa không thể đổ giá trị cũ vào ô —
 *     và nếu coi ô trống là "xóa mật khẩu" thì mỗi lần sửa karma là một lần mất credential.
 *
 *  2. **Sửa xong thì chấm lại luật.** Đổi karma nick, đổi `minKarma` của sub, sửa thân bài —
 *     tất cả đều làm cũ đi verdict đã lưu trong job đang chờ. Verdict cũ trông y hệt verdict
 *     đúng, nên phải chấm lại ngay và nói rõ đã chấm mấy job (xem recheck-jobs-batch.ts).
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { adminAction, guardedAction } from "@/lib/auth/guarded-action";
import { requireAdmin, requireNickOwner } from "@/lib/auth/require-actor";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import { prisma } from "@/lib/db/prisma-client";
import {
  describeUnexpectedDbError,
  isUniqueConstraintError,
} from "@/lib/db/prisma-error-helpers";
import { isQuarantinedStatus } from "./account-status";
import {
  accountUpdateSchema,
  firstError,
  formToObject,
  proxyUpdateSchema,
  STALE_ACCOUNT_WRITE_MESSAGE,
  validatePlatformAccountFields,
} from "./vault-form-schemas";

/** Chỉ ADMIN — cùng lý lẽ với `deleteProxy`: sửa nhầm host/port là mất một proxy đang chạy. */
export const updateProxy = adminAction(async function updateProxy(
  _actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = proxyUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, password, ...data } = parsed.data;

  try {
    await prisma.proxy.update({
      where: { id },
      // Chỉ đụng vào cột mật khẩu khi người dùng thật sự gõ mật khẩu mới.
      data: {
        ...data,
        ...(password
          ? { passwordEnc: encryptCredential(password, loadVaultKey("server")) }
          : {}),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        message:
          "A proxy with this label or host/port/username already exists. Use unique proxy details and try again.",
      };
    }
    return {
      ok: false,
      message: describeUnexpectedDbError(error, "update the proxy"),
    };
  }

  revalidatePath("/proxies");
  revalidatePath(`/proxies/${id}`);
  revalidatePath("/accounts");
  return {
    ok: true,
    message:
      `Proxy "${data.label}" saved.` +
      (password
        ? " The new password will be applied to the browser profile the next time it opens."
        : " No further action is needed."),
  };
});

export const updateAccount = guardedAction(async function updateAccount(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  // Ba cột bí mật vào đây đã là ciphertext do cầu nối bọc — xem chú thích ở `createAccount`.
  const { id, revision, passwordEnc, emailPasswordEnc, totpSecretEnc, ...data } =
    parsed.data;
  const nextProxyId = data.proxyId?.trim() || null;
  const nextAntidetectProfileId = data.antidetectProfileId?.trim() || null;

  // `platform` không sửa được nên form không gửi lên — phải đọc từ DB thì mới chấm được luật
  // "Reddit bắt buộc proxy + profile antidetect". `status` đọc kèm để ghi được nhật ký "đổi từ
  // gì sang gì": biết trạng thái mới mà không biết trạng thái cũ thì hàng nhật ký gần như vô dụng
  // đúng vào lúc cần nó — lúc đi tìm ai đã kéo một nick từ SHADOWBANNED về HEALTHY.
  const existing = await prisma.account.findUnique({
    where: { id },
    select: { platform: true, status: true, proxyId: true, antidetectProfileId: true },
  });
  if (!existing) {
    return {
      ok: false,
      message: "The nick to update was not found. Return to the nick vault and try again.",
    };
  }

  if (nextProxyId !== existing.proxyId) {
    await requireAdmin(
      actor,
      "Changing a nick's proxy is an ADMIN task. Contact an administrator to request the change.",
    );
  }

  /**
   * Ghi đè bí mật thì phải là chủ nick — **đối xứng với `requestCredentialTicket`**.
   *
   * Không gác thì trạng thái là *"tôi không đọc được mật khẩu nick của bạn, nhưng tôi ghi đè
   * được nó"*. Bất đối xứng đó không giải thích nổi cho ai, và là loại lỗ người ta chỉ phát
   * hiện sau khi đã bị.
   *
   * Chỉ gác khi form THẬT SỰ mang bí mật lên. Ô để trống nghĩa là giữ nguyên giá trị cũ, và
   * sửa karma / trạng thái / proxy cho nick của đồng nghiệp là việc chung hằng ngày của team —
   * gác cả những lần đó là làm chậm việc thật để đổi lấy một lớp bảo vệ không nhắm đúng đâu cả.
   *
   * Chuyện `status` bị kéo từ SHADOWBANNED về HEALTHY KHÔNG giải bằng phép kiểm này: chủ nick
   * cũng ép được, và ép trên nick của chính mình thì luật 1-3 vẫn bị vô hiệu y hệt. Thứ giúp
   * được ở đó là dấu vết, xem `AuditLog` cuối hàm.
   */
  // Lỗi quyền ném ra được `guardedAction` đổi thành ActionResult — người bị từ chối cần đọc
  // được vì sao, chứ không phải một nút chết lặng. Xem chú thích đầu `guarded-action.ts`.
  if (passwordEnc || emailPasswordEnc || totpSecretEnc) {
    await requireNickOwner(actor, id);
  }

  // `creating: false` — ô bí mật để trống ở đường này nghĩa là *giữ nguyên*, không phải *không có*,
  // nên luật "Facebook phải có mật khẩu nick" không chấm được ở đây. Luật của Reddit thì vẫn áp.
  const identityError = validatePlatformAccountFields(existing.platform, data, { creating: false });
  if (identityError) return { ok: false, message: identityError };

  const auditDetailParts = [
    existing.status === data.status
      ? `karma ${data.karma}, ${data.status}`
      : `karma ${data.karma}, status ${existing.status} → ${data.status}`,
  ];
  if (existing.proxyId !== nextProxyId) {
    auditDetailParts.push(
      `proxy ${existing.proxyId ?? "unassigned"} → ${nextProxyId ?? "unassigned"}`,
    );
  }
  if (existing.antidetectProfileId !== nextAntidetectProfileId) {
    auditDetailParts.push(
      `browser profile ${existing.antidetectProfileId ?? "none"} → ${nextAntidetectProfileId ?? "none"}`,
    );
  }

  let didUpdate = false;
  try {
    didUpdate = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { id, updatedAt: revision },
        data: {
          ...data,
          // Với Prisma, `undefined` nghĩa là GIỮ NGUYÊN — nên ô để trống phải ép về `null`, không
          // thì gỡ proxy khỏi một nick Facebook sẽ im lặng không có tác dụng gì.
          antidetectProfileId: nextAntidetectProfileId,
          proxyId: nextProxyId,
          // Cùng lý do: xóa trắng ô giọng phải thật sự xóa, không thì nick giữ mãi một làn viết
          // mà người dùng tưởng đã bỏ.
          voice: data.voice?.trim() || null,
          contentAngle: data.contentAngle?.trim() || null,
          // Gỡ cách ly thì lý do cách ly phải đi theo. Để lại là dựng ra một màn hình tự mâu
          // thuẫn: nhãn "Khỏe" nằm ngay trên hộp đỏ "dừng đăng ngay" — xem isQuarantinedStatus().
          quarantineReason: isQuarantinedStatus(data.status)
            ? data.quarantineReason?.trim() || null
            : null,
          // Ô để trống nghĩa là GIỮ NGUYÊN, nên chỉ đụng vào cột khi form thật sự mang ciphertext
          // mới lên. `undefined` với Prisma là "không đổi" — đúng thứ cần ở đây.
          ...(passwordEnc ? { passwordEnc } : {}),
          ...(emailPasswordEnc ? { emailPasswordEnc } : {}),
          ...(totpSecretEnc ? { totpSecretEnc } : {}),
        },
      });
      if (updated.count === 0) return false;

      await tx.auditLog.create({
        data: {
          accountId: id,
          action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
          // Trạng thái đổi thì ghi cả chiều đổi. Đây là đường thứ hai ép được trạng thái nick —
          // đường kia là bộ dò sức khỏe, và nó đã ghi `HEALTH_STATUS_FORCED` kèm chiều đổi từ lâu.
          // Hai đường tới cùng một hậu quả thì nhật ký của chúng phải đọc được như nhau.
          detail: auditDetailParts.join(", "),
          actorId: actor.userId,
        },
      });

      return true;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        ok: false,
        message:
          "The nick could not be saved. Check whether its proxy or browser profile belongs to " +
          "another nick, or whether the username already exists on this platform.",
      };
    }
    return { ok: false, message: describeUnexpectedDbError(error, "update the nick") };
  }

  if (!didUpdate) return { ok: false, message: STALE_ACCOUNT_WRITE_MESSAGE };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  return {
    ok: true,
    message: `Nick "${data.username}" saved.`,
  };
});
