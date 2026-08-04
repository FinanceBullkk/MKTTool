/**
 * Tự gán link cho job, dựa trên bài mà bộ dò vừa thấy trên profile công khai.
 *
 * Đây là vế "đồng bộ" của bộ dò: trước đợt này nó chỉ CHỈ RA chỗ lệch ("Có bài chưa ghi") rồi
 * bảo người dùng vào /queue ghi tay. Nhưng dữ liệu để ghi đã nằm sẵn trong đúng trang vừa đọc —
 * permalink mang cả tên sub lẫn slug tiêu đề, `data-timestamp` mang giờ đăng thật.
 *
 * Ranh giới của file này: nó CHỈ ghi khi bộ ghép (discovered-post-matcher.ts) trả về đúng một
 * ứng viên qua cả ba cửa. Mọi phán đoán nằm ở đó, mọi việc chạm database nằm ở đây.
 *
 * Ghi bằng `markPostJobPosted` chứ không tự viết `prisma.update`: một bài đăng phải để lại đúng
 * một bộ dấu vết dù ai ghi — nếu không, luật 8 mù đúng ở những bài do bộ dò gán.
 */
import { prisma } from "@/lib/db/prisma-client";
import { OPEN_JOB_STATUSES } from "@/lib/content/content-types";
import { markPostJobPosted } from "@/lib/queue/post-job-mark-posted";
import {
  type AmbiguousPost,
  type CandidateJob,
  type DiscoveredPost,
  matchDiscoveredPosts,
} from "./discovered-post-matcher";

export interface AutoLinkResult {
  /** Khóa của những bài đã ghi được vào kho — bộ dò dùng nó để kết luận theo tình trạng SAU khi gán. */
  linkedKeys: string[];
  /** Bài thấy được mà không dám gán, kèm lý do — nêu ra chứ không nuốt. */
  ambiguous: AmbiguousPost[];
  /** Câu mô tả từng lần gán, để in ra log lượt dò. */
  lines: string[];
}

/** Job đang chờ của nick này ở các đích Reddit — mẫu ứng viên cho phép ghép. */
async function loadOpenJobs(accountId: string): Promise<CandidateJob[]> {
  const jobs = await prisma.postJob.findMany({
    where: {
      accountId,
      status: { in: OPEN_JOB_STATUSES },
      target: { platform: "REDDIT" },
    },
    select: {
      id: true,
      scheduledAt: true,
      target: { select: { name: true, url: true } },
      contentItem: { select: { title: true } },
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    // Tên đích là nguồn chính (`r/Trove`); url chỉ để đỡ khi ai đó đặt tên đích tự do.
    subreddit: job.target.name || job.target.url,
    scheduledAt: job.scheduledAt,
    contentTitle: job.contentItem.title,
  }));
}

/**
 * Gán link cho những job ghép được. Job BỊ CHẶN cũng gán được, có chủ ý: bài đã lên rồi thì
 * sổ sách phải phản ánh điều đó: giấu một bài đã đăng không làm nó biến mất khỏi Reddit, chỉ
 * làm bộ luật đếm thiếu.
 */
export async function autoLinkDiscoveredPosts(
  accountId: string,
  posts: readonly DiscoveredPost[],
): Promise<AutoLinkResult> {
  if (posts.length === 0) return { linkedKeys: [], ambiguous: [], lines: [] };

  const jobs = await loadOpenJobs(accountId);
  const { matches, ambiguous } = matchDiscoveredPosts(posts, jobs);

  const lines: string[] = [];
  const linkedKeys: string[] = [];

  for (const match of matches) {
    const written = await markPostJobPosted(match.jobId, match.post.permalinkUrl);
    if (!written.ok) {
      // Job vừa đổi trạng thái ở nơi khác giữa lúc dò. Không phải lỗi của ai, nhưng phải nói ra.
      ambiguous.push({ post: match.post, reason: `không ghi được: ${written.message}` });
      continue;
    }

    linkedKeys.push(match.post.threadKey);
    lines.push(`tự gán ${match.post.threadKey} → job ${match.jobId}`);

    // AuditLog là chỗ DUY NHẤT phân biệt "người bấm" với "bộ dò tự gán": Interaction dùng chung
    // một ghi chú cho mọi đường ghi (xem post-job-mark-posted.ts), nên nếu không ghi ở đây thì
    // sau này không ai truy được vì sao job đó thành đã đăng.
    await prisma.auditLog.create({
      data: {
        accountId,
        action: "HEALTH_AUTO_LINKED_POST",
        detail: `job ${match.jobId} ← ${match.post.permalinkUrl}`.slice(0, 500),
      },
    });
  }

  return { linkedKeys, ambiguous, lines };
}
