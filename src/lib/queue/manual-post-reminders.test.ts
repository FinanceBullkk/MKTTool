import { describe, expect, it } from "vitest";
import { buildReminderCopyTexts } from "./manual-post-reminders";

/**
 * Hai dạng copy phải khác nhau ở đúng một chỗ: có tiêu đề hay không.
 *
 * Dán nhầm dạng có tiêu đề vào ô Text của Reddit thì bài hiện tiêu đề hai lần — lỗi nhìn thấy
 * ngay nhưng chỉ thấy SAU KHI đã đăng, mà bài Reddit sửa được thì cũng đã có người đọc rồi.
 */
describe("buildReminderCopyTexts", () => {
  const content = { title: "Title", body: "Post body", links: [] as string[] };

  it("excludes the title from Reddit body copy because Reddit has a separate title field", () => {
    expect(buildReminderCopyTexts(content).bodyToCopy).toBe("Post body");
  });

  it("combines title and body for the single Facebook Group post field", () => {
    expect(buildReminderCopyTexts(content).messageToCopy).toBe("Title\n\nPost body");
  });

  it("appends links to both copy formats so they are not omitted from the post", () => {
    const withLinks = buildReminderCopyTexts({
      ...content,
      links: ["https://a.example", "https://b.example"],
    });

    expect(withLinks.bodyToCopy).toBe("Post body\n\nhttps://a.example\nhttps://b.example");
    expect(withLinks.messageToCopy).toContain("Title");
    expect(withLinks.messageToCopy).toContain("https://b.example");
  });

  it("does not leave a trailing blank line when there are no links", () => {
    const texts = buildReminderCopyTexts(content);
    expect(texts.bodyToCopy).not.toMatch(/\n\s*$/);
    expect(texts.messageToCopy).not.toMatch(/\n\s*$/);
  });

  it("returns only the title for a Facebook Group post with an empty body", () => {
    const texts = buildReminderCopyTexts({ title: "Just title", body: "", links: [] });
    expect(texts.messageToCopy).toBe("Just title");
    expect(texts.bodyToCopy).toBe("");
  });
});
