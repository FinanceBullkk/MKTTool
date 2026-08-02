/**
 * Luật 10 — Kết quả dò sức khỏe gần nhất. CHỈ ÁP CHO REDDIT.
 *
 * Luật 1 đọc `status` — thứ do người đặt. Luật này đọc kết quả dò — thứ người ngoài thật sự
 * nhìn thấy. Hai nguồn khác nhau, và chỗ chúng lệch nhau mới là chỗ đáng lo:
 *
 *  • Ai đó gỡ cách ly một nick về ALIVE mà chưa dò lại. Luật 1 cho qua vì `status` đã sạch;
 *    luật này vẫn thấy lần dò cuối nói nick bị ẩn, và chặn.
 *  • Chưa dò lần nào, hoặc dò lâu rồi. Không có tin xấu KHÔNG phải là tin tốt — đó là
 *    không có tin. Cảnh báo để người biết mình đang đăng mù.
 *
 * Không áp cho Facebook: Fanpage đăng bằng Graph API chính thức, đăng hỏng thì Graph trả lỗi
 * ngay chứ không có chuyện bài lên mà không ai thấy.
 */
import { MS_PER_DAY, formatDayMonth } from "@/lib/format/vietnamese-date-format";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleHealthCheck(ctx: RuleContext): RuleVerdict {
  const latest = ctx.latestHealthCheck;

  if (!latest) {
    return warn(
      "Nick chưa được dò shadowban lần nào, nên chưa biết bài của nó có hiện với người ngoài " +
        "không. Thêm proxy quan sát viên ở /proxies rồi chạy `npm run health`.",
    );
  }

  if (latest.verdict === "SHADOWBANNED" || latest.verdict === "CHECKPOINT") {
    return block(
      `Lần dò gần nhất (${formatDayMonth(latest.checkedAt)}) kết luận nick đang ở tình trạng ` +
        `"${latest.verdict}". Trạng thái nick có thể đã được gỡ cách ly bằng tay, nhưng chưa có ` +
        "lần dò nào chứng minh nick đã hồi phục. Chạy `npm run health` cho nick này trước.",
    );
  }

  const daysOld = (ctx.at.getTime() - latest.checkedAt.getTime()) / MS_PER_DAY;
  if (daysOld > ctx.thresholds.healthCheckStaleDays) {
    return warn(
      `Lần dò gần nhất đã ${Math.floor(daysOld)} ngày trước (${formatDayMonth(latest.checkedAt)}). ` +
        "Shadowban im lặng — số liệu cũ không nói được gì về hôm nay.",
    );
  }

  if (latest.verdict === "ERROR") {
    return warn(
      `Lần dò gần nhất không kết luận được (${formatDayMonth(latest.checkedAt)}): bộ dò bị chặn ` +
        "hoặc Reddit đổi HTML. Xem lý do ở /health — đang đăng mà không có ai canh.",
    );
  }

  if (latest.verdict === "WARN") {
    return warn(
      `Lần dò gần nhất thấy ít bài hơn số đã đăng (${formatDayMonth(latest.checkedAt)}). ` +
        "Có thể chỉ là mod xóa bài, cũng có thể là bị ẩn từng bài — xem chi tiết ở /health.",
    );
  }

  return ALLOW;
}
