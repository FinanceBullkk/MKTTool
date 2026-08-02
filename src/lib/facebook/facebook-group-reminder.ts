/**
 * Nhắc việc đăng Facebook Group — luồng THỦ CÔNG.
 *
 * Không có model riêng cho nhắc việc: một bài group đã là `PostJob` với đích
 * FACEBOOK_GROUP, đủ cả content, nick, giờ đăng và trạng thái. Dựng thêm bảng song song
 * nghĩa là bài group đi vòng qua bộ luật — mà group vận hành y hệt subreddit, phải chấm
 * đủ 9 luật (xem COMMUNITY_PLATFORMS).
 *
 * Việc duy nhất còn thiếu là nhắc đúng giờ, và đó là một câu truy vấn chứ không phải một bảng.
 */
import { parseLinks } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { composeMessage } from "./facebook-post-payload";

/** Nhắc trước ngần này để bạn MKT còn kịp sắp xếp, không phải đúng phút mới hiện. */
const LOOKAHEAD_HOURS = 24;

export interface GroupReminder {
  jobId: string;
  scheduledAt: Date;
  accountId: string;
  accountUsername: string;
  accountStatus: string;
  groupName: string;
  groupUrl: string;
  contentTitle: string;
  /** Nội dung đã ghép sẵn để copy — giống hệt thứ Fanpage đăng qua API. */
  messageToCopy: string;
  overdue: boolean;
}

export async function loadDueGroupReminders(now: Date = new Date()): Promise<GroupReminder[]> {
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3_600_000);

  const jobs = await prisma.postJob.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: until },
      target: { platform: "FACEBOOK_GROUP" },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      contentItem: { select: { title: true, body: true, links: true } },
      account: { select: { id: true, username: true, status: true } },
      target: { select: { name: true, url: true } },
    },
  });

  return jobs.map((job) => {
    const links = parseLinks(job.contentItem.links);
    const message = composeMessage({
      title: job.contentItem.title,
      body: job.contentItem.body,
      links,
    });

    return {
      jobId: job.id,
      scheduledAt: job.scheduledAt,
      accountId: job.account.id,
      accountUsername: job.account.username,
      accountStatus: job.account.status,
      groupName: job.target.name,
      groupUrl: job.target.url,
      contentTitle: job.contentItem.title,
      // Link dán kèm cuối bài: Facebook Group không dựng thẻ xem trước từ tham số như Page.
      messageToCopy: links.length > 0 ? `${message}\n\n${links.join("\n")}` : message,
      overdue: job.scheduledAt.getTime() < now.getTime(),
    };
  });
}
