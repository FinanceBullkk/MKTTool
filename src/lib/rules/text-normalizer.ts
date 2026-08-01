/**
 * Chuẩn hóa văn bản trước khi so trùng.
 *
 * Mục tiêu: hai bài chỉ khác nhau ở dấu câu, viết hoa, xuống dòng hay dấu tiếng Việt
 * phải cho ra cùng một chuỗi. Đổi vài chữ vẫn phải giữ được phần lớn ký tự giống nhau,
 * nên KHÔNG cắt từ, KHÔNG bỏ từ dừng — trigram ký tự tự lo phần đó.
 */

/** Dấu tổ hợp Unicode (huyền, sắc, hỏi, ngã, nặng… sau khi NFD tách ra). */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD") // tách dấu thành ký tự tổ hợp
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/đ/g, "d") // NFD không tách được đ
    .replace(NON_ALPHANUMERIC, " ")
    .trim();
}

/** Một bài = tiêu đề + thân bài. Tiêu đề trùng mà thân khác vẫn là tín hiệu đáng ngờ. */
export function combineContentText(title: string, body: string): string {
  return `${title}\n${body}`;
}
