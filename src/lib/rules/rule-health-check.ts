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

/**
 * Những kết luận luật này BIẾT CÁCH chấm. Cố ý là danh sách RIÊNG, không import
 * `HEALTH_VERDICTS` của bộ dò — và đó là toàn bộ giá trị của nó.
 *
 * Import danh sách kia thì thêm một kết luận mới ở bộ dò là nó tự động được coi như "đã biết",
 * rơi xuống `ALLOW` cuối hàm, và luật 10 lặng lẽ ngừng bảo vệ đúng loại nick vừa sinh ra. Giữ
 * danh sách riêng thì chuyện ngược lại xảy ra: kết luận lạ bị CHẶN cho tới khi có người dạy luật
 * này cách chấm nó. Bắt phải nghĩ, giống hệt dấu `vault:` của mỗi cột mã hóa.
 *
 * `rule-health-check.test.ts` đối chiếu hai danh sách, nên người thêm kết luận mới gặp test đỏ ở
 * máy mình chứ không gặp cả đàn nick bị chặn trên máy chủ.
 */
const JUDGEABLE_VERDICTS = new Set([
  "HEALTHY",
  "WARN",
  "SHADOWBANNED",
  "CHECKPOINT",
  "ERROR",
  "NO_BASELINE",
  "UNTRACKED_POSTS",
]);

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

  // Đặt TRƯỚC phép kiểm cũ/mới: một kết luận lạ mà lại cũ thì nhánh "số liệu cũ" nuốt mất nó và
  // trả WARN, tức vẫn cho đăng. Không hiểu kết luận là không kết luận được, và chuyện đó không
  // phụ thuộc kết luận đó cũ hay mới.
  if (!JUDGEABLE_VERDICTS.has(latest.verdict)) {
    return block(
      `Lần dò gần nhất (${formatDayMonth(latest.checkedAt)}) trả về kết luận "${latest.verdict}" ` +
        "mà luật này chưa biết cách chấm. Không hiểu kết quả thì không được coi là khỏe — " +
        "dạy luật 10 cách chấm kết luận đó (rule-health-check.ts) rồi đăng lại.",
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

  if (latest.verdict === "NO_BASELINE") {
    return warn(
      `Lần dò gần nhất (${formatDayMonth(latest.checkedAt)}) chỉ thấy nick còn hiện ra, chưa ` +
        "kiểm được bài nào vì không bài nào được đánh dấu đã đăng. Nick mới hoặc đang nghỉ thì " +
        "bình thường; đăng rồi mà quên bấm “Đã đăng” thì bộ dò đang mù mà bảng vẫn xanh.",
    );
  }

  if (latest.verdict === "WARN") {
    return warn(
      `Lần dò gần nhất thấy ít bài hơn số đã đăng (${formatDayMonth(latest.checkedAt)}). ` +
        "Có thể chỉ là mod xóa bài, cũng có thể là bị ẩn từng bài — xem chi tiết ở /health.",
    );
  }

  // Nick khỏe, SỔ SÁCH của mình mới là thứ thiếu — nên cảnh báo chứ không chặn, cùng lý do
  // `statusForcedBy` cố ý không cách ly nick vì kết luận này (xem health-verdict.ts). Nhưng cũng
  // KHÔNG được im: luật 4, 5 và 6 đang đếm thiếu đúng số bài mà bộ dò vừa nhìn thấy.
  if (latest.verdict === "UNTRACKED_POSTS") {
    return warn(
      `Lần dò gần nhất (${formatDayMonth(latest.checkedAt)}) thấy bài mà kho không có. ` +
        "Nick không sao, nhưng hạn mức ngày, giãn cách và tỷ lệ promo đang đếm thiếu — " +
        "vào /queue ghi lại những bài đó trước khi xếp thêm.",
    );
  }

  return ALLOW;
}
