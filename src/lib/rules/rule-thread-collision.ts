/**
 * Luật 8 — Đụng độ thread. KHÔNG CHO GHI ĐÈ. CHỈ ÁP CHO NỀN TẢNG CỘNG ĐỒNG.
 *
 * Hai nick của cùng một người chạm vào một thread là tín hiệu phối hợp rõ nhất mà nền tảng
 * bắt được. Trên Reddit, hai nick chung IP cùng tương tác một bài là shadowban tức thì;
 * IP khác nhau vẫn bị chấm điểm nghi ngờ vì mẫu hành vi quá lộ.
 *
 * Không có lý do kinh doanh nào đủ lớn để đánh đổi, nên trong phạm vi áp dụng thì đây là
 * luật duy nhất không cho ghi đè.
 *
 * Không áp cho Fanpage: trang trả lời bình luận dưới bài của chính mình là chăm sóc khách
 * hàng, không phải giả làm hai người lạ đồng tình với nhau.
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
 * Tham số chỉ dùng để theo dõi lượt bấm — bỏ đi thì mọi biến thể share link của cùng
 * một bài cho ra cùng một khóa.
 *
 * Cố ý là danh sách LOẠI TRỪ, không phải danh sách giữ lại. Hai kiểu sai không cân nhau:
 *  - sót một tên tracking → khóa dư tham số → bỏ lọt một lần đụng độ, còn cảnh báo
 *    "nick khác cùng đích" đỡ phía sau;
 *  - bỏ nguyên query string → hai thread KHÁC NHAU ra cùng khóa. Facebook phát link group
 *    dạng `permalink.php?story_fbid=…` và `story.php?story_fbid=…`, path giống hệt nhau,
 *    chỉ query mới phân biệt. Mà luật 8 KHÔNG cho ghi đè, nên chặn nhầm là chặn vĩnh viễn,
 *    không có đường gỡ từ giao diện.
 */
const TRACKING_PARAMS = new Set([
  "ref",
  "refid",
  "ref_src",
  "ref_url",
  "fbclid",
  "gclid",
  "igshid",
  "mibextid",
  "rdt",
  "share_id",
  "share_source",
  "correlation_id",
  "notif_id",
  "notif_t",
  "_rdr",
  "si",
  "sh",
]);

/** `utm_*` của mọi nền tảng và `__cft__[0]` / `__tn__` của Facebook đều là tracking. */
function isTrackingParam(key: string): boolean {
  return TRACKING_PARAMS.has(key) || key.startsWith("utm_") || key.startsWith("__");
}

/** Phần query còn lại sau khi lọc tracking, sắp xếp để thứ tự tham số không đổi khóa. */
function meaningfulQuery(params: URLSearchParams): string {
  const kept = [...params.entries()]
    .filter(([key]) => !isTrackingParam(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);

  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

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
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host.replace(/^www\./, "")}${path}${meaningfulQuery(url.searchParams)}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}
