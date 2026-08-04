/**
 * Phép so slug là CỔNG duy nhất đứng giữa "bộ dò thấy một bài" và "kho tự ghi bài đó".
 *
 * Nên hai kiểu sai ở đây không cân nhau: bỏ sót một bài khớp thì người dùng bấm tay như cũ,
 * còn nhận nhầm hai bài không liên quan là tự tay tạo lại đúng ca dán nhầm link mà tính năng
 * này sinh ra để dọn.
 */
import { describe, expect, it } from "vitest";
import {
  readPermalinkSlug,
  titleMatchesPermalink,
  titleSlugScore,
} from "./reddit-title-slug-match";

const TROVE_ALIVE = "/r/Trove/comments/1veg99o/is_trove_still_alive_will_gamigo_continue_to/";

describe("readPermalinkSlug", () => {
  it("đọc slug từ permalink tương đối lẫn URL đầy đủ", () => {
    expect(readPermalinkSlug(TROVE_ALIVE)).toBe("is_trove_still_alive_will_gamigo_continue_to");
    expect(readPermalinkSlug(`https://www.reddit.com${TROVE_ALIVE}`)).toBe(
      "is_trove_still_alive_will_gamigo_continue_to",
    );
  });

  it("link không có slug thì trả null, không trả chuỗi rỗng", () => {
    // Link chia sẻ và permalink cụt là chuyện thường — "không có slug" phải khác "slug lệch".
    expect(readPermalinkSlug("https://redd.it/1veg99o")).toBeNull();
    expect(readPermalinkSlug("https://www.reddit.com/r/Trove/comments/1veg99o/")).toBeNull();
  });
});

describe("titleSlugScore", () => {
  it("tiêu đề gốc khớp trọn slug", () => {
    expect(
      titleSlugScore("Is trove still alive? Will Gamigo continue to develop it? ", TROVE_ALIVE),
    ).toBe(1);
  });

  it("hai bài cùng chủ đề nhưng khác nội dung thì không khớp", () => {
    // Đúng cặp có thật 04/08/2026: link của bài A bị dán cho job của bài B, cả hai đều về Trove.
    const score = titleSlugScore("Looking for a game similar to trove", TROVE_ALIVE);
    expect(score).not.toBeNull();
    expect(score).toBeLessThan(0.6);
  });

  it("không so được thì trả null chứ không trả 0", () => {
    // 0 nghĩa là "đã so và lệch hẳn"; null nghĩa là "chưa so được". Gộp hai thứ này lại là
    // biến mọi link thiếu slug thành một cảnh báo sai.
    expect(titleSlugScore("Bài gì đó", "https://redd.it/1veg99o")).toBeNull();
    expect(titleSlugScore("", TROVE_ALIVE)).toBeNull();
  });

  it("bỏ qua từ quá ngắn để chúng không tự đẩy tỷ lệ lên", () => {
    // Slug này có `is` và `to`; tiêu đề dưới đây cũng có, mà hai bài chẳng liên quan gì nhau.
    // Đếm mấy từ đó là cho điểm không công cho mọi cặp tiếng Anh bất kỳ.
    expect(titleSlugScore("to it is a game about backups", TROVE_ALIVE)).toBe(0);
  });
});

describe("titleMatchesPermalink", () => {
  it("khớp thì cho tự ghi, lệch hoặc không so được thì không", () => {
    expect(titleMatchesPermalink("Is trove still alive? Will Gamigo continue?", TROVE_ALIVE)).toBe(
      true,
    );
    expect(titleMatchesPermalink("Looking for a game similar to trove", TROVE_ALIVE)).toBe(false);
    // Không so được phải là KHÔNG khớp: tự ghi dựa trên thứ chưa kiểm là kiểu sai tệ nhất ở đây.
    expect(titleMatchesPermalink("Bài gì đó", "https://redd.it/1veg99o")).toBe(false);
  });
});
