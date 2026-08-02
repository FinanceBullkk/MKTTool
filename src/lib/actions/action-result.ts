/**
 * Kết quả trả về của mọi server action trong dự án.
 *
 * Ở riêng một file vì 18 chỗ dùng tới nó và không chỗ nào trong số đó dính đến kho danh tính —
 * trước đây nó nằm nhờ trong `accounts/account-actions.ts`, nên đọc `import ... from
 * "@/lib/accounts/account-actions"` ở giữa file đăng Facebook là một câu đánh lạc hướng.
 *
 * `ok` quyết định màu chữ thông báo, `message` là câu tiếng Việt hiện thẳng cho người dùng —
 * nên nó phải nói được điều gì đã xảy ra và làm gì tiếp theo, không phải mã lỗi kỹ thuật.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
}
