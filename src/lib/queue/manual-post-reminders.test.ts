import { describe, expect, it } from "vitest";
import { buildReminderCopyTexts } from "./manual-post-reminders";

/**
 * Hai dạng copy phải khác nhau ở đúng một chỗ: có tiêu đề hay không.
 *
 * Dán nhầm dạng có tiêu đề vào ô Text của Reddit thì bài hiện tiêu đề hai lần — lỗi nhìn thấy
 * ngay nhưng chỉ thấy SAU KHI đã đăng, mà bài Reddit sửa được thì cũng đã có người đọc rồi.
 */
describe("buildReminderCopyTexts", () => {
  const content = { title: "Tiêu đề", body: "Thân bài.", links: [] as string[] };

  it("thân bài để copy KHÔNG kèm tiêu đề — Reddit có ô tiêu đề riêng", () => {
    expect(buildReminderCopyTexts(content).bodyToCopy).toBe("Thân bài.");
  });

  it("khối gộp có cả tiêu đề lẫn thân bài — Facebook Group chỉ có một ô", () => {
    expect(buildReminderCopyTexts(content).messageToCopy).toBe("Tiêu đề\n\nThân bài.");
  });

  it("link dán kèm cuối cả hai dạng — link ngoài thân bài là link biến mất khỏi bài", () => {
    const withLinks = buildReminderCopyTexts({
      ...content,
      links: ["https://a.example", "https://b.example"],
    });

    expect(withLinks.bodyToCopy).toBe("Thân bài.\n\nhttps://a.example\nhttps://b.example");
    expect(withLinks.messageToCopy).toContain("Tiêu đề");
    expect(withLinks.messageToCopy).toContain("https://b.example");
  });

  it("không có link thì không để lại dòng trống thừa ở cuối", () => {
    const texts = buildReminderCopyTexts(content);
    expect(texts.bodyToCopy).not.toMatch(/\n\s*$/);
    expect(texts.messageToCopy).not.toMatch(/\n\s*$/);
  });

  it("thân bài rỗng thì khối gộp chỉ còn tiêu đề, không có dòng trống dẫn đầu", () => {
    const texts = buildReminderCopyTexts({ title: "Chỉ tiêu đề", body: "", links: [] });
    expect(texts.messageToCopy).toBe("Chỉ tiêu đề");
    expect(texts.bodyToCopy).toBe("");
  });
});
