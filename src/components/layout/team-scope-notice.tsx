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
import { Archive, ChevronDown, PauseCircle } from "lucide-react";
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
    <details className="group mb-6 rounded-xl border border-white/[0.08] bg-white/[0.025] text-sm text-neutral-300">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 marker:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300">
          <Archive size={17} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-neutral-100">Vault mode</span>
          <span className="block truncate text-xs text-neutral-500">Nicks · proxies · Relay PCs</span>
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-200">
          <PauseCircle size={13} />
          Posting parked
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="max-w-4xl space-y-2 border-t border-white/[0.07] px-4 py-3 text-[13px] leading-5 text-neutral-400">
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
