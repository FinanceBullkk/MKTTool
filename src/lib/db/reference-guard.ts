/**
 * Chặn xóa khi bản ghi còn thứ khác trỏ tới.
 *
 * Nguyên tắc lấy từ `disconnectPage` trong facebook-page-actions.ts: xóa lịch sử đăng chỉ để
 * dọn màn hình là mất luôn dữ liệu nuôi bộ luật. Job và tương tác cũ chính là thứ luật tỷ lệ
 * promo, luật hạn mức và luật đụng độ thread đếm — xóa đi thì bộ luật cho qua những bài lẽ ra
 * phải chặn, mà không có gì báo rằng nó vừa mù đi.
 *
 * Nghỉ một nick thì đổi trạng thái sang DEAD, nghỉ một đích thì bỏ tick "đang dùng".
 * Xóa chỉ dành cho thứ vừa nhập sai vài phút trước, lúc chưa có gì trỏ tới.
 */

export interface ReferenceCount {
  /** Danh từ đếm được, viết thường: "job", "tương tác", "nick". */
  label: string;
  count: number;
}

export interface DeleteBlock {
  /** Lý do đầy đủ để trả thẳng cho người dùng. */
  message: string;
}

/**
 * `null` nghĩa là xóa được. Ngược lại là câu giải thích vướng gì và làm gì thay thế.
 *
 * `alternative` bắt buộc phải có: từ chối mà không chỉ đường thì người dùng đi tìm cách lách,
 * và cách lách gần nhất luôn là xóa tay bằng Prisma Studio — mất đúng thứ vừa cố giữ.
 */
export function blockDeleteWhenReferenced(
  subject: string,
  references: ReferenceCount[],
  alternative: string,
): DeleteBlock | null {
  const blocking = references.filter((reference) => reference.count > 0);
  if (blocking.length === 0) return null;

  const listed = blocking
    .map((reference) => `${reference.count} ${reference.label}`)
    .join(", ");

  return {
    message: `Không xóa được ${subject}: còn ${listed} trỏ tới. ${alternative}`,
  };
}
