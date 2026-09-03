/**
 * Bộ ghép quyết định khi nào công cụ được TỰ GHI vào kho, nên phần lớn test dưới đây kiểm
 * những ca nó phải TỪ CHỐI.
 *
 * Lý do ở đầu discovered-post-matcher.ts: bỏ sót thì mất vài giây bấm tay, gán nhầm thì bộ luật
 * đếm sai trong im lặng. Mọi ngưỡng ở đây đều nghiêng về phía từ chối.
 */
import { describe, expect, it } from "vitest";
import {
  type CandidateJob,
  type DiscoveredPost,
  matchDiscoveredPosts,
  subredditKey,
} from "./discovered-post-matcher";

const SCHEDULED = new Date("2026-08-03T19:00:00Z");
const HOUR = 3_600_000;

function post(overrides: Partial<DiscoveredPost> = {}): DiscoveredPost {
  return {
    threadKey: "reddit:1veg99o",
    permalinkUrl:
      "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive_will_gamigo_continue_to/",
    subreddit: "Trove",
    postedAt: new Date(SCHEDULED.getTime() + 2 * HOUR),
    ...overrides,
  };
}

function job(overrides: Partial<CandidateJob> = {}): CandidateJob {
  return {
    id: "job-1",
    subreddit: "r/Trove",
    scheduledAt: SCHEDULED,
    contentTitle: "Is trove still alive? Will Gamigo continue to develop it?",
    ...overrides,
  };
}

describe("subredditKey", () => {
  it("normalizes subreddit names and URLs to one key", () => {
    // Đích trong kho lưu `r/Trove`, permalink trả `Trove`, người dùng có thể gõ cả URL.
    expect(subredditKey("r/Trove")).toBe("trove");
    expect(subredditKey("Trove")).toBe("trove");
    expect(subredditKey("https://reddit.com/r/trove/")).toBe("trove");
  });
});

describe("matchDiscoveredPosts", () => {
  it("matches one post to one job with the same subreddit, time, and title", () => {
    const outcome = matchDiscoveredPosts([post()], [job()]);

    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0].jobId).toBe("job-1");
    expect(outcome.ambiguous).toHaveLength(0);
  });

  it("does not match a different subreddit even when the title matches", () => {
    const outcome = matchDiscoveredPosts([post()], [job({ subreddit: "r/selfhosted" })]);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("no pending job targets");
  });

  it("does not match a post more than 24 hours from the scheduled time", () => {
    const outcome = matchDiscoveredPosts(
      [post({ postedAt: new Date(SCHEDULED.getTime() + 30 * HOUR) })],
      [job()],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("more than 24 hours");
  });

  it("does not match the same subreddit and time when the title differs", () => {
    // Nếu bộ ghép bỏ cửa tiêu đề, nó sẽ tự tạo lại đúng lỗi dán nhầm link phải sửa bằng tay.
    const outcome = matchDiscoveredPosts(
      [post()],
      [job({ contentTitle: "Looking for a game similar to trove" })],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("title");
  });

  it("does not choose when two jobs match one post", () => {
    const outcome = matchDiscoveredPosts([post()], [job(), job({ id: "job-2" })]);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("will not choose one automatically");
  });

  it("does not link either post when two posts match one job", () => {
    // Ca này từng là chỗ dễ sai nhất: gán bài đầu rồi từ chối bài sau nghe có vẻ hợp lý, nhưng
    // thứ tự đọc trang không phải bằng chứng về bài nào là bài thật.
    const outcome = matchDiscoveredPosts(
      [post(), post({ threadKey: "reddit:abc999", permalinkUrl: post().permalinkUrl.replace("1veg99o", "abc999") })],
      [job()],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous).toHaveLength(2);
    expect(outcome.ambiguous[0].reason).toContain("2 posts match the same job");
  });

  it("returns unmatched external posts with a reason", () => {
    // Nick mua lại hoặc bài nuôi nick — không gán được là đúng, nhưng im lặng thì sai:
    // bài không được ghi làm bốn luật giữ nhịp đếm thiếu.
    const outcome = matchDiscoveredPosts([post()], []);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous).toHaveLength(1);
    expect(outcome.ambiguous[0].post.threadKey).toBe("reddit:1veg99o");
  });
});
