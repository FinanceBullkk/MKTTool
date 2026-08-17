/**
 * H109 — hai đường nhận link gõ tay đều phải từ chối link share không rút được về id bài.
 *
 * Chốt nằm ở zod của từng server action, và nó chạy TRƯỚC mọi truy vấn — nên file này không cần
 * Postgres, dù hai hàm dưới đây đều là hàm chạm database. Đó cũng chính là điều đáng kiểm: link
 * hỏng phải bị chặn trước khi kịp ghi một dấu vết mà luật 8 không đối chiếu được.
 *
 * Vì sao không kiểm thẳng cái schema: cả hai file là `"use server"`, nên mọi thứ export ra từ đó
 * đều thành endpoint HTTP. Export schema chỉ để test là mở thêm một cửa ra internet cho tiện việc
 * kiểm — đổi sai chiều.
 */
import { describe, expect, it, vi } from "vitest";
import { UNRESOLVABLE_SHARE_LINK_MESSAGE } from "@/lib/rules/rule-thread-collision";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: "test-actor",
    email: "test@mkttool.local",
    role: "ADMIN" as const,
  }),
}));

const { markJobPosted } = await import("./post-job-status-actions");
const { recordInteraction } = await import("./interaction-actions");

const SHARE_LINK = "https://www.reddit.com/r/Trove/s/AbCdEfGh12";
const PERMALINK = "https://www.reddit.com/r/Trove/comments/1veg99o/tieu_de/";

function interactionForm(threadUrl: string): FormData {
  const data = new FormData();
  data.set("accountId", "acc-1");
  data.set("targetId", "tgt-1");
  data.set("threadUrl", threadUrl);
  data.set("kind", "COMMENT");
  return data;
}

describe("chặn link share ở đầu vào", () => {
  it("đánh dấu đã đăng bằng link share thì bị từ chối", async () => {
    const result = await markJobPosted("job-1", SHARE_LINK);

    expect(result.ok).toBe(false);
    expect(result.message).toBe(UNRESOLVABLE_SHARE_LINK_MESSAGE);
  });

  it("ghi tương tác bằng link share thì bị từ chối", async () => {
    const result = await recordInteraction(null, interactionForm(SHARE_LINK));

    expect(result.ok).toBe(false);
    expect(result.message).toBe(UNRESOLVABLE_SHARE_LINK_MESSAGE);
  });

  /**
   * Chốt phải chặn ĐÚNG dạng không rút được. Link đầy đủ đi qua được vòng kiểm dạng và ngã ở bước
   * sau (không có job/đích thật trong test này) — điều cần chứng minh là nó KHÔNG ngã vì thông báo
   * link share, nếu không thì chốt đang chặn cả việc bình thường.
   */
  it("link đầy đủ không bị chốt này chặn", async () => {
    const marked = await markJobPosted("job-1", PERMALINK).catch(() => ({ message: "" }));
    expect(marked.message).not.toBe(UNRESOLVABLE_SHARE_LINK_MESSAGE);
  });
});
