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
  if (!job) return { ok: false, message: "Không tìm thấy job." };

  if (job.target.platform !== "FACEBOOK_PAGE") {
    return {
      ok: false,
      message: `Đích "${job.target.name}" không phải Fanpage. Chỉ Fanpage đăng được bằng API.`,
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
      message: "Job này vừa được người khác đăng hoặc đổi trạng thái. Tải lại trang để xem hiện trạng.",
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
      message: error instanceof Error ? error.message : "lỗi không rõ khi ghi trạng thái",
    }),
  );

  revalidatePath("/queue");
  revalidatePath("/");

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
