/**
 * Hai người bấm cùng một job cùng lúc, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Vì sao phải có test SONG SONG riêng, không gộp vào test tuần tự đang có: lỗi ở đây không phải
 * "bấm hai lần" mà là "hai lượt chạy chồng nhau". Test tuần tự gọi lượt hai sau khi lượt một đã
 * ghi xong, nên phép kiểm trạng thái nào cũng đủ để chặn — kể cả phép kiểm đọc-rồi-mới-ghi vốn
 * không chặn được gì khi hai lượt thật sự chồng nhau. Nói cách khác: bộ test cũ xanh trong khi
 * lỗi vẫn còn nguyên.
 *
 * Hai bất biến được giữ ở đây:
 *
 * 1. Một job chỉ gọi Graph API của Fanpage ĐÚNG MỘT LẦN. Hỏng cái này là hai bài thật trên tường
 *    Facebook, không có đường gỡ nào ngoài xóa tay.
 * 2. Một bài đăng chỉ để lại ĐÚNG MỘT Interaction. Hỏng cái này thì bộ luật đếm sai hạn mức
 *    ngày, tỷ lệ promo và đụng độ thread — sai âm thầm, không màn hình nào đỏ lên.
 *
 * Test dựng cửa sổ tranh chấp bằng độ trễ giả trong bộ đăng, thay vì trông chờ hai lượt vô tình
 * rơi trúng nhau. Chạy nhiều lượt cùng lúc ở ca ghi trạng thái cũng vì lý do đó.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: "test-actor",
    email: "test@mkttool.local",
    role: "ADMIN" as const,
  }),
}));

/**
 * Bộ đăng giả, đếm số lần bị gọi và giữ nhịp đủ chậm để hai lượt chắc chắn chồng nhau.
 *
 * `toPostContent` và `FacebookPublishError` giữ nguyên bản thật: chỉ lời gọi ra Facebook mới cần
 * thay, còn lại thay là test tự nới lỏng chính thứ nó đang kiểm.
 */
const publishCalls = { count: 0 };
const GRAPH_DELAY_MS = 150;

vi.mock("@/lib/facebook/facebook-page-publisher", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/facebook/facebook-page-publisher")>();
  return {
    ...original,
    publishToPage: async () => {
      const attempt = ++publishCalls.count;
      await new Promise((resolve) => setTimeout(resolve, GRAPH_DELAY_MS));
      return {
        postId: `page_post_${attempt}`,
        postUrl: `https://www.facebook.com/permalink.php?story_fbid=${attempt}&id=9`,
      };
    },
  };
});

const { prisma } = await import("@/lib/db/prisma-client");
const { markJobPosted } = await import("./post-job-status-actions");
const { markPostJobPosted } = await import("./post-job-mark-posted");
const { publishJobToPage } = await import("@/lib/facebook/facebook-publish-action");

const DAY = 86_400_000;
const REDDIT_URL = "https://www.reddit.com/r/nhap/comments/abc123/bai_that/";

interface Seeded {
  accountId: string;
  redditTargetId: string;
  pageTargetId: string;
}

async function clearAll() {
  // Xóa theo thứ tự khóa ngoại: con trước, cha sau.
  await prisma.healthCheck.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.facebookPage.deleteMany();
  await prisma.facebookConnection.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.platformTarget.deleteMany();
  await prisma.auditLog.deleteMany();
}

async function seed(): Promise<Seeded> {
  const proxy = await prisma.proxy.create({
    data: {
      label: "race-proxy",
      host: "127.0.0.1",
      port: 1081,
      username: "u",
      passwordEnc: "x",
      country: "VN",
    },
  });
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "race-nick",
      passwordEnc: "x",
      emailAddress: "race@example.test",
      emailPasswordEnc: "x",
      antidetectProfileId: "profile-race",
      proxyId: proxy.id,
      status: "ALIVE",
      karma: 5000,
      coldStartUntil: new Date(Date.now() - 60 * DAY),
      platformCreatedAt: new Date(Date.now() - 700 * DAY),
    },
  });
  await prisma.healthCheck.create({
    data: {
      accountId: account.id,
      verdict: "HEALTHY",
      karma: 5000,
      visiblePosts: 0,
      expectedPosts: 0,
      detail: "Data for test.",
    },
  });

  const redditTarget = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/nhap", url: "https://reddit.com/r/nhap" },
  });
  const pageTarget = await prisma.platformTarget.create({
    data: { platform: "FACEBOOK_PAGE", name: "Trang team", url: "https://facebook.com/trang-team" },
  });

  const connection = await prisma.facebookConnection.create({
    data: { fbUserId: "fb-user-1", name: "Page Connector", accessTokenEnc: "x" },
  });
  await prisma.facebookPage.create({
    data: {
      pageId: "page-1",
      name: "Trang team",
      accessTokenEnc: "x",
      connectionId: connection.id,
      targetId: pageTarget.id,
    },
  });

  return {
    accountId: account.id,
    redditTargetId: redditTarget.id,
    pageTargetId: pageTarget.id,
  };
}

