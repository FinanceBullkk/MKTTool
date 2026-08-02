/**
 * Dò một nick Reddit từ góc nhìn người ngoài: mở trang profile công khai qua proxy quan sát
 * viên, đọc số liệu, quy về kết luận.
 *
 * File này chỉ nối các mảnh lại — mọi phán đoán nằm ở `health-status-evaluator.ts`, mọi việc
 * đọc HTML nằm ở `reddit-profile-parser.ts`, cả hai đều là hàm thuần và đã có test riêng.
 */
import { detectCheckpoint } from "./checkpoint-detector";
import { type HealthEvaluation, evaluateHealth } from "./health-status-evaluator";
import type { ObserverSession } from "./observer-browser-session";
import { countPostsWithin, parseRedditProfile } from "./reddit-profile-parser";

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
}

/** Bản `old` trả HTML đầy đủ ngay lượt đầu — xem giải thích ở reddit-profile-parser.ts. */
export function redditProfileUrl(username: string): string {
  return `https://old.reddit.com/user/${encodeURIComponent(username)}/`;
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
  options: { username: string; expectedPosts: number; now?: Date },
): Promise<ProbeResult> {
  const { username, expectedPosts, now = new Date() } = options;

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
    };
  }

  const checkpoint = detectCheckpoint({ url: page.url, html: page.html });
  const profile = parseRedditProfile({ html: page.html, status: page.status });

  const visiblePosts =
    profile.kind === "OK"
      ? countPostsWithin(profile.postTimestamps, OBSERVATION_WINDOW_DAYS, now)
      : null;

  const evaluation = evaluateHealth({
    checkpoint,
    profile,
    navigationError: null,
    expectedPosts,
    visiblePosts,
    windowDays: OBSERVATION_WINDOW_DAYS,
  });

  return {
    evaluation,
    karma: profile.kind === "OK" ? profile.karma : null,
    visiblePosts,
    expectedPosts,
    screenshot: shouldKeepScreenshot(evaluation) ? page.screenshot : null,
  };
}
