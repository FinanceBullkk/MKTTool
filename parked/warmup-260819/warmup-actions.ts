"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";

/**
 * Giảm số ngày Cold-Start còn lại sau khi hoàn thành phiên nuôi trong ngày
 */
export const decrementColdStart = guardedAction(async function decrementColdStart(
  _actor,
  accountId: string,
): Promise<ActionResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, coldStartDaysRemaining: true },
  });

  if (!account) {
    return { ok: false, message: "Không tìm thấy tài khoản." };
  }

  if (account.coldStartDaysRemaining <= 0) {
    return { ok: true, message: "Tài khoản đã hoàn tất thời gian Cold-Start!" };
  }

  const nextDays = account.coldStartDaysRemaining - 1;
  await prisma.account.update({
    where: { id: accountId },
    data: {
      coldStartDaysRemaining: nextDays,
      status: nextDays === 0 ? "ALIVE" : undefined,
    },
  });

  revalidatePath("/");
  return {
    ok: true,
    message: nextDays === 0
      ? "🎉 Chúc mừng! Tài khoản đã hoàn thành giai đoạn nuôi và sẵn sàng đăng bài!"
      : `Đã cập nhật: Còn ${nextDays} ngày nuôi (Cold-Start).`,
  };
});
