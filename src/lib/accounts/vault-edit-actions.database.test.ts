/**
 * Sửa và xóa trong kho danh tính, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Hai nhóm khẳng định, đều là chỗ hỏng thì hỏng âm thầm:
 *  1. Ô bí mật để trống phải GIỮ NGUYÊN giá trị cũ. Hỏng ở đây là mỗi lần sửa karma là một
 *     lần mất mật khẩu nick — mà chỉ lộ ra lúc cần đăng nhập.
 *  2. Xóa phải bị chặn khi còn dữ liệu trỏ tới. Hỏng ở đây là mất lịch sử nuôi bộ luật.
 *
 * (Nhóm thứ ba cũ — "sửa xong phải chấm lại job đang chờ" — đã đi cùng pipeline đăng bài bị
 * gỡ bỏ: không còn PostJob thì không còn verdict nào nằm im trong hàng đợi để phải chấm lại.)
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
const { deleteAccount, deleteProxy } = await import("./vault-delete-actions");
const { updateAccount, updateProxy } = await import("./vault-update-actions");

const INITIAL_ACCOUNT_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z");

interface Seeded {
  proxyId: string;
  accountId: string;
  accountRevision: string;
}

async function clearAll() {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
}

/** Một nick khỏe gắn một proxy, chưa trỏ đi đâu cả — mọi nhóm test dưới đều bắt đầu từ đây. */
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

  return {
    proxyId: proxy.id,
    accountId: account.id,
    accountRevision: account.updatedAt.toISOString(),
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

let seeded: Seeded;

beforeEach(async () => {
  await clearAll();
  seeded = await seed();
});

afterAll(async () => {
  await clearAll();
  await prisma.$disconnect();
});

describe("blank secret fields preserve current values", () => {
  it("keeps the current proxy password when an update leaves it blank", async () => {
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

  it("replaces the proxy password when a new one is entered", async () => {
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

  it("keeps all three nick secrets when an update leaves them blank", async () => {
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
  it("encrypts the nick password for the operator domain so the server key cannot open it", async () => {
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
  it("rejects a plaintext password in the update path", async () => {
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

describe("proxy-change authorization and audit log", () => {
  it("allows ADMIN to change the proxy and records the before-to-after detail", async () => {
    const replacementProxy = await prisma.proxy.create({
      data: {
        label: "proxy-moi",
        host: "127.0.0.2",
        port: 1081,
        username: "user02",
        passwordEnc: encryptCredential("mat-khau-moi", loadVaultKey("server")),
        country: "US",
        protocol: "http",
      },
    });

    const result = await updateAccount(
      null,
      accountForm(seeded, { proxyId: replacementProxy.id }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.proxyId).toBe(replacementProxy.id);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { accountId: seeded.accountId, action: "ACCOUNT_UPDATED" },
    });
    expect(log.detail).toBe(
      `karma 500, ALIVE, proxy ${seeded.proxyId} → ${replacementProxy.id}`,
    );
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
describe("quarantine reason follows quarantine status", () => {
  it("clears the quarantine reason when status returns to ALIVE", async () => {
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

  it("does not save a quarantine reason for a non-quarantined status", async () => {
    const result = await updateAccount(
      null,
      accountForm(seeded, { status: "COLD_START", quarantineReason: "gõ nhầm chỗ" }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.quarantineReason).toBeNull();
  });

  it("preserves the reason while the nick remains quarantined", async () => {
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
describe("platform-specific proxy and browser profile behavior", () => {
  it("actually removes a Facebook nick's proxy instead of silently retaining it", async () => {
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

  it("allows the removed proxy to be assigned to another nick", async () => {
    const fb = await prisma.account.create({
      data: {
        platform: "FACEBOOK",
        username: "trang-fb",
        passwordEnc: encryptForOperator("mk"),
        emailAddress: "fb@example.test",
        emailPasswordEnc: encryptForOperator("mk"),
        proxyId: null,
        status: "ALIVE",
      },
    });
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

  it("blocks clearing a Reddit nick's proxy instead of applying the Facebook exception", async () => {
    const result = await updateAccount(null, accountForm(seeded, { proxyId: "" }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("home IP");
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
  it("allows clearing a Reddit browser profile because it is no longer a form rule", async () => {
    const result = await updateAccount(null, accountForm(seeded, { antidetectProfileId: "" }));

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: seeded.accountId } });
    expect(after.antidetectProfileId).toBeNull();
  });
});

describe("optimistic concurrency during nick updates", () => {
  it("rejects a stale revision without writing the account or audit log", async () => {
    const staleRevision = seeded.accountRevision;

    const winner = await updateAccount(
      null,
      accountForm(seeded, { karma: "0", revision: staleRevision }),
    );
    expect(winner.ok).toBe(true);

    const accountAfterWinner = await prisma.account.findUniqueOrThrow({
      where: { id: seeded.accountId },
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

    expect(accountAfterLoser.karma).toBe(accountAfterWinner.karma);
    expect(accountAfterLoser.status).toBe(accountAfterWinner.status);
    expect(accountAfterLoser.updatedAt).toEqual(accountAfterWinner.updatedAt);
    expect(await prisma.auditLog.count({ where: { accountId: seeded.accountId } })).toBe(
      auditsAfterWinner,
    );
  });
});

describe("deletion is blocked while referenced data remains", () => {
  it("does not delete a proxy assigned to a nick", async () => {
    const result = await deleteProxy(seeded.proxyId);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("anna");
    expect(await prisma.proxy.count()).toBe(1);
  });

  it("deletes records in dependency order after references are removed", async () => {
    expect((await deleteAccount(seeded.accountId)).ok).toBe(true);
    // Nick đi rồi thì proxy mới hết bị trỏ tới.
    expect((await deleteProxy(seeded.proxyId)).ok).toBe(true);

    expect(await prisma.account.count()).toBe(0);
    expect(await prisma.proxy.count()).toBe(0);
  });

  it("retains AuditLog after nick deletion", async () => {
    await prisma.auditLog.create({
      data: { accountId: seeded.accountId, action: "CREDENTIAL_REVEALED", detail: "password" },
    });

    expect((await deleteAccount(seeded.accountId)).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "CREDENTIAL_REVEALED" } })).toBe(1);
  });
});
