/**
 * Bắt lỗi dán nhầm link khi bấm "Đã đăng".
 *
 * Đo thật 04/08/2026: một nick có hai job `POSTED` với HAI NỘI DUNG KHÁC NHAU nhưng cùng một
 * link. Bài thứ hai chưa từng lên Reddit — người dùng dán lại link của bài thứ nhất. Hậu quả
 * không nằm ở bộ dò mà ở bộ luật:
 *
 *  - luật 7 coi nội dung đó là ĐÃ ĐĂNG nên sẽ chặn khi đăng nó thật;
 *  - luật 6 cộng nó vào quota bài hữu ích, cho phép bài promo sớm hơn thực tế;
 *  - luật 4 và 5 tính nó vào hạn mức ngày và giãn cách.
 *
 * Vì sao phải có phép kiểm RIÊNG thay vì trông vào bộ dò: bộ dò gộp job theo link (đúng, vì
 * ngoài đời chỉ có một bài), nên sau khi gộp thì con số trông sạch và lỗi biến mất khỏi màn
 * hình. Chính phép gộp đó xóa mất manh mối, nên manh mối phải được đọc ở chỗ khác.
 *
 * Cũng vì vậy đây KHÔNG phải việc của bộ dò: nó không cần mạng, không cần proxy, không phụ
 * thuộc Reddit đổi HTML — chỉ là một câu hỏi đặt cho chính kho dữ liệu.
 */
import { prisma } from "@/lib/db/prisma-client";
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";

export interface ConflictingJob {
  jobId: string;
  contentTitle: string;
  accountUsername: string;
}

export interface DuplicatePostedUrl {
  /** Khóa thread đã chuẩn hóa — cùng khóa mà luật 8 dùng. */
  threadKey: string;
  /** Một link nguyên bản để bấm vào xem. */
  sampleUrl: string;
  jobs: ConflictingJob[];
}

interface JobRow {
  jobId: string;
  contentItemId: string;
  contentTitle: string;
  accountUsername: string;
  postedUrl: string;
}

/**
 * Hàm thuần — tách khỏi truy vấn để test không cần database.
 *
 * Chỉ báo khi các job dùng chung link mà trỏ về NHIỀU CONTENT KHÁC NHAU. Hai job cùng một
 * content mà cùng link là chuyện bình thường và có thật: một bài xếp lịch hai lần rồi hủy
 * một, hoặc đăng lại đúng bài đó. Báo cả trường hợp đó là dạy người dùng phớt lờ cảnh báo.
 */
export function findDuplicatePostedUrls(rows: readonly JobRow[]): DuplicatePostedUrl[] {
  const byKey = new Map<string, { sampleUrl: string; rows: JobRow[] }>();

  for (const row of rows) {
    const key = normalizeThreadUrl(row.postedUrl);
    const group = byKey.get(key);
    if (group) group.rows.push(row);
    else byKey.set(key, { sampleUrl: row.postedUrl, rows: [row] });
  }

  const conflicts: DuplicatePostedUrl[] = [];

  for (const [threadKey, group] of byKey) {
    const distinctContent = new Set(group.rows.map((row) => row.contentItemId));
    if (distinctContent.size < 2) continue;

    conflicts.push({
      threadKey,
      sampleUrl: group.sampleUrl,
      jobs: group.rows.map((row) => ({
        jobId: row.jobId,
        contentTitle: row.contentTitle,
        accountUsername: row.accountUsername,
      })),
    });
  }

  return conflicts;
}

export async function loadDuplicatePostedUrls(): Promise<DuplicatePostedUrl[]> {
  const jobs = await prisma.postJob.findMany({
    where: { status: "POSTED", postedUrl: { not: null } },
    select: {
      id: true,
      contentItemId: true,
      postedUrl: true,
      contentItem: { select: { title: true } },
      account: { select: { username: true } },
    },
  });

  return findDuplicatePostedUrls(
    jobs.flatMap((job) => {
      const postedUrl = job.postedUrl?.trim();
      if (!postedUrl) return [];
      return [
        {
          jobId: job.id,
          contentItemId: job.contentItemId,
          contentTitle: job.contentItem.title,
          accountUsername: job.account.username,
          postedUrl,
        },
      ];
    }),
  );
}
