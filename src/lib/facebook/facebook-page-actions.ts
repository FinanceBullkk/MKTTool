"use server";

/**
 * Server actions cho trang /facebook: kiểm tra token, gán nick quản trị, ngắt kết nối.
 * Không có action nào trả token ra ngoài — token chỉ rời database bên trong publisher.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";
import { verifyAllPageTokens } from "./facebook-token-manager";

export async function checkAllPageTokens(): Promise<ActionResult> {
  const results = await verifyAllPageTokens();
  if (results.length === 0) return { ok: false, message: "Chưa kết nối Fanpage nào." };

  const failed = results.filter((result) => !result.ok);
  revalidatePath("/facebook");

  if (failed.length === 0) {
    return { ok: true, message: `${results.length} Page đều dùng được.` };
  }
  return {
    ok: false,
    message: `${failed.length}/${results.length} Page có vấn đề: ${failed
      .map((result) => `${result.name} — ${result.message}`)
      .join(" | ")}`,
  };
}

/**
 * Gán nick cá nhân quản trị Page.
 *
 * Chỉ để tra ngược "mất nick nào thì mất Page nào" — công cụ không dùng nick này để đăng,
 * việc đăng đi bằng Page token. Trên Facebook nhớ đặt 2 người làm quản trị viên.
 */
export async function assignPageAdmin(pageId: string, accountId: string): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(pageId);
  if (!parsed.success) return { ok: false, message: "Thiếu id Page." };

  const adminAccountId = accountId.trim() === "" ? null : accountId;

  if (adminAccountId) {
    const account = await prisma.account.findUnique({ where: { id: adminAccountId } });
    if (!account) return { ok: false, message: "Không tìm thấy nick." };
    if (account.platform !== "FACEBOOK") {
      return { ok: false, message: "Quản trị viên Page phải là nick Facebook." };
    }
  }

  await prisma.facebookPage.update({ where: { pageId }, data: { adminAccountId } });
  revalidatePath("/facebook");
  return { ok: true, message: adminAccountId ? "Đã gán nick quản trị." : "Đã bỏ gán nick quản trị." };
}

/**
 * Xóa Page khỏi công cụ. Giữ nguyên `PlatformTarget` và mọi job cũ —
 * xóa lịch sử đăng chỉ để dọn màn hình là mất luôn dữ liệu nuôi bộ luật.
 */
export async function disconnectPage(pageId: string): Promise<ActionResult> {
  const page = await prisma.facebookPage.findUnique({ where: { pageId } });
  if (!page) return { ok: false, message: "Không tìm thấy Page." };

  await prisma.facebookPage.delete({ where: { pageId } });
  revalidatePath("/facebook");
  return {
    ok: true,
    message: `Đã gỡ "${page.name}". Đích đăng và lịch sử job giữ nguyên; kết nối lại là dùng tiếp được.`,
  };
}

/** Ngắt hẳn một nick khỏi công cụ — mọi Page dưới nick đó bị gỡ theo (cascade). */
export async function disconnectConnection(connectionId: string): Promise<ActionResult> {
  const connection = await prisma.facebookConnection.findUnique({
    where: { id: connectionId },
    include: { _count: { select: { pages: true } } },
  });
  if (!connection) return { ok: false, message: "Không tìm thấy kết nối." };

  await prisma.facebookConnection.delete({ where: { id: connectionId } });
  revalidatePath("/facebook");
  return {
    ok: true,
    message: `Đã ngắt kết nối "${connection.name}" và gỡ ${connection._count.pages} Page kèm theo.`,
  };
}
