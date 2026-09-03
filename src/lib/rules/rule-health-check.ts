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
      "This nick has never been checked for a shadowban, so we do not know whether its posts are " +
        "visible to outsiders. Add an observer proxy in /proxies, then run `npm run health`.",
    );
  }

  if (latest.verdict === "SHADOWBANNED" || latest.verdict === "CHECKPOINT") {
    return block(
      `The latest check (${formatDayMonth(latest.checkedAt)}) reported "${latest.verdict}". ` +
        "The nick may have been released from quarantine manually, but no later check proves it recovered. " +
        "Run `npm run health` for this nick before posting.",
    );
  }

  // Đặt TRƯỚC phép kiểm cũ/mới: một kết luận lạ mà lại cũ thì nhánh "số liệu cũ" nuốt mất nó và
  // trả WARN, tức vẫn cho đăng. Không hiểu kết luận là không kết luận được, và chuyện đó không
  // phụ thuộc kết luận đó cũ hay mới.
  if (!JUDGEABLE_VERDICTS.has(latest.verdict)) {
    return block(
      `The latest check (${formatDayMonth(latest.checkedAt)}) returned "${latest.verdict}", which ` +
        "this rule does not know how to evaluate. An unknown result cannot be treated as healthy. " +
        "Teach rule 10 how to evaluate it in rule-health-check.ts before posting again.",
    );
  }

  const daysOld = (ctx.at.getTime() - latest.checkedAt.getTime()) / MS_PER_DAY;
  if (daysOld > ctx.thresholds.healthCheckStaleDays) {
    return warn(
      `The latest check was ${Math.floor(daysOld)} days ago (${formatDayMonth(latest.checkedAt)}). ` +
        "Shadowbans are silent, so stale data cannot confirm the nick is healthy today.",
    );
  }

  if (latest.verdict === "ERROR") {
    return warn(
      `The latest check was inconclusive (${formatDayMonth(latest.checkedAt)}): the checker was blocked ` +
        "or Reddit changed its HTML. Review the reason on /health before posting without visibility checks.",
    );
  }

  if (latest.verdict === "NO_BASELINE") {
    return warn(
      `The latest check (${formatDayMonth(latest.checkedAt)}) found the nick, but could not verify any ` +
        "posts because none were marked as posted. This is normal for a new or resting nick; if posts " +
        "were published without clicking \"Posted\", the checker is blind even while the dashboard looks healthy.",
    );
  }

  if (latest.verdict === "WARN") {
    return warn(
      `The latest check found fewer posts than the queue records (${formatDayMonth(latest.checkedAt)}). ` +
        "A moderator may have removed a post, or individual posts may be hidden. Review the details on /health.",
    );
  }

  // Nick khỏe, SỔ SÁCH của mình mới là thứ thiếu — nên cảnh báo chứ không chặn, cùng lý do
  // `statusForcedBy` cố ý không cách ly nick vì kết luận này (xem health-verdict.ts). Nhưng cũng
  // KHÔNG được im: luật 4, 5 và 6 đang đếm thiếu đúng số bài mà bộ dò vừa nhìn thấy.
  if (latest.verdict === "UNTRACKED_POSTS") {
    return warn(
      `The latest check (${formatDayMonth(latest.checkedAt)}) found posts that are missing from the queue. ` +
        "The nick appears healthy, but daily caps, cooldowns, and promotional ratios are undercounted. " +
        "Record those posts in /queue before scheduling more.",
    );
  }

  return ALLOW;
}
