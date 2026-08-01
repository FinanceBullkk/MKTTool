/**
 * Luật 4 — Giới hạn bài mỗi ngày.
 *
 * Nick người thật không đăng 5 bài/ngày đều đặn. Nhịp đăng đều và dày là dấu hiệu
 * dễ nhận nhất của tài khoản vận hành bằng công cụ.
 */
import { formatDayMonth } from "@/lib/format/vietnamese-date-format";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleDailyCap(ctx: RuleContext): RuleVerdict {
  const { postsSameDay } = ctx;
  const { maxPostsPerDay, warnPostsPerDay } = ctx.thresholds;
  const day = formatDayMonth(ctx.at);

  if (postsSameDay >= maxPostsPerDay) {
    return block(
      `Nick đã có ${postsSameDay} bài trong ngày ${day} — hạn mức là ${maxPostsPerDay} bài/ngày. ` +
        "Dời bài này sang hôm khác.",
    );
  }

  if (postsSameDay >= warnPostsPerDay) {
    return warn(
      `Đây là bài thứ ${postsSameDay + 1} của nick trong ngày ${day}. Giãn giờ ra vài tiếng.`,
    );
  }

  return ALLOW;
}
