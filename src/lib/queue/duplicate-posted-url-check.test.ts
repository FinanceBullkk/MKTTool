import { describe, expect, it } from "vitest";
import { findDuplicatePostedUrls } from "./duplicate-posted-url-check";

function job(overrides: Partial<Parameters<typeof findDuplicatePostedUrls>[0][number]> = {}) {
  return {
    jobId: "job-1",
    contentItemId: "content-1",
    contentTitle: "Post A",
    accountUsername: "nick-1",
    postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/a/",
    ...overrides,
  };
}

describe("findDuplicatePostedUrls", () => {
  it("two different contents posting the same link is an error — report", () => {
    // Ca thật 04/08/2026: job thứ hai được bấm "Đã đăng" với link của bài thứ nhất, nên nội
    // dung của nó bị kho coi là đã đăng trong khi chưa từng lên Reddit.
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({ jobId: "job-2", contentItemId: "content-2", contentTitle: "Post B" }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.threadKey).toBe("reddit:1veg99o");
    expect(conflicts[0]?.jobs.map((entry) => entry.contentTitle)).toEqual(["Post A", "Post B"]);
  });

  it("Posting the same content with the same link does NOT report", () => {
    // Chuyện bình thường và có thật: một bài xếp lịch hai lần, hoặc đăng lại đúng bài đó.
    // Báo cả trường hợp này là dạy người dùng phớt lờ cảnh báo.
    const conflicts = findDuplicatePostedUrls([job(), job({ jobId: "job-2" })]);
    expect(conflicts).toEqual([]);
  });

  it("recognize as duplicate even if two links are in two different forms", () => {
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

  it("silent about two posts in two different links", () => {
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

  it("Can gather all three jobs or more into one group", () => {
    const conflicts = findDuplicatePostedUrls([
      job(),
      job({ jobId: "job-2", contentItemId: "content-2" }),
      job({ jobId: "job-3", contentItemId: "content-3" }),
    ]);

    expect(conflicts[0]?.jobs).toHaveLength(3);
  });

  it("Empty space doesn't report anything", () => {
    expect(findDuplicatePostedUrls([])).toEqual([]);
  });
});
