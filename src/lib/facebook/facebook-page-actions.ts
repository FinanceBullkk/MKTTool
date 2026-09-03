"use server";

/**
 * Server actions cho trang /facebook: kiểm tra token, gán nick quản trị, ngắt kết nối.
 * Không có action nào trả token ra ngoài — token chỉ rời database bên trong publisher.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { verifyAllPageTokens } from "./facebook-token-manager";

export const checkAllPageTokens = guardedAction(async function checkAllPageTokens(
  _actor,
): Promise<ActionResult> {
  const results = await verifyAllPageTokens();
  if (results.length === 0) return { ok: false, message: "No Facebook Pages are connected." };

  const failed = results.filter((result) => !result.ok);
  revalidatePath("/facebook");

  if (failed.length === 0) {
    return { ok: true, message: `All ${results.length} Pages are usable.` };
  }
  return {
    ok: false,
    message: `${failed.length}/${results.length} Pages have problems: ${failed
      .map((result) => `${result.name} — ${result.message}`)
      .join(" | ")}`,
  };
});

/**
 * Gán nick cá nhân quản trị Page.
 *
 * Chỉ để tra ngược "mất nick nào thì mất Page nào" — công cụ không dùng nick này để đăng,
 * việc đăng đi bằng Page token. Trên Facebook nhớ đặt 2 người làm quản trị viên.
 */
export const assignPageAdmin = guardedAction(async function assignPageAdmin(
  _actor,
  pageId: string,
  accountId: string,
): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(pageId);
  if (!parsed.success) return { ok: false, message: "Page ID is required." };

  const adminAccountId = accountId.trim() === "" ? null : accountId;

  if (adminAccountId) {
    const account = await prisma.account.findUnique({ where: { id: adminAccountId } });
    if (!account) return { ok: false, message: "Nick not found." };
    if (account.platform !== "FACEBOOK") {
      return { ok: false, message: "The Page administrator must be a Facebook nick." };
    }
  }

  await prisma.facebookPage.update({ where: { pageId }, data: { adminAccountId } });
  revalidatePath("/facebook");
  return { ok: true, message: adminAccountId ? "Page administrator nick assigned." : "Page administrator nick unassigned." };
});

/**
 * Xóa Page khỏi công cụ. Giữ nguyên `PlatformTarget` và mọi job cũ —
 * xóa lịch sử đăng chỉ để dọn màn hình là mất luôn dữ liệu nuôi bộ luật.
 */
export const disconnectPage = guardedAction(async function disconnectPage(
  _actor,
  pageId: string,
): Promise<ActionResult> {
  const page = await prisma.facebookPage.findUnique({ where: { pageId } });
  if (!page) return { ok: false, message: "Page not found." };

  await prisma.facebookPage.delete({ where: { pageId } });
  revalidatePath("/facebook");
  return {
    ok: true,
    message: `Removed "${page.name}". Its posting target and job history remain; reconnect it to resume use.`,
  };
});

/** Ngắt hẳn một nick khỏi công cụ — mọi Page dưới nick đó bị gỡ theo (cascade). */
export const disconnectConnection = guardedAction(async function disconnectConnection(
  _actor,
  connectionId: string,
): Promise<ActionResult> {
  const connection = await prisma.facebookConnection.findUnique({
    where: { id: connectionId },
    include: { _count: { select: { pages: true } } },
  });
  if (!connection) return { ok: false, message: "Connection not found." };

  await prisma.facebookConnection.delete({ where: { id: connectionId } });
  revalidatePath("/facebook");
  return {
    ok: true,
    message: `Disconnected "${connection.name}" and removed its ${connection._count.pages} Pages.`,
  };
});
