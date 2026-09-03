/**
 * Tạo job từ tab "Viết mới", chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Điểm cần giữ bằng test chứ không bằng trí nhớ: nháp gõ ở trang xếp lịch PHẢI thành một
 * ContentItem thật trong kho. Luật 7 so bài mới với các ContentItem trong 30 ngày gần nhất —
 * job trỏ vào content không nằm trong kho thì mỗi bài viết thẳng lại xóa một mẩu trí nhớ của
 * luật đó, và nó mù dần mà không có gì báo. Kiểu hỏng đó không đỏ ở đâu cả: màn hình vẫn xanh,
 * chỉ là bộ luật ngày càng dễ tính.
 *
 * Đường "Chọn từ kho" đi kèm ở đây để chắc nhánh cũ không đổi hành vi khi thêm nhánh mới.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// revalidatePath chỉ chạy được trong ngữ cảnh request của Next; ở đây ta kiểm phần database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Phiên đăng nhập giả — `createPostJob` là server action đã gác, và gác thật đòi cookie phiên
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
const { createPostJob } = await import("./post-job-actions");

const DAY = 86_400_000;
const SCHEDULED_AT = new Date(Date.now() + 2 * 3_600_000);

interface Seeded {
  accountId: string;
  targetId: string;
  contentId: string;
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
      label: "nhap-proxy",
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
      username: "nhap-nick",
      passwordEnc: "x",
      emailAddress: "nhap@example.test",
      emailPasswordEnc: "x",
      antidetectProfileId: "profile-nhap",
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
      detail: "Dữ liệu dựng sẵn của test.",
    },
  });
  const target = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/nhap", url: "https://reddit.com/r/nhap" },
  });
  const content = await prisma.contentItem.create({
    data: {
      title: "Bài có sẵn trong kho",
      body: "Ghi chép về chuyện dựng backup cho homelab, đủ dài để không bị coi là bài rỗng.",
      type: "VALUE",
      authorName: "team",
    },
  });

  return { accountId: account.id, targetId: target.id, contentId: content.id };
}

/** Dựng FormData từ object — server action nhận FormData chứ không nhận object. */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function draftForm(seeded: Seeded, overrides: Record<string, string> = {}): FormData {
  return form({
    contentMode: "draft",
    title: "Bài gõ thẳng ở trang xếp lịch",
    body: "Mình chạy restic đẩy sang một con NAS cũ, ổn định suốt hai năm, phần khó là chính sách giữ bản sao.",
    type: "VALUE",
    authorName: "hao",
    linksText: "https://example.com/a\nhttps://example.com/b",
    accountId: seeded.accountId,
    targetId: seeded.targetId,
    scheduledAt: SCHEDULED_AT.toISOString(),
    ...overrides,
  });
}