async function createPendingJob(seeded: Seeded, targetId: string, title: string) {
  const content = await prisma.contentItem.create({
    data: {
      title,
      body: `Draft ${title}: story about backing up the homelab, long enough not to be considered an empty post.`,
      type: "VALUE",
      authorName: "team",
    },
  });

  return prisma.postJob.create({
    data: {
      contentItemId: content.id,
      accountId: seeded.accountId,
      targetId,
      scheduledAt: new Date(Date.now() + 2 * 3_600_000),
      status: "PENDING",
    },
  });
}

function countOk(results: readonly { ok: boolean }[]): number {
  return results.filter((result) => result.ok).length;
}

describe("two overrides on one job", () => {
  let seeded: Seeded;
  const scopeBefore = process.env.ROLLOUT_PLATFORMS;

  beforeEach(async () => {
    // Xem chú thích cùng chỗ trong `post-job-actions.database.test.ts`. Bộ này kiểm chuyện hai
    // người cùng bấm đăng một job thì Graph chỉ bị gọi một lần — một tính chất của cơ chế
    // giành chỗ, chỉ quan sát được khi đường đăng đang mở.
    process.env.ROLLOUT_PLATFORMS = "REDDIT,FACEBOOK_PAGE,FACEBOOK_GROUP";
    await clearAll();
    seeded = await seed();
    publishCalls.count = 0;
  });

  afterAll(async () => {
    if (scopeBefore === undefined) delete process.env.ROLLOUT_PLATFORMS;
    else process.env.ROLLOUT_PLATFORMS = scopeBefore;
    await clearAll();
  });

  it("only call Graph ONE time even though two people press post to Fanpage", async () => {
    const job = await createPendingJob(seeded, seeded.pageTargetId, "Fanpage Post");

    const results = await Promise.all([publishJobToPage(job.id), publishJobToPage(job.id)]);

    // Bất biến số 1. Hai lần gọi ở đây nghĩa là hai bài thật trên tường Facebook.
    expect(publishCalls.count).toBe(1);
    expect(countOk(results as { ok: boolean }[])).toBe(1);

    const after = await prisma.postJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(after.status).toBe("POSTED");
    expect(await prisma.interaction.count()).toBe(1);
  });

  it("The loser gets a hint, not a blank screen", async () => {
    const job = await createPendingJob(seeded, seeded.pageTargetId, "Second Fanpage Post");

    const results = (await Promise.all([
      publishJobToPage(job.id),
      publishJobToPage(job.id),
    ])) as { ok: boolean; message: string }[];

    const refused = results.find((result) => !result.ok);
    expect(refused?.message).toMatch(/Another operator|just posted/);
  });

  it("eight people marking the same job as posted at once only leaves one trace", async () => {
    const job = await createPendingJob(seeded, seeded.redditTargetId, "Reddit Post");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => markJobPosted(job.id, REDDIT_URL)),
    );

    // Bất biến số 2. Dư một Interaction là bộ luật đếm sai, và không có gì đỏ lên.
    expect(await prisma.interaction.count()).toBe(1);
    expect(countOk(results as { ok: boolean }[])).toBe(1);
  });

  it("the checker automatically matches and hits at the same time as the human, only leaving one trace", async () => {
    const job = await createPendingJob(seeded, seeded.redditTargetId, "Post discovered by the checker");

    // Đường của bộ dò sức khỏe (`auto-link-discovered-posts.ts`) gọi thẳng lõi, không đi qua
    // server action. Hai đường ghi khác nhau vào cùng một job là ca có thật: bộ dò chạy theo
    // hẹn giờ, không hỏi ai đang mở trang.
    const [byScanner, byHuman] = await Promise.all([
      markPostJobPosted(job.id, REDDIT_URL),
      markJobPosted(job.id, REDDIT_URL),
    ]);

    expect(await prisma.interaction.count()).toBe(1);
    expect(countOk([byScanner, byHuman] as { ok: boolean }[])).toBe(1);
  });

  it("Job stuck in PUBLISHING still saved by the Posted button", async () => {
    // Ca xảy ra khi tiến trình chết giữa lúc gọi Graph: bài đã lên tường nhưng job chưa kịp
    // chốt. Câu mà đường đăng dặn người dùng là *vào hàng đợi bấm "Đã đăng"* — nên đường đó
    // phải nhận được job đang ở PUBLISHING, nếu không lời dặn dẫn vào ngõ cụt.
    const job = await createPendingJob(seeded, seeded.redditTargetId, "Post stuck in the middle");
    await prisma.postJob.update({ where: { id: job.id }, data: { status: "PUBLISHING" } });

    const rescued = await markJobPosted(job.id, REDDIT_URL);

    expect(rescued.ok).toBe(true);
    expect(await prisma.interaction.count()).toBe(1);
  });
});
