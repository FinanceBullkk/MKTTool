import { describe, expect, it } from "vitest";
import { buildPagePostPayload, buildPostUrl, composeMessage } from "./facebook-post-payload";

const PAGE_ID = "123456789";

describe("composeMessage", () => {
  it("ghép tiêu đề và thân bài bằng dòng trống", () => {
    expect(composeMessage({ title: "Tiêu đề", body: "Thân bài", links: [] })).toBe(
      "Tiêu đề\n\nThân bài",
    );
  });

  it("không lặp tiêu đề khi thân bài đã mở đầu bằng chính nó", () => {
    const message = composeMessage({ title: "Tiêu đề", body: "Tiêu đề\nnội dung", links: [] });
    expect(message).toBe("Tiêu đề\nnội dung");
  });

  it("thiếu một trong hai phần vẫn ra nội dung dùng được", () => {
    expect(composeMessage({ title: "", body: "Chỉ thân bài", links: [] })).toBe("Chỉ thân bài");
    expect(composeMessage({ title: "Chỉ tiêu đề", body: "", links: [] })).toBe("Chỉ tiêu đề");
  });
});

describe("buildPagePostPayload", () => {
  it("một link thì đưa vào tham số link để Facebook dựng thẻ xem trước", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "Tiêu đề",
      body: "Thân bài",
      links: ["https://example.com"],
    });

    expect(payload.path).toBe(`${PAGE_ID}/feed`);
    expect(payload.params.link).toBe("https://example.com");
    expect(payload.params.message).not.toContain("https://example.com");
  });

  it("nhiều link thì dán hết vào cuối bài, không bỏ sót link nào", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "Tiêu đề",
      body: "Thân bài",
      links: ["https://a.com", "https://b.com"],
    });

    expect(payload.params.link).toBeUndefined();
    expect(payload.params.message).toContain("https://a.com");
    expect(payload.params.message).toContain("https://b.com");
  });

  it("không có link thì không gửi tham số link", () => {
    const payload = buildPagePostPayload(PAGE_ID, { title: "T", body: "B", links: [] });
    expect(payload.params).not.toHaveProperty("link");
  });

  it("bỏ qua link rỗng lẫn trong mảng", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "T",
      body: "B",
      links: ["  ", "https://example.com"],
    });
    expect(payload.params.link).toBe("https://example.com");
  });

  it("có ảnh thì đổi sang /photos và dùng caption thay message", () => {
    const payload = buildPagePostPayload(
      PAGE_ID,
      { title: "T", body: "B", links: [] },
      { imageUrl: "https://cdn.example.com/a.jpg" },
    );

    expect(payload.path).toBe(`${PAGE_ID}/photos`);
    expect(payload.params.url).toBe("https://cdn.example.com/a.jpg");
    expect(payload.params.caption).toContain("T");
    expect(payload.params).not.toHaveProperty("message");
  });

  it("ảnh toàn khoảng trắng thì coi như không có ảnh", () => {
    const payload = buildPagePostPayload(PAGE_ID, { title: "T", body: "B", links: [] }, { imageUrl: "   " });
    expect(payload.path).toBe(`${PAGE_ID}/feed`);
  });
});

describe("buildPostUrl", () => {
  it("tách id dạng {pageId}_{postId} thành URL xem bài", () => {
    expect(buildPostUrl(PAGE_ID, "123456789_987")).toBe(
      "https://www.facebook.com/123456789/posts/987",
    );
  });

  it("ưu tiên post_id khi Facebook trả về id ảnh ở /photos", () => {
    // /photos trả `id` là id ảnh, `post_id` mới là bài trên tường.
    expect(buildPostUrl(PAGE_ID, "555", "123456789_987")).toBe(
      "https://www.facebook.com/123456789/posts/987",
    );
  });

  it("id trần vẫn ra URL mở được", () => {
    expect(buildPostUrl(PAGE_ID, "987")).toBe("https://www.facebook.com/123456789/posts/987");
  });
});
