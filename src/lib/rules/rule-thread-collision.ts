/**
 * Luật 8 — Đụng độ thread. KHÔNG CHO GHI ĐÈ.
 *
 * Hai nick của cùng một người chạm vào một thread là tín hiệu phối hợp rõ nhất mà nền tảng
 * bắt được. Trên Reddit, hai nick chung IP cùng tương tác một bài là shadowban tức thì;
 * IP khác nhau vẫn bị chấm điểm nghi ngờ vì mẫu hành vi quá lộ.
 *
 * Không có lý do kinh doanh nào đủ lớn để đánh đổi, nên đây là luật duy nhất không cho ghi đè.
 */
import { getInteractionKindLabel } from "@/lib/content/content-types";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

/** Chỉ cần đúng ba mảnh này để chạy luật — nhờ vậy dùng lại được cho form ghi tương tác tay. */
export type ThreadCollisionContext = Pick<
  RuleContext,
  "target" | "threadCollisions" | "sameTargetNeighbors" | "thresholds"
>;

export function ruleThreadCollision(ctx: ThreadCollisionContext): RuleVerdict {
  const [collision] = ctx.threadCollisions;

  if (collision) {
    return block(
      `Nick "${collision.accountUsername}" của mình đã ${getInteractionKindLabel(collision.kind)} ` +
        `ở đúng thread này lúc ${formatDayMonthTime(collision.at)}. Hai nick cùng chủ đụng một ` +
        "thread là tín hiệu phối hợp — luật này không cho ghi đè.",
    );
  }

  const [neighbor] = ctx.sameTargetNeighbors;
  if (neighbor) {
    return warn(
      `Nick "${neighbor.accountUsername}" của mình vừa hoạt động ở ${ctx.target.name} lúc ` +
        `${formatDayMonthTime(neighbor.at)} (trong vòng ${ctx.thresholds.threadCollisionWarnHours} ` +
        "tiếng). Khác thread nên chưa chặn, nhưng giãn giờ ra thì an toàn hơn.",
    );
  }

  return ALLOW;
}

const REDDIT_POST_ID = /\/comments\/([a-z0-9]+)/;

/**
 * Rút URL về một khóa so sánh ổn định.
 *
 * Cùng một bài Reddit có vô số URL khác nhau (có/không slug, old.reddit, share link kèm tham số
 * theo dõi). So chuỗi thô là bỏ lọt gần hết, nên rút permalink về id bài.
 */
export function normalizeThreadUrl(raw: string): string {
  const trimmed = raw.trim().toLowerCase();

  const redditMatch = trimmed.match(REDDIT_POST_ID);
  if (redditMatch) return `reddit:${redditMatch[1]}`;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}
