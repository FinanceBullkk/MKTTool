/**
 * One-line notice at the top of a route that is outside the current TikTok
 * scope.
 *
 * Parked is not deleted. These routes keep working and stay reachable by URL —
 * the decision was to pull them out of the navigation, not to remove the code,
 * because deleting costs the blame trail and the way back. What the banner adds
 * is the missing sentence: someone who lands here from a bookmark, a link, or
 * their own memory should learn immediately that the page is out of scope
 * rather than conclude the tool is broken or half-built.
 */
export function ParkedScopeBanner({ what }: { what: string }) {
  return (
    <div
      role="note"
      className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-amber-200/90"
    >
      Đang tạm gác — {what} không nằm trong phạm vi TikTok hiện tại. Trang vẫn dùng được, nhưng đã
      rút khỏi thanh điều hướng.
    </div>
  );
}
