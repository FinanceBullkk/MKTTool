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
      title: "Tiêu đề bài",
      body: "Thân bài.",
      links: JSON.stringify(["https://example.com"]),
      type: "VALUE",
      authorName: "hao",
    },
  });

  const targets = await Promise.all(
    (
      [
        ["REDDIT", "r/selfhosted"],
        ["FACEBOOK_GROUP", "Group nội bộ"],
        ["FACEBOOK_PAGE", "Fanpage nháp"],
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

  it("hiện bài Reddit đến hạn — đây là lỗ hổng cũ, Reddit từng bị bỏ sót hoàn toàn", async () => {
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

  it("hiện cả Reddit lẫn Group, nhưng KHÔNG hiện Fanpage — Fanpage đăng bằng một nút", async () => {
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

  it("bỏ qua job quá xa và job không còn chờ đăng", async () => {
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

  it("đánh dấu quá giờ cho bài đã tới hạn mà chưa đăng", async () => {
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

  it("bài Reddit mang sẵn thân bài tách khỏi tiêu đề, kèm link", async () => {
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
    expect(reminder?.contentTitle).toBe("Tiêu đề bài");
    expect(reminder?.bodyToCopy).not.toContain("Tiêu đề bài");
    expect(reminder?.bodyToCopy).toContain("https://example.com");
    expect(reminder?.messageToCopy).toContain("Tiêu đề bài");
  });
});
