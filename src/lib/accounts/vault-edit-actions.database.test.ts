/**
 * Sửa và xóa trong kho danh tính, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Ba nhóm khẳng định, đều là chỗ hỏng thì hỏng âm thầm:
 *  1. Ô bí mật để trống phải GIỮ NGUYÊN giá trị cũ. Hỏng ở đây là mỗi lần sửa karma là một
 *     lần mất mật khẩu nick — mà chỉ lộ ra lúc cần đăng nhập.
 *  2. Sửa xong phải chấm lại job đang chờ. Hỏng ở đây là verdict cũ nằm im trong hàng đợi,
 *     trông y hệt verdict đúng.
 *  3. Xóa phải bị chặn khi còn dữ liệu trỏ tới. Hỏng ở đây là mất lịch sử nuôi bộ luật.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// revalidatePath chỉ chạy được trong ngữ cảnh request của Next; ở đây ta kiểm phần database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Phiên đăng nhập giả.
 *
 * Test này kiểm phần database, nhưng đường vào là server action đã gác, và gác thật sẽ đi hỏi
 * Better Auth — tức là đòi `GOOGLE_CLIENT_ID` cùng một cookie phiên mà tiến trình vitest không
 * có. Không có mock thì mọi khẳng định ở dưới đều chết ở dòng đầu tiên.
 *
 * Thay **nguồn danh tính**, không nới lỏng `guardedAction`: lớp bọc vẫn chạy nguyên vẹn đúng
 * như lúc chạy thật, chỉ có câu trả lời "ai đang gọi" là dựng sẵn. Nếu nới lỏng lớp bọc thì
 * test sẽ đi qua một đoạn mã khác đoạn mã production đi qua — và cái nó chứng minh cũng thành
 * chuyện khác.
 *
 * `ADMIN` để `requireNickOwner` (còn nguyên bản thật nhờ `importOriginal`) cho qua sớm: ở đây
 * đang kiểm sửa/xóa, không kiểm phân quyền chủ nick.
 */
const TEST_ADMIN = { userId: "test-actor", email: "test@mkttool.local", role: "ADMIN" as const };

/**
 * Thay cả `requireAdmin`, không chỉ `requireActor`.
 *
 * Từ 07/08/2026 các đường ghi kho proxy là `adminAction` (mật khẩu proxy không có bản thứ hai
 * ở đâu cả), mà `adminAction` gọi thẳng `requireAdmin` — và lời gọi `requireActor` nội bộ bên
 * trong nó không đi qua bản mock này. Thiếu dòng dưới thì test chết ở `headers()`.
 *
 * Ranh giới vai trò của kho proxy được chứng minh ở `proxy-writes-are-admin-only.database.test.ts`,
 * nơi mock đặt ở tầng nguồn danh tính nên `requireAdmin` thật vẫn chạy.
 */
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => TEST_ADMIN,
  requireAdmin: async () => TEST_ADMIN,
}));

// Hai khóa KHÁC NHAU, cố ý: nếu chỗ nào mã hóa cột vùng operator bằng khóa vùng server thì
// bài test phải đỏ. Đặt trùng nhau là tự bịt mắt mình đúng thứ cần canh.
process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential, decryptCredential } = await import(
  "@/lib/crypto/credential-encryption"
);
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");

/** Cột credential của nick thuộc vùng operator — xem encrypted-field-registry.ts. */
const encryptForOperator = (plaintext: string) =>
  encryptCredential(plaintext, loadVaultKey("operator"));
const decryptAsOperator = (encoded: string) =>
  decryptCredential(encoded, loadVaultKey("operator"));
const { deleteAccount, deleteProxy, deleteTarget } = await import("./vault-delete-actions");
const { updateAccount, updateProxy, updateTarget } = await import("./vault-update-actions");
const { deleteContentItem, updateContentItem } = await import(
  "@/lib/content/content-item-actions"
);

