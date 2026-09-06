/**
 * Ô "cầu nối" trong sổ đăng ký máy — chỗ đọc của C40.
 *
 * ## Vì sao ô này tồn tại
 *
 * C40 dựng đường ghi `relayVersion` + `lastSeenAt` ngày 18/08/2026 và dừng ở đó: hai cột được ghi
 * đều đặn và **không màn hình nào đọc**. Câu hỏi sinh ra C40 — *"vừa chặn những ai, đội cập nhật
 * xong chưa, còn ai kẹt không"* — vẫn phải mở SQL mới trả lời được, tức là vẫn chưa ai trả lời.
 *
 * ## Vì sao con số không bao giờ đứng một mình
 *
 * "Đang chạy bản 12" và "tắt từ tháng trước ở bản 12" là **cùng một con số**, và chỉ một trong hai
 * là việc phải làm hôm nay. Nên badge luôn kèm một dòng độ tươi ở dưới, kể cả khi dòng đó chỉ nói
 * là không biết.
 *
 * Chữ nghĩa và phân loại nằm ở `relay-device-version-status.ts` để kiểm được không cần dựng React;
 * chỗ này chỉ chọn màu và xếp chỗ.
 */
import { StatusBadge } from "@/components/ui/page-section";
import {
  readRelayVersionStatus,
  type RelayVersionInput,
  type RelayVersionTone,
} from "@/lib/relay/relay-device-version-status";

/**
 * `unknown` PHẢI nhạt hơn cảnh báo: mọi máy đăng ký trước 18/08/2026 đều rơi vào đó và không máy
 * nào trong số đó có lỗi gì. Tô vàng chúng là chỉ vào một chiếc máy khỏe rồi bảo người ta đi sửa.
 */
const TONE_CLASS: Record<RelayVersionTone, string> = {
  current: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  "below-floor": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  stale: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-500",
  unknown: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export function RelayDeviceVersionCell({
  device,
  floor,
}: {
  device: RelayVersionInput;
  floor: number;
}) {
  const status = readRelayVersionStatus(device, floor);

  return (
    <>
      <StatusBadge label={status.label} className={TONE_CLASS[status.tone]} />
      <span className="mt-1 block text-sm leading-5 text-neutral-400">{status.detail}</span>
    </>
  );
}
