/**
 * Bắt link đã gán mà trỏ về một bài KHÁC nội dung của job.
 *
 * Bổ cho duplicate-posted-url-check.ts, và bắt được đúng ca mà phép kiểm đó bỏ lọt: nó chỉ lên
 * tiếng khi HAI job dán trùng MỘT link. Dán nhầm link của một bài không nằm trong kho — bài
 * nuôi nick, bài của chủ cũ, hay chỉ là copy nhầm tab — thì không có cặp nào để so, và lỗi
 * nằm im.
 *
 * Tín hiệu ở đây là slug Reddit tự sinh từ tiêu đề lúc đăng, vốn nằm sẵn trong chính link đã
 * lưu. Không cần mạng, không cần proxy, không cần bộ dò chạy — chỉ là một câu hỏi đặt cho kho.
 *
 * CỐ Ý CHỈ LÀ CẢNH BÁO, không phải kết luận: tiêu đề sửa được sau khi đăng, và người dùng có
 * thể đặt tiêu đề trên Reddit khác với tiêu đề content trong kho. Cả hai đều làm slug lệch mà
 * không có gì sai cả. Vì vậy nó không đổi trạng thái job và không đụng tới bộ luật.
 */
import { titleSlugScore } from "@/lib/health/reddit-title-slug-match";
import { prisma } from "@/lib/db/prisma-client";

/**
 * Dưới ngưỡng này mới báo. Thấp hơn hẳn ngưỡng cho phép TỰ GHI (0.6) là có chủ ý: ghi nhầm thì
 * hỏng dữ liệu nên phải chắc mới ghi, còn báo nhầm thì tốn một lần liếc mắt nhưng dạy người
 * dùng phớt lờ cảnh báo — nên chỉ báo khi lệch hẳn.
 */
export const SUSPECT_TITLE_SCORE = 0.2;

export interface SuspectPostedUrl {
  jobId: string;
  contentTitle: string;
  accountUsername: string;
  postedUrl: string;
}

interface JobRow {
  jobId: string;
  contentTitle: string;
  accountUsername: string;
  postedUrl: string;
}

/** Hàm thuần — tách khỏi truy vấn để test không cần database. */
export function findSuspectPostedUrls(rows: readonly JobRow[]): SuspectPostedUrl[] {
  return rows.filter((row) => {
    const score = titleSlugScore(row.contentTitle, row.postedUrl);
    // `null` = link không có slug để so (redd.it, permalink cụt). Không so được thì im lặng,
    // vì mọi kết luận lúc đó đều là đoán.
    return score !== null && score < SUSPECT_TITLE_SCORE;
  });
}

export async function loadSuspectPostedUrls(): Promise<SuspectPostedUrl[]> {
  const jobs = await prisma.postJob.findMany({
    where: { status: "POSTED", postedUrl: { not: null }, target: { platform: "REDDIT" } },
    select: {
      id: true,
      postedUrl: true,
      contentItem: { select: { title: true } },
      account: { select: { username: true } },
    },
  });

  return findSuspectPostedUrls(
    jobs.flatMap((job) => {
      const postedUrl = job.postedUrl?.trim();
      if (!postedUrl) return [];
      return [
        {
          jobId: job.id,
          contentTitle: job.contentItem.title,
          accountUsername: job.account.username,
          postedUrl,
        },
      ];
    }),
  );
}
