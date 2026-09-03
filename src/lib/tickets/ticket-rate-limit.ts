/**
 * Hạn nhịp cho đường phát vé bí mật.
 *
 * ## Nó chặn cái gì
 *
 * Không phải người ngoài — `guardedAction` + `requireNickOwner` đã chặn rồi. Nó chặn **một phiên
 * bị trộm**: kẻ cầm cookie của một operator gọi thẳng server action trong vòng lặp và rút sạch
 * bí mật của mọi nick người đó làm chủ trong vài giây. `AuditLog` ghi lại đầy đủ, nhưng nhật ký
 * là thứ đọc **sau**, còn thiệt hại thì đã xong.
 *
 * Không đặt hạn thì "sạch kho" là chuyện của vài giây; đặt hạn thì nó thành chuyện của nhiều
 * phút, và nhiều phút là đủ để một người nhận ra tab của mình đang tự bấm nút.
 *
 * ## Vì sao giữ trong bộ nhớ, khác với khóa chống chạy chồng của bộ dò
 *
 * Khóa của bộ dò phải nằm trong database vì nó điều phối **hai tiến trình** (lịch chạy nền và
 * người bấm nút). Ở đây chỉ có một: web app. Thêm một bảng cho việc này là đổi một lượt ghi
 * database lấy đúng thứ mà một `Map` đã làm được.
 *
 * Đánh đổi phải nói ra: **khởi động lại là quên sạch**, và nếu có ngày chạy nhiều bản song song
 * thì mỗi bản đếm riêng. Cả hai đều nới lỏng chứ không siết nhầm, và kẻ trộm phiên không tự gây
 * ra được lượt khởi động lại nào.
 *
 * ## Vì sao chỉ áp cho vé bí mật, không áp cho vé mở profile
 *
 * Ruột vé mở profile là cấu hình proxy — thứ mà chính người đó vào `/proxies` là xem được, và
 * vốn thuộc vùng khóa máy chủ. Siết nó chỉ làm phiền người mở lần lượt 8 profile buổi sáng.
 */

/** Bao nhiêu vé bí mật trong một cửa sổ. Cao hơn nhu cầu người thật rất nhiều lần. */
const MAX_TICKETS_PER_WINDOW = 10;

/** Độ dài cửa sổ trượt, mili-giây. */
const WINDOW_MS = 60_000;

/**
 * Mốc thời gian các lần phát gần đây, theo từng người.
 *
 * Không bao giờ lớn: mỗi khóa giữ tối đa `MAX_TICKETS_PER_WINDOW` số, và hàng của người ngừng
 * bấm bị dọn ngay ở lượt lọc dưới đây.
 */
const recentIssues = new Map<string, number[]>();

export interface RateLimitVerdict {
  allowed: boolean;
  /** Câu giải thích khi bị chặn — nói cả lý do lẫn khi nào thử lại được. */
  message: string;
}

/**
 * Ghi nhận một lượt xin vé và trả lời cho phép hay không.
 *
 * Ghi nhận **chỉ khi cho phép**: đếm cả những lượt đã bị chặn thì một vòng lặp đủ nhanh sẽ tự
 * đẩy cửa sổ của chính nó ra xa mãi, và người dùng thật bị khóa vô thời hạn vì hành vi của kẻ
 * đang gõ cửa.
 */
export function checkTicketRateLimit(userId: string, now: number = Date.now()): RateLimitVerdict {
  const cutoff = now - WINDOW_MS;
  const recent = (recentIssues.get(userId) ?? []).filter((at) => at > cutoff);

  if (recent.length >= MAX_TICKETS_PER_WINDOW) {
    const retryInSeconds = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    recentIssues.set(userId, recent);
    return {
      allowed: false,
      message:
        `${MAX_TICKETS_PER_WINDOW} secrets were retrieved within one minute. Wait ` +
        `${retryInSeconds} seconds before trying again. This limit prevents a stolen session ` +
        `from draining the vault in seconds; if these requests are yours, wait and continue.`,
    };
  }

  recent.push(now);
  recentIssues.set(userId, recent);
  return { allowed: true, message: "" };
}

/** Dọn sổ. Chỉ dùng trong test — mỗi bài test phải bắt đầu từ trạng thái trắng. */
export function resetTicketRateLimit(): void {
  recentIssues.clear();
}
