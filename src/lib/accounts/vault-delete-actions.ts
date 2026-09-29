"use server";

/**
 * Xóa bản ghi trong kho danh tính — chỉ khi chưa có gì trỏ tới.
 *
 * Xóa ở đây KHÔNG phải là cách nghỉ hưu một nick hay một đích: nghỉ nick thì đổi trạng thái
 * sang DEAD, nghỉ đích thì bỏ tick "đang dùng". Cả hai giữ nguyên lịch sử, mà lịch sử chính
 * là thứ bộ luật đếm. Nút xóa chỉ để dọn thứ vừa nhập sai vài phút trước.
 *
 * Xem reference-guard.ts để biết vì sao chặn thay vì cascade.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { adminAction, guardedAction } from "@/lib/auth/guarded-action";
import { requireNickOwner } from "@/lib/auth/require-actor";
import { lockAccountForDeletion } from "@/lib/db/account-ticket-row-locks";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError } from "@/lib/db/prisma-error-helpers";
import { blockDeleteWhenReferenced } from "@/lib/db/reference-guard";

/**
 * Chỉ ADMIN.
 *
 * Proxy là **dữ liệu đã trả tiền và không mua lại được bản cũ**: mật khẩu proxy không nằm ở đâu
 * khác ngoài cột `passwordEnc` của hàng này. Xóa nhầm một dòng là mất đúng thứ đó — nhà cung cấp
 * cấp lại IP khác, và nick gắn với IP cũ thì coi như đổi chỗ ở.
 *
 * Lớp chặn "còn nick gắn thì không xóa" bên dưới vẫn giữ nguyên; hai lớp không thay nhau được.
 * Lớp đó chặn xóa nhầm proxy ĐANG DÙNG, còn `adminAction` chặn cả ca xóa một proxy chưa gắn ai —
 * proxy dự phòng vừa mua tháng trước cũng là tiền.
 */
