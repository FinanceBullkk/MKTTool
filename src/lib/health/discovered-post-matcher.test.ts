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
  it("quy mọi cách viết tên sub về một khóa", () => {
    // Đích trong kho lưu `r/Trove`, permalink trả `Trove`, người dùng có thể gõ cả URL.
    expect(subredditKey("r/Trove")).toBe("trove");
    expect(subredditKey("Trove")).toBe("trove");
    expect(subredditKey("https://reddit.com/r/trove/")).toBe("trove");
  });
});

describe("matchDiscoveredPosts", () => {
  it("một bài, một job cùng sub, đúng giờ, khớp tiêu đề → gán", () => {
    const outcome = matchDiscoveredPosts([post()], [job()]);

    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0].jobId).toBe("job-1");
    expect(outcome.ambiguous).toHaveLength(0);
  });

  it("khác sub thì không gán, dù tiêu đề khớp", () => {
    const outcome = matchDiscoveredPosts([post()], [job({ subreddit: "r/selfhosted" })]);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("không có job nào đang chờ");
  });

  it("đăng cách giờ dự kiến quá 24 tiếng thì không gán", () => {
    const outcome = matchDiscoveredPosts(
      [post({ postedAt: new Date(SCHEDULED.getTime() + 30 * HOUR) })],
      [job()],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("quá 24 tiếng");
  });

  it("đúng ca 04/08/2026: cùng sub, đúng giờ, nhưng tiêu đề là bài khác → KHÔNG gán", () => {
    // Nếu bộ ghép bỏ cửa tiêu đề, nó sẽ tự tạo lại đúng lỗi dán nhầm link phải sửa bằng tay.
    const outcome = matchDiscoveredPosts(
      [post()],
      [job({ contentTitle: "Looking for a game similar to trove" })],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("tiêu đề");
  });

  it("hai job cùng khớp một bài thì không chọn hộ", () => {
    const outcome = matchDiscoveredPosts([post()], [job(), job({ id: "job-2" })]);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous[0].reason).toContain("không dám chọn hộ");
  });

  it("hai bài cùng khớp một job thì KHÔNG bài nào được gán", () => {
    // Ca này từng là chỗ dễ sai nhất: gán bài đầu rồi từ chối bài sau nghe có vẻ hợp lý, nhưng
    // thứ tự đọc trang không phải bằng chứng về bài nào là bài thật.
    const outcome = matchDiscoveredPosts(
      [post(), post({ threadKey: "reddit:abc999", permalinkUrl: post().permalinkUrl.replace("1veg99o", "abc999") })],
      [job()],
    );

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous).toHaveLength(2);
    expect(outcome.ambiguous[0].reason).toContain("2 bài cùng khớp một job");
  });

  it("bài đăng ngoài công cụ vẫn được nêu ra kèm lý do, không bị nuốt", () => {
    // Nick mua lại hoặc bài nuôi nick — không gán được là đúng, nhưng im lặng thì sai:
    // bài không được ghi làm bốn luật giữ nhịp đếm thiếu.
    const outcome = matchDiscoveredPosts([post()], []);

    expect(outcome.matches).toHaveLength(0);
    expect(outcome.ambiguous).toHaveLength(1);
    expect(outcome.ambiguous[0].post.threadKey).toBe("reddit:1veg99o");
  });
});
