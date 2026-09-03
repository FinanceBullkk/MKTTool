/**
 * Nhãn "nick này đã đủ điều kiện thao tác kỹ thuật chưa" — một dòng cho ô bảng, một khối cho
 * trang chi tiết. Nó không đánh giá hay chứng minh cô lập danh tính.
 *
 * Dùng chung để ba chỗ đọc `describeAccountReadiness()` không vẽ ra ba kiểu chữ khác nhau cho
 * cùng một sự thật.
 */
import type { AccountReadiness } from "@/lib/accounts/account-readiness";
import { StatusBadge } from "@/components/ui/page-section";

/**
 * Ba màu cho ba nghĩa khác nhau, và **chờ khác với thiếu**:
 * xanh = đủ điều kiện cấu hình; vàng = chỉ chờ; đỏ = có người phải làm gì đó.
 */
function tone(readiness: AccountReadiness): { label: string; className: string } {
  if (readiness.ready) {
    return {
      label: "Configuration ready",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    };
  }
  if (readiness.waiting) {
    return {
      label: "Waiting",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    };
  }
  return {
    label: "Not ready",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
}

/** Bản gọn cho ô bảng: một nhãn màu, và lý do đứng ngay dưới nếu có. */
export function AccountReadinessCell({ readiness }: { readiness: AccountReadiness }) {
  const { label, className } = tone(readiness);

  return (
    <>
      <StatusBadge label={label} className={className} />
      {readiness.ready ? null : (
        <span className="mt-1 block text-xs text-neutral-500">{readiness.summary}</span>
      )}
    </>
  );
}

/**
 * Bản đầy cho trang chi tiết: mỗi chặn một dòng, kèm **việc phải làm tiếp**.
 *
 * Khi cấu hình đủ thì không vẽ gì — một dải xanh "mọi thứ ổn" trên mỗi trang là thứ mắt học
 * cách bỏ qua, và khi nó chuyển đỏ thì cũng bị bỏ qua nốt.
 */
export function AccountReadinessPanel({ readiness }: { readiness: AccountReadiness }) {
  if (readiness.ready) return null;

  const boxClass = readiness.waiting
    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200";

  return (
    <div className={`mb-6 rounded-md border px-4 py-3 text-sm ${boxClass}`}>
      <p className="font-medium">
        {readiness.waiting
          ? "Setup is complete for now; wait for:"
          : `Setup is incomplete. Resolve these ${readiness.blockers.length} items:`}
      </p>
      <ul className="mt-2 space-y-1">
        {readiness.blockers.map((blocker) => (
          <li key={blocker.code}>
            <strong>{blocker.label}</strong> — {blocker.fix}
          </li>
        ))}
      </ul>
    </div>
  );
}
