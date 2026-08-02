/**
 * Đăng một bài lên Fanpage qua Graph API.
 *
 * Tự lên lịch ở tool chứ KHÔNG dùng `scheduled_publish_time` của Facebook: để mọi thứ
 * nằm một chỗ và bộ luật còn kiểm được trước lúc bấm. Bài đẩy sang Facebook là đăng ngay.
 */
import { prisma } from "@/lib/db/prisma-client";
import { parseLinks } from "@/lib/content/content-types";
import { FacebookGraphError, graphPost } from "./facebook-graph-client";
import { type PostContent, buildPagePostPayload, buildPostUrl } from "./facebook-post-payload";
import { decryptPageToken, markPageTokenInvalid } from "./facebook-token-manager";
import { evaluateTokenHealth } from "./facebook-token-health";

export interface PublishResult {
  postId: string;
  postUrl: string;
}

export class FacebookPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookPublishError";
  }
}

interface FeedResponse {
  id: string;
  post_id?: string;
}

export async function publishToPage(
  pageId: string,
  content: PostContent,
  options: { imageUrl?: string } = {},
): Promise<PublishResult> {
  const page = await prisma.facebookPage.findUnique({
    where: { pageId },
    include: { connection: true },
  });
  if (!page) throw new FacebookPublishError(`Chưa kết nối Fanpage có id "${pageId}".`);

  // Token hỏng thì gọi API cũng chỉ ăn lỗi — báo trước bằng câu người đọc hiểu được.
  const health = evaluateTokenHealth({
    expiresAt: page.connection.expiresAt,
    tokenValid: page.tokenValid,
    tokenNote: page.tokenNote,
  });
  if (!health.usable) throw new FacebookPublishError(`Không đăng được: ${health.message}`);

  const payload = buildPagePostPayload(page.pageId, content, options);

  try {
    const response = await graphPost<FeedResponse>(
      payload.path,
      payload.params,
      decryptPageToken(page.accessTokenEnc),
    );

    return {
      postId: response.post_id ?? response.id,
      postUrl: buildPostUrl(page.pageId, response.id, response.post_id),
    };
  } catch (error) {
    // Facebook từ chối token thì ghi lại ngay, để lần sau UI chặn từ đầu thay vì thử lại mù.
    if (error instanceof FacebookGraphError && error.tokenExpired) {
      await markPageTokenInvalid(page.pageId, error.message);
    }
    throw error instanceof FacebookGraphError
      ? new FacebookPublishError(error.message)
      : new FacebookPublishError("Lỗi không xác định khi đăng lên Fanpage.");
  }
}

/** Đổi một ContentItem trong kho thành nội dung đăng được. */
export function toPostContent(item: {
  title: string;
  body: string;
  links: string | null;
}): PostContent {
  return { title: item.title, body: item.body, links: parseLinks(item.links) };
}