export const deleteProxy = adminAction(async function deleteProxy(
  _actor,
  proxyId: string,
): Promise<ActionResult> {
  const proxy = await prisma.proxy.findUnique({
    where: { id: proxyId },
    include: { account: { select: { username: true } } },
  });
  if (!proxy) return { ok: false, message: "Proxy not found. Return to the proxy list and try again." };

  if (proxy.account) {
    return {
      ok: false,
      message:
        `Proxy "${proxy.label}" cannot be deleted because it is assigned to nick ` +
        `"${proxy.account.username}". Assign that nick another proxy first; otherwise it would use your home IP.`,
    };
  }

  try {
    await prisma.proxy.delete({ where: { id: proxyId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "delete the proxy") };
  }

  revalidatePath("/proxies");
  return {
    ok: true,
    message: `Proxy "${proxy.label}" deleted. It is no longer available for nick assignment.`,
  };
});

/**
 * Xóa một nick — FINDING C31.
 *
 * Cùng một chốt với đường lấy bí mật của chính nick đó (`requireNickOwner`: chủ nick, hoặc ADMIN;
 * nick chưa có chủ thì chỉ ADMIN). Lý do dùng đúng chốt ấy chứ không phải `adminAction`: xóa hàng
 * này **phá hủy đúng những thứ mà chốt kia canh** — mật khẩu nick, mật khẩu email và TOTP secret
 * vùng operator nằm trong chính hàng đó, và với một nick vừa nhập thì kho không còn bản nào khác.
 * Ai được phép đọc chúng thì được phép hủy chúng; ai không thì không.
 *
 * Trước 17/08/2026 đây chỉ là `guardedAction`, tức bất kỳ ai đăng nhập cũng xóa được nick của
 * người khác — trong khi xóa một cái *proxy* lại đòi ADMIN. Bất đối xứng đó ngược với thứ tự mà
 * schema tự tuyên bố: "Nick là tài sản, đăng ký máy là quyền".
 *
 * Tầm nhìn vẫn không đổi: mọi người vẫn thấy nick, job và lịch sử của nhau. Chốt này chỉ chặn
 * đường HỦY, đúng như chốt kia chỉ chặn đường ĐỌC BÍ MẬT.
 */
export const deleteAccount = guardedAction(async function deleteAccount(
  actor,
  accountId: string,
): Promise<ActionResult> {
  await requireNickOwner(actor, accountId);

  const snapshot = await prisma.account.findUnique({
    where: { id: accountId },
    select: { updatedAt: true },
  });
  if (!snapshot) return { ok: false, message: "Nick not found. Return to the nick vault and try again." };

  let outcome:
    | { kind: "deleted"; username: string; proxyLabel: string | null }
    | { kind: "rejected"; message: string };
  try {
    outcome = await prisma.$transaction(async (tx): Promise<typeof outcome> => {
      await lockAccountForDeletion(tx, accountId);
      const account = await tx.account.findUnique({
        where: { id: accountId },
        include: {
          proxy: { select: { label: true } },
          _count: {
            select: {
              jobs: true,
              interactions: true,
              facebookConnections: true,
              facebookPages: true,
            },
          },
        },
      });
      if (!account) {
        return { kind: "rejected", message: "Nick not found. Return to the nick vault and try again." };
      }
      if (account.updatedAt.getTime() !== snapshot.updatedAt.getTime()) {
        return {
          kind: "rejected",
          message: "The nick changed while deletion was being prepared. Reload the page and review it again.",
        };
      }
      if (actor.role !== "ADMIN" && account.ownerId !== actor.userId) {
        return {
          kind: "rejected",
          message:
            account.ownerId === null
              ? `Nick "${account.username}" has not been assigned to anyone. Ask an administrator to assign a nick owner first.`
              : `Nick "${account.username}" belongs to another operator. Only its owner can delete it.`,
        };
      }

      const blocked = blockDeleteWhenReferenced(
        `nick "${account.username}"`,
        [
          { label: "job", count: account._count.jobs },
          { label: "recorded interactions", count: account._count.interactions },
          { label: "Facebook connections", count: account._count.facebookConnections },
          { label: "Facebook Pages administered by this nick", count: account._count.facebookPages },
        ],
        'If this nick is no longer used, change its status to "Dead" instead. Its history must remain ' +
          "so the rules can still count limits and promotional ratios for the other nicks.",
      );
      if (blocked) return { kind: "rejected", message: blocked.message };

      const deleted = await tx.account.deleteMany({
        where:
          actor.role === "ADMIN"
            ? { id: accountId, updatedAt: account.updatedAt }
            : { id: accountId, ownerId: actor.userId, updatedAt: account.updatedAt },
      });
      if (deleted.count !== 1) {
        return {
          kind: "rejected",
          message: "The nick changed while deletion was being prepared. Reload the page and review it again.",
        };
      }
      return {
        kind: "deleted",
        username: account.username,
        proxyLabel: account.proxy?.label ?? null,
      };
    });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "delete the nick") };
  }
  if (outcome.kind === "rejected") return { ok: false, message: outcome.message };

  // AuditLog cố ý giữ lại: accountId của nó không có ràng buộc khóa ngoại, và nhật ký thao tác
  // nhạy cảm phải sống lâu hơn thứ nó ghi lại, nếu không xóa nick là xóa luôn dấu vết.
  revalidatePath("/accounts");
  return {
    ok: true,
    message:
      `Nick "${outcome.username}" deleted. ` +
      (outcome.proxyLabel
        ? `Proxy "${outcome.proxyLabel}" can now be assigned to another nick.`
        : "Return to the nick vault to continue."),
  };
});

export const deleteTarget = guardedAction(async function deleteTarget(
  _actor,
  targetId: string,
): Promise<ActionResult> {
  const target = await prisma.platformTarget.findUnique({
    where: { id: targetId },
    include: {
      _count: { select: { jobs: true, interactions: true } },
      facebookPage: { select: { name: true } },
    },
  });
  if (!target) {
    return {
      ok: false,
      message: "Posting target not found. Return to the target list and try again.",
    };
  }

  const blocked = blockDeleteWhenReferenced(
    `posting target "${target.name}"`,
    [
      { label: "job", count: target._count.jobs },
      { label: "recorded interactions", count: target._count.interactions },
      { label: "connected Facebook Page", count: target.facebookPage ? 1 : 0 },
    ],
    'If this target is no longer used, clear "Active" instead. It will disappear from scheduling ' +
      "while its history remains available to the rules.",
  );
  if (blocked) return { ok: false, message: blocked.message };

  try {
    await prisma.platformTarget.delete({ where: { id: targetId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "delete the posting target") };
  }

  revalidatePath("/targets");
  return {
    ok: true,
    message: `Posting target "${target.name}" deleted. It is no longer available for scheduling.`,
  };
});
