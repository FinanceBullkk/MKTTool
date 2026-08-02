/**
 * Bảng Fanpage: trạng thái token, đích đăng tương ứng, nick quản trị.
 *
 * Cột "Token" là cột quan trọng nhất — token chết không báo trước, và mọi Page dưới cùng
 * một nick chết cùng lúc chứ không lần lượt.
 */
import Link from "next/link";
import { DataTable, EmptyState, StatusBadge } from "@/components/ui/page-section";
import {
  TOKEN_HEALTH_CLASS,
  TOKEN_HEALTH_LABEL,
  evaluateTokenHealth,
} from "@/lib/facebook/facebook-token-health";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { type AdminOption, FacebookPageRowActions } from "./facebook-page-row-actions";

export interface FacebookPageRow {
  id: string;
  pageId: string;
  name: string;
  tokenValid: boolean;
  tokenNote: string | null;
  tokenCheckedAt: Date | null;
  adminAccountId: string | null;
  connection: { name: string; expiresAt: Date | null };
  target: { id: string; name: string } | null;
}

export function FacebookPageTable({
  pages,
  adminOptions,
}: {
  pages: FacebookPageRow[];
  adminOptions: AdminOption[];
}) {
  if (pages.length === 0) {
    return (
      <EmptyState>
        Chưa có Fanpage nào. Kết nối một nick cá nhân quản trị Page ở khối trên — công cụ tự tạo
        đích đăng tương ứng để xếp lịch được ngay.
      </EmptyState>
    );
  }

  return (
    <DataTable headers={["Page", "Đích đăng", "Token", "Kiểm lần cuối", "Nick quản trị"]}>
      {pages.map((page) => {
        const health = evaluateTokenHealth({
          expiresAt: page.connection.expiresAt,
          tokenValid: page.tokenValid,
          tokenNote: page.tokenNote,
        });

        return (
          <tr key={page.id}>
            <td className="py-2 pr-4">
              <a
                href={`https://www.facebook.com/${page.pageId}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium hover:underline"
              >
                {page.name}
              </a>
              <div className="text-xs text-neutral-500">qua {page.connection.name}</div>
            </td>
            <td className="py-2 pr-4 text-sm">
              {page.target ? (
                <Link href="/targets" className="hover:underline">
                  {page.target.name}
                </Link>
              ) : (
                <span className="text-amber-700 dark:text-amber-400">
                  chưa nối — không xếp lịch được
                </span>
              )}
            </td>
            <td className="py-2 pr-4">
              <StatusBadge
                label={TOKEN_HEALTH_LABEL[health.level]}
                className={TOKEN_HEALTH_CLASS[health.level]}
              />
              {health.level !== "OK" ? (
                <p className="mt-1 max-w-xs text-xs text-neutral-500">{health.message}</p>
              ) : null}
            </td>
            <td className="whitespace-nowrap py-2 pr-4 text-xs text-neutral-500">
              {page.tokenCheckedAt ? formatDayMonthTime(page.tokenCheckedAt) : "chưa kiểm"}
            </td>
            <td className="py-2 pr-4">
              <FacebookPageRowActions
                pageId={page.pageId}
                pageName={page.name}
                adminAccountId={page.adminAccountId}
                adminOptions={adminOptions}
              />
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
