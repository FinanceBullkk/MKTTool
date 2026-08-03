/**
 * Nhắc việc cho bài phải ĐĂNG TAY — Reddit và Facebook Group.
 *
 * Không có model riêng cho nhắc việc: một bài phải đăng tay đã là `PostJob`, đủ cả content,
 * nick, giờ đăng và trạng thái. Dựng thêm bảng song song nghĩa là bài đó đi vòng qua bộ luật.
 * Việc duy nhất còn thiếu là nhắc đúng giờ, và đó là một câu truy vấn chứ không phải một bảng.
 *
 * Vì sao gộp Reddit chung với Group thay vì mỗi nền tảng một bộ: hai đường đăng tay giống nhau
 * tới từng bước (mở profile → copy nội dung → dán → quay lại bấm "Đã đăng"). Trước đây chỉ
 * Group có bộ này, còn Reddit — nền tảng chính, ~80% công sức theo tài liệu sản phẩm — thì
 * không có gì, nên đăng một bài Reddit phải đi qua ba trang và copy tiêu đề bằng cách bôi đen.
 *
 * Khác biệt duy nhất giữa hai nền tảng nằm ở Ô NHẬP: Reddit có ô tiêu đề riêng, Facebook chỉ
 * có một khối text. Vì vậy bản ghi trả về mang sẵn cả hai dạng copy.
 */
import { parseLinks } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { composeMessage } from "@/lib/facebook/facebook-post-payload";
import { MANUAL_POST_PLATFORMS } from "@/lib/platforms/platform-family";

/** Nhắc trước ngần này để bạn MKT còn kịp sắp xếp, không phải đúng phút mới hiện. */
const LOOKAHEAD_HOURS = 24;

export interface ManualPostReminder {
  jobId: string;
  scheduledAt: Date;
  accountId: string;
  accountUsername: string;
  accountStatus: string;
  /** REDDIT | FACEBOOK_GROUP — quyết định giao diện hiện nút copy nào. */
  targetPlatform: string;
  targetName: string;
  targetUrl: string;
  contentTitle: string;
  /**
   * Thân bài kèm link, KHÔNG kèm tiêu đề — dán vào ô nội dung của Reddit, nơi tiêu đề
   * đã có ô riêng. Ghép tiêu đề vào đây là bài Reddit hiện tiêu đề hai lần.
   */
  bodyToCopy: string;
  /** Tiêu đề + thân bài + link trong một khối — Facebook Group chỉ có một ô nhập. */
  messageToCopy: string;
  overdue: boolean;
}

export interface ReminderCopyTexts {
  bodyToCopy: string;
  messageToCopy: string;
}

/**
 * Dựng hai dạng nội dung để copy. Hàm thuần, tách riêng để test được không cần database.
 *
 * Link dán kèm cuối bài ở cả hai dạng: Group và Reddit đều không dựng thẻ xem trước từ tham số
 * như Page, nên link không nằm trong thân bài là link biến mất khỏi bài đăng.
 */
export function buildReminderCopyTexts(content: {
  title: string;
  body: string;
  links: string[];
}): ReminderCopyTexts {
  const withLinks = (text: string) =>
    content.links.length > 0 ? `${text}\n\n${content.links.join("\n")}`.trim() : text.trim();

  return {
    bodyToCopy: withLinks(content.body),
    messageToCopy: withLinks(composeMessage(content)),
  };
}

/** Bài đăng tay đến hạn trong 24 tiếng tới, cũ nhất lên trước. */
export async function loadDueManualPostReminders(
  now: Date = new Date(),
): Promise<ManualPostReminder[]> {
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000);

  const jobs = await prisma.postJob.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: until },
      target: { platform: { in: [...MANUAL_POST_PLATFORMS] } },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      contentItem: { select: { title: true, body: true, links: true } },
      account: { select: { id: true, username: true, status: true } },
      target: { select: { name: true, url: true, platform: true } },
    },
  });

  return jobs.map((job) => {
    const copy = buildReminderCopyTexts({
      title: job.contentItem.title,
      body: job.contentItem.body,
      links: parseLinks(job.contentItem.links),
    });

    return {
      jobId: job.id,
      scheduledAt: job.scheduledAt,
      accountId: job.account.id,
      accountUsername: job.account.username,
      accountStatus: job.account.status,
      targetPlatform: job.target.platform,
      targetName: job.target.name,
      targetUrl: job.target.url,
      contentTitle: job.contentItem.title,
      ...copy,
      overdue: job.scheduledAt.getTime() < now.getTime(),
    };
  });
}
