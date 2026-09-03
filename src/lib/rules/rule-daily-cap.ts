/**
 * Luật 4 — Giới hạn bài mỗi ngày. CHỈ ÁP CHO NỀN TẢNG CỘNG ĐỒNG.
 *
 * Nick người thật không đăng 5 bài/ngày đều đặn. Nhịp đăng đều và dày là dấu hiệu
 * dễ nhận nhất của tài khoản vận hành bằng công cụ.
 *
 * Không áp cho Fanpage: kênh thương hiệu đăng 5 bài một ngày là chuyện thường, không ai phạt.
 */
import { formatDayMonth } from "@/lib/format/vietnamese-date-format";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleDailyCap(ctx: RuleContext): RuleVerdict {
  const { postsSameDay } = ctx;
  const { maxPostsPerDay, warnPostsPerDay } = ctx.thresholds;
  const day = formatDayMonth(ctx.at);

  if (postsSameDay >= maxPostsPerDay) {
    return block(
      `Nick already has ${postsSameDay} posts on ${day}; the limit is ${maxPostsPerDay} posts per day. ` +
        "Move this post to another day.",
    );
  }

  if (postsSameDay >= warnPostsPerDay) {
    return warn(
      `This would be post number ${postsSameDay + 1} for the nick on ${day}. Space the posts a few hours apart.`,
    );
  }

  return ALLOW;
}