const SCHEDULED_AT = new Date("2026-09-10T09:00:00+07:00");
const INITIAL_ACCOUNT_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z");

interface Seeded {
  proxyId: string;
  accountId: string;
  accountRevision: string;
  targetId: string;
  contentId: string;
  jobId: string;
}

async function clearAll() {
  await prisma.interaction.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.platformTarget.deleteMany();
  await prisma.auditLog.deleteMany();
}

/** Một nick khỏe, một sub dễ tính, một bài hữu ích đã xếp lịch và đang PENDING. */
async function seed(): Promise<Seeded> {
  const proxy = await prisma.proxy.create({
    data: {
      label: "proxy-thu",
      host: "127.0.0.1",
      port: 1080,
      username: "user01",
      passwordEnc: encryptCredential("mat-khau-cu", loadVaultKey("server")),
      country: "GB",
      protocol: "http",
    },
  });
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "anna",
      passwordEnc: encryptForOperator("mat-khau-nick-cu"),
      emailAddress: "anna@example.test",
      emailPasswordEnc: encryptForOperator("mat-khau-email-cu"),
      totpSecretEnc: encryptForOperator("JBSWY3DPEHPK3PXP"),
      antidetectProfileId: "profile-anna",
      voice: "điềm đạm",
      contentAngle: "self-hosting",
      proxyId: proxy.id,
      status: "ALIVE",
      karma: 500,
      updatedAt: INITIAL_ACCOUNT_UPDATED_AT,
    },
  });
  const target = await prisma.platformTarget.create({
    data: { platform: "REDDIT", name: "r/thu", url: "https://reddit.com/r/thu", minKarma: 100 },
  });
  const content = await prisma.contentItem.create({
    data: { title: "Bài hữu ích", body: "Nội dung ban đầu", type: "VALUE", authorName: "team" },
  });
  const job = await prisma.postJob.create({
    data: {
      contentItemId: content.id,
      accountId: account.id,
      targetId: target.id,
      scheduledAt: SCHEDULED_AT,
      status: "PENDING",
    },
  });

  return {
    proxyId: proxy.id,
    accountId: account.id,
    accountRevision: account.updatedAt.toISOString(),
    targetId: target.id,
    contentId: content.id,
    jobId: job.id,
  };
}

/** Dựng FormData từ object — server action nhận FormData chứ không nhận object. */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function accountForm(seeded: Seeded, overrides: Record<string, string> = {}): FormData {
  return form({
    id: seeded.accountId,
    username: "anna",
    emailAddress: "anna@example.test",
    antidetectProfileId: "profile-anna",
    proxyId: seeded.proxyId,
    status: "ALIVE",
    karma: "500",
    revision: seeded.accountRevision,
    ...overrides,
  });
}

function targetForm(seeded: Seeded, overrides: Record<string, string> = {}): FormData {
  return form({
    id: seeded.targetId,
    name: "r/thu",
    url: "https://reddit.com/r/thu",
    minKarma: "100",
    minAccountAgeDays: "0",
    promoRatio: "9",
    allowsLinks: "on",
    active: "on",
    ...overrides,
  });
}

let seeded: Seeded;

beforeEach(async () => {
  await clearAll();
  seeded = await seed();
});

afterAll(async () => {
  await clearAll();
  await prisma.$disconnect();
});

