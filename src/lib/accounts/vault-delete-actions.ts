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
  if (!proxy) return { ok: false, message: "Không tìm thấy proxy." };

  if (proxy.account) {
    return {
      ok: false,
      message:
        `Không xóa được proxy "${proxy.label}": đang gắn với nick "${proxy.account.username}". ` +
        "Gán nick đó sang proxy khác trước — nick không có proxy là nick chạy bằng IP nhà.",
    };
  }

  try {
    await prisma.proxy.delete({ where: { id: proxyId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa proxy") };
  }

  revalidatePath("/proxies");
  return { ok: true, message: `Đã xóa proxy "${proxy.label}".` };
});

export const deleteAccount = guardedAction(async function deleteAccount(
  _actor,
  accountId: string,
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      proxy: { select: { label: true } },
      _count: {
        select: { jobs: true, interactions: true, facebookConnections: true, facebookPages: true },
      },
    },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  const blocked = blockDeleteWhenReferenced(
    `nick "${account.username}"`,
    [
      { label: "job", count: account._count.jobs },
      { label: "tương tác đã ghi", count: account._count.interactions },
      { label: "kết nối Facebook", count: account._count.facebookConnections },
      { label: "Fanpage nhận nick này làm quản trị", count: account._count.facebookPages },
    ],
    "Nick không dùng nữa thì đổi trạng thái sang \"Đã chết\" — lịch sử giữ nguyên để bộ luật " +
      "còn đếm hạn mức và tỷ lệ promo cho những nick còn lại.",
  );
  if (blocked) return { ok: false, message: blocked.message };

  try {
    await prisma.account.delete({ where: { id: accountId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa nick") };
  }

  // AuditLog cố ý giữ lại: accountId của nó không có ràng buộc khóa ngoại, và nhật ký thao tác
  // nhạy cảm phải sống lâu hơn thứ nó ghi lại, nếu không xóa nick là xóa luôn dấu vết.
  revalidatePath("/accounts");
  return {
    ok: true,
    message:
      `Đã xóa nick "${account.username}".` +
      (account.proxy ? ` Proxy "${account.proxy.label}" giờ gắn được cho nick khác.` : ""),
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
  if (!target) return { ok: false, message: "Không tìm thấy đích đăng." };

  const blocked = blockDeleteWhenReferenced(
    `đích "${target.name}"`,
    [
      { label: "job", count: target._count.jobs },
      { label: "tương tác đã ghi", count: target._count.interactions },
      { label: "Fanpage đang nối", count: target.facebookPage ? 1 : 0 },
    ],
    "Đích không dùng nữa thì bỏ tick \"Đang dùng\" — nó biến khỏi ô chọn lúc xếp lịch mà " +
      "lịch sử vẫn còn cho bộ luật đếm.",
  );
  if (blocked) return { ok: false, message: blocked.message };

  try {
    await prisma.platformTarget.delete({ where: { id: targetId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa đích đăng") };
  }

  revalidatePath("/targets");
  return { ok: true, message: `Đã xóa đích "${target.name}".` };
});
