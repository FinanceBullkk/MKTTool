/**
 * Nhãn "nick này đã đủ điều kiện thao tác kỹ thuật chưa" — một dòng cho ô bảng, một khối cho
 * trang chi tiết. Nó không đánh giá hay chứng minh cô lập danh tính.
 *
 * Dùng chung để ba chỗ đọc `describeAccountReadiness()` không vẽ ra ba kiểu chữ khác nhau cho
 * cùng một sự thật.
 */
import type { AccountReadiness } from "@/lib/accounts/account-readiness";
import { StatusBadge } from "@/components/ui/page-section";
import { CircleDashed, TriangleAlert } from "lucide-react";

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
    ? "border-amber-400/20 bg-amber-400/[0.055]"
    : "border-red-400/20 bg-red-400/[0.055]";
  const Icon = readiness.waiting ? CircleDashed : TriangleAlert;

  return (
    <section className={`mb-5 rounded-xl border p-4 ${boxClass}`}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            readiness.waiting ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"
          }`}
        >
          <Icon size={17} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">
            {readiness.waiting ? "Waiting on time" : "Action required"}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-400">
        {readiness.waiting
              ? "Setup is complete for now. No operator action is needed."
              : `${readiness.blockers.length} ${readiness.blockers.length === 1 ? "blocker needs" : "blockers need"} resolution.`}
          </p>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {readiness.blockers.map((blocker) => (
          <li key={blocker.code} className="rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5">
            <strong className="block text-xs font-semibold text-neutral-200">{blocker.label}</strong>
            <span className="mt-1 block text-xs leading-5 text-neutral-500">{blocker.fix}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
