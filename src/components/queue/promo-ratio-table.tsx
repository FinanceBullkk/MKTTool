/**
 * Bảng tỷ lệ promo theo cặp (nick × đích).
 *
 * Hiện dạng "7/9" để bạn MKT biết còn phải nuôi mấy bài hữu ích nữa trước khi được quảng cáo —
 * biết trước thì viết trước, chứ không phải tới lúc xếp lịch mới thấy đèn đỏ.
 */
import { DataTable, EmptyState } from "@/components/ui/page-section";
import type { PromoRatioRow } from "@/lib/queue/promo-ratio-summary";

export function PromoRatioTable({ rows }: { rows: PromoRatioRow[] }) {
  if (rows.length === 0) {
    return <EmptyState>No nick × target pair has posts yet.</EmptyState>;
  }

  return (
    <DataTable headers={["Nick", "Target", "Value / Required", "Promotional", "Missing"]}>
      {rows.map((row) => (
        <tr key={`${row.accountUsername}:${row.targetName}`}>
          <td className="py-2 pr-4 font-medium">{row.accountUsername}</td>
          <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{row.targetName}</td>
          <td className="py-2 pr-4 font-mono">
            {row.valueCount}/{(row.promoCount + 1) * row.ratio}
          </td>
          <td className="py-2 pr-4">{row.promoCount}</td>
          <td className="py-2 pr-4">
            {row.missingForNextPromo === 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">Ready to promote</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                {row.missingForNextPromo} value post{row.missingForNextPromo === 1 ? "" : "s"}
              </span>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
