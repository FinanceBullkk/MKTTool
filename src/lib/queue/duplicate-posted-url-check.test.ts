import { describe, expect, it } from "vitest";
import { findDuplicatePostedUrls } from "./duplicate-posted-url-check";

function job(overrides: Partial<Parameters<typeof findDuplicatePostedUrls>[0][number]> = {}) {
  return {
    jobId: "job-1",
    contentItemId: "content-1",
    contentTitle: "Bài A",
    accountUsername: "nick-1",
    postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/a/",
    ...overrides,
  };
}

describe("findDuplicatePostedUrls", () => {
  it("hai content khác nhau dán cùng một link là lỗi — báo", () => {
    // Ca thật 04/08/2026: job thứ hai được bấm "Đã đăng" với link của bài thứ nhất, nên nội
    // dung của nó bị kho coi là đã đăng trong khi chưa từng lên Reddit.
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({ jobId: "job-2", contentItemId: "content-2", contentTitle: "Bài B" }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.threadKey).toBe("reddit:1veg99o");
    expect(conflicts[0]?.jobs.map((entry) => entry.contentTitle)).toEqual(["Bài A", "Bài B"]);
  });

  it("cùng một content dán cùng link thì KHÔNG báo", () => {
    // Chuyện bình thường và có thật: một bài xếp lịch hai lần, hoặc đăng lại đúng bài đó.
    // Báo cả trường hợp này là dạy người dùng phớt lờ cảnh báo.
    const conflicts = findDuplicatePostedUrls([job(), job({ jobId: "job-2" })]);
    expect(conflicts).toEqual([]);
  });

  it("nhận ra trùng dù hai link ở hai dạng khác nhau", () => {
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({
        jobId: "job-2",
        contentItemId: "content-2",
        postedUrl: "https://old.reddit.com/r/Trove/comments/1veg99o/?utm_source=share",
      }),
    ]);

    expect(conflicts).toHaveLength(1);
  });

  it("hai bài khác nhau ở hai link khác nhau thì im lặng", () => {
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({
        jobId: "job-2",
        contentItemId: "content-2",
        postedUrl: "https://www.reddit.com/r/Trove/comments/2xyz789/b/",
      }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it("gom được cả ba job trở lên vào một nhóm", () => {
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({ jobId: "job-2", contentItemId: "content-2" }),
      job({ jobId: "job-3", contentItemId: "content-3" }),
    ]);

    expect(conflicts[0]?.jobs).toHaveLength(3);
  });

  it("kho trống thì không báo gì", () => {
    expect(findDuplicatePostedUrls([])).toEqual([]);
  });
});
