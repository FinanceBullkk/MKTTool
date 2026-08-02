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
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError } from "@/lib/db/prisma-error-helpers";
import { blockDeleteWhenReferenced } from "@/lib/db/reference-guard";

export async function deletePersona(personaId: string): Promise<ActionResult> {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    include: { _count: { select: { accounts: true } } },
  });
  if (!persona) return { ok: false, message: "Không tìm thấy nhân vật." };

  const blocked = blockDeleteWhenReferenced(
    `nhân vật "${persona.name}"`,
    [{ label: "nick", count: persona._count.accounts }],
    "Gỡ nhân vật khỏi các nick đó trước, hoặc giữ nguyên — nhân vật không dùng nữa cũng vô hại.",
  );
  if (blocked) return { ok: false, message: blocked.message };

  try {
    await prisma.persona.delete({ where: { id: personaId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa nhân vật") };
  }

  revalidatePath("/personas");
  return { ok: true, message: `Đã xóa nhân vật "${persona.name}".` };
}

export async function deleteProxy(proxyId: string): Promise<ActionResult> {
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
}

export async function deleteAccount(accountId: string): Promise<ActionResult> {
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
    message: `Đã xóa nick "${account.username}". Proxy "${account.proxy.label}" giờ gắn được cho nick khác.`,
  };
}

export async function deleteTarget(targetId: string): Promise<ActionResult> {
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
}
