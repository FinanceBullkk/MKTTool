/**
 * Đọc cặp `relayVersion` + `lastSeenAt` của một máy trong sổ thành một câu người ta hiểu được.
 *
 * ## Vì sao cần một module riêng cho hai cột
 *
 * C40 dựng đường ghi (`relay-device-version-reporting.ts`) và dừng ở đó: hai cột được ghi đều đặn
 * từ 18/08/2026 và **không màn hình nào đọc**. Muốn biết đội đang chạy bản nào thì phải mở SQL —
 * đúng câu hỏi mà C40 sinh ra để trả lời, hỏi theo đúng cách mà C40 định bỏ đi.
 *
 * ## Ba cái bẫy nằm sẵn trong dữ liệu
 *
 * 1. **`null` là "chưa biết", không phải "bản cũ".** Schema nói thẳng điều này và nó dễ sai đúng
 *    theo hướng đắt nhất: vẽ `null` thành cảnh báo đỏ là chỉ vào một chiếc máy khỏe mạnh và bảo
 *    người ta đi sửa. Mọi máy đăng ký trước 18/08/2026 đều bắt đầu từ `null`.
 *
 * 2. **Một con số không có mốc thời gian không nói được gì.** "Đang chạy bản 12" và "tắt từ tháng
 *    trước ở bản 12" là cùng một con số, và chỉ một trong hai là việc phải làm hôm nay. Nên trạng
 *    thái luôn đi kèm độ tươi, không bao giờ đứng một mình.
 *
 * 3. **Đây là con số do máy khách khai.** Nó không cho phép việc gì — thứ chặn thật là
 *    `minRelayVersion` trong từng tấm vé, do máy chủ ký. Chữ nghĩa ở đây phải là *quan trắc*
 *    ("máy khai bản 12"), không phải *phán quyết* ("máy này bị chặn"), vì máy chủ không hề biết
 *    chiếc máy đó vừa cập nhật xong lúc nào.
 */
import { MS_PER_DAY } from "@/lib/format/vietnamese-date-format";

/**
 * Quá mốc này thì con số phiên bản là **hồ sơ cũ**, không phải trạng thái hiện tại.
 *
 * Bảy ngày vì mọi máy đang dùng thật đều mở web app trong một tuần làm việc — không mở tức là
 * không làm việc, và một chiếc máy không làm việc thì bản của nó không còn là câu hỏi cấp bách.
 * Con số này chỉ đổi chữ hiển thị, không chặn gì, nên sai lệch vài ngày không hỏng chuyện gì.
 */
export const VERSION_REPORT_STALE_AFTER_MS = 7 * MS_PER_DAY;

export type RelayVersionTone = "unknown" | "current" | "below-floor" | "stale";

export interface RelayVersionStatus {
  /** Nhãn ngắn trên badge. */
  label: string;
  tone: RelayVersionTone;
  /** Dòng phụ dưới badge — mốc nhìn thấy, hoặc lý do không có mốc nào. */
  detail: string;
}

export interface RelayVersionInput {
  relayVersion: number | null;
  lastSeenAt: Date | null;
  /** `revokedAt` khác `null` thì hai cột đứng yên từ lúc thu hồi — xem `recordRelayDeviceVersion`. */
  revokedAt: Date | null;
}

/**
 * Dịch trạng thái phiên bản của một máy.
 *
 * `floor` truyền vào chứ không đọc thẳng `MIN_RELAY_VERSION`: sàn là thứ đã đổi một lần giữa
 * chừng (12 → 13, và chính lần đổi đó đẻ ra C39 lẫn C40), nên chỗ nào so với sàn cũng phải kiểm
 * được ở cả hai phía của lần đổi tiếp theo.
 */
export function readRelayVersionStatus(
  device: RelayVersionInput,
  floor: number,
  now: Date = new Date(),
): RelayVersionStatus {
  const { relayVersion, lastSeenAt, revokedAt } = device;

  // Máy thu hồi: giữ nguyên con số cuối cùng và nói rõ nó đã đóng băng. Vẽ nó như trạng thái
  // sống là làm một hàng đã đóng trông như còn chạy.
  if (revokedAt) {
    return {
      label: relayVersion === null ? "never reported" : `version ${relayVersion}`,
      tone: "unknown",
      detail: "frozen when this Relay PC was revoked",
    };
  }

  if (relayVersion === null) {
    return {
      label: "not reported",
      tone: "unknown",
      // Nói ra cách để ô này tự đầy, vì người đọc sẽ hỏi ngay "làm sao cho nó hiện ra".
      detail: "this Relay PC has not opened the web app since 18 August; its version is unknown, not outdated",
    };
  }

  const staleness = lastSeenAt ? now.getTime() - lastSeenAt.getTime() : null;
  const isStale = staleness === null || staleness > VERSION_REPORT_STALE_AFTER_MS;

  if (relayVersion < floor) {
    return {
      label: `version ${relayVersion} - below minimum ${floor}`,
      // Dưới sàn là việc phải làm, kể cả khi số đã cũ: một chiếc máy khai bản 12 rồi im lặng
      // vẫn là một chiếc máy sẽ bị từ chối vào đúng ngày nó quay lại.
      tone: "below-floor",
      detail: describeLastSeen(lastSeenAt, isStale),
    };
  }

  return {
    label: `version ${relayVersion}`,
    tone: isStale ? "stale" : "current",
    detail: describeLastSeen(lastSeenAt, isStale),
  };
}

function describeLastSeen(lastSeenAt: Date | null, isStale: boolean): string {
  // Có phiên bản mà không có mốc chỉ xảy ra nếu ai đó ghi tay vào database — hai cột luôn được
  // ghi cùng lúc. Nói thẳng là không biết, đừng đoán.
  if (!lastSeenAt) return "last response time unknown";
  return isStale ? "no recent response; this version report is stale" : "responded recently";
}
