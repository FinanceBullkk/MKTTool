"use server";

/**
 * Đăng một job trong hàng đợi lên Fanpage bằng Graph API.
 *
 * Đây là con đường tự động DUY NHẤT của Facebook trong công cụ này. Group không có
 * và sẽ không có: Meta gỡ `publish_to_groups` từ 04/2024, mọi thứ tự nhận làm được
 * đều là lách bằng trình duyệt giả — đúng thứ khiến nick chết.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { markJobPosted } from "@/lib/queue/post-job-status-actions";
import { FacebookPublishError, publishToPage, toPostContent } from "./facebook-page-publisher";

export const publishJobToPage = guardedAction(async function publishJobToPage(
  actor,
  jobId: string,
  imageUrl?: string,
): Promise<ActionResult> {
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

  // Ranh giới quan trọng nhất của hàm này: chỉ lời gọi Graph nằm trong khối try dưới đây.
  // Qua được nó nghĩa là bài ĐÃ nằm trên tường Facebook, và từ đó trở đi không lỗi nào
  // được phép đẩy job về FAILED — người dùng thấy "lỗi" sẽ bấm đăng lại, thành hai bài.
  let result: Awaited<ReturnType<typeof publishToPage>>;
  try {
    result = await publishToPage(page.pageId, toPostContent(job.contentItem), { imageUrl });
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
        actorId: actor.userId,
      },
    });

    revalidatePath("/queue");
    return { ok: false, message };
  }

  await prisma.auditLog.create({
    data: {
      accountId: job.accountId,
      action: "FACEBOOK_PAGE_PUBLISHED",
      detail: `job ${job.id} → page ${page.name} (${result.postId})`.slice(0, 500),
      actorId: actor.userId,
    },
  });

  // Dùng lại đường đánh dấu đã đăng của hàng đợi: nó ghi luôn Interaction để
  // luật chống đụng độ và tỷ lệ promo nhìn thấy bài này như mọi bài đăng tay.
  const marked = await markJobPosted(jobId, result.postUrl).catch((error: unknown) => ({
    ok: false as const,
    message: error instanceof Error ? error.message : "lỗi không rõ khi ghi trạng thái",
  }));

  if (!marked.ok) {
    // Bài đã lên rồi mà job vẫn PENDING: phải nói thẳng, nếu không lần bấm sau là bài thứ hai.
    return {
      ok: false,
      message:
        `ĐÃ ĐĂNG THÀNH CÔNG lên "${page.name}" (${result.postUrl}) nhưng không ghi được trạng thái ` +
        `job: ${marked.message} — ĐỪNG bấm đăng lại. Vào hàng đợi bấm "Đã đăng" và dán chính link này.`,
    };
  }

  return { ok: true, message: `Đã đăng lên "${page.name}". Mở link ở cột trạng thái để kiểm tra.` };
});
