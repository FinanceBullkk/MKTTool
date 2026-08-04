/**
 * Dò một nick Reddit từ góc nhìn người ngoài: mở trang profile công khai qua proxy quan sát
 * viên, đọc số liệu, quy về kết luận.
 *
 * File này chỉ nối các mảnh lại — mọi phán đoán nằm ở `health-status-evaluator.ts`, mọi việc
 * đọc HTML nằm ở `reddit-profile-parser.ts`, cả hai đều là hàm thuần và đã có test riêng.
 */
import { detectCheckpoint } from "./checkpoint-detector";
import type { DiscoveredPost } from "./discovered-post-matcher";
import { type HealthEvaluation, evaluateHealth } from "./health-status-evaluator";
import type { ObserverSession } from "./observer-browser-session";
import { type VisiblePost, parseRedditProfile, postsWithin } from "./reddit-profile-parser";

/**
 * Chỉ soi 7 ngày gần nhất. Trang đầu của profile là đủ cho ngần đó, nên không phải lật trang —
 * mà lật trang chính là chỗ đếm sai hay xảy ra nhất.
 */
export const OBSERVATION_WINDOW_DAYS = 7;

export interface ProbeResult {
  evaluation: HealthEvaluation;
  karma: number | null;
  visiblePosts: number | null;
  expectedPosts: number;
  /** Chỉ có khi kết luận đáng để nhìn lại bằng mắt. Kết luận khỏe thì không giữ ảnh. */
  screenshot: Buffer | null;
  /** Khóa của những bài vừa được `resolveUntracked` gán vào kho ngay trong lượt dò này. */
  autoLinkedKeys: string[];
  /**
   * Bài lạ nhận dạng được nhưng THIẾU link hoặc tên sub, nên không thể tự gán.
   *
   * Đếm riêng chứ không bỏ lặng: nếu Reddit bỏ `data-permalink` thì con số này nhảy lên và mọi
   * bài lạ ngừng được gán, mà triệu chứng duy nhất người dùng thấy là "bấm nút không có gì xảy
   * ra". Một bộ dò hỏng trong im lặng đúng là thứ cả file này sinh ra để tránh.
   */
  unlinkablePosts: number;
}

/** Bản `old` trả HTML đầy đủ ngay lượt đầu — xem giải thích ở reddit-profile-parser.ts. */
export function redditProfileUrl(username: string): string {
  // Cắt khoảng trắng ngay tại đây nữa, dù schema đã cắt lúc lưu: bản ghi cũ nhập trước khi có
  // ràng buộc đó vẫn còn trong kho, và một khoảng trắng thừa thành `%20` trong URL — đủ để
  // Reddit trả 404 và bộ dò kết luận nick bị ẩn.
  return `https://old.reddit.com/user/${encodeURIComponent(username.trim())}/`;
}

/**
 * Kết luận nào đáng giữ lại ảnh màn hình để người soi bằng mắt.
 *
 * `NO_BASELINE` không nằm trong đó dù nó không phải "khỏe": trang profile lúc đó trông hoàn
 * toàn bình thường, thứ thiếu nằm ở phía mình (chưa đánh dấu bài nào) chứ không phải ở trang.
 * Ảnh chụp không cho biết thêm gì, chỉ tốn đĩa mỗi ngày cho mọi nick đang nghỉ.
 */
function shouldKeepScreenshot(evaluation: HealthEvaluation): boolean {
  return evaluation.verdict !== "HEALTHY" && evaluation.verdict !== "NO_BASELINE";
}

