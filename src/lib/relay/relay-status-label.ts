/**
 * Nhãn cầu nối hiện ở thanh đầu trang — tên máy và phiên bản đã khai báo (ví dụ "AnhHao · v16").
 *
 * Tách thành hàm thuần vì nó canh đúng một luật: **không bịa số bản.** Bản redesign 19/08/2026
 * ghi cứng chuỗi `"Relay v15 (…)"` vào thanh đầu trang, đúng một ngày sau khi `relayVersion`
 * trở thành con số thật đọc từ máy (xem chú thích cột đó ở `schema.prisma`). Chuỗi v15 này là
 * **historical evidence**, không phải candidate hiện tại; nhãn cứng nói dối ở chỗ nguy hiểm nhất
 * — nó bảo mọi máy đều đang chạy một bản cụ thể kể cả máy chưa từng khai bản nào, tức là xóa sạch
 * thứ mà C40 vừa dựng lên để trả lời "còn ai kẹt ở bản cũ không".
 *
 * `relayVersion` null nghĩa là **chưa biết**, không phải "bản cũ" — nên chỗ đó bỏ trống, không
 * điền số.
 */

export interface RelayStatusInput {
  /** Tên máy do người đăng ký đặt. */
  name: string;
  /** Bản cầu nối máy khai lần gần nhất. `null` = chưa từng khai. */
  relayVersion: number | null;
}

/** Chưa có máy nào đăng ký — nói đúng như vậy, không giả vờ có cầu nối đang chạy. */
export const NO_RELAY_LABEL = "Chưa ghi máy nào";

export function relayStatusLabel(device: RelayStatusInput | null): string {
  if (!device) return NO_RELAY_LABEL;
  if (device.relayVersion === null) return device.name;
  return `${device.name} · v${device.relayVersion}`;
}
