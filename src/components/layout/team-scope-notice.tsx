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
    <section
      role="note"
      className="mb-5 rounded-xl border border-slate-500/25 bg-slate-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-slate-200/90"
    >
      <h2 className="mb-1.5 text-[13px] font-semibold text-slate-100">
        Công cụ này đang dùng để làm gì
      </h2>
      <p className="mb-2">
        <strong className="font-medium text-slate-100">Dùng được:</strong> kho nick dùng chung,
        kho proxy và việc gán chủ sở hữu, sổ đăng ký máy Relay. Mỗi nick có một người phụ trách
        và một máy.
      </p>
      <p className="mb-2">
        <strong className="font-medium text-slate-100">Đang đóng:</strong> mọi đường đăng bài (
        {parkedNames}). Không phải hỏng, cũng không phải sắp xong — đây là quyết định thu phạm vi
        ngày 02/09/2026. Các trang đó vẫn mở xem được, nhưng nút đăng sẽ từ chối.
      </p>
      {isPostingFullyParked() ? (
        <p className="text-slate-300/70">
          MKT Browser chưa phát cho ai. Công cụ chưa chứng minh được hai nick là không liên kết
          được với nhau, nên đừng dùng nick thật dựa vào nó. Cần mở lại nền tảng nào thì hỏi chủ
          dự án.
        </p>
      ) : null}
    </section>
  );
}
