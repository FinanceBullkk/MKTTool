/**
 * Tự gán link, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Đây là đường DUY NHẤT trong công cụ mà máy tự ghi vào dữ liệu bộ luật dựa vào để đếm, nên
 * test ở đây canh hai thứ:
 *
 *  1. Gán xong phải để lại ĐỦ dấu vết như bấm tay — thiếu Interaction thì luật 8 mù đúng ở
 *     những bài do bộ dò gán, và không màn hình nào đỏ lên vì chuyện đó.
 *  2. Ca không chắc phải KHÔNG ghi gì cả. Ghi nhầm ở đây tệ hơn hẳn không ghi.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// revalidatePath chỉ chạy được trong ngữ cảnh request của Next; ở đây ta kiểm phần database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { prisma } = await import("@/lib/db/prisma-client");
const { autoLinkDiscoveredPosts } = await import("./auto-link-discovered-posts");
const { normalizeThreadUrl } = await import("@/lib/rules/rule-thread-collision");

const DAY = 86_400_000;
const SCHEDULED = new Date(Date.now() - 3 * 3_600_000);
const TROVE_URL =
  "https://www.reddit.com/r/Trove/comments/1veg99o/is_trove_still_alive_will_gamigo_continue_to/";

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

async function seed(): Promise<Seeded> {
  const proxy = await prisma.proxy.create({
    data: {
      label: "gan-proxy",
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
      username: "gan-nick",
      passwordEnc: "x",
      emailAddress: "gan@example.test",
      emailPasswordEnc: "x",
      antidetectProfileId: "profile-gan",
      proxyId: proxy.id,
      status: "ALIVE",
      karma: 5000,
      coldStartUntil: new Date(Date.now() - 60 * DAY),
      platformCreatedAt: new Date(Date.now() - 700 * DAY),
    },
  });
  const target = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/Trove", url: "https://reddit.com/r/Trove" },
  });

  return { accountId: account.id, targetId: target.id };
}

async function createPendingJob(seeded: Seeded, title: string) {
  const content = await prisma.contentItem.create({
    data: {
      title,
      body: `Thân bài của "${title}", đủ dài để không bị coi là bài rỗng khi chấm luật.`,
      type: "VALUE",
      authorName: "team",
    },
  });

  return prisma.postJob.create({
    data: {
      contentItemId: content.id,
      accountId: seeded.accountId,
      targetId: seeded.targetId,
      scheduledAt: SCHEDULED,
      status: "PENDING",
    },
  });
}

/** Bài bộ dò vừa thấy trên profile — mặc định khớp job "Is trove still alive?". */
function discovered(overrides: Partial<Parameters<typeof autoLinkDiscoveredPosts>[1][number]> = {}) {
  return {
    threadKey: "reddit:1veg99o",
    permalinkUrl: TROVE_URL,
    subreddit: "Trove",
    postedAt: new Date(SCHEDULED.getTime() + 3_600_000),
    ...overrides,
  };
}

describe("autoLinkDiscoveredPosts", () => {
  let seeded: Seeded;

  beforeEach(async () => {
    await clearAll();
    seeded = await seed();
  });

  afterAll(async () => {
    await clearAll();
  });

  it("gán link vào job khớp và để lại đủ dấu vết như bấm tay", async () => {
    const job = await createPendingJob(seeded, "Is trove still alive? Will Gamigo continue?");

    const result = await autoLinkDiscoveredPosts(seeded.accountId, [discovered()]);

    expect(result.linkedKeys).toEqual(["reddit:1veg99o"]);

    const linked = await prisma.postJob.findUnique({ where: { id: job.id } });
    expect(linked?.status).toBe("POSTED");
    // Link phải là permalink do Reddit trả về, không phải chuỗi nào khác.
    expect(linked?.postedUrl).toBe(TROVE_URL);
    expect(linked?.postedAt).not.toBeNull();

    // Thiếu Interaction thì luật 8 không có gì để so — đây là vế dễ quên nhất của "đã đăng".
    const trace = await prisma.interaction.findFirst({ where: { accountId: seeded.accountId } });
    expect(trace?.threadKey).toBe(normalizeThreadUrl(TROVE_URL));
    expect(trace?.kind).toBe("POST");

    // AuditLog là chỗ duy nhất phân biệt "người bấm" với "bộ dò tự gán".
    const audit = await prisma.auditLog.findFirst({
      where: { accountId: seeded.accountId, action: "HEALTH_AUTO_LINKED_POST" },
    });
    expect(audit?.detail).toContain(job.id);
  });

  it("tiêu đề không khớp thì KHÔNG ghi gì, chỉ nêu lý do", async () => {
    // Đúng ca 04/08/2026: cùng nick, cùng sub, đúng giờ — chỉ khác nội dung. Gán ở đây là
    // tự tay tạo lại lỗi dán nhầm link mà tính năng này sinh ra để dọn.
    const job = await createPendingJob(seeded, "Looking for a game similar to trove");

    const result = await autoLinkDiscoveredPosts(seeded.accountId, [discovered()]);

    expect(result.linkedKeys).toHaveLength(0);
    expect(result.ambiguous[0].reason).toContain("tiêu đề");

    const untouched = await prisma.postJob.findUnique({ where: { id: job.id } });
    expect(untouched?.status).toBe("PENDING");
    expect(untouched?.postedUrl).toBeNull();
    expect(await prisma.interaction.count()).toBe(0);
  });

  it("bài ở sub không có job nào thì báo là bài đăng ngoài công cụ", async () => {
    await createPendingJob(seeded, "Is trove still alive? Will Gamigo continue?");

    const result = await autoLinkDiscoveredPosts(seeded.accountId, [
      discovered({
        threadKey: "reddit:zzz111",
        subreddit: "selfhosted",
        permalinkUrl:
          "https://www.reddit.com/r/selfhosted/comments/zzz111/is_trove_still_alive_will_gamigo_continue_to/",
      }),
    ]);

    expect(result.linkedKeys).toHaveLength(0);
    expect(result.ambiguous[0].reason).toContain("đăng ngoài công cụ");
    expect(await prisma.postJob.count({ where: { status: "POSTED" } })).toBe(0);
  });

  it("job đã đăng rồi thì không bị gán đè", async () => {
    const job = await createPendingJob(seeded, "Is trove still alive? Will Gamigo continue?");
    await prisma.postJob.update({
      where: { id: job.id },
      data: { status: "POSTED", postedUrl: TROVE_URL, postedAt: new Date() },
    });

    const result = await autoLinkDiscoveredPosts(seeded.accountId, [discovered()]);

    // Job đã chốt không còn nằm trong mẫu ứng viên, nên bài này thành "không có job nào chờ".
    expect(result.linkedKeys).toHaveLength(0);
    expect(await prisma.interaction.count()).toBe(0);
  });
});
