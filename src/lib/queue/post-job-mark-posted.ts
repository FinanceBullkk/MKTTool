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
import { OPEN_JOB_STATUSES } from "@/lib/content/content-types";
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

/** Câu từ chối ứng với trạng thái job đọc được lúc thua cuộc giành chỗ. */
function refusalFor(status: string): string {
  if (status === "POSTED") return "Job này đã được đánh dấu đã đăng rồi.";
  if (status === "PUBLISHING") return "Job này đang được đăng ở nơi khác — chờ nó xong rồi tải lại.";
  return "Job này đã bỏ qua hoặc đã đánh dấu lỗi — không đánh dấu đã đăng được.";
}

/**
 * @param fromStatuses Trạng thái được phép chuyển sang POSTED. Mặc định là job còn mở; đường
 *   đăng Fanpage truyền `["PUBLISHING"]` vì nó đã giành chỗ từ trước khi gọi Graph.
 */
export async function markPostJobPosted(
  jobId: string,
  postedUrl: string,
  fromStatuses: readonly string[] = OPEN_JOB_STATUSES,
): Promise<ActionResult> {
  const job = await prisma.postJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Không tìm thấy job." };

  // Kiểm sớm chỉ để có câu từ chối tử tế cho trường hợp thường gặp — bấm hai lần cách nhau vài
  // giây. Nó KHÔNG phải chỗ bảo đảm đúng đắn: chỗ đó là điều kiện `status` trong `updateMany`
  // dưới đây.
  if (!fromStatuses.includes(job.status)) {
    return { ok: false, message: refusalFor(job.status) };
  }

  // Đổi trạng thái bằng MỘT câu lệnh có điều kiện thay vì đọc-kiểm-rồi-ghi.
  //
  // Bản cũ đọc job, kiểm trạng thái, rồi mới ghi — ba bước rời nhau. `$transaction` bọc mấy lệnh
  // ghi nhưng không bọc lượt đọc, và `update` chỉ lọc theo `id`, nên hai lượt chạy song song đều
  // đọc thấy PENDING, đều qua cửa, đều ghi: MỘT bài đăng để lại HAI Interaction. Không cần hai
  // người mới dính — bộ dò sức khỏe tự gán (`auto-link-discovered-posts.ts`) chạy theo hẹn giờ
  // song song với người đang bấm "Đã đăng". Interaction nhân đôi làm lệch đúng mấy con số bộ
  // luật đếm: hạn mức ngày, tỷ lệ promo, chặn đụng độ thread.
  //
  // Đưa điều kiện `status` vào chính câu ghi thì database là trọng tài: đúng một lượt thấy
  // `count === 1`, lượt còn lại thấy `0` và dừng trước khi tạo Interaction.
  const written = await prisma.$transaction(async (tx) => {
    const claimed = await tx.postJob.updateMany({
      where: { id: jobId, status: { in: [...fromStatuses] } },
      data: { status: "POSTED", postedUrl, postedAt: new Date(), errorMessage: null },
    });
    if (claimed.count === 0) return false;

    await tx.interaction.create({
      data: {
        accountId: job.accountId,
        targetId: job.targetId,
        threadUrl: postedUrl,
        threadKey: normalizeThreadUrl(postedUrl),
        kind: "POST",
        note: AUTO_POST_INTERACTION_NOTE,
      },
    });
    await tx.account.update({ where: { id: job.accountId }, data: { lastActionAt: new Date() } });
    return true;
  });

  if (!written) {
    // Thua cuộc giành chỗ. Đọc lại để nói đúng ai đã ghi trước thay vì một câu chung chung.
    const current = await prisma.postJob.findUnique({ where: { id: jobId } });
    return { ok: false, message: refusalFor(current?.status ?? "POSTED") };
  }

  return { ok: true, message: "Đã ghi nhận bài đăng. Nick khác sẽ bị chặn nếu đụng vào thread này." };
}
