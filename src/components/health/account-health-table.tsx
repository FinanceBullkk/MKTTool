/**
 * Bảng sức khỏe đàn nick: mỗi nick một dòng, nick đáng lo ở trên.
 *
 * Cột "Lần dò cuối" quan trọng ngang cột kết luận. Một kết luận HEALTHY từ chín ngày trước
 * không có nghĩa nick đang khỏe — nó chỉ có nghĩa chín ngày trước nick còn khỏe. Bảng nào
 * hiện kết luận mà giấu tuổi của nó thì đang nói dối một cách lịch sự.
 */
import Link from "next/link";
import { DataTable, EmptyState, StatusBadge } from "@/components/ui/page-section";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import type { AccountHealthRow } from "@/lib/health/health-dashboard-queries";
import { getVerdictPresentation } from "@/lib/health/health-verdict";
import { HealthCheckNowButton } from "./health-check-now-button";

function LastCheckCell({ row }: { row: AccountHealthRow }) {
  if (!row.latest) {
    return (
      <span className="text-amber-700 dark:text-amber-400">chưa dò lần nào</span>
    );
  }

  return (
    <span className={row.stale ? "text-amber-700 dark:text-amber-400" : "text-neutral-600 dark:text-neutral-400"}>
      {formatDayMonthTime(row.latest.checkedAt)}
      {row.stale ? ` (${row.daysSinceCheck} ngày trước — đã cũ)` : ""}
    </span>
  );
}

export function AccountHealthTable({ rows }: { rows: AccountHealthRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState>
        Chưa có nick Reddit nào. Bộ dò chỉ làm việc với Reddit — Fanpage đăng bằng Graph API
        chính thức nên không có chuyện bị ẩn thầm lặng.
      </EmptyState>
    );
  }

  return (
    <DataTable headers={["Nick", "Kết luận", "Karma", "Thấy / đã đăng", "Lần dò cuối", ""]}>
      {rows.map((row) => {
        const presentation = row.latest ? getVerdictPresentation(row.latest.verdict) : null;

        return (
          <tr key={row.id}>
            <td className="py-2 pr-4 font-medium">
              <Link href={`/accounts/${row.id}`} className="hover:underline">
                {row.username}
              </Link>
            </td>
            <td className="py-2 pr-4">
              {presentation ? (
                <StatusBadge label={presentation.label} className={presentation.className} />
              ) : (
                <StatusBadge
                  label="chưa biết"
                  className="bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                />
              )}
            </td>
            <td className="py-2 pr-4 tabular-nums">{row.karma}</td>
            <td className="py-2 pr-4 tabular-nums text-neutral-600 dark:text-neutral-400">
              {row.latest && row.latest.visiblePosts !== null && row.latest.expectedPosts !== null
                ? `${row.latest.visiblePosts} / ${row.latest.expectedPosts}`
                : "—"}
            </td>
            <td className="py-2 pr-4 text-xs">
              <LastCheckCell row={row} />
            </td>
            <td className="py-2 pr-4">
              <HealthCheckNowButton accountId={row.id} />
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
