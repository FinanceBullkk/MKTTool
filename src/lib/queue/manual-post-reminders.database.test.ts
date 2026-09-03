import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import { loadDueManualPostReminders } from "./manual-post-reminders";

/**
 * Phạm vi lọc của bộ nhắc việc, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Đây là chỗ đã từng hỏng: truy vấn lọc cứng `platform: "FACEBOOK_GROUP"`, nên bài REDDIT —
 * nền tảng chính, ~80% công sức theo tài liệu sản phẩm — không bao giờ hiện ra nhắc việc.
 * Hỏng kiểu đó không báo lỗi: màn hình vẫn sạch, chỉ là việc cần làm biến mất khỏi tầm mắt.
 *
 * Vì vậy mỗi khẳng định đi theo cặp: thứ phải thấy, và thứ phải KHÔNG thấy.
 */

const NOW = new Date("2026-08-10T09:00:00+07:00");
const HOUR = 3_600_000;

async function clearAll() {
  // Xóa theo thứ tự khóa ngoại: con trước, cha sau.
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.platformTarget.deleteMany();
}

async function seed() {

  const proxy = await prisma.proxy.create({
    data: {
      label: "nhac-viec-proxy",
      host: "127.0.0.1",
      port: 1080,
      username: "u",
      passwordEnc: "x",
      country: "VN",
    },
  });

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "nhac-viec-nick",
      passwordEnc: "x",
      emailAddress: "a@example.com",
      emailPasswordEnc: "x",
      proxyId: proxy.id,
      antidetectProfileId: "profile-nhac-viec",
      status: "ALIVE",
    },
  });

  const content = await prisma.contentItem.create({
    data: {
      title: "Post title",
      body: "Post body",
      links: JSON.stringify(["https://example.com"]),
      type: "VALUE",
      authorName: "hao",
    },
  });

  const targets = await Promise.all(
    (
      [
        ["REDDIT", "r/selfhosted"],
        ["FACEBOOK_GROUP", "Internal group"],
        ["FACEBOOK_PAGE", "Flimsy fanpage"],
      ] as const
    ).map(([platform, name]) =>
      prisma.platformTarget.create({
        data: { platform, name, url: `https://example.com/${platform}` },
      }),
    ),
  );

  return { accountId: account.id, contentId: content.id, targets };
}

describe("loadDueManualPostReminders", () => {
  beforeEach(clearAll);
  afterAll(clearAll);

  it("Show that Reddit posts are due - this is an old hole, Reddit was completely overlooked", async () => {
    const { accountId, contentId, targets } = await seed();
    const reddit = targets.find((target) => target.platform === "REDDIT")!;

    await prisma.postJob.create({
      data: {
        contentItemId: contentId,
        accountId,
        targetId: reddit.id,
        scheduledAt: new Date(NOW.getTime() + HOUR),
        status: "PENDING",
      },
    });

    const reminders = await loadDueManualPostReminders(NOW);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.targetPlatform).toBe("REDDIT");
    expect(reminders[0]?.targetName).toBe("r/selfhosted");
  });

  it("Show both Reddit and Group, but DO NOT show Fanpage - Fanpage posted with one button", async () => {
    const { accountId, contentId, targets } = await seed();

    await Promise.all(
      targets.map((target) =>
        prisma.postJob.create({
          data: {
            contentItemId: contentId,
            accountId,
            targetId: target.id,
            scheduledAt: new Date(NOW.getTime() + HOUR),
            status: "PENDING",
          },
        }),
      ),
    );

    const platforms = (await loadDueManualPostReminders(NOW))
      .map((reminder) => reminder.targetPlatform)
      .sort();

    expect(platforms).toEqual(["FACEBOOK_GROUP", "REDDIT"]);
  });

  it("Skip jobs too far and jobs no longer waiting to be posted", async () => {
    const { accountId, contentId, targets } = await seed();
    const reddit = targets.find((target) => target.platform === "REDDIT")!;

    await prisma.postJob.create({
      data: {
        contentItemId: contentId,
        accountId,
        targetId: reddit.id,
        // Ngoài cửa sổ nhắc 24 tiếng.
        scheduledAt: new Date(NOW.getTime() + 48 * HOUR),
        status: "PENDING",
      },
    });
    await prisma.postJob.create({
      data: {
        contentItemId: contentId,
        accountId,
        targetId: reddit.id,
        scheduledAt: new Date(NOW.getTime() + HOUR),
        status: "POSTED",
      },
    });

    expect(await loadDueManualPostReminders(NOW)).toHaveLength(0);
  });

  it("Mark past due for posts that are overdue and not yet posted", async () => {
    const { accountId, contentId, targets } = await seed();
    const reddit = targets.find((target) => target.platform === "REDDIT")!;

    await prisma.postJob.create({
      data: {
        contentItemId: contentId,
        accountId,
        targetId: reddit.id,
        scheduledAt: new Date(NOW.getTime() - HOUR),
        status: "PENDING",
      },
    });

    expect((await loadDueManualPostReminders(NOW))[0]?.overdue).toBe(true);
  });

  it("Reddit post with ready body, separate title, and link", async () => {
    const { accountId, contentId, targets } = await seed();
    const reddit = targets.find((target) => target.platform === "REDDIT")!;

    await prisma.postJob.create({
      data: {
        contentItemId: contentId,
        accountId,
        targetId: reddit.id,
        scheduledAt: new Date(NOW.getTime() + HOUR),
        status: "PENDING",
      },
    });

    const reminder = (await loadDueManualPostReminders(NOW))[0];
    expect(reminder?.contentTitle).toBe("Post title");
    expect(reminder?.bodyToCopy).not.toContain("Post title");
    expect(reminder?.bodyToCopy).toContain("https://example.com");
    expect(reminder?.messageToCopy).toContain("Post title");
  });
});
