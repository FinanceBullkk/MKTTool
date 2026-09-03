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
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  isPlatformInRolloutScope,
  parkedPlatformMessage,
} from "@/lib/platforms/rollout-scope";
import { markPostJobPosted } from "@/lib/queue/post-job-mark-posted";
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
  if (!job) return { ok: false, message: "Job not found." };

  if (job.target.platform !== "FACEBOOK_PAGE") {
    return {
      ok: false,
      message: `Target "${job.target.name}" is not a Facebook Page. Only Facebook Pages can be published through the API.`,
    };
  }
  // Chốt phạm vi đặt ngay sau lượt kiểm loại đích và TRƯỚC mọi thứ chạm tới Graph API.
  //
  // Đây là lối vào duy nhất trong công cụ gây ra hiệu ứng ra ngoài thế giới: một bài thật xuất
  // hiện trên một Fanpage thật. Job có thể xóa, trạng thái có thể sửa, còn bài đã đăng thì chỉ
  // gỡ được bằng tay trên Facebook. Cho nên nếu chỉ một chỗ trong file này được chặn thì phải
  // là chỗ này.
  if (!isPlatformInRolloutScope(job.target.platform)) {
    return { ok: false, message: parkedPlatformMessage(job.target.platform) };
  }

  if (job.status !== "PENDING") {
    return {
      ok: false,
      message: "Only pending jobs can be posted. Resolve or override the blocking rule first.",
    };
  }

  const page = await prisma.facebookPage.findFirst({ where: { targetId: job.targetId } });
  if (!page) {
    return {
      ok: false,
      message: `Target "${job.target.name}" is not connected to a Facebook Page. Connect it on /facebook first.`,
    };
  }

  // Giành chỗ TRƯỚC khi gọi Graph, bằng một câu lệnh có điều kiện trạng thái.
  //
  // Lượt kiểm `job.status !== "PENDING"` bên trên đọc từ một lượt truy vấn đã cũ, nên tự nó
  // không chặn được gì: giữa lúc đọc và lúc gọi Graph có một cửa sổ rộng bằng cả vòng gọi mạng
  // ra Facebook. Hai người cùng bấm một job trong cửa sổ đó thì cả hai đều thấy PENDING, cả hai
  // đều gọi Graph, và Fanpage nhận HAI bài thật — không có gì gỡ lại được ngoài xóa tay. Đây là
  // đường đăng dùng chung: ai cũng nhìn thấy job của người khác nên hai người bấm một job là
  // chuyện thường, không phải tình huống hiếm.
  //
  // `disabled={pending}` ở nút bấm chỉ che một tab của một người, không che hai người.
  const claimed = await prisma.postJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "PUBLISHING" },
  });
  if (claimed.count === 0) {
    return {
      ok: false,
      message: "Another operator just posted this job or changed its status. Reload the page to see its current state.",
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
      error instanceof FacebookPublishError ? error.message : "An unknown error occurred while posting.";

    await prisma.postJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: message.slice(0, 500) },
    });
    await prisma.auditLog.create({
      data: {
        accountId: job.accountId,
        action: AUDIT_ACTIONS.FACEBOOK_PAGE_PUBLISH_FAILED,
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
      action: AUDIT_ACTIONS.FACEBOOK_PAGE_PUBLISHED,
      detail: `job ${job.id} → page ${page.name} (${result.postId})`.slice(0, 500),
      actorId: actor.userId,
    },
  });

  // Dùng lại đường đánh dấu đã đăng của hàng đợi: nó ghi luôn Interaction để
  // luật chống đụng độ và tỷ lệ promo nhìn thấy bài này như mọi bài đăng tay.
  //
  // Gọi thẳng lõi thay vì server action `markJobPosted` vì chỗ này phải khai trạng thái nguồn là
  // `PUBLISHING` — chỗ mà lượt giành chỗ bên trên vừa đặt job vào. Server action là một endpoint
  // HTTP công khai, nên thêm tham số "được chuyển từ trạng thái nào" vào chữ ký của nó là mở cho
  // người gọi tự chọn luật chuyển trạng thái. Lõi không lộ ra ngoài nên giữ được quyền đó bên trong.
  const marked = await markPostJobPosted(jobId, result.postUrl, ["PUBLISHING"]).catch(
    (error: unknown) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "unknown status-write error",
    }),
  );

  revalidatePath("/queue");
  revalidatePath("/");

  if (!marked.ok) {
    // Bài đã lên rồi mà job vẫn PENDING: phải nói thẳng, nếu không lần bấm sau là bài thứ hai.
    return {
      ok: false,
      message:
        `POSTED SUCCESSFULLY to "${page.name}" (${result.postUrl}), but the job status could not be recorded: ` +
        `${marked.message}. DO NOT post again. Open the posting queue, select "Posted", and paste this exact link.`,
    };
  }

  return { ok: true, message: `Posted to "${page.name}". Open the link in the status column to verify it.` };
});
