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

const GIU_LICH_SU = 'Nick không dùng nữa thì đổi trạng thái sang "Đã chết".';

describe("blockDeleteWhenReferenced", () => {
  it("không còn gì trỏ tới thì cho xóa", () => {
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [
        { label: "job", count: 0 },
        { label: "tương tác đã ghi", count: 0 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked).toBeNull();
  });

  it("danh sách rỗng cũng là cho xóa — không có gì để đếm thì không có gì để mất", () => {
    expect(blockDeleteWhenReferenced('content "Bài 1"', [], GIU_LICH_SU)).toBeNull();
  });

  it("còn một thứ trỏ tới là chặn, và nói rõ vướng bao nhiêu cái gì", () => {
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [{ label: "job", count: 12 }],
      GIU_LICH_SU,
    );

    expect(blocked).not.toBeNull();
    expect(blocked?.message).toContain('Không xóa được nick "u/test"');
    expect(blocked?.message).toContain("12 job");
  });

  it("nhiều thứ cùng vướng thì liệt kê hết, không dừng ở cái đầu tiên", () => {
    // Nêu một cái rồi im là bắt người dùng gỡ từng lớp, mỗi lớp một lượt bấm mới biết còn gì.
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [
        { label: "job", count: 12 },
        { label: "tương tác đã ghi", count: 30 },
        { label: "kết nối Facebook", count: 1 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain("12 job");
    expect(blocked?.message).toContain("30 tương tác đã ghi");
    expect(blocked?.message).toContain("1 kết nối Facebook");
  });

  it("chỉ liệt kê thứ thật sự đang vướng, bỏ qua ô đếm bằng 0", () => {
    // "còn 12 job, 0 tương tác đã ghi trỏ tới" đọc như một lời than phiền về con số 0.
    const blocked = blockDeleteWhenReferenced(
      'đích "r/test"',
      [
        { label: "job", count: 12 },
        { label: "tương tác đã ghi", count: 0 },
        { label: "Fanpage đang nối", count: 0 },
      ],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain("12 job");
    expect(blocked?.message).not.toContain("0 tương tác");
    expect(blocked?.message).not.toContain("0 Fanpage");
  });

  it("câu từ chối luôn kèm đường thay thế", () => {
    // Ràng buộc của cả module: từ chối mà không chỉ đường thì người dùng đi tìm cách lách.
    const blocked = blockDeleteWhenReferenced(
      'nick "u/test"',
      [{ label: "job", count: 1 }],
      GIU_LICH_SU,
    );

    expect(blocked?.message).toContain(GIU_LICH_SU);
  });

  it("số âm không được hiểu thành đang vướng", () => {
    // Không có đường nào sinh ra số âm hôm nay, nhưng `> 0` và `!== 0` chỉ khác nhau ở đúng ca này,
    // và ca này nếu xảy ra thì biểu hiện là một nick không ai xóa nổi mà không rõ vì sao.
    expect(
      blockDeleteWhenReferenced('nick "u/test"', [{ label: "job", count: -1 }], GIU_LICH_SU),
    ).toBeNull();
  });
});
