import { describe, expect, it } from "vitest";
import { parseRedditProfile, postsWithin } from "./reddit-profile-parser";

/** Rút gọn từ HTML thật của old.reddit.com — giữ đúng những thuộc tính bộ dò đọc tới. */
function profileHtml(things: string, karma = '<span class="karma">1,234</span>'): string {
  return `
    <div id="header-bottom-right">${karma}</div>
    <div id="siteTable">${things}</div>
  `;
}

function thing(
  type: "link" | "comment",
  timestamp: number,
  permalink = "/r/Trove/comments/1veg99o/tieu-de/",
): string {
  return (
    `<div class=" thing id-t3_abc odd ${type} " data-type="${type}" ` +
    `data-timestamp="${timestamp}" data-fullname="t3_1veg99o" data-permalink="${permalink}"></div>`
  );
}

const NOW = new Date("2026-08-03T00:00:00Z");
const DAY = 86_400_000;

describe("parseRedditProfile", () => {
  /**
   * Tín hiệu chính. Đo trên Reddit thật 03/08/2026: nick không tồn tại (và nick bị shadowban
   * toàn cục) trả HTTP 404, còn nick có thật trả 200.
   */
  it("returns MISSING for HTTP 404 regardless of page contents", () => {
    const parsed = parseRedditProfile({ html: profileHtml(""), status: 404 });
    expect(parsed.kind).toBe("MISSING");
  });

  /**
   * Hồi quy cho lỗi đo được 03/08/2026: trang 404 của Reddit KHÔNG còn câu "nobody on Reddit
   * goes by that name", nhưng vẫn có đủ header, thanh điều hướng và ô đăng nhập. Bản parser cũ
   * nhận nhầm nó là profile rỗng — tức là nick chết mà báo còn sống.
   */
  it("does not mistake a complete 404 page for an empty profile", () => {
    const notFound = '<div id="header-bottom-left">nav</div><h1>page not found</h1>';
    expect(parseRedditProfile({ html: notFound, status: 404 }).kind).toBe("MISSING");
    // Ngay cả khi mất mã HTTP, tiêu đề trang vẫn cứu được.
    expect(parseRedditProfile({ html: "<title>reddit.com: page not found</title>" }).kind).toBe(
      "MISSING",
    );
  });

  it("keeps recognizing Reddit's legacy missing-profile message", () => {
    const parsed = parseRedditProfile({ html: "<p>Sorry, nobody on Reddit goes by that name.</p>" });
    expect(parsed.kind).toBe("MISSING");
  });

  /** Reddit đổi HTML thì phải nói không đọc được — tuyệt đối không được im lặng báo khỏe. */
  it("returns UNPARSEABLE for unknown HTML instead of an empty profile", () => {
    const parsed = parseRedditProfile({ html: "<html><body><p>unknown page</p></body></html>" });
    expect(parsed.kind).toBe("UNPARSEABLE");
  });

  it("counts posts and comments separately", () => {
    const html = profileHtml(
      thing("link", NOW.getTime()) + thing("comment", NOW.getTime()) + thing("link", NOW.getTime()),
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts).toHaveLength(2);
    expect(parsed.commentCount).toBe(1);
  });

  it("adds post karma and comment karma", () => {
    const karma = '<span class="karma">1,200</span><span class="karma comment-karma">34</span>';
    const parsed = parseRedditProfile({ html: profileHtml("", karma), status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.karma).toBe(1234);
  });

  it("returns null instead of zero when the karma field is missing", () => {
    const parsed = parseRedditProfile({ html: '<div id="siteTable"></div>', status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    // 0 nghĩa là "đo được và bằng 0"; null nghĩa là "không đo được". Trộn hai thứ này
    // vào nhau là biểu đồ karma tụt xuống 0 mỗi lần Reddit đổi sidebar.
    expect(parsed.karma).toBeNull();
  });

  it("returns an empty post list for a real profile with no activity", () => {
    const parsed = parseRedditProfile({ html: profileHtml(""), status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts).toEqual([]);
  });

  /**
   * Khóa bài là thứ biến bộ dò từ ĐẾM thành ĐỐI CHIẾU. Nó phải sinh ra từ cùng
   * `normalizeThreadUrl()` mà luật 8 và job trong kho đang dùng, nếu không hai bên không
   * bao giờ ghép được với nhau.
   */
  it("reads the post key from data-permalink using the stored job format", () => {
    const parsed = parseRedditProfile({
      html: profileHtml(thing("link", NOW.getTime())),
      status: 200,
    });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts[0]?.threadKey).toBe("reddit:1veg99o");
  });

  it("falls back to data-fullname when data-permalink is missing", () => {
    const html = profileHtml(
      `<div class=" thing " data-type="link" data-timestamp="${NOW.getTime()}" ` +
        `data-fullname="t3_1veg99o"></div>`,
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts[0]?.threadKey).toBe("reddit:1veg99o");
  });

  /**
   * Link và tên sub đi cùng khóa bài vì chúng nằm trong ĐÚNG cái thẻ vòng lặp đã quét — không
   * tốn thêm request nào. Thiếu chúng thì bộ dò biết "có bài chưa ghi" mà không tự gán được
   * cho job nào: gán cần biết bài nằm ở sub nào và link đầy đủ để lưu vào kho.
   */
  it("reads the full URL and subreddit for each post", () => {
    const parsed = parseRedditProfile({
      html: profileHtml(thing("link", NOW.getTime())),
      status: 200,
    });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    // Link phải là dạng www để người dùng bấm vào, dù bộ dò đang xem bản old.
    expect(parsed.posts[0]?.permalinkUrl).toBe(
      "https://www.reddit.com/r/Trove/comments/1veg99o/tieu-de/",
    );
    expect(parsed.posts[0]?.subreddit).toBe("Trove");
  });

  it("falls back to data-subreddit when the permalink is incomplete", () => {
    const html = profileHtml(
      `<div class=" thing " data-type="link" data-timestamp="${NOW.getTime()}" ` +
        `data-fullname="t3_1veg99o" data-subreddit="selfhosted"></div>`,
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts[0]?.subreddit).toBe("selfhosted");
    // Không có permalink thì KHÔNG bịa ra link: kho chỉ nhận link do Reddit trả về.
    expect(parsed.posts[0]?.permalinkUrl).toBeNull();
  });

  it("counts posts without identifiers but cannot match them", () => {
    // Đếm được mà không nhận dạng được thì vẫn hơn bỏ sót: bỏ qua bài này là thu nhỏ con số
    // "người ngoài thấy mấy bài", tức làm một nick đang bị ẩn trông khỏe hơn thực tế.
    const html = profileHtml(
      `<div class=" thing " data-type="link" data-timestamp="${NOW.getTime()}"></div>`,
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts).toHaveLength(1);
    expect(parsed.posts[0]?.threadKey).toBeNull();
  });
});

describe("postsWithin", () => {
  const at = (daysAgo: number) => ({
    timestamp: NOW.getTime() - daysAgo * DAY,
    threadKey: null,
    permalinkUrl: null,
    subreddit: null,
  });

  it("keeps only posts inside the observation window", () => {
    expect(postsWithin([at(1), at(6), at(30)], 7, NOW)).toHaveLength(2);
  });

  it("returns an empty array when there are no posts", () => {
    expect(postsWithin([], 7, NOW)).toEqual([]);
  });
});