describe("ô bí mật để trống là giữ nguyên", () => {
  it("sửa proxy không gõ mật khẩu thì mật khẩu cũ còn nguyên", async () => {
    const before = await prisma.proxy.findUniqueOrThrow({ where: { id: seeded.proxyId } });

    const result = await updateProxy(
      null,
      form({
        id: seeded.proxyId,
        label: "proxy-doi-ten",
        host: "127.0.0.1",
        port: "1080",
        username: "user01",
        password: "",
        country: "GB",
        type: "STATIC_ISP",
        protocol: "socks5",
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.proxy.findUniqueOrThrow({ where: { id: seeded.proxyId } });
    expect(after.label).toBe("proxy-doi-ten");
    expect(after.protocol).toBe("socks5");
    expect(after.passwordEnc).toBe(before.passwordEnc);
    expect(decryptCredential(after.passwordEnc, loadVaultKey("server"))).toBe("mat-khau-cu");
  });

  it("gõ mật khẩu mới thì thay thật", async () => {
    await updateProxy(
      null,
      form({
        id: seeded.proxyId,
        label: "proxy-thu",
        host: "127.0.0.1",
        port: "1080",
        username: "user01",
        password: "mat-khau-moi",
        country: "GB",
        type: "STATIC_ISP",
        protocol: "http",
      }),
    );

    const after = await prisma.proxy.findUniqueOrThrow({ where: { id: seeded.proxyId } });
    expect(decryptCredential(after.passwordEnc, loadVaultKey("server"))).toBe("mat-khau-moi");
  });

  it("sửa nick không gõ ô bí mật nào thì cả ba giữ nguyên", async () => {
    const before = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });

    const result = await updateAccount(null, accountForm(seeded, { karma: "750" }));

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.karma).toBe(750);
    expect(after.passwordEnc).toBe(before.passwordEnc);
    expect(after.emailPasswordEnc).toBe(before.emailPasswordEnc);
    expect(after.totpSecretEnc).toBe(before.totpSecretEnc);
  });

  /**
   * Phép thử vùng khóa: bí mật của nick phải nằm trong vùng operator.
   *
   * Không kiểm bằng mắt được — hai khóa đều mở ra chuỗi, chỉ khác là một trong hai ném lỗi.
   * Nên phải ép: mở bằng khóa operator ra đúng mật khẩu, mở bằng khóa server thì HỎNG.
   *
   * Từ GĐ3, form gửi lên **ciphertext do cầu nối bọc** — `encryptForOperator` ở đây đóng vai
   * cầu nối. Bài test vì vậy còn chứng minh thêm một điều: máy chủ ghi thẳng thứ nó nhận, không
   * mã hóa lại bằng khóa nào của nó.
   */
  it("mật khẩu nick mã hóa bằng khóa vùng operator, khóa server không mở được", async () => {
    const boc = encryptForOperator("mat-khau-nick-moi");

    const result = await updateAccount(null, accountForm(seeded, { passwordEnc: boc }));
    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.passwordEnc).toBe(boc);
    expect(decryptAsOperator(after.passwordEnc ?? "")).toBe("mat-khau-nick-moi");
    expect(() => decryptCredential(after.passwordEnc ?? "", loadVaultKey("server"))).toThrow();
  });

  /**
   * Máy chủ không đọc nổi thứ nó nhận, nên phép kiểm duy nhất nó làm được là hình dạng — và nó
   * phải làm. Không có nó thì một form hỏng ghi mật khẩu trần vào database mà không gì báo.
   */
  it("từ chối mật khẩu dạng trần lọt vào đường sửa", async () => {
    const before = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });

    const result = await updateAccount(
      null,
      accountForm(seeded, { passwordEnc: "mat-khau-tran" }),
    );

    expect(result.ok).toBe(false);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.passwordEnc).toBe(before.passwordEnc);
  });
});

/**
 * Đo thật 04/08/2026: lượt dò đầu tiên cách ly nhầm một nick khỏe rồi ghi lý do cách ly. Người
 * dùng sửa trạng thái về ALIVE, nhưng lý do cũ nằm lại — trang chi tiết hiện đồng thời nhãn
 * "Khỏe — hoạt động bình thường" VÀ hộp đỏ "Dừng đăng bằng nick này ngay".
 *
 * Màn hình tự cãi nhau tệ hơn màn hình thiếu thông tin: người đọc phải đoán tin dòng nào, và
 * lần sau họ bỏ qua cả hai — kể cả lần cảnh báo thật.
 */
