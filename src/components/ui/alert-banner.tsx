/**
 * Dải cảnh báo ở đầu trang Hôm nay.
 *
 * Tách ra vì số dải đã lên năm, và mỗi dải trước đây tự chép lại đúng bộ class nền/viền/chữ
 * cho hai chế độ sáng tối — năm bản chép của cùng một thứ là năm chỗ để lệch nhau.
 *
 * `red` = đang hỏng, phải xử lý. `amber` = chưa hỏng nhưng sẽ hỏng, hoặc "không biết".
 * Đừng dùng đỏ cho thứ chỉ đáng chú ý: dải đỏ nào cũng đỏ thì không dải nào còn đỏ.
 */
export type AlertTone = "amber" | "red";

const BOX_CLASS: Record<AlertTone, string> = {
  amber: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950",
  red: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950",
};

const TEXT_CLASS: Record<AlertTone, string> = {
  amber: "text-amber-900 dark:text-amber-300",
  red: "text-red-800 dark:text-red-300",
};

export function AlertBanner({
  tone,
  children,
}: {
  tone: AlertTone;
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-6 rounded-md border px-4 py-3 ${BOX_CLASS[tone]}`}>
      <div className={`text-sm ${TEXT_CLASS[tone]}`}>{children}</div>
    </div>
  );
}
