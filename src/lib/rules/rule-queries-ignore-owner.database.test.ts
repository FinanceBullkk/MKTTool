/**
 * Bộ luật quét TOÀN BỘ đàn nick, không lọc theo chủ sở hữu. Chạy trên Postgres thật.
 *
 * ## Vì sao phải có test riêng cho một chuyện "hiển nhiên"
 *
 * Phase 02 thêm cột `Account.ownerId` và một bộ lọc "nick của tôi" cho màn hình. Bộ lọc đó
 * **chỉ được lọc chỗ hiển thị**. Ngày nào đó có người thấy `loadThreadCollisions` trả về nick
 * của đồng nghiệp và tưởng là rò rỉ dữ liệu giữa hai người, rồi thêm `ownerId: actor.userId`
 * vào truy vấn cho "sạch" — đó chính là kiểu hỏng mà file này canh.
 *
 * Hỏng theo hướng đó **không có màn hình nào đỏ lên**: mọi thứ vẫn chạy, chỉ là luật 8 ngừng
 * thấy nick của người khác. Mà luật 8 sinh ra đúng để bắt ca "hai nick cùng nhà đụng một
 * thread" — hai nick cùng nhà thì thường do hai người khác nhau cầm. Lọc theo chủ sở hữu là
 * làm nó mù đúng vào ca duy nhất nó có ích, và cái giá phải trả là cả cụm nick bị nền tảng
 * ghép lại với nhau.
 *
 * Luật 7 (trùng nội dung) cũng vậy: dùng lại bài của đồng nghiệp vẫn là trùng.
 *
 * Test seed **hai chủ khác nhau** rồi hỏi đúng ba truy vấn nhạy cảm với quyền sở hữu.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const { prisma } = await import("@/lib/db/prisma-client");
const { loadComparableContent, loadSameTargetNeighbors, loadThreadCollisions } = await import(
  "./rule-context-queries"
);

const DAY = 86_400_000;
const THREAD_URL = "https://www.reddit.com/r/nhap/comments/xyz789/bai_cua_dong_nghiep/";

interface TwoOwners {
  /** Nick của người A — nick đang đi hỏi bộ luật. */
  mineAccountId: string;
  /** Nick của người B — thứ phải nhìn thấy được dù khác chủ. */
  theirsAccountId: string;
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
  await prisma.user.deleteMany();
}

/** Hai người dùng, mỗi người một nick, cùng một đích đăng. */
async function seedTwoOwners(): Promise<TwoOwners> {
  const target = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/nhap", url: "https://reddit.com/r/nhap" },
  });

  async function createOwnedAccount(slug: string) {
    const user = await prisma.user.create({
      data: {
        id: `user-${slug}`,
        name: slug,
        email: `${slug}@mkttool.local`,
        updatedAt: new Date(),
      },
    });
    const account = await prisma.account.create({
      data: {
        platform: "REDDIT",
        username: `nick-${slug}`,
        passwordEnc: "x",
        emailAddress: `${slug}@example.test`,
        emailPasswordEnc: "x",
        antidetectProfileId: `profile-${slug}`,
        ownerId: user.id,
        status: "ALIVE",
        karma: 5000,
        coldStartUntil: new Date(Date.now() - 60 * DAY),
        platformCreatedAt: new Date(Date.now() - 700 * DAY),
      },
    });
    return account.id;
  }

  return {
    mineAccountId: await createOwnedAccount("nguoi-a"),
    theirsAccountId: await createOwnedAccount("nguoi-b"),
    targetId: target.id,
  };
}

describe("truy vấn bộ luật không lọc theo chủ sở hữu", () => {
  let seeded: TwoOwners;

  beforeEach(async () => {
    await clearAll();
    seeded = await seedTwoOwners();
  });

  afterAll(async () => {
    await clearAll();
    await prisma.$disconnect();
  });

  it("luật 8 thấy nick của người khác đã chạm thread — dấu vết không thuộc về riêng ai", async () => {
    await prisma.interaction.create({
      data: {
        accountId: seeded.theirsAccountId,
        targetId: seeded.targetId,
        threadUrl: THREAD_URL,
        threadKey: THREAD_URL,
        kind: "COMMENT",
        at: new Date(),
      },
    });

    const collisions = await loadThreadCollisions(THREAD_URL, seeded.mineAccountId);

    expect(
      collisions.map((row) => row.accountUsername),
      "Nick của người B phải hiện ra khi nick của người A hỏi về cùng thread.\n" +
        "Rỗng nghĩa là truy vấn đã bị lọc theo chủ sở hữu — luật 8 vừa mù đúng ca nó sinh ra để bắt.",
    ).toEqual(["nick-nguoi-b"]);
  });

  it("luật 8 (mức cảnh báo) thấy job của nick người khác quanh cùng đích", async () => {
    const at = new Date();
    const content = await prisma.contentItem.create({
      data: {
        title: "Bài của người B",
        body: "Ghi chép dài vừa đủ để không bị coi là bài rỗng khi bộ luật đọc tới.",
        type: "VALUE",
        authorName: "team",
      },
    });
    await prisma.postJob.create({
      data: {
        contentItemId: content.id,
        accountId: seeded.theirsAccountId,
        targetId: seeded.targetId,
        scheduledAt: new Date(at.getTime() + 3_600_000),
        status: "PENDING",
      },
    });

    const neighbors = await loadSameTargetNeighbors(
      seeded.targetId,
      seeded.mineAccountId,
      at,
      12,
    );

    expect(neighbors.map((row) => row.accountUsername)).toEqual(["nick-nguoi-b"]);
  });

  it("luật 7 so trùng với bài của người khác — dùng lại bài đồng nghiệp vẫn là trùng", async () => {
    const content = await prisma.contentItem.create({
      data: {
        title: "Dựng backup cho homelab",
        body: "Bài gốc của người B, đủ dài để phép so trùng có thứ thật sự để so sánh.",
        type: "VALUE",
        authorName: "team",
      },
    });
    await prisma.postJob.create({
      data: {
        contentItemId: content.id,
        accountId: seeded.theirsAccountId,
        targetId: seeded.targetId,
        scheduledAt: new Date(),
        status: "PENDING",
      },
    });

    const comparable = await loadComparableContent("REDDIT", new Date(), 30);

    expect(comparable).toHaveLength(1);
    expect(comparable[0].label).toContain("nick-nguoi-b");
  });
});
