/**
 * Trang Hôm nay nên nói gì về bản sao lưu — hàm thuần, test được không cần database.
 *
 * ## Vì sao cảnh báo này bắt buộc phải có
 *
 * Một nếp sao lưu tự động hỏng lặng lẽ **tệ hơn không có nếp nào**. Không có thì người ta biết
 * mình đang không có gì; có mà hỏng thì người ta tin là mình đang được bảo vệ, và điều đó chỉ
 * được kiểm chứng vào đúng ngày mọi thứ khác đã cháy.
 *
 * Bộ lịch ghi kết cục từng lượt vào `ScheduledJobRun`, nhưng một hàng trong database thì không ai
 * mở ra xem. Đây là chỗ biến nó thành thứ đập vào mắt.
 *
 * ## Vì sao KHÔNG kêu khi tính năng đang tắt
 *
 * Tắt là một lựa chọn hợp lệ, và người vận hành không đổi được biến môi trường của máy chủ. Kêu
 * với họ một dòng đỏ vĩnh viễn chỉ dạy họ phớt lờ cả trang. Ca "chưa bật" thuộc về khay cảnh báo
 * vận hành, nơi lọc theo ADMIN — cùng lập luận với `collect-ops-alerts.ts`.
 */

/** Quá ngần này ngày mà không có bản sao mới thì coi là hỏng, dù sổ không ghi lỗi nào. */
export const BACKUP_STALE_AFTER_DAYS = 2;

export type BackupWarningKind = "NEVER_RAN" | "LAST_FAILED" | "STALE";

export interface BackupFreshnessWarning {
  kind: BackupWarningKind;
  message: string;
  tone: "amber" | "red";
}

export interface BackupFreshnessInput {
  /** Lịch đã bật VÀ R2 đã khai. Tắt thì hàm này im. */
  enabled: boolean;
  /** Mốc bộ lịch quyết lượt gần nhất, `null` khi chưa có lượt nào. */
  lastRunAt: Date | null;
  /** `LAUNCHED` là đã tải lên được; mọi giá trị khác là chưa. */
  lastOutcome: string | null;
  lastDetail: string | null;
  now: Date;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function evaluateBackupFreshness(
  input: BackupFreshnessInput,
): BackupFreshnessWarning | null {
  if (!input.enabled) return null;

  if (input.lastRunAt === null) {
    return {
      kind: "NEVER_RAN",
      message:
        "Lịch sao lưu đã bật nhưng chưa chạy lượt nào — chưa có bản sao nào nằm ngoài Railway. " +
        "Bình thường nếu vừa bật; quá một ngày mà vẫn vậy thì bộ lịch không chạy.",
      tone: "amber",
    };
  }

  // Lượt gần nhất hỏng là tin xấu ngay lập tức, không đợi tới ngưỡng cũ: nó nói ra được LÝ DO,
  // mà lý do mới là thứ sửa được.
  if (input.lastOutcome !== "LAUNCHED") {
    return {
      kind: "LAST_FAILED",
      message:
        `Lượt sao lưu gần nhất KHÔNG thành công${input.lastDetail ? `: ${input.lastDetail}` : "."} ` +
        `Bộ lịch chỉ thử lại vào ngày mai, nên chừng nào chưa sửa thì mỗi ngày thêm một ngày ` +
        `không có bản sao mới.`,
      tone: "red",
    };
  }

  const days = daysBetween(input.lastRunAt, input.now);
  if (days >= BACKUP_STALE_AFTER_DAYS) {
    return {
      kind: "STALE",
      message:
        `Bản sao lưu mới nhất đã ${days} ngày tuổi, trong khi lịch chạy mỗi ngày. Sổ không ghi ` +
        `lỗi nào — nghĩa là bộ lịch đang KHÔNG chạy, chứ không phải nó chạy rồi hỏng.`,
      tone: "red",
    };
  }

  return null;
}
