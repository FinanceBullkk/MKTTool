/**
 * Câu trả lời cho "tôi được làm gì bằng công cụ này" — đặt ngay trang đầu.
 *
 * ## Vì sao cần
 *
 * Quyết định 02/09/2026 thu phạm vi bàn giao xuống còn kho danh tính: nick, proxy, sổ máy.
 * Người thứ năm hay thứ sáu vào tuần sau không dự cuộc họp ra quyết định đó. Thứ họ thấy là
 * một công cụ có nhiều màn hình, trong đó phần lớn đã rút khỏi thanh điều hướng — dễ đọc thành
 * "công cụ hỏng" hoặc "làm dở dang" hơn là "cố ý thu hẹp".
 *
 * `ParkedScopeBanner` đã nói được câu đó, nhưng chỉ nói khi người ta đã lạc vào một trang ngoài
 * phạm vi. Ở đây nói trước, tại chỗ ai cũng đi qua.
 *
 * ## Vì sao suy ra chứ không khai tay danh sách
 *
 * Danh sách "đang đóng" đọc từ `parkedPlatforms()`, cùng nguồn với chốt chặn thật ở server.
 * Khai tay một danh sách thứ hai thì có ngày trang này nói một đằng còn nút bấm làm một nẻo,
 * và cái sai đó im lặng. Mở lại một nền tảng bằng biến môi trường thì câu chữ ở đây tự đổi
 * theo.
 */
import {
  isPostingFullyParked,
  parkedPlatforms,
  rolloutPlatformLabel,
} from "@/lib/platforms/rollout-scope";

export function TeamScopeNotice() {
  const parked = parkedPlatforms();
  if (parked.length === 0) return null;

  const parkedNames = parked.map(rolloutPlatformLabel).join(", ");

  return (
    <details className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-neutral-300">
      <summary className="cursor-pointer list-none font-medium text-neutral-100 marker:hidden">
        <span className="mr-2 text-amber-300">Current rollout</span>
        Nick vault, proxies, and Relay PCs are available. Posting is parked.
        <span className="ml-2 text-xs font-normal text-neutral-500">View boundary</span>
      </summary>
      <div className="mt-3 max-w-4xl space-y-2 border-t border-white/[0.07] pt-3 text-[13px] leading-5 text-neutral-400">
        <p>
          Every nick has one owner and one Relay PC. Posting paths for {parkedNames} remain available
          for history, but posting actions are denied by the 2 September 2026 scope decision.
        </p>
        {isPostingFullyParked() ? (
          <p>
            MKT Browser has not been distributed, and the tool has not proved that two nicks are
            unlinkable. Ask the project owner before reopening a platform or using real nicks based
            on an identity-isolation assumption.
          </p>
        ) : null}
      </div>
    </details>
  );
}
