import { describe, expect, it } from "vitest";
import { countDistinctPostedUrls, nextAccountStatus } from "./health-check-recorder";

/**
 * Quy tắc một chiều: bộ dò được phép cách ly nick, KHÔNG được phép gỡ cách ly.
 * Một lần dò khỏe sau khi dính shadowban chỉ chứng minh lần dò đó không thấy vấn đề.
 */
describe("nextAccountStatus", () => {
  it("quarantines a healthy nick when it is shadowbanned", () => {
    expect(nextAccountStatus("ALIVE", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("quarantines a healthy nick when it hits a checkpoint", () => {
    expect(nextAccountStatus("ALIVE", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("can quarantine a nick during cold start", () => {
    expect(nextAccountStatus("COLD_START", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("does not automatically clear quarantine after a healthy check", () => {
    expect(nextAccountStatus("SHADOWBANNED", "HEALTHY")).toBeNull();
    expect(nextAccountStatus("CHECKPOINT", "HEALTHY")).toBeNull();
  });

  it("does not change status for a warning", () => {
    expect(nextAccountStatus("ALIVE", "WARN")).toBeNull();
  });

  it("does not change status when the checker fails", () => {
    expect(nextAccountStatus("ALIVE", "ERROR")).toBeNull();
  });

  it("does not move a dead nick to a less severe status", () => {
    expect(nextAccountStatus("DEAD", "SHADOWBANNED")).toBeNull();
    expect(nextAccountStatus("DEAD", "CHECKPOINT")).toBeNull();
  });

  it("moves a shadowbanned nick to the more severe checkpoint status", () => {
    expect(nextAccountStatus("SHADOWBANNED", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("does not rewrite an unchanged status", () => {
    expect(nextAccountStatus("SHADOWBANNED", "SHADOWBANNED")).toBeNull();
  });
});

/**
 * Mẫu số của phép đối chiếu shadowban. Sai ở đây thì kết luận sai theo — mà sai theo hướng
 * "thấy ít hơn dự kiến" chính là hướng bắn cảnh báo giả cho một nick đang khỏe.
 */
describe("countDistinctPostedUrls", () => {
  it("counts duplicate posted URLs as one post", () => {
    // Đúng tình huống đo được 04/08/2026: nick có 2 job POSTED cùng trỏ vào
    // .../comments/1veg99o/..., mẫu số thành 2 trong khi ngoài đời chỉ có một bài.
    const url = "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive/";
    expect(countDistinctPostedUrls([{ postedUrl: url }, { postedUrl: url }])).toBe(1);
  });

  it("counts URL variants for the same post only once", () => {
    expect(
      countDistinctPostedUrls([
        { postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive/" },
        { postedUrl: "https://old.reddit.com/r/Trove/comments/1veg99o/?utm_source=share" },
      ]),
    ).toBe(1);
  });

  it("counts different posts separately", () => {
    expect(
      countDistinctPostedUrls([
        { postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/a/" },
        { postedUrl: "https://www.reddit.com/r/Trove/comments/2abcdef/b/" },
      ]),
    ).toBe(2);
  });

  it("counts each job without a posted URL separately", () => {
    // Bỏ qua là thu nhỏ mẫu số, làm một nick đang bị ẩn trông khỏe hơn thực tế.
    expect(
      countDistinctPostedUrls([{ postedUrl: null }, { postedUrl: null }, { postedUrl: "  " }]),
    ).toBe(3);
  });

  it("counts jobs with and without posted URLs together", () => {
    const url = "https://www.reddit.com/r/Trove/comments/1veg99o/a/";
    expect(
      countDistinctPostedUrls([{ postedUrl: url }, { postedUrl: url }, { postedUrl: null }]),
    ).toBe(2);
  });

  it("returns zero when there are no jobs", () => {
    expect(countDistinctPostedUrls([])).toBe(0);
  });
});
