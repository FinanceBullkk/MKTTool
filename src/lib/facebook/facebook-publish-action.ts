"use server";

/**
 * Đăng một job trong hàng đợi lên Fanpage bằng Graph API.
 *
 * Đây là con đường tự động DUY NHẤT của Facebook trong công cụ này. Group không có
 * và sẽ không có: Meta gỡ `publish_to_groups` từ 04/2024, mọi thứ tự nhận làm được
 * đều là lách bằng trình duyệt giả — đúng thứ khiến nick chết.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";
import { markJobPosted } from "@/lib/queue/post-job-status-actions";
import { FacebookPublishError, publishToPage, toPostContent } from "./facebook-page-publisher";

export async function publishJobToPage(jobId: string, imageUrl?: string): Promise<ActionResult> {
  const job = await prisma.postJob.findUnique({
    where: { id: jobId },
    include: { contentItem: true, target: true },
  });
  if (!job) return { ok: false, message: "Không tìm thấy job." };

  if (job.target.platform !== "FACEBOOK_PAGE") {
    return {
      ok: false,
      message: `Đích "${job.target.name}" không phải Fanpage. Chỉ Fanpage đăng được bằng API.`,
    };
  }
  if (job.status !== "PENDING") {
    return {
      ok: false,
      message: "Chỉ đăng được job đang chờ. Job bị chặn phải gỡ luật hoặc ghi đè trước.",
    };
  }

  const page = await prisma.facebookPage.findFirst({ where: { targetId: job.targetId } });
  if (!page) {
    return {
      ok: false,
      message: `Đích "${job.target.name}" chưa nối với Fanpage nào. Vào /facebook kết nối trước.`,
    };
  }

  try {
    const result = await publishToPage(page.pageId, toPostContent(job.contentItem), { imageUrl });

    await prisma.auditLog.create({
      data: {
        accountId: job.accountId,
        action: "FACEBOOK_PAGE_PUBLISHED",
        detail: `job ${job.id} → page ${page.name} (${result.postId})`.slice(0, 500),
      },
    });

    // Dùng lại đường đánh dấu đã đăng của hàng đợi: nó ghi luôn Interaction để
    // luật chống đụng độ và tỷ lệ promo nhìn thấy bài này như mọi bài đăng tay.
    await markJobPosted(jobId, result.postUrl);

    return { ok: true, message: `Đã đăng lên "${page.name}". Mở link ở cột trạng thái để kiểm tra.` };
  } catch (error) {
    const message =
      error instanceof FacebookPublishError ? error.message : "Lỗi không xác định khi đăng bài.";

    await prisma.postJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    await prisma.auditLog.create({
      data: {
        accountId: job.accountId,
        action: "FACEBOOK_PAGE_PUBLISH_FAILED",
        detail: `job ${job.id} — ${message}`.slice(0, 500),
      },
    });

    revalidatePath("/queue");
    return { ok: false, message };
  }
}
