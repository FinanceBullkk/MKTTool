import { describe, expect, it } from "vitest";
import { countDistinctPostedUrls, nextAccountStatus } from "./health-check-recorder";

/**
 * Quy tắc một chiều: bộ dò được phép cách ly nick, KHÔNG được phép gỡ cách ly.
 * Một lần dò khỏe sau khi dính shadowban chỉ chứng minh lần dò đó không thấy vấn đề.
 */
describe("nextAccountStatus", () => {
  it("nick khỏe bị phát hiện ẩn thì cách ly", () => {
    expect(nextAccountStatus("ALIVE", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("nick khỏe dính checkpoint thì cách ly", () => {
    expect(nextAccountStatus("ALIVE", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("nick đang cold-start vẫn cách ly được", () => {
    expect(nextAccountStatus("COLD_START", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("dò khỏe KHÔNG tự gỡ cách ly — quyết định đó là của người", () => {
    expect(nextAccountStatus("SHADOWBANNED", "HEALTHY")).toBeNull();
    expect(nextAccountStatus("CHECKPOINT", "HEALTHY")).toBeNull();
  });

  it("WARN không đổi trạng thái — mod xóa bài cũng cho ra WARN", () => {
    expect(nextAccountStatus("ALIVE", "WARN")).toBeNull();
  });

  it("ERROR không đổi trạng thái — bộ dò đang mù thì không kết luận gì", () => {
    expect(nextAccountStatus("ALIVE", "ERROR")).toBeNull();
  });

  it("nick đã chết thì không leo ngược lên trạng thái nhẹ hơn", () => {
    expect(nextAccountStatus("DEAD", "SHADOWBANNED")).toBeNull();
    expect(nextAccountStatus("DEAD", "CHECKPOINT")).toBeNull();
  });

  it("checkpoint nặng hơn bị ẩn nên vẫn leo tiếp được", () => {
    expect(nextAccountStatus("SHADOWBANNED", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("đang ở đúng trạng thái đó rồi thì không ghi lại", () => {
    expect(nextAccountStatus("SHADOWBANNED", "SHADOWBANNED")).toBeNull();
  });
});

/**
 * Mẫu số của phép đối chiếu shadowban. Sai ở đây thì kết luận sai theo — mà sai theo hướng
 * "thấy ít hơn dự kiến" chính là hướng bắn cảnh báo giả cho một nick đang khỏe.
 */
describe("countDistinctPostedUrls", () => {
  it("hai job dán TRÙNG một link chỉ tính là một bài", () => {
    // Đúng tình huống đo được 04/08/2026: nick có 2 job POSTED cùng trỏ vào
    // .../comments/1veg99o/..., mẫu số thành 2 trong khi ngoài đời chỉ có một bài.
    const url = "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive/";
    expect(countDistinctPostedUrls([{ postedUrl: url }, { postedUrl: url }])).toBe(1);
  });

  it("cùng một bài ở hai dạng URL khác nhau vẫn chỉ là một bài", () => {
    expect(
      countDistinctPostedUrls([
        { postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive/" },
        { postedUrl: "https://old.reddit.com/r/Trove/comments/1veg99o/?utm_source=share" },
      ]),
    ).toBe(1);
  });

  it("hai bài khác nhau thì đếm đủ hai", () => {
    expect(
      countDistinctPostedUrls([
        { postedUrl: "https://www.reddit.com/r/Trove/comments/1veg99o/a/" },
        { postedUrl: "https://www.reddit.com/r/Trove/comments/2abcdef/b/" },
      ]),
    ).toBe(2);
  });

  it("job chưa dán link thì đếm riêng từng cái, không bỏ qua", () => {
    // Bỏ qua là thu nhỏ mẫu số, làm một nick đang bị ẩn trông khỏe hơn thực tế.
    expect(
      countDistinctPostedUrls([{ postedUrl: null }, { postedUrl: null }, { postedUrl: "  " }]),
    ).toBe(3);
  });

  it("trộn job có link và không link thì cộng cả hai phần", () => {
    const url = "https://www.reddit.com/r/Trove/comments/1veg99o/a/";
    expect(
      countDistinctPostedUrls([{ postedUrl: url }, { postedUrl: url }, { postedUrl: null }]),
    ).toBe(2);
  });

  it("không có job nào thì mẫu số bằng 0", () => {
    expect(countDistinctPostedUrls([])).toBe(0);
  });
});
