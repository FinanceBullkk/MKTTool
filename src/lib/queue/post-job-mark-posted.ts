/**
 * Ghi một job thành ĐÃ ĐĂNG: đổi trạng thái, lưu link, và để lại dấu vết cho luật 8.
 *
 * Tách khỏi post-job-status-actions.ts vì file đó là `"use server"` và gọi `revalidatePath()` —
 * hai thứ chỉ sống được trong ngữ cảnh request của Next. Bộ dò sức khỏe chạy ở TIẾN TRÌNH RIÊNG
 * (`npm run health`, hoặc tiến trình tách rời do nút "Dò cả đàn" sinh ra), nên nó không đi qua
 * đường đó được.
 *
 * Vì sao không để bộ dò tự viết câu `prisma.update` của riêng nó: một bài đăng phải để lại ĐÚNG
 * MỘT bộ dấu vết dù ai ghi — bấm tay ở hàng đợi, Graph API của Fanpage, hay bộ dò tự gán. Hai
 * đường ghi là hai cơ hội để một đường quên tạo Interaction, và luật 8 mù đúng chỗ đó mà không
 * có gì đỏ lên.
 */
import type { ActionResult } from "@/lib/actions/action-result";
import { isOpenJobStatus } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";

/**
 * Ghi chú của Interaction sinh ra khi đánh dấu job đã đăng.
 *
 * Một chuỗi duy nhất cho mọi đường ghi, kể cả lúc bộ dò tự gán: đường gỡ (post-job-revert.ts)
 * tìm lại dấu vết bằng đúng chuỗi này, nên thêm một biến thể là thêm một dấu vết gỡ không ra.
 * Ai ghi thì đọc ở AuditLog, không đọc ở đây.
 */
export const AUTO_POST_INTERACTION_NOTE = "tự ghi khi đánh dấu job đã đăng";

export async function markPostJobPosted(jobId: string, postedUrl: string): Promise<ActionResult> {
  const job = await prisma.postJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };

  // Bấm hai lần thì lần sau không được ghi thêm Interaction: một bài đăng là một dấu vết,
  // nhân đôi dấu vết làm bẩn chính dữ liệu mà bộ luật dựa vào để đếm.
  if (job.status === "POSTED") {
    return { ok: false, message: "Job này đã được đánh dấu đã đăng rồi." };
  }
  if (!isOpenJobStatus(job.status)) {
    return {
      ok: false,
      message: "Job này đã bỏ qua hoặc đã đánh dấu lỗi — không đánh dấu đã đăng được.",
    };
  }

  await prisma.$transaction([
    prisma.postJob.update({
      where: { id: jobId },
      data: { status: "POSTED", postedUrl, postedAt: new Date(), errorMessage: null },
    }),
    prisma.interaction.create({
      data: {
        accountId: job.accountId,
        targetId: job.targetId,
        threadUrl: postedUrl,
        threadKey: normalizeThreadUrl(postedUrl),
        kind: "POST",
        note: AUTO_POST_INTERACTION_NOTE,
      },
    }),
    prisma.account.update({ where: { id: job.accountId }, data: { lastActionAt: new Date() } }),
  ]);

  return { ok: true, message: "Đã ghi nhận bài đăng. Nick khác sẽ bị chặn nếu đụng vào thread này." };
}
