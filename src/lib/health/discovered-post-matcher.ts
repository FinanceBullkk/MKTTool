/**
 * Ghép một bài lạ thấy trên profile với job đang chờ trong kho.
 *
 * Hàm thuần — đây là chỗ chứa toàn bộ phán đoán "có chắc đây là job đó không", nên nó phải
 * test được hết nhánh mà không cần proxy, không cần database.
 *
 * Nguyên tắc chi phối mọi thứ dưới đây: **hai kiểu sai không cân nhau.**
 *
 *  - Bỏ sót một bài khớp → người dùng bấm "Đã đăng" bằng tay như trước. Mất vài giây.
 *  - Gán nhầm bài của job này cho job kia → chính là ca 04/08/2026 phải sửa bằng tay: luật 7
 *    coi nội dung chưa đăng là đã đăng, luật 4/5/6 đếm sai, và không màn hình nào đỏ lên.
 *
 * Nên khi còn nghi ngờ thì KHÔNG gán. Ba cửa phải qua hết: cùng sub, đúng cửa sổ thời gian,
 * và slug tiêu đề khớp. Còn lại đúng một ứng viên mới ghi.
 */
import { titleMatchesPermalink } from "./reddit-title-slug-match";

/**
 * Bài đăng thật cách giờ dự kiến bao xa thì vẫn coi là cùng một job.
 *
 * 24 tiếng vì lịch trong công cụ là giờ DỰ KIẾN, không phải hẹn giờ tự đăng — người đăng trễ
 * nửa ngày là chuyện thường. Rộng hơn nữa thì hai job cách nhau một ngày ở cùng sub bắt đầu
 * chồng cửa sổ lên nhau, và ca chồng cửa sổ luôn kết thúc bằng "không gán".
 */
export const MATCH_WINDOW_HOURS = 24;

export interface DiscoveredPost {
  /** Khóa thread đã chuẩn hóa — cùng dạng khóa với `PostJob.postedUrl`. */
  threadKey: string;
  /** Link đầy đủ do Reddit trả về; đây là thứ sẽ được ghi vào kho. */
  permalinkUrl: string;
  subreddit: string;
  /** Giờ đăng thật, đọc từ `data-timestamp`. */
  postedAt: Date;
}

export interface CandidateJob {
  id: string;
  /** Tên sub của đích, đã rút khỏi `PlatformTarget.name` hoặc `url`. */
  subreddit: string;
  scheduledAt: Date;
  contentTitle: string;
}

export interface PostMatch {
  post: DiscoveredPost;
  jobId: string;
}

export interface AmbiguousPost {
  post: DiscoveredPost;
  /** Vì sao không dám gán — hiện thẳng cho người dùng, không nuốt. */
  reason: string;
}

export interface MatchOutcome {
  matches: PostMatch[];
  ambiguous: AmbiguousPost[];
}

/** `r/Trove`, `/r/trove/`, `https://reddit.com/r/Trove` → `trove`. */
export function subredditKey(raw: string): string {
  const fromUrl = /(?:^|\/)r\/([^/?#\s]+)/i.exec(raw.trim())?.[1];
  return (fromUrl ?? raw.trim()).toLowerCase();
}

function withinWindow(post: DiscoveredPost, job: CandidateJob): boolean {
  const gapMs = Math.abs(post.postedAt.getTime() - job.scheduledAt.getTime());
  return gapMs <= MATCH_WINDOW_HOURS * 3_600_000;
}

/**
 * Ghép từng bài lạ với đúng một job, hoặc không ghép gì cả.
 *
 * Một job chỉ được nhận MỘT bài: hai bài cùng đòi một job nghĩa là đang có thứ mình chưa hiểu,
 * và đoán bừa lúc đó là cách chắc chắn nhất để ghi sai. Cả hai bài đều bị đẩy sang "mơ hồ".
 */
export function matchDiscoveredPosts(
  posts: readonly DiscoveredPost[],
  jobs: readonly CandidateJob[],
): MatchOutcome {
  const ambiguous: AmbiguousPost[] = [];
  // Lượt một: mỗi bài tự tìm job của nó. Chưa ghi gì, vì còn phải xem có bài nào tranh nhau.
  const claims = new Map<string, DiscoveredPost[]>();

  for (const post of posts) {
    const jobId = findSoleCandidate(post, jobs, ambiguous);
    if (!jobId) continue;
    claims.set(jobId, [...(claims.get(jobId) ?? []), post]);
  }

  // Lượt hai: job bị nhiều bài cùng đòi thì KHÔNG bài nào được gán. Cái sai lúc đó không nằm
  // ở bài nào cả, mà ở chỗ mình không phân biệt được chúng — chọn đại một cái là đoán bừa.
  const matches: PostMatch[] = [];
  for (const [jobId, claimants] of claims) {
    if (claimants.length === 1) {
      matches.push({ post: claimants[0], jobId });
      continue;
    }
    for (const post of claimants) {
      ambiguous.push({
        post,
        reason: `${claimants.length} posts match the same job, so the checker will not choose one automatically`,
      });
    }
  }

  return { matches, ambiguous };
}

/** Job duy nhất qua được cả ba cửa, hoặc `null` kèm lý do đã ghi vào `ambiguous`. */
function findSoleCandidate(
  post: DiscoveredPost,
  jobs: readonly CandidateJob[],
  ambiguous: AmbiguousPost[],
): string | null {
  const reject = (reason: string) => {
    ambiguous.push({ post, reason });
    return null;
  };

  const sameSub = jobs.filter((job) => subredditKey(job.subreddit) === subredditKey(post.subreddit));
  if (sameSub.length === 0) {
    return reject(`no pending job targets r/${post.subreddit}; was this post made outside the tool?`);
  }

  const inWindow = sameSub.filter((job) => withinWindow(post, job));
  if (inWindow.length === 0) {
    return reject(
      `all jobs for r/${post.subreddit} are more than ${MATCH_WINDOW_HOURS} hours from the post time`,
    );
  }

  const byTitle = inWindow.filter((job) => titleMatchesPermalink(job.contentTitle, post.permalinkUrl));
  if (byTitle.length === 0) {
    return reject("The title in the link does not match any job's content");
  }
  if (byTitle.length > 1) {
    return reject(`${byTitle.length} jobs match, so the checker will not choose one automatically`);
  }

  return byTitle[0].id;
}
