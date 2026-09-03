/**
 * One-line notice at the top of a route outside the current team rollout scope.
 *
 * Parked is not deleted. These routes stay reachable by URL for history and
 * reference, while server-side guards keep every posting action closed.
 */
import Link from "next/link";

export function ParkedScopeBanner({ what }: { what: string }) {
  return (
    <div
      role="note"
      className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-amber-200/90"
    >
      Đang tạm gác — {what} đã ra khỏi phạm vi bàn giao từ 02/09/2026. Trang này chỉ dùng để xem
      lịch sử; không đăng được.{" "}
      <Link href="/accounts" className="font-medium underline">
        Quay lại kho nick
      </Link>
      .
    </div>
  );
}
