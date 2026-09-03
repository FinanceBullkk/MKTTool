import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import {
  loadComparableContent,
  loadOwnJobs,
  loadSameTargetNeighbors,
  loadThreadCollisions,
} from "./rule-context-queries";

/**
 * Tầng truy vấn, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Mỗi phép lọc dưới đây, nếu hỏng, làm một luật an toàn IM LẶNG cho qua chứ không báo lỗi —
 * kiểu hỏng đắt nhất trong hệ thống này. Vì vậy mỗi khẳng định đều đi theo cặp:
 * thứ phải thấy, và thứ phải KHÔNG thấy.
 */

const AT = new Date("2026-08-10T09:00:00+07:00");
const HOUR = 3_600_000;
const DAY = 86_400_000;

interface Seeded {
  anna: string;
  binh: string;
  reddit1: string;
  reddit2: string;
  fanpage: string;
  group: string;
  value: string;
  promo: string;
}

async function clearAll() {
  // Xóa theo thứ tự khóa ngoại: con trước, cha sau.
  await prisma.interaction.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.platformTarget.deleteMany();
}

async function createAccount(username: string): Promise<string> {
  const proxy = await prisma.proxy.create({
    data: {
      label: `proxy-${username}`,
      host: "127.0.0.1",
      port: 1080,
      username,
      passwordEnc: "v1.aa.bb.cc",
      country: "GB",
    },
  });

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username,
      passwordEnc: "v1.aa.bb.cc",
      emailAddress: `${username}@example.test`,
      emailPasswordEnc: "v1.aa.bb.cc",
      antidetectProfileId: `profile-${username}`,
      proxyId: proxy.id,
      status: "ALIVE",
    },
  });

  return account.id;
}

async function seed(): Promise<Seeded> {
  const target = (name: string, platform: string) =>
    prisma.platformTarget.create({
      data: { platform, name, url: `https://example.test/${name}` },
    });

  const [reddit1, reddit2, fanpage, group] = await Promise.all([
    target("r/selfhosted", "REDDIT"),
    target("r/homelab", "REDDIT"),
    target("Fanpage cua minh", "FACEBOOK_PAGE"),
    target("Group nguoi khac", "FACEBOOK_GROUP"),
  ]);

  const content = (title: string, type: string) =>
    prisma.contentItem.create({
      data: { title, body: `content${title}`, type, authorName: "team" },
    });

  const [value, promo] = await Promise.all([
    content("Backup homelab", "VALUE"),
    content("release new version", "PROMO"),
  ]);

  return {
    anna: await createAccount("u_anna"),
    binh: await createAccount("u_binh"),
    reddit1: reddit1.id,
    reddit2: reddit2.id,
    fanpage: fanpage.id,
    group: group.id,
    value: value.id,
    promo: promo.id,
  };
}

function makeJob(data: {
  accountId: string;
  targetId: string;
  contentItemId: string;
  scheduledAt: Date;
  status?: string;
}) {
  return prisma.postJob.create({ data: { status: "PENDING", ...data } });
}

let db: Seeded;

beforeEach(async () => {
  await clearAll();
  db = await seed();
});

afterAll(async () => {
  await clearAll();
  await prisma.$disconnect();
});

describe("loadOwnJobs", () => {
  it("only take jobs of the correct nick", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadOwnJobs(db.anna)).toHaveLength(1);
  });

  /**
   * Job đã bỏ qua / bị chặn / lỗi không được chiếm chỗ trong lịch: nếu tính vào, hạn mức ngày
   * và tỷ lệ promo sẽ chặn oan những bài hoàn toàn hợp lệ.
   */
  it.each(["SKIPPED", "BLOCKED", "FAILED"])("exclude jobs with status %s", async (status) => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
      status,
    });

    expect(await loadOwnJobs(db.anna)).toHaveLength(0);
  });

  it.each(["PENDING", "POSTED"])("include jobs with status %s", async (status) => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
      status,
    });

    expect(await loadOwnJobs(db.anna)).toHaveLength(1);
  });

  /** Chấm lại một job phải bỏ chính nó ra, nếu không nó tự chặn mình. */
  it("exclude the job being regraded", async () => {
    const job = await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadOwnJobs(db.anna, job.id)).toHaveLength(0);
  });
});

describe("loadThreadCollisions", () => {
  const THREAD = "reddit:abc123";

  async function recordInteraction(accountId: string, threadKey: string, targetId: string) {
    await prisma.interaction.create({
      data: {
        accountId,
        targetId,
        threadUrl: `https://reddit.com/comments/${threadKey}`,
        threadKey,
        kind: "COMMENT",
        at: AT,
      },
    });
  }

  it("see traces of OTHER nicks on the same thread", async () => {
    await recordInteraction(db.binh, THREAD, db.reddit1);

    const collisions = await loadThreadCollisions(THREAD, db.anna);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].accountUsername).toBe("u_binh");
  });

  /**
   * Lọc sai chiều ở đây là hỏng nặng nhất: nick tự đụng chính mình thì luật 8 chặn oan
   * mọi bài tiếp theo của nick đó trên thread nó vừa đăng.
   */
  it("DO NOT count traces of the current nick being examined", async () => {
    await recordInteraction(db.anna, THREAD, db.reddit1);

    expect(await loadThreadCollisions(THREAD, db.anna)).toHaveLength(0);
  });

  it("do not count if thread is different", async () => {
    await recordInteraction(db.binh, "reddit:thread-khac", db.reddit1);

    expect(await loadThreadCollisions(THREAD, db.anna)).toHaveLength(0);
  });

  it("if no thread key, return empty, do not scan entire table", async () => {
    await recordInteraction(db.binh, THREAD, db.reddit1);

    expect(await loadThreadCollisions(null, db.anna)).toEqual([]);
  });
});

describe("loadSameTargetNeighbors", () => {
  const WARN_HOURS = 6;

  it("see other nick's job in the window, both before and after the mark", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() - 2 * HOUR),
    });
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() + 2 * HOUR),
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(2);
  });

  it("do not count jobs outside the window", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() + 7 * HOUR),
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("do not count the current nick's job", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("do not count activity at a different target", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit2,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("combine both manual interactions and scheduled jobs, sort newest first", async () => {
    await prisma.interaction.create({
      data: {
        accountId: db.binh,
        targetId: db.reddit1,
        threadUrl: "https://reddit.com/comments/xyz",
        threadKey: "reddit:xyz",
        kind: "UPVOTE",
        at: new Date(AT.getTime() - 4 * HOUR),
      },
    });
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() - HOUR),
    });

    const neighbors = await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS);
    expect(neighbors.map((row) => row.kind)).toEqual(["POST", "UPVOTE"]);
  });

  it("exclude the job being regraded", async () => {
    const job = await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS, job.id)).toHaveLength(
      0,
    );
  });
});

describe("loadComparableContent", () => {
  it("get posts from EVERY nick, not just the current one", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(1);
  });

  /** Gộp họ nền tảng: Fanpage và Group đều là Facebook, trùng nội dung giữa hai chỗ vẫn lộ. */
  it("combine FACEBOOK_PAGE and FACEBOOK_GROUP into one family", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.group,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("FACEBOOK_PAGE", AT, 30)).toHaveLength(1);
  });

  it("do not compare Reddit posts to Facebook posts", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.fanpage,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(0);
  });

  it("do not take old posts from the window to compare duplicates", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() - 31 * DAY),
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(0);
  });

  it("exclude the job being regraded", async () => {
    const job = await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30, job.id)).toHaveLength(0);
  });
});
