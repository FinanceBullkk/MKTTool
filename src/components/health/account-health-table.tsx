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
      <span className="text-amber-300">Never checked</span>
    );
  }

  return (
    <span className={row.stale ? "text-amber-300" : "text-neutral-400"}>
      {formatDayMonthTime(row.latest.checkedAt)}
      {row.stale ? ` (${row.daysSinceCheck} days ago - stale)` : ""}
    </span>
  );
}

export function AccountHealthTable({ rows }: { rows: AccountHealthRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState>
        No Reddit nicks yet. The checker covers only Reddit; Facebook Pages publish through the
        official Graph API, where failures are returned directly instead of silently hiding posts.
      </EmptyState>
    );
  }

  return (
    <DataTable headers={["Nick", "Verdict", "Karma", "Visible / posted", "Last check", ""]}>
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
                  label="Unknown"
                  className="bg-white/[0.06] text-neutral-400"
                />
              )}
            </td>
            <td className="py-2 pr-4 tabular-nums">{row.karma}</td>
            <td className="py-2 pr-4 tabular-nums text-neutral-400">
              {row.latest && row.latest.visiblePosts !== null && row.latest.expectedPosts !== null
                ? `${row.latest.visiblePosts} / ${row.latest.expectedPosts}`
                : "—"}
            </td>
            <td className="py-2 pr-4 text-xs">
              <LastCheckCell row={row} />
            </td>
            {/* Căn phải ở đây chứ không trong nút: dòng job ở hàng đợi dùng lại đúng nút đó
                nhưng nằm trong cụm thao tác căn trái. */}
            <td className="py-2 pr-4 text-right">
              <HealthCheckNowButton accountId={row.id} />
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
