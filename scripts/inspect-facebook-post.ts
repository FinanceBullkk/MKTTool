/**
 * Hỏi Graph API xem một bài đã đăng lên Page giờ ra sao — CHỈ ĐỌC, không đăng, không sửa gì.
 *
 * Có script này vì "mở link thấy This content isn't available" là câu hỏi sẽ quay lại nhiều lần,
 * và nó có ba nguyên nhân rất khác nhau: bài không tồn tại (lỗi phía mình), bài tồn tại nhưng
 * chưa xuất bản, hoặc bài bình thường mà PAGE chưa xuất bản nên người ngoài không thấy gì cả.
 * Đoán bằng mắt thì cả ba giống hệt nhau; hỏi Graph thì phân biệt được trong một giây.
 *
 * Dùng:
 *   npx tsx --env-file=.env scripts/inspect-facebook-post.ts
 *   npx tsx --env-file=.env scripts/inspect-facebook-post.ts <link bài hoặc {pageId}_{postId}>
 *
 * Không truyền gì thì lấy job POSTED gần nhất có đích là Fanpage.
 */
import { prisma } from "../src/lib/db/prisma-client";
import { FacebookGraphError, graphGet, toUserMessage } from "../src/lib/facebook/facebook-graph-client";
import { decryptPageToken } from "../src/lib/facebook/facebook-token-manager";

interface PostFields {
  id: string;
  created_time?: string;
  message?: string;
  permalink_url?: string;
  is_published?: boolean;
}

interface PageFields {
  id: string;
  name?: string;
  is_published?: boolean;
  link?: string;
}

/** Tách `{pageId}_{postId}` từ link bài hoặc từ chính chuỗi id. */
function parseObjectId(raw: string): { pageId: string; objectId: string } | null {
  const trimmed = raw.trim();

  const fromUrl = /facebook\.com\/(\d+)\/posts\/(\d+)/.exec(trimmed);
  if (fromUrl) return { pageId: fromUrl[1], objectId: `${fromUrl[1]}_${fromUrl[2]}` };

  const fromId = /^(\d+)_(\d+)$/.exec(trimmed);
  if (fromId) return { pageId: fromId[1], objectId: trimmed };

  return null;
}

async function resolveTarget(argument: string | undefined) {
  if (argument) return parseObjectId(argument);

  const job = await prisma.postJob.findFirst({
    where: { status: "POSTED", postedUrl: { not: null }, target: { platform: "FACEBOOK_PAGE" } },
    orderBy: { postedAt: "desc" },
    select: { postedUrl: true, postedAt: true },
  });

  if (!job?.postedUrl) return null;
  console.log(`Lấy job POSTED gần nhất: ${job.postedUrl}\n`);
  return parseObjectId(job.postedUrl);
}

/**
 * `is_published` không phải Page nào cũng cho đọc. Hỏi cả cụm trước, hỏng thì lùi về bộ tối
 * thiểu — thà thiếu một trường còn hơn mất cả câu trả lời vì một trường.
 */
async function readWithFallback<T>(path: string, full: string, minimal: string, token: string) {
  try {
    return { data: await graphGet<T>(path, { fields: full }, token), partial: false };
  } catch (error) {
    if (!(error instanceof FacebookGraphError)) throw error;
    return { data: await graphGet<T>(path, { fields: minimal }, token), partial: true };
  }
}

async function main() {
  const target = await resolveTarget(process.argv[2]);
  if (!target) {
    console.error("Không tìm ra bài nào để kiểm. Truyền link bài, hoặc đăng một bài lên Page trước.");
    process.exitCode = 1;
    return;
  }

  // Facebook dùng nhiều không gian id cho cùng một Page (page id cổ điển, profile id của New
  // Pages Experience, actor id trong permalink). Link có thể mang id nào cũng được, nên không
  // khớp thì vẫn thử bằng token của Page kết nối gần nhất thay vì bỏ cuộc.
  const page =
    (await prisma.facebookPage.findUnique({ where: { pageId: target.pageId } })) ??
    (await prisma.facebookPage.findFirst({ orderBy: { createdAt: "desc" } }));

  if (!page) {
    console.error("Chưa kết nối Page nào — không có token để hỏi Graph.");
    process.exitCode = 1;
    return;
  }
  if (page.pageId !== target.pageId) {
    console.log(`Id trong link (${target.pageId}) không khớp Page đã lưu — thử bằng token của "${page.name}".\n`);
  }

  const token = decryptPageToken(page.accessTokenEnc);

  const post = await readWithFallback<PostFields>(
    target.objectId,
    "id,created_time,message,permalink_url,is_published",
    "id,created_time,message",
    token,
  );

  const pageInfo = await readWithFallback<PageFields>(
    target.pageId,
    "id,name,is_published,link",
    "id,name",
    token,
  );

  console.log("BÀI ĐĂNG");
  console.log(`  id           ${post.data.id}`);
  console.log(`  đăng lúc     ${post.data.created_time ?? "—"}`);
  console.log(`  nội dung     ${(post.data.message ?? "—").slice(0, 80)}`);
  console.log(`  permalink    ${post.data.permalink_url ?? "—"}`);
  console.log(`  is_published ${post.data.is_published ?? "(Page không cho đọc trường này)"}`);

  console.log("\nPAGE");
  console.log(`  ${pageInfo.data.name ?? page.name} (${pageInfo.data.id})`);
  console.log(`  is_published ${pageInfo.data.is_published ?? "(không đọc được)"}`);
  console.log(`  link         ${pageInfo.data.link ?? "—"}`);

  console.log("\nKẾT LUẬN");
  if (pageInfo.data.is_published === false) {
    console.log("  PAGE CHƯA XUẤT BẢN — bài có thật nhưng người ngoài không thấy gì của Page này.");
    console.log("  Sửa: Meta Business Suite → Cài đặt Page → xuất bản Page.");
  } else if (post.data.is_published === false) {
    console.log("  Bài đang ở dạng chưa xuất bản trên một Page đã xuất bản.");
  } else {
    console.log("  Bài tồn tại và không có cờ nào nói là bị ẩn.");
    console.log("  Mở link bằng tài khoản ĐÃ ĐĂNG NHẬP có quyền trên Page để đối chiếu —");
    console.log("  Facebook giấu phần lớn nội dung Page với người chưa đăng nhập.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(toUserMessage(error, "Không kiểm được bài đăng."));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
