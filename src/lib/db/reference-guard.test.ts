import { describe, expect, it } from "vitest";
import { blockDeleteWhenReferenced } from "./reference-guard";

/**
 * Hàng rào này là thứ đứng giữa một cú bấm nhầm và việc bộ luật mù đi lặng lẽ.
 *
 * Xóa một nick còn job nghĩa là luật hạn mức, luật tỷ lệ promo và luật đụng độ thread mất phần
 * lịch sử chúng đếm — rồi cho qua những bài lẽ ra phải chặn, mà không có gì báo. Đó là kiểu hỏng
 * không test nào khác bắt được, vì mọi thứ vẫn xanh: nick xóa xong, job biến mất, màn hình sạch sẽ.
 *
 * Nên phần đáng canh không chỉ là "có chặn không" mà còn là **câu nói ra khi chặn**: nó phải nêu
 * đúng vướng gì và chỉ đường thay thế, vì từ chối mà không chỉ đường thì người dùng đi tìm cách
 * lách, và cách lách gần nhất là xóa tay bằng Prisma Studio — mất đúng thứ vừa cố giữ.
 */

const GIU_LICH_SU = 'If a nick is no longer used, change its status to "Dead".';

describe("blockDeleteWhenReferenced", () => {
  it("allows deletion when nothing references the record", () => {
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [
        { label: "job", count: 0 },
        { label: "recorded interactions", count: 0 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked).toBeNull();
  });

  it("allows deletion for an empty reference list", () => {
    expect(blockDeleteWhenReferenced('content "Post 1"', [], GIU_LICH_SU)).toBeNull();
  });

  it("blocks one remaining reference and names its count and type", () => {
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [{ label: "job", count: 12 }],
      GIU_LICH_SU,
    );

    expect(blocked).not.toBeNull();
    expect(blocked?.message).toContain('Cannot delete nick "u/test"');
    expect(blocked?.message).toContain("12 job");
  });

  it("lists every blocking reference instead of stopping at the first", () => {
    // Nêu một cái rồi im là bắt người dùng gỡ từng lớp, mỗi lớp một lượt bấm mới biết còn gì.
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [
        { label: "job", count: 12 },
        { label: "recorded interactions", count: 30 },
        { label: "Facebook connection", count: 1 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain("12 job");
    expect(blocked?.message).toContain("30 recorded interactions");
    expect(blocked?.message).toContain("1 Facebook connection");
  });

  it("lists only positive reference counts", () => {
    // "còn 12 job, 0 tương tác đã ghi trỏ tới" đọc như một lời than phiền về con số 0.
    const blocked = blockDeleteWhenReferenced(
      'target "r/test"',
      [
        { label: "job", count: 12 },
        { label: "recorded interactions", count: 0 },
        { label: "connected Facebook Pages", count: 0 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain("12 job");
    expect(blocked?.message).not.toContain("0 recorded interactions");
    expect(blocked?.message).not.toContain("0 connected Facebook Pages");
  });

  it("always includes an alternative action in the denial", () => {
    // Ràng buộc của cả module: từ chối mà không chỉ đường thì người dùng đi tìm cách lách.
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [{ label: "job", count: 1 }],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain(GIU_LICH_SU);
  });

  it("does not treat negative counts as active references", () => {
    // Không có đường nào sinh ra số âm hôm nay, nhưng `> 0` và `!== 0` chỉ khác nhau ở đúng ca này,
    // và ca này nếu xảy ra thì biểu hiện là một nick không ai xóa nổi mà không rõ vì sao.
    expect(
      blockDeleteWhenReferenced('nick "u/test"', [{ label: "job", count: -1 }], GIU_LICH_SU),
    ).toBeNull();
  });
});
