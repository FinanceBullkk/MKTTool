/**
 * Đọc trang profile công khai của Reddit (bản `old.reddit.com`) thành số liệu.
 *
 * Hàm thuần trên HTML — không chạm mạng, nên test được bằng HTML mẫu và đó cũng là chỗ duy
 * nhất bắt được lúc Reddit đổi giao diện.
 *
 * Dùng `old.reddit.com` chứ không phải giao diện mới: bản cũ trả HTML đầy đủ ngay trong phản
 * hồi đầu tiên, không cần chạy JS, và cấu trúc gần như đứng yên nhiều năm. Giao diện mới dựng
 * bằng JS và đổi tên class liên tục — bộ dò dựa vào nó sẽ hỏng mỗi vài tháng.
 *
 * KHÔNG có nhánh nào trả về "khỏe" khi không đọc được. Đọc không ra thì nói `UNPARSEABLE`,
 * và người gọi có trách nhiệm biến nó thành `ERROR`.
 */
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";

export type RedditProfile =
  /** Reddit nói không có nick này. Với nick mình đang nuôi, đây là dấu hiệu shadowban toàn cục. */
  | { kind: "MISSING" }
  /** Trang về tới nơi nhưng không nhận ra là trang profile — Reddit có thể vừa đổi HTML. */
  | { kind: "UNPARSEABLE"; reason: string }
  | {
      kind: "OK";
      /** Tổng karma bài + karma comment. `null` khi không tìm thấy ô karma. */
      karma: number | null;
      /** Từng BÀI thấy được, kèm khóa để đối chiếu với job trong kho. Comment đếm riêng. */
      posts: VisiblePost[];
      commentCount: number;
    };

/**
 * Một bài nhìn thấy được trên trang profile công khai.
 *
 * `threadKey` là thứ biến bộ dò từ ĐẾM thành ĐỐI CHIẾU: nó dùng chung đúng bộ chuẩn hóa với
 * luật 8, nên ghép thẳng được với `postedUrl` của job trong kho. Trước đây parser chỉ lấy mốc
 * thời gian, nên bộ dò biết "thiếu một bài" mà không chỉ được vào bài nào.
 *
 * `null` khi thẻ không mang thuộc tính nhận dạng nào — vẫn đếm được, chỉ là không ghép được.
 */
export interface VisiblePost {
  timestamp: number;
  threadKey: string | null;
}

/**
 * Câu chữ báo không có nick này.
 *
 * Đo 03/08/2026: Reddit KHÔNG còn trả câu "nobody on Reddit goes by that name" nữa — trang
 * giờ là "page not found" thường. Giữ lại câu cũ vì nó vô hại và có thể còn xuất hiện ở vài
 * đường, nhưng tín hiệu thật nằm ở HTTP 404, xem `parseRedditProfile`.
 */
const MISSING_MARKERS = [
  "nobody on reddit goes by that name",
  "reddit.com: page not found",
] as const;

/**
 * Dấu hiệu đây là trang profile có thật.
 *
 * CHỈ dùng `id="siteTable"` — đo 03/08/2026: trang 404 của Reddit vẫn có đủ thanh điều hướng,
 * header và ô đăng nhập, nên mọi dấu hiệu "khung sườn trang" đều có mặt ở cả hai bên và không
 * phân biệt được gì. `siteTable` là hộp chứa danh sách hoạt động, chỉ trang profile thật mới có.
 */
const PROFILE_MARKERS = ['id="siteTable"'] as const;

/** `1,234` → 1234. Trả `null` cho chuỗi rác thay vì `NaN`. */
function parseKarmaNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[,.\s]/g, "");
  if (!/^-?\d+$/.test(digits)) return null;
  return Number(digits);
}

/**
 * Cộng mọi ô `class="karma..."` trong sidebar. Bản cũ để karma bài ở `class="karma"` và
 * karma comment ở `class="karma comment-karma"`; cộng cả hai cho ra con số người dùng quen thấy.
 */