export async function probeRedditAccount(
  session: ObserverSession,
  options: {
    username: string;
    expectedPosts: number;
    now?: Date;
    /** Xem `HealthEvaluationInput.profileSeenBefore` — chỉ dùng cho nhánh 404. */
    profileSeenBefore?: boolean;
    /**
     * Khóa thread của những job đã đánh dấu đăng trong cửa sổ quan sát.
     *
     * Có nó thì bộ dò chuyển từ ĐẾM sang ĐỐI CHIẾU: biết được bài nào trên profile không có
     * job tương ứng, và job nào khai đã đăng mà không thấy bài. Bỏ trống thì mọi thứ chạy y
     * như cũ, chỉ so số lượng.
     */
    recordedPostKeys?: readonly string[];
    /**
     * Cơ hội ghi những bài lạ vào kho TRƯỚC khi kết luận, trả về khóa của các bài đã ghi được.
     *
     * Tiêm vào chứ không gọi thẳng: file này cố ý không chạm database. Và phải chạy trước lúc
     * kết luận chứ không phải sau — nếu không, bản ghi HealthCheck sẽ vĩnh viễn nói "có N bài
     * chưa ghi" về đúng những bài vừa được ghi xong, và người đọc bảng sẽ đi tìm một lỗi đã
     * được sửa.
     */
    resolveUntracked?: (posts: readonly DiscoveredPost[]) => Promise<readonly string[]>;
  },
): Promise<ProbeResult> {
  const {
    username,
    expectedPosts,
    now = new Date(),
    profileSeenBefore = false,
    recordedPostKeys = [],
    resolveUntracked,
  } = options;

  let page: Awaited<ReturnType<ObserverSession["fetchPage"]>>;
  try {
    page = await session.fetchPage(redditProfileUrl(username));
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      evaluation: evaluateHealth({
        checkpoint: null,
        profile: null,
        navigationError: reason,
        expectedPosts,
        visiblePosts: null,
        windowDays: OBSERVATION_WINDOW_DAYS,
      }),
      karma: null,
      visiblePosts: null,
      expectedPosts,
      screenshot: null,
      autoLinkedKeys: [],
      unlinkablePosts: 0,
    };
  }

  const checkpoint = detectCheckpoint({ url: page.url, html: page.html });
  const profile = parseRedditProfile({ html: page.html, status: page.status });

  const visibleInWindow =
    profile.kind === "OK" ? postsWithin(profile.posts, OBSERVATION_WINDOW_DAYS, now) : null;
  const visiblePosts = visibleInWindow?.length ?? null;

  // Chỉ đối chiếu những bài ĐỌC ĐƯỢC khóa. Bài không có khóa vẫn được đếm vào `visiblePosts`
  // nhưng không bị coi là "chưa ghi" — không nhận dạng được thì không kết tội được.
  const recorded = new Set(recordedPostKeys);
  const visibleKeys = new Set(
    (visibleInWindow ?? []).map((post) => post.threadKey).filter((key): key is string => key !== null),
  );

  const untrackedPostKeys = [...visibleKeys].filter((key) => !recorded.has(key));
  const missingPostKeys = [...recorded].filter((key) => !visibleKeys.has(key));

  // Gán trước, kết luận sau. Bài vừa gán xong không còn là "bài chưa ghi", và nó nâng mẫu số
  // lên đúng một job — nên mọi con số dưới đây phải là con số SAU khi gán.
  const discoverable = toDiscoverable(visibleInWindow ?? [], new Set(untrackedPostKeys));
  const autoLinkedKeys =
    discoverable.length > 0 && resolveUntracked ? [...(await resolveUntracked(discoverable))] : [];

  const linked = new Set(autoLinkedKeys);
  const expectedAfterLinking = expectedPosts + linked.size;

  const evaluation = evaluateHealth({
    checkpoint,
    profile,
    navigationError: null,
    expectedPosts: expectedAfterLinking,
    visiblePosts,
    windowDays: OBSERVATION_WINDOW_DAYS,
    profileSeenBefore,
    untrackedPostKeys: untrackedPostKeys.filter((key) => !linked.has(key)),
    // Chỉ có nghĩa khi đã đọc được danh sách bài — không đọc được thì "không thấy" là
    // vì bộ dò mù, không phải vì bài biến mất.
    missingPostKeys: visibleInWindow ? missingPostKeys : [],
  });

  return {
    evaluation,
    karma: profile.kind === "OK" ? profile.karma : null,
    visiblePosts,
    expectedPosts: expectedAfterLinking,
    screenshot: shouldKeepScreenshot(evaluation) ? page.screenshot : null,
    autoLinkedKeys,
    unlinkablePosts: untrackedPostKeys.length - discoverable.length,
  };
}

/**
 * Giữ lại những bài lạ có ĐỦ dữ liệu để gán: khóa, link, tên sub.
 *
 * Bài thiếu một trong ba vẫn được đếm vào `visiblePosts` và vẫn làm nên kết luận "Có bài chưa
 * ghi" — chỉ là không tự gán được. Bịa nốt phần thiếu để gán cho đủ là đúng kiểu sai mà cả
 * tính năng này sinh ra để dọn.
 */
function toDiscoverable(
  posts: readonly VisiblePost[],
  untrackedKeys: ReadonlySet<string>,
): DiscoveredPost[] {
  return posts.flatMap((post) => {
    if (!post.threadKey || !untrackedKeys.has(post.threadKey)) return [];
    if (!post.permalinkUrl || !post.subreddit) return [];

    return [
      {
        threadKey: post.threadKey,
        permalinkUrl: post.permalinkUrl,
        subreddit: post.subreddit,
        postedAt: new Date(post.timestamp),
      },
    ];
  });
}
