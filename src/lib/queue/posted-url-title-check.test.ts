/**
 * Cảnh báo này soi link đã nằm trong kho, nên nó dễ trở thành thứ kêu suốt ngày. Test ở đây
 * canh chiều ngược lại nhiều hơn: những ca PHẢI im lặng.
 *
 * Một cảnh báo kêu sai vài lần là một cảnh báo bị tắt trong đầu người đọc — và lần kêu đúng
 * sau đó cũng trôi qua.
 */
import { describe, expect, it } from "vitest";
import { findSuspectPostedUrls } from "./posted-url-title-check";

const TROVE_ALIVE =
  "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive_will_gamigo_continue_to/";

function row(contentTitle: string, postedUrl = TROVE_ALIVE) {
  return { jobId: "job-1", contentTitle, accountUsername: "nick", postedUrl };
}

describe("findSuspectPostedUrls", () => {
  it("catch 04/08/2026: link of another post assigned to this job", () => {
    const suspects = findSuspectPostedUrls([row("Looking for a game similar to trove")]);

    expect(suspects).toHaveLength(1);
    expect(suspects[0].jobId).toBe("job-1");
  });

  it("silent when title matches link", () => {
    expect(
      findSuspectPostedUrls([row("Is trove still alive? Will Gamigo continue to develop it?")]),
    ).toHaveLength(0);
  });

  it("silent when link does not have a slug to compare", () => {
    // redd.it và permalink cụt là link hợp lệ. Coi "không so được" là "lệch" thì mọi link
    // dạng ngắn đều thành báo động giả.
    expect(findSuspectPostedUrls([row("Some post", "https://redd.it/1veg99o")])).toHaveLength(0);
  });

  it("silent when title only differs slightly — user has right to edit title when posting", () => {
    // Ngưỡng báo (0.2) thấp hơn hẳn ngưỡng cho phép tự ghi (0.6): khoảng giữa là vùng "khác
    // một chút", nơi im lặng đúng hơn là hỏi.
    const suspects = findSuspectPostedUrls([row("Trove still alive in 2026? Gamigo roadmap")]);
    expect(suspects).toHaveLength(0);
  });
});