function readKarma(html: string): number | null {
  const matches = [...html.matchAll(/<span[^>]*class="[^"]*\bkarma\b[^"]*"[^>]*>([^<]*)<\/span>/gi)];
  if (matches.length === 0) return null;

  let total = 0;
  let found = false;
  for (const match of matches) {
    const value = parseKarmaNumber(match[1]);
    if (value !== null) {
      total += value;
      found = true;
    }
  }

  return found ? total : null;
}

/**
 * Rút khóa nhận dạng bài từ thẻ mở của một mục.
 *
 * Ưu tiên `data-permalink` (`/r/Trove/comments/1veg99o/tieu-de/`) rồi mới tới
 * `data-fullname` (`t3_1veg99o`) — cả hai đều nằm sẵn trong đúng cái thẻ vòng lặp dưới đây
 * vốn đã quét, nên đọc thêm chúng không tốn thêm request nào.
 *
 * Cho permalink đi qua `normalizeThreadUrl()` của luật 8 thay vì tự cắt chuỗi: khóa hai bên
 * phải sinh ra từ CÙNG một hàm thì mới ghép được, còn hai cách rút gọn riêng là hai cách sai
 * khác nhau.
 */
function readThreadKey(tag: string): string | null {
  const permalink = /\bdata-permalink="([^"]+)"/i.exec(tag)?.[1];
  if (permalink) return normalizeThreadUrl(permalink);

  const fullname = /\bdata-fullname="t3_([a-z0-9]+)"/i.exec(tag)?.[1];
  return fullname ? `reddit:${fullname.toLowerCase()}` : null;
}

/**
 * Mỗi mục trong danh sách là một `<div class="... thing ...">` mang sẵn `data-type`
 * (`link` = bài, `comment` = comment) và `data-timestamp` tính bằng mili giây.
 *
 * Chỉ soi thẻ mở của từng mục chứ không parse cả cây DOM: nhẹ, và không kéo thêm thư viện
 * chỉ để đọc vài thuộc tính.
 */
function readListing(html: string): { posts: VisiblePost[]; commentCount: number } {
  const posts: VisiblePost[] = [];
  let commentCount = 0;

  for (const match of html.matchAll(/<div[^>]*\bclass="[^"]*\bthing\b[^"]*"[^>]*>/gi)) {
    const tag = match[0];

    const type = /\bdata-type="([^"]+)"/i.exec(tag)?.[1];
    if (type === "comment") {
      commentCount += 1;
      continue;
    }
    if (type !== "link") continue;

    const timestamp = Number(/\bdata-timestamp="(\d+)"/i.exec(tag)?.[1]);
    if (Number.isFinite(timestamp) && timestamp > 0) {
      posts.push({ timestamp, threadKey: readThreadKey(tag) });
    }
  }

  return { posts, commentCount };
}

export interface RedditProfilePage {
  html: string;
  /**
   * Mã HTTP của trang. Đây là tín hiệu MẠNH NHẤT và ổn định nhất: Reddit trả 404 cho cả nick
   * không tồn tại lẫn nick bị shadowban toàn cục, và mã HTTP không đổi theo đợt thay giao diện
   * như câu chữ trong trang. Bỏ trống thì lùi về đọc câu chữ.
   */
  status?: number;
}

export function parseRedditProfile(page: RedditProfilePage): RedditProfile {
  const haystack = page.html.toLowerCase();

  if (page.status === 404) return { kind: "MISSING" };
  if (MISSING_MARKERS.some((marker) => haystack.includes(marker))) return { kind: "MISSING" };

  if (!PROFILE_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()))) {
    return {
      kind: "UNPARSEABLE",
      reason:
        "Không nhận ra đây là trang profile Reddit bản cũ. Reddit có thể vừa đổi HTML, " +
        "hoặc proxy quan sát viên bị trả về một trang khác. Mở tay old.reddit.com để đối chiếu.",
    };
  }

  const { posts, commentCount } = readListing(page.html);
  return { kind: "OK", karma: readKarma(page.html), posts, commentCount };
}

/** Những bài thấy được nằm trong `windowDays` ngày gần nhất tính từ `now`. */
export function postsWithin(
  posts: readonly VisiblePost[],
  windowDays: number,
  now: Date = new Date(),
): VisiblePost[] {
  const since = now.getTime() - windowDays * 86_400_000;
  return posts.filter((post) => post.timestamp >= since);
}
