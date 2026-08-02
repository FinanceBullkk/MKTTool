/**
 * Dựng nội dung và tham số gửi lên Graph API — hàm thuần, test được không cần mạng.
 *
 * Tách khỏi phần gọi API vì đây là chỗ quyết định bài đăng TRÔNG như thế nào,
 * và sai ở đây thì bài đã lên tường rồi mới biết.
 */

export interface PostContent {
  title: string;
  body: string;
  links: string[];
}

export interface PagePostPayload {
  /** Đường dẫn Graph: `{pageId}/feed` hoặc `{pageId}/photos`. */
  path: string;
  params: Record<string, string>;
}

/**
 * Ghép tiêu đề và thân bài.
 *
 * Facebook không có ô tiêu đề riêng như Reddit — tất cả nằm trong một khối text.
 * Tiêu đề trùng đúng dòng đầu của thân bài thì bỏ, tránh lặp hai lần.
 */
export function composeMessage(content: PostContent): string {
  const title = content.title.trim();
  const body = content.body.trim();

  if (!title) return body;
  if (!body) return title;

  const firstLine = body.split("\n")[0]?.trim();
  if (firstLine === title) return body;

  return `${title}\n\n${body}`;
}

/**
 * Dựng tham số đăng bài.
 *
 * Quy tắc link: đúng MỘT link thì đưa vào tham số `link` để Facebook dựng thẻ xem trước
 * (hiển thị đẹp hơn hẳn và ăn nhiều tương tác hơn). Từ hai link trở lên thì Facebook chỉ
 * xem trước được một cái, nên dán hết vào cuối bài cho không mất link nào.
 */
export function buildPagePostPayload(
  pageId: string,
  content: PostContent,
  options: { imageUrl?: string } = {},
): PagePostPayload {
  const links = content.links.filter((link) => link.trim() !== "");
  const singleLink = links.length === 1 ? links[0] : undefined;

  const messageParts = [composeMessage(content)];
  if (links.length > 1) messageParts.push(links.join("\n"));
  const message = messageParts.filter((part) => part.trim() !== "").join("\n\n");

  // Ảnh đi qua /photos; ở đó trường text tên là `caption`, không phải `message`.
  if (options.imageUrl?.trim()) {
    return {
      path: `${pageId}/photos`,
      params: { url: options.imageUrl.trim(), caption: message, published: "true" },
    };
  }

  return {
    path: `${pageId}/feed`,
    params: { message, ...(singleLink ? { link: singleLink } : {}) },
  };
}

/**
 * Đổi id Facebook trả về thành URL xem bài.
 *
 * `/feed` trả `{pageId}_{postId}`, còn `/photos` trả id ảnh trần kèm `post_id` riêng.
 * Cả hai đều mở được bằng dạng `facebook.com/{id}` nhưng dạng `/posts/` thân thiện hơn.
 */
export function buildPostUrl(pageId: string, responseId: string, postId?: string): string {
  const combined = postId ?? responseId;
  const [prefix, suffix] = combined.split("_");

  if (suffix) return `https://www.facebook.com/${prefix}/posts/${suffix}`;
  return `https://www.facebook.com/${pageId}/posts/${combined}`;
}
