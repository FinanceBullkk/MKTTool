import { describe, expect, it } from "vitest";
import { buildPagePostPayload, buildPostUrl, composeMessage } from "./facebook-post-payload";

const PAGE_ID = "123456789";

describe("composeMessage", () => {
  it("joins the title and body with a blank line", () => {
    expect(composeMessage({ title: "Title", body: "Body", links: [] })).toBe(
      "Title\n\nBody",
    );
  });

  it("does not duplicate the title when the body already starts with it", () => {
    const message = composeMessage({ title: "Title", body: "Title\nContent", links: [] });
    expect(message).toBe("Title\nContent");
  });

  it("produces usable content when either the title or body is missing", () => {
    expect(composeMessage({ title: "", body: "Body only", links: [] })).toBe("Body only");
    expect(composeMessage({ title: "Title only", body: "", links: [] })).toBe("Title only");
  });
});

describe("buildPagePostPayload", () => {
  it("sends one link as the link parameter so Facebook builds a preview", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "Title",
      body: "Body",
      links: ["https://example.com"],
    });

    expect(payload.path).toBe(`${PAGE_ID}/feed`);
    expect(payload.params.link).toBe("https://example.com");
    expect(payload.params.message).not.toContain("https://example.com");
  });

  it("appends every link when there is more than one", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "Title",
      body: "Body",
      links: ["https://a.com", "https://b.com"],
    });

    expect(payload.params.link).toBeUndefined();
    expect(payload.params.message).toContain("https://a.com");
    expect(payload.params.message).toContain("https://b.com");
  });

  it("does not send a link parameter when there are no links", () => {
    const payload = buildPagePostPayload(PAGE_ID, { title: "T", body: "B", links: [] });
    expect(payload.params).not.toHaveProperty("link");
  });

  it("ignores blank links in the array", () => {
    const payload = buildPagePostPayload(PAGE_ID, {
      title: "T",
      body: "B",
      links: ["  ", "https://example.com"],
    });
    expect(payload.params.link).toBe("https://example.com");
  });

  it("uses the photos endpoint and caption when an image is present", () => {
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

  it("treats a whitespace-only image URL as no image", () => {
    const payload = buildPagePostPayload(PAGE_ID, { title: "T", body: "B", links: [] }, { imageUrl: "   " });
    expect(payload.path).toBe(`${PAGE_ID}/feed`);
  });
});

describe("buildPostUrl", () => {
  it("turns a {pageId}_{postId} ID into a viewable post URL", () => {
    expect(buildPostUrl(PAGE_ID, "123456789_987")).toBe(
      "https://www.facebook.com/123456789/posts/987",
    );
  });

  it("prefers post_id when Facebook returns an image ID from /photos", () => {
    // /photos trả `id` là id ảnh, `post_id` mới là bài trên tường.
    expect(buildPostUrl(PAGE_ID, "555", "123456789_987")).toBe(
      "https://www.facebook.com/123456789/posts/987",
    );
  });

  it("turns a bare ID into a viewable URL", () => {
    expect(buildPostUrl(PAGE_ID, "987")).toBe("https://www.facebook.com/123456789/posts/987");
  });
});