describe("createPostJob — nguồn content", () => {
  let seeded: Seeded;
  const scopeBefore = process.env.ROLLOUT_PLATFORMS;

  beforeEach(async () => {
    // Mở phạm vi cho đúng những gì bộ test này kiểm.
    //
    // Từ 02/09/2026 mọi nền tảng mặc định đóng (`rollout-scope.ts`), nên không đặt biến này thì
    // `createPostJob` từ chối ngay và cả bộ test đỏ vì một lý do không liên quan tới thứ nó
    // định kiểm. Ở đây kiểm CƠ CHẾ tạo job — nguồn content, nhật ký ghi đè — chứ không kiểm
    // quyết định phạm vi; quyết định đó có bộ test riêng ở `platforms/rollout-scope.test.ts`.
    //
    // Khai thẳng ở đây thay vì đặt trong config chung: một dòng đọc được ngay tại chỗ nói rõ
    // bộ test này chạy được là nhờ phạm vi đang mở, thay vì để người đọc sau tự đoán.
    process.env.ROLLOUT_PLATFORMS = "REDDIT,FACEBOOK_PAGE,FACEBOOK_GROUP";
    await clearAll();
    seeded = await seed();
  });

  afterAll(async () => {
    if (scopeBefore === undefined) delete process.env.ROLLOUT_PLATFORMS;
    else process.env.ROLLOUT_PLATFORMS = scopeBefore;
    await clearAll();
  });

  it("lưu nháp thành ContentItem rồi cho job trỏ vào nó", async () => {
    const result = await createPostJob(null, draftForm(seeded));
    expect(result.ok).toBe(true);

    const saved = await prisma.contentItem.findFirst({ where: { authorName: "hao" } });
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe("Bài gõ thẳng ở trang xếp lịch");
    expect(saved?.type).toBe("VALUE");
    // Ô link là textarea nhiều dòng, phải vào kho dạng JSON array như đường /content.
    expect(JSON.parse(saved?.links ?? "[]")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);

    const job = await prisma.postJob.findFirst({ where: { contentItemId: saved?.id } });
    expect(job).not.toBeNull();
    expect(job?.status).toBe("PENDING");
    expect(job?.ruleVerdicts).not.toBeNull();
  });

  it("nháp thiếu ô bắt buộc thì không tạo gì cả", async () => {
    const result = await createPostJob(null, draftForm(seeded, { title: "" }));

    expect(result.ok).toBe(false);
    expect(await prisma.postJob.count()).toBe(0);
    // Quan trọng hơn cả thông báo lỗi: không được để lại một content mồ côi trong kho.
    expect(await prisma.contentItem.count()).toBe(1);
  });

  it("đường 'chọn từ kho' vẫn tạo job và không đẻ thêm content", async () => {
    const result = await createPostJob(
      null,
      form({
        contentMode: "library",
        contentItemId: seeded.contentId,
        accountId: seeded.accountId,
        targetId: seeded.targetId,
        scheduledAt: SCHEDULED_AT.toISOString(),
      }),
    );

    expect(result.ok).toBe(true);
    expect(await prisma.contentItem.count()).toBe(1);

    const job = await prisma.postJob.findFirst();
    expect(job?.contentItemId).toBe(seeded.contentId);
  });

  /**
   * Ghi đè luật là thao tác nhạy cảm nhất của hàng đợi, và dòng nhật ký là thứ DUY NHẤT trả lời
   * được "ai bấm, vì sao" về sau. Trước đây job và dòng nhật ký là hai lệnh rời nhau, nên một lần
   * chết máy giữa chúng để lại bài đã ghi đè mà không ai truy được.
   *
   * Test này giữ bất biến người dùng nhìn thấy: có job ghi đè thì phải có dòng nhật ký trỏ đúng
   * vào nó. Tính "cùng sống hoặc cùng không" khi tiến trình chết giữa chừng là do giao dịch bảo
   * đảm — không dựng lại được trong test vì `AuditLog` không có ràng buộc nào để ép nó hỏng.
   */
  it("job ghi đè luật luôn kèm một dòng nhật ký trỏ đúng vào nó", async () => {
    // Nick đang cách ly → luật 1 chặn, và luật 1 CHO ghi đè.
    await prisma.account.update({
      where: { id: seeded.accountId },
      data: { status: "CHECKPOINT" },
    });

    const result = await createPostJob(
      null,
      draftForm(seeded, { overrideReason: "khách đang chờ bài này, chấp nhận rủi ro" }),
    );

    expect(result.ok).toBe(true);

    const job = await prisma.postJob.findFirstOrThrow();
    expect(job.overrideReason).toContain("chấp nhận rủi ro");

    const entries = await prisma.auditLog.findMany({ where: { action: "RULE_OVERRIDDEN" } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toContain(job.id);
    expect(entries[0]?.actorId).toBe("test-actor");
    expect(entries[0]?.accountId).toBe(seeded.accountId);
  });

  /** Không ghi đè thì không có gì để ghi nhật ký — sổ chỉ nên có dòng khi thật sự có chuyện. */
  it("job bình thường không đẻ ra dòng nhật ký ghi đè", async () => {
    const result = await createPostJob(null, draftForm(seeded));

    expect(result.ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "RULE_OVERRIDDEN" } })).toBe(0);
  });

  it("form không khai contentMode thì vẫn hiểu là chọn từ kho", async () => {
    const result = await createPostJob(
      null,
      form({
        contentItemId: seeded.contentId,
        accountId: seeded.accountId,
        targetId: seeded.targetId,
        scheduledAt: SCHEDULED_AT.toISOString(),
      }),
    );

    expect(result.ok).toBe(true);
    expect(await prisma.postJob.count()).toBe(1);
  });
});

/**
 * Chốt phạm vi bàn giao — kiểm bằng hành vi thật qua cơ sở dữ liệu, không phải bằng quét chuỗi.
 *
 * Quét chuỗi ở `platforms/rollout-scope.test.ts` chỉ chứng minh chốt còn được gọi trong file.
 * Bộ này chứng minh thứ thật sự quan trọng: phạm vi đóng thì **không có job nào ra đời**, kể cả
 * khi mọi thứ khác đều hợp lệ và người dùng có nhập lý do ghi đè.
 */
describe("createPostJob — phạm vi bàn giao đóng", () => {
  let seeded: Seeded;
  const scopeBefore = process.env.ROLLOUT_PLATFORMS;

  beforeEach(async () => {
    delete process.env.ROLLOUT_PLATFORMS;
    await clearAll();
    seeded = await seed();
  });

  afterAll(async () => {
    if (scopeBefore === undefined) delete process.env.ROLLOUT_PLATFORMS;
    else process.env.ROLLOUT_PLATFORMS = scopeBefore;
    await clearAll();
  });

  it("từ chối xếp lịch và không ghi job nào vào cơ sở dữ liệu", async () => {
    const result = await createPostJob(null, draftForm(seeded));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("chỉ dùng để xem lịch sử");
    expect(result.message).toContain("/accounts");
    expect(result.message).not.toContain("ROLLOUT_PLATFORMS");
    expect(await prisma.postJob.count()).toBe(0);
  });

  it("lý do ghi đè không mở được quyết định phạm vi", async () => {
    const result = await createPostJob(
      null,
      draftForm(seeded, { overrideReason: "Sếp bảo đăng gấp cho kịp chiến dịch hôm nay" }),
    );

    expect(result.ok).toBe(false);
    expect(await prisma.postJob.count()).toBe(0);
  });

  it("nháp bị từ chối thì cũng không để lại ContentItem mồ côi trong kho", async () => {
    const before = await prisma.contentItem.count();
    await createPostJob(null, draftForm(seeded));

    expect(await prisma.contentItem.count()).toBe(before);
  });

  it("mở đúng nền tảng của đích thì xếp lịch lại được", async () => {
    const target = await prisma.platformTarget.findUniqueOrThrow({
      where: { id: seeded.targetId },
      select: { platform: true },
    });
    process.env.ROLLOUT_PLATFORMS = target.platform;

    const result = await createPostJob(null, draftForm(seeded));

    expect(result.ok).toBe(true);
    expect(await prisma.postJob.count()).toBe(1);
  });
});
