/**
 * So tiêu đề content với phần slug nằm trong permalink Reddit.
 *
 * Reddit tự sinh slug từ tiêu đề lúc đăng: `Is trove still alive? Will Gamigo continue to
 * develop it?` → `is_trove_still_alive_will_gamigo_continue_to`. Slug đó nằm sẵn trong mọi
 * permalink, kể cả link đã lưu trong kho — nên đây là tín hiệu duy nhất nối được MỘT LINK với
 * MỘT NỘI DUNG mà không cần mở bài ra xem.
 *
 * Vì sao trước đây cố ý KHÔNG đối chiếu tiêu đề (xem changelog 04/08): tiêu đề sửa được sau khi
 * đăng, nên slug lệch KHÔNG chứng minh được bài sai. Ở đây nó giữ đúng vai trò yếu hơn đó:
 *
 *  - làm **cổng tin cậy** trước khi tự ghi vào kho — chỉ tự gán khi slug khớp;
 *  - làm **cảnh báo** cho link đã gán, chứ không phải kết luận sức khỏe nick.
 *
 * Slug bị Reddit cắt ngắn (khoảng 50 ký tự) nên phép so phải một chiều: mọi từ trong slug có
 * mặt trong tiêu đề là khớp. So hai chiều thì mọi tiêu đề dài đều trượt.
 */

/** Chỉ cần khớp ngần này phần từ trong slug là coi như cùng một bài. */
export const TITLE_SLUG_MATCH_RATIO = 0.6;

/**
 * Từ quá ngắn bị bỏ: `a`, `to`, `it` xuất hiện trong gần như mọi tiêu đề nên khớp chúng không
 * nói lên điều gì, mà lại kéo tỷ lệ lên đủ để một cặp không liên quan trông như khớp.
 */
const MIN_TOKEN_LENGTH = 3;

function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Rút phần slug khỏi permalink: `/r/Trove/comments/1veg99o/is_trove_still_alive/` → phần cuối.
 *
 * Trả `null` khi link không có slug — link chia sẻ dạng `redd.it/1veg99o` hoặc permalink cụt là
 * chuyện thường, và "không có slug" phải khác hẳn "slug không khớp".
 */
export function readPermalinkSlug(permalinkOrUrl: string): string | null {
  const match = /\/comments\/[a-z0-9]+\/([^/?#]+)/i.exec(permalinkOrUrl.trim());
  const slug = match?.[1];
  if (!slug) return null;

  // Reddit dùng `_` cho bài không có tiêu đề chữ nào; không có ký tự nào đáng so thì coi như trống.
  return tokenize(slug).length > 0 ? slug : null;
}

/**
 * Phần từ trong slug có mặt trong tiêu đề, từ 0 đến 1.
 *
 * `null` khi không so được (thiếu slug hoặc tiêu đề rỗng) — người gọi phải tự quyết định, và
 * quyết định đúng gần như luôn là "không kết luận gì", chứ không phải "coi như lệch".
 */
export function titleSlugScore(contentTitle: string, permalinkOrUrl: string): number | null {
  const slug = readPermalinkSlug(permalinkOrUrl);
  if (!slug) return null;

  const slugTokens = tokenize(slug);
  const titleTokens = new Set(tokenize(contentTitle));
  if (slugTokens.length === 0 || titleTokens.size === 0) return null;

  const matched = slugTokens.filter((token) => titleTokens.has(token)).length;
  return matched / slugTokens.length;
}

/** Khớp đủ chắc để tự ghi vào kho. Không so được thì KHÔNG coi là khớp. */
export function titleMatchesPermalink(contentTitle: string, permalinkOrUrl: string): boolean {
  const score = titleSlugScore(contentTitle, permalinkOrUrl);
  return score !== null && score >= TITLE_SLUG_MATCH_RATIO;
}