describe("gỡ cách ly thì lý do cách ly đi theo", () => {
  it("đổi trạng thái về ALIVE thì xóa lý do cách ly", async () => {
    const quarantined = await prisma.account.update({
      where: { id: seeded.accountId },
      data: { status: "SHADOWBANNED", quarantineReason: "Bộ dò báo nick vô hình với người ngoài." },
    });

    const result = await updateAccount(
      null,
      accountForm(seeded, {
        status: "ALIVE",
        revision: quarantined.updatedAt.toISOString(),
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.status).toBe("ALIVE");
    expect(after.quarantineReason).toBeNull();
  });

  it("gõ lý do vào ô mà trạng thái không phải cách ly thì cũng không lưu", async () => {
    const result = await updateAccount(
      null,
      accountForm(seeded, { status: "COLD_START", quarantineReason: "gõ nhầm chỗ" }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.quarantineReason).toBeNull();
  });

  it("nick đang bị cách ly thật thì lý do được giữ", async () => {
    const result = await updateAccount(
      null,
      accountForm(seeded, { status: "CHECKPOINT", quarantineReason: "Dính captcha lúc mở profile." }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.quarantineReason).toBe("Dính captcha lúc mở profile.");
  });
});

/**
 * Proxy và profile antidetect: Reddit bắt buộc, Facebook không.
 *
 * Chỗ này có một cái bẫy riêng của Prisma: trong `update`, `undefined` nghĩa là GIỮ NGUYÊN chứ
 * không phải xóa. Nên ô để trống mà truyền thẳng xuống thì gỡ proxy sẽ im lặng không có tác
 * dụng gì — người dùng thấy thông báo "đã lưu", mở lại vẫn thấy proxy cũ, và không đoán được
 * vì sao. Hai test đầu canh đúng chỗ đó.
 */
describe("proxy + profile antidetect theo nền tảng", () => {
  async function makeFacebookAccount() {
    return prisma.account.create({
      data: {
        platform: "FACEBOOK",
        username: "trang-fb",
        passwordEnc: encryptForOperator("mk"),
        emailAddress: "fb@example.test",
        emailPasswordEnc: encryptForOperator("mk"),
        antidetectProfileId: "profile-cu",
        proxyId: null,
        status: "ALIVE",
      },
    });
  }

  it("gỡ proxy khỏi nick Facebook thì gỡ THẬT, không im lặng giữ nguyên", async () => {
    const proxy = await prisma.proxy.create({
      data: {
        label: "proxy-fb",
        host: "127.0.0.2",
        port: 1080,
        username: "u",
        passwordEnc: encryptCredential("p", loadVaultKey("server")),
        country: "US",
      },
    });
    const fb = await prisma.account.create({
      data: {
        platform: "FACEBOOK",
        username: "trang-fb-2",
        passwordEnc: encryptForOperator("mk"),
        emailAddress: "fb2@example.test",
        emailPasswordEnc: encryptForOperator("mk"),
        proxyId: proxy.id,
        status: "ALIVE",
      },
    });

    const result = await updateAccount(
      null,
      form({
        id: fb.id,
        username: "trang-fb-2",
        emailAddress: "fb2@example.test",
        antidetectProfileId: "",
        proxyId: "",
        status: "ALIVE",
        karma: "0",
        revision: fb.updatedAt.toISOString(),
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: fb.id } });
    expect(after.proxyId).toBeNull();
    expect(after.antidetectProfileId).toBeNull();
  });

  it("gỡ xong thì proxy đó gắn được cho nick khác", async () => {
    const fb = await makeFacebookAccount();
    await updateAccount(
      null,
      form({
        id: fb.id,
        username: "trang-fb",
        emailAddress: "fb@example.test",
        antidetectProfileId: "",
        proxyId: seeded.proxyId, // proxy đang gắn nick Reddit "anna"
        status: "ALIVE",
        karma: "0",
        revision: fb.updatedAt.toISOString(),
      }),
    );
    const after = await prisma.account.findUniqueOrThrow({ where: { id: fb.id } });
    // Proxy đó đã gắn nick khác nên phải bị từ chối, không được cướp mất của nick Reddit.
    expect(after.proxyId).toBeNull();
  });

  it("nick Reddit xóa trắng proxy thì BỊ CHẶN, không nới theo Facebook", async () => {
    const result = await updateAccount(null, accountForm(seeded, { proxyId: "" }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("IP nhà");
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.proxyId).toBe(seeded.proxyId);
  });

  /**
   * Đảo chiều so với bản trước (07/08/2026), và đây là chỗ ghi lại vì sao.
   *
   * Id profile chỉ có được sau khi bấm nút "Tạo profile trên máy này" ở trang chi tiết — mà trang
   * đó cần nick tồn tại trước. Ép nó ở đường form là dựng một vòng luẩn quẩn: không tạo nổi nick
   * Reddit nào, nên nút kia không bao giờ hiện ra.
   *
   * Không nới lỏng gì trên thực tế: `describeAccountReadiness()` báo `NO_PROFILE` ở cột "Sẵn sàng",
   * và `launch/route.ts` vẫn từ chối mở nick thiếu profile. Chỉ đổi chỗ chấm, từ *chặn lúc nhập*
   * sang *chấm điểm sẵn sàng*. Xóa trắng ô này còn là cách duy nhất để dựng lại một profile hỏng.
   */
  it("nick Reddit xóa trắng profile antidetect thì CHO QUA — không còn là luật của form", async () => {
    const result = await updateAccount(null, accountForm(seeded, { antidetectProfileId: "" }));

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.antidetectProfileId).toBeNull();
  });
});

describe("sửa xong thì chấm lại job đang chờ", () => {
  it("nâng minKarma của đích quá karma nick thì job chuyển sang BLOCKED", async () => {
    const result = await updateTarget(null, targetForm(seeded, { minKarma: "9000" }));

    expect(result.ok).toBe(true);
    expect(result.message).toContain("chấm lại");
    expect(result.message).toContain("BỊ CHẶN");

    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("BLOCKED");
    expect(job.ruleVerdicts).toContain("BLOCK");
  });

  it("hạ karma nick xuống dưới ngưỡng của đích thì job chuyển sang BLOCKED", async () => {
    const result = await updateAccount(null, accountForm(seeded, { karma: "0" }));

    expect(result.ok).toBe(true);
    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("BLOCKED");
  });

  it("đổi nick sang trạng thái chết thì job chuyển sang BLOCKED", async () => {
    await updateAccount(null, accountForm(seeded, { status: "DEAD" }));

    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("BLOCKED");
  });

  it("sửa content thành bài quảng cáo thì job vướng luật tỷ lệ 9:1", async () => {
    const result = await updateContentItem(
      null,
      form({
        id: seeded.contentId,
        title: "Bài hữu ích",
        body: "Nội dung đã sửa hẳn",
        type: "PROMO",
        authorName: "team",
      }),
    );

    expect(result.ok).toBe(true);
    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("BLOCKED");
    expect(job.ruleVerdicts).toContain("Tỷ lệ promo");
  });

  it("sửa thứ vô hại thì job vẫn ở PENDING", async () => {
    const result = await updateTarget(null, targetForm(seeded, { notes: "mod dễ tính" }));

    expect(result.ok).toBe(true);
    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("PENDING");
  });

  it("job đã đăng KHÔNG bị chấm lại — trạng thái cuối là cuối", async () => {
    await prisma.postJob.update({ where: { id: seeded.jobId }, data: { status: "POSTED" } });

    await updateTarget(null, targetForm(seeded, { minKarma: "9000" }));

    const job = await prisma.postJob.findUniqueOrThrow({ where: { id: seeded.jobId } });
    expect(job.status).toBe("POSTED");
  });
});

describe("optimistic concurrency khi sửa nick", () => {
  it("từ chối lượt ghi dùng revision cũ và không ghi account, audit hay verdict", async () => {
    const staleRevision = seeded.accountRevision;

    const winner = await updateAccount(
      null,
      accountForm(seeded, { karma: "0", revision: staleRevision }),
    );
    expect(winner.ok).toBe(true);

    const accountAfterWinner = await prisma.account.findUniqueOrThrow({
      where: { id: seeded.accountId },
    });
    const jobAfterWinner = await prisma.postJob.findUniqueOrThrow({
      where: { id: seeded.jobId },
      select: { status: true, ruleVerdicts: true },
    });
    const auditsAfterWinner = await prisma.auditLog.count({
      where: { accountId: seeded.accountId },
    });

    const loser = await updateAccount(
      null,
      accountForm(seeded, {
        karma: "900",
        status: "DEAD",
        revision: staleRevision,
      }),
    );

    expect(loser).toEqual({
      ok: false,
      message: "This record was changed after you opened it. Reload the page before saving.",
    });

    const accountAfterLoser = await prisma.account.findUniqueOrThrow({
      where: { id: seeded.accountId },
    });
    const jobAfterLoser = await prisma.postJob.findUniqueOrThrow({
      where: { id: seeded.jobId },
      select: { status: true, ruleVerdicts: true },
    });

    expect(accountAfterLoser.karma).toBe(accountAfterWinner.karma);
    expect(accountAfterLoser.status).toBe(accountAfterWinner.status);
    expect(accountAfterLoser.updatedAt).toEqual(accountAfterWinner.updatedAt);
    expect(jobAfterLoser).toEqual(jobAfterWinner);
    expect(await prisma.auditLog.count({ where: { accountId: seeded.accountId } })).toBe(
      auditsAfterWinner,
    );
  });
});

describe("xóa bị chặn khi còn dữ liệu trỏ tới", () => {
  it("proxy đang gắn nick thì không xóa được", async () => {
    const result = await deleteProxy(seeded.proxyId);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("anna");
    expect(await prisma.proxy.count()).toBe(1);
  });

  it("nick còn job thì không xóa được", async () => {
    const result = await deleteAccount(seeded.accountId);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("1 job");
    expect(await prisma.account.count()).toBe(1);
  });

  it("đích còn job thì không xóa được", async () => {
    const result = await deleteTarget(seeded.targetId);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("1 job");
    expect(await prisma.platformTarget.count()).toBe(1);
  });

  it("content đã xếp lịch thì không xóa được", async () => {
    const result = await deleteContentItem(seeded.contentId);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("1 job đã xếp lịch");
    expect(await prisma.contentItem.count()).toBe(1);
  });

  it("dọn hết thứ trỏ tới rồi thì xóa được, đúng thứ tự phụ thuộc", async () => {
    await prisma.postJob.deleteMany();

    expect((await deleteContentItem(seeded.contentId)).ok).toBe(true);
    expect((await deleteTarget(seeded.targetId)).ok).toBe(true);
    expect((await deleteAccount(seeded.accountId)).ok).toBe(true);
    // Nick đi rồi thì proxy mới hết bị trỏ tới.
    expect((await deleteProxy(seeded.proxyId)).ok).toBe(true);

    expect(await prisma.account.count()).toBe(0);
    expect(await prisma.proxy.count()).toBe(0);
  });

  it("xóa nick vẫn giữ AuditLog — nhật ký phải sống lâu hơn thứ nó ghi lại", async () => {
    await prisma.postJob.deleteMany();
    await prisma.auditLog.create({
      data: { accountId: seeded.accountId, action: "CREDENTIAL_REVEALED", detail: "password" },
    });

    expect((await deleteAccount(seeded.accountId)).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "CREDENTIAL_REVEALED" } })).toBe(1);
  });
});
