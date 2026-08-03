/**
 * Bốn con số của vòng đăng bài, cho băng chuyền ở trang Hôm nay.
 *
 * Con số đáng giá nhất là `overdue`: job tới giờ mà vẫn `PENDING`. Nó có đúng hai nghĩa, và
 * nghĩa nào cũng cần biết — hoặc bài chưa đăng, hoặc đã đăng rồi mà quên bấm "Đã đăng". Vế sau
 * mới là vế nguy hiểm: không có `Interaction` nào được ghi, nên với bộ luật thì bài đó chưa từng
 * tồn tại, và nick khác đụng đúng thread ấy sẽ được cho qua.
 *
 * `interactions30d` là đầu kia của vòng — bằng chứng dữ liệu vẫn đang chảy ngược về nuôi luật.
 */
import { prisma } from "@/lib/db/prisma-client";
import { startOfLocalDay } from "@/lib/format/vietnamese-date-format";

const SIMILARITY_WINDOW_DAYS = 30;

export interface PostingLoopSummary {
  pending: number;
  /** Job tới giờ mà chưa chốt trạng thái. */
  overdue: number;
  postedToday: number;
  interactions30d: number;
}

export async function loadPostingLoopSummary(
  now: Date = new Date(),
): Promise<PostingLoopSummary> {
  const since = new Date(now.getTime() - SIMILARITY_WINDOW_DAYS * 86_400_000);

  const [pending, overdue, postedToday, interactions30d] = await Promise.all([
    prisma.postJob.count({ where: { status: "PENDING" } }),
    prisma.postJob.count({ where: { status: "PENDING", scheduledAt: { lt: now } } }),
    prisma.postJob.count({ where: { status: "POSTED", postedAt: { gte: startOfLocalDay(now) } } }),
    prisma.interaction.count({ where: { at: { gte: since } } }),
  ]);

  return { pending, overdue, postedToday, interactions30d };
}
