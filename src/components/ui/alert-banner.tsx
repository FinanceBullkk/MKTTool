/**
 * Dải cảnh báo ở đầu trang Hôm nay.
 *
 * Tách ra vì số dải đã lên năm, và mỗi dải trước đây tự chép lại đúng bộ class nền/viền/chữ
 * cho hai chế độ sáng tối — năm bản chép của cùng một thứ là năm chỗ để lệch nhau.
 *
 * `red` = đang hỏng, phải xử lý. `amber` = chưa hỏng nhưng sẽ hỏng, hoặc "không biết".
 * Đừng dùng đỏ cho thứ chỉ đáng chú ý: dải đỏ nào cũng đỏ thì không dải nào còn đỏ.
 */
import { CircleAlert, TriangleAlert } from "lucide-react";

export type AlertTone = "amber" | "red";

const BOX_CLASS: Record<AlertTone, string> = {
  amber: "border-amber-400/20 bg-amber-400/[0.06]",
  red: "border-red-400/20 bg-red-400/[0.06]",
};

const TEXT_CLASS: Record<AlertTone, string> = {
  amber: "text-amber-200",
  red: "text-red-200",
};

const ICON = { amber: TriangleAlert, red: CircleAlert } as const;

export function AlertBanner({
  tone,
  children,
}: {
  tone: AlertTone;
  children: React.ReactNode;
}) {
  const Icon = ICON[tone];
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 ${BOX_CLASS[tone]}`}>
      <Icon size={17} className={`mt-0.5 shrink-0 ${TEXT_CLASS[tone]}`} aria-hidden="true" />
      <div className={`min-w-0 text-sm leading-5 ${TEXT_CLASS[tone]}`}>{children}</div>
    </div>
  );
}
