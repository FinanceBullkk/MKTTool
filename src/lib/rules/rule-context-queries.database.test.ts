import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import {
  loadComparableContent,
  loadOwnJobs,
  loadSameTargetNeighbors,
  loadThreadCollisions,
} from "./rule-context-queries";

/**
 * Tầng truy vấn, chạy trên SQLite thật (xem vitest.global-setup.ts).
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
  await prisma.persona.deleteMany();
  await prisma.platformTarget.deleteMany();
}

async function createAccount(username: string, personaId: string): Promise<string> {
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
      personaId,
      proxyId: proxy.id,
      status: "ALIVE",
    },
  });

  return account.id;
}

async function seed(): Promise<Seeded> {
  const persona = await prisma.persona.create({
    data: { name: "Nhân vật thử", voice: "điềm đạm", contentAngle: "self-hosting" },
  });

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
      data: { title, body: `Nội dung ${title}`, type, authorName: "team" },
    });

  const [value, promo] = await Promise.all([
    content("Backup homelab", "VALUE"),
    content("Ra mắt bản mới", "PROMO"),
  ]);

  return {
    anna: await createAccount("u_anna", persona.id),
    binh: await createAccount("u_binh", persona.id),
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
  it("chỉ lấy job của đúng nick đó", async () => {
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
  it.each(["SKIPPED", "BLOCKED", "FAILED"])("không tính job trạng thái %s", async (status) => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
      status,
    });

    expect(await loadOwnJobs(db.anna)).toHaveLength(0);
  });

  it.each(["PENDING", "POSTED"])("có tính job trạng thái %s", async (status) => {
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
  it("bỏ đúng job đang được chấm lại", async () => {
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

  it("thấy dấu vết của nick KHÁC trên cùng thread", async () => {
    await recordInteraction(db.binh, THREAD, db.reddit1);

    const collisions = await loadThreadCollisions(THREAD, db.anna);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].accountUsername).toBe("u_binh");
  });

  /**
   * Lọc sai chiều ở đây là hỏng nặng nhất: nick tự đụng chính mình thì luật 8 chặn oan
   * mọi bài tiếp theo của nick đó trên thread nó vừa đăng.
   */
  it("KHÔNG tính dấu vết của chính nick đang xét", async () => {
    await recordInteraction(db.anna, THREAD, db.reddit1);

    expect(await loadThreadCollisions(THREAD, db.anna)).toHaveLength(0);
  });

  it("thread khác thì không tính", async () => {
    await recordInteraction(db.binh, "reddit:thread-khac", db.reddit1);

    expect(await loadThreadCollisions(THREAD, db.anna)).toHaveLength(0);
  });

  it("không có khóa thread thì trả rỗng, không quét cả bảng", async () => {
    await recordInteraction(db.binh, THREAD, db.reddit1);

    expect(await loadThreadCollisions(null, db.anna)).toEqual([]);
  });
});

describe("loadSameTargetNeighbors", () => {
  const WARN_HOURS = 6;

  it("thấy job của nick khác trong cửa sổ, cả trước lẫn sau mốc", async () => {
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

  it("không tính job ngoài cửa sổ", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() + 7 * HOUR),
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("không tính job của chính nick đang xét", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("không tính hoạt động ở đích khác", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit2,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadSameTargetNeighbors(db.reddit1, db.anna, AT, WARN_HOURS)).toHaveLength(0);
  });

  it("gộp cả tương tác đã ghi tay lẫn job đã xếp, sắp mới nhất trước", async () => {
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

  it("bỏ đúng job đang được chấm lại", async () => {
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
  it("lấy bài của MỌI nick, không riêng nick đang xét", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(1);
  });

  /** Gộp họ nền tảng: Fanpage và Group đều là Facebook, trùng nội dung giữa hai chỗ vẫn lộ. */
  it("gộp FACEBOOK_PAGE với FACEBOOK_GROUP thành một họ", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.group,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("FACEBOOK_PAGE", AT, 30)).toHaveLength(1);
  });

  it("không so bài Reddit với bài Facebook", async () => {
    await makeJob({
      accountId: db.anna,
      targetId: db.fanpage,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(0);
  });

  it("không lấy bài cũ hơn cửa sổ so trùng", async () => {
    await makeJob({
      accountId: db.binh,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: new Date(AT.getTime() - 31 * DAY),
    });

    expect(await loadComparableContent("REDDIT", AT, 30)).toHaveLength(0);
  });

  it("bỏ đúng job đang được chấm lại", async () => {
    const job = await makeJob({
      accountId: db.anna,
      targetId: db.reddit1,
      contentItemId: db.value,
      scheduledAt: AT,
    });

    expect(await loadComparableContent("REDDIT", AT, 30, job.id)).toHaveLength(0);
  });
});
