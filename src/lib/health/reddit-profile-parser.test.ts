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
  it("HTTP 404 là MISSING, bất kể trang chứa chữ gì", () => {
    const parsed = parseRedditProfile({ html: profileHtml(""), status: 404 });
    expect(parsed.kind).toBe("MISSING");
  });

  /**
   * Hồi quy cho lỗi đo được 03/08/2026: trang 404 của Reddit KHÔNG còn câu "nobody on Reddit
   * goes by that name", nhưng vẫn có đủ header, thanh điều hướng và ô đăng nhập. Bản parser cũ
   * nhận nhầm nó là profile rỗng — tức là nick chết mà báo còn sống.
   */
  it("trang 404 đầy đủ khung sườn KHÔNG bị nhận nhầm là profile rỗng", () => {
    const notFound = '<div id="header-bottom-left">nav</div><h1>page not found</h1>';
    expect(parseRedditProfile({ html: notFound, status: 404 }).kind).toBe("MISSING");
    // Ngay cả khi mất mã HTTP, tiêu đề trang vẫn cứu được.
    expect(parseRedditProfile({ html: "<title>reddit.com: page not found</title>" }).kind).toBe(
      "MISSING",
    );
  });

  it("giữ nhận diện câu chữ cũ của Reddit", () => {
    const parsed = parseRedditProfile({ html: "<p>Sorry, nobody on Reddit goes by that name.</p>" });
    expect(parsed.kind).toBe("MISSING");
  });

  /** Reddit đổi HTML thì phải nói không đọc được — tuyệt đối không được im lặng báo khỏe. */
  it("HTML lạ trả về UNPARSEABLE chứ không phải hồ sơ rỗng", () => {
    const parsed = parseRedditProfile({ html: "<html><body><p>trang gì đó</p></body></html>" });
    expect(parsed.kind).toBe("UNPARSEABLE");
  });

  it("đếm bài và comment tách nhau", () => {
    const html = profileHtml(
      thing("link", NOW.getTime()) + thing("comment", NOW.getTime()) + thing("link", NOW.getTime()),
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts).toHaveLength(2);
    expect(parsed.commentCount).toBe(1);
  });

  it("cộng karma bài với karma comment", () => {
    const karma = '<span class="karma">1,200</span><span class="karma comment-karma">34</span>';
    const parsed = parseRedditProfile({ html: profileHtml("", karma), status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.karma).toBe(1234);
  });

  it("không có ô karma thì trả null, không trả 0", () => {
    const parsed = parseRedditProfile({ html: '<div id="siteTable"></div>', status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    // 0 nghĩa là "đo được và bằng 0"; null nghĩa là "không đo được". Trộn hai thứ này
    // vào nhau là biểu đồ karma tụt xuống 0 mỗi lần Reddit đổi sidebar.
    expect(parsed.karma).toBeNull();
  });

  it("profile có thật nhưng chưa đăng gì thì OK với danh sách rỗng", () => {
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
  it("đọc khóa bài từ data-permalink, cùng dạng khóa với job trong kho", () => {
    const parsed = parseRedditProfile({
      html: profileHtml(thing("link", NOW.getTime())),
      status: 200,
    });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts[0]?.threadKey).toBe("reddit:1veg99o");
  });

  it("thiếu data-permalink thì lùi về data-fullname", () => {
    const html = profileHtml(
      `<div class=" thing " data-type="link" data-timestamp="${NOW.getTime()}" ` +
        `data-fullname="t3_1veg99o"></div>`,
    );
    const parsed = parseRedditProfile({ html, status: 200 });

    expect(parsed.kind).toBe("OK");
    if (parsed.kind !== "OK") return;
    expect(parsed.posts[0]?.threadKey).toBe("reddit:1veg99o");
  });

  it("không có thuộc tính nhận dạng nào thì vẫn đếm được bài, chỉ là không ghép được", () => {
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
  const at = (daysAgo: number) => ({ timestamp: NOW.getTime() - daysAgo * DAY, threadKey: null });

  it("chỉ giữ bài trong cửa sổ quan sát", () => {
    expect(postsWithin([at(1), at(6), at(30)], 7, NOW)).toHaveLength(2);
  });

  it("không có bài nào thì trả mảng rỗng", () => {
    expect(postsWithin([], 7, NOW)).toEqual([]);
  });
});
