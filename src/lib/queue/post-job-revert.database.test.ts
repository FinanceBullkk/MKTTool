/**
 * Trả job đã chốt về chờ đăng, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Điểm phải giữ bằng test chứ không bằng trí nhớ: gỡ trạng thái mà KHÔNG gỡ dấu vết là kiểu
 * hỏng im lặng. Job trông đã sạch ở hàng đợi, nhưng luật 8 vẫn nhớ một lần chạm thread chưa
 * từng xảy ra và sẽ chặn nhầm nick khác — không màn hình nào đỏ lên vì chuyện đó.
 *
 * Ca đắt nhất là ca có thật đã đẻ ra tính năng này: hai job cùng nick, cùng sub, dán trùng một
 * link. Xóa dấu vết bằng `deleteMany` thì lượt gỡ job dán nhầm cuốn theo luôn dấu vết của bài
 * đăng thật — sửa một lỗi sổ sách bằng cách tạo một lỗ hổng lớn hơn.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// revalidatePath chỉ chạy được trong ngữ cảnh request của Next; ở đây ta kiểm phần database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Phiên đăng nhập giả — `markJobPosted` là server action đã gác, và gác thật đòi cookie phiên
 * cùng credential Google mà tiến trình vitest không có.
 *
 * Thay nguồn danh tính chứ không nới lỏng `guardedAction`: lớp bọc vẫn chạy y như chạy thật.
 */
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: "test-actor",
    email: "test@mkttool.local",
    role: "ADMIN" as const,
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { markJobPosted } = await import("./post-job-status-actions");
const { revertPostJobToPending } = await import("./post-job-revert");

const DAY = 86_400_000;
const POSTED_URL = "https://www.reddit.com/r/nhap/comments/abc123/bai_that/";

interface Seeded {
  accountId: string;
  targetId: string;
}

async function clearAll() {
  // Xóa theo thứ tự khóa ngoại: con trước, cha sau.
  await prisma.healthCheck.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.platformTarget.deleteMany();
  await prisma.auditLog.deleteMany();
}

/** Nick khỏe, hết cold-start, dư karma — để không luật nào ngoài luật đang xét lên tiếng. */
async function seed(): Promise<Seeded> {
  const proxy = await prisma.proxy.create({
    data: {
      label: "go-proxy",
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
      username: "go-nick",
      passwordEnc: "x",
      emailAddress: "go@example.test",
      emailPasswordEnc: "x",
      antidetectProfileId: "profile-go",
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
  const target = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/nhap", url: "https://reddit.com/r/nhap" },
  });

  return { accountId: account.id, targetId: target.id };
}

/** Một job PENDING kèm content riêng — mỗi job một content để luật 7 không tự so hai job với nhau. */
async function createPendingJob(seeded: Seeded, title: string, hoursFromNow: number) {
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
      targetId: seeded.targetId,
      scheduledAt: new Date(Date.now() + hoursFromNow * 3_600_000),
      status: "PENDING",
    },
  });
}

describe("revertPostJobToPending", () => {
  let seeded: Seeded;

  beforeEach(async () => {
    await clearAll();
    seeded = await seed();
  });

  afterAll(async () => {
    await clearAll();
  });

  it("remove the POSTED status, delete the link and erase any thread interference traces", async () => {
    const job = await createPendingJob(seeded, "post with mismatched link", 2);
    expect((await markJobPosted(job.id, POSTED_URL)).ok).toBe(true);
    expect(await prisma.interaction.count()).toBe(1);

    const result = await revertPostJobToPending(job.id);
    expect(result.ok).toBe(true);

    const reverted = await prisma.postJob.findUnique({ where: { id: job.id } });
    expect(reverted?.status).toBe("PENDING");
    expect(reverted?.postedUrl).toBeNull();
    expect(reverted?.postedAt).toBeNull();
    // Dấu vết ma ở lại là kiểu hỏng không màn hình nào báo: luật 8 chặn nhầm nick khác.
    expect(await prisma.interaction.count()).toBe(0);
    // Chấm lại luôn, để job không quay lại hàng đợi mang theo verdict của bối cảnh cũ.
    expect(reverted?.ruleVerdicts).not.toBeNull();
  });

  it("two jobs with the same link pasted: removing this job still keeps the traces of the actual post", async () => {
    const real = await createPendingJob(seeded, "post that was mistakenly pasted with a mismatched link", 2);
    const mispasted = await createPendingJob(seeded, "two jobs with the same link pasted: removing this job still keeps the traces of the actual post", 26);
    expect((await markJobPosted(real.id, POSTED_URL)).ok).toBe(true);
    expect((await markJobPosted(mispasted.id, POSTED_URL)).ok).toBe(true);
    expect(await prisma.interaction.count()).toBe(2);

    expect((await revertPostJobToPending(mispasted.id)).ok).toBe(true);

    // Đúng một dấu vết bị xóa. `deleteMany` sẽ cuốn cả hai và bài thật mất khả năng chặn.
    expect(await prisma.interaction.count()).toBe(1);
    const stillPosted = await prisma.postJob.findUnique({ where: { id: real.id } });
    expect(stillPosted?.status).toBe("POSTED");
    expect(stillPosted?.postedUrl).toBe(POSTED_URL);
  });

  it("skipped job also returns successfully, and there are no traces to delete", async () => {
    const job = await createPendingJob(seeded, "job skipped by mistake", 2);
    await prisma.postJob.update({ where: { id: job.id }, data: { status: "SKIPPED" } });

    expect((await revertPostJobToPending(job.id)).ok).toBe(true);

    const reverted = await prisma.postJob.findUnique({ where: { id: job.id } });
    expect(reverted?.status).toBe("PENDING");
    expect(await prisma.interaction.count()).toBe(0);
  });

  it("reject pending job - there is nothing to return", async () => {
    const job = await createPendingJob(seeded, "Job is still pending or being blocked — nothing to return.", 2);

    const result = await revertPostJobToPending(job.id);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("still pending");
  });

  it("Job not found — throw error instead of throwing exception.", async () => {
    const result = await revertPostJobToPending("khong-co-that");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Job not found");
  });
});
