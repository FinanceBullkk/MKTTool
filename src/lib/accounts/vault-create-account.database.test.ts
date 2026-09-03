/**
 * Đường **tạo** nick, canh đúng một tính chất: *dữ liệu nick tạo ra chỉ mở được bằng khóa operator.*
 *
 * Đường *sửa* đã có bài canh việc này từ lâu (`vault-edit-actions.database.test.ts`); đường tạo
 * thì trước GĐ3 không có bài test nào — không file test nào import `vault-create-actions.ts`.
 * Mã hồi đó vẫn đúng, nhưng kiểu hỏng ở đây chỉ lộ ra vào **ngày chạy `vault:rekey --domain=
 * operator`**: xoay khóa vùng operator xong thì cột nào lỡ mã hóa bằng khóa vùng server thành
 * rác, và đó đúng là ngày nghiệm thu cả phase.
 *
 * Hai khóa đặt KHÁC NHAU có chủ ý — đặt trùng là tự bịt mắt mình đúng thứ cần canh.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const SERVER_KEY_HEX =
  "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
const OPERATOR_KEY_HEX =
  "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

process.env.VAULT_KEY_SERVER = SERVER_KEY_HEX;
process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: "user-1",
    email: "admin@mkttool.local",
    role: "ADMIN" as const,
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential, decryptCredential } =
  await import("@/lib/crypto/credential-encryption");
const { loadVaultKey, resetVaultKeyCache } =
  await import("@/lib/crypto/encryption-key-loader");
const { createAccount } = await import("./vault-create-actions");

/** Đóng vai cầu nối: nơi duy nhất được phép biết khóa vùng operator từ GĐ3. */
const bocNhuCauNoi = (plaintext: string) =>
  encryptCredential(plaintext, loadVaultKey("operator"));

const ADMIN_ID = "user-1";
const NAM_ID = "user-nam";

let proxyId: string;
/**
 * Ciphertext bọc sẵn từ `beforeEach`, lúc khóa còn trong môi trường.
 *
 * Phải bọc trước chứ không bọc lúc dựng form: có bài test **gỡ hẳn `VAULT_KEY_OPERATOR`** rồi
 * mới gọi — đúng như ngoài đời, nơi cầu nối bọc xong thì máy chủ mới nhìn thấy chuỗi.
 */
let bocMatKhau: string;
let bocMatKhauEmail: string;

function createForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    platform: "FACEBOOK",
    username: "nick-moi",
    emailAddress: "nick@example.test",
    status: "COLD_START",
    karma: "0",
    passwordEnc: bocMatKhau,
    emailPasswordEnc: bocMatKhauEmail,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(async () => {
  process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;
  resetVaultKeyCache();
  bocMatKhau = bocNhuCauNoi("mat-khau-nick");
  bocMatKhauEmail = bocNhuCauNoi("mat-khau-email");

  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.user.deleteMany();

  const [proxy] = await Promise.all([
    // Nick Reddit bắt buộc gắn proxy — luật đó KHÔNG đổi trong bản này, và còn quan trọng hơn
    // trước: vân tay của profile được căn theo `Proxy.country`.
    prisma.proxy.create({
      data: {
        label: "proxy-thu",
        host: "1.2.3.4",
        port: 9100,
        username: "u",
        passwordEnc: encryptCredential("p", loadVaultKey("server")),
        country: "US",
        protocol: "http",
      },
    }),
    prisma.user.createMany({
      data: [
        { id: ADMIN_ID, name: "Quản trị", email: "admin@mkttool.local", updatedAt: new Date() },
        { id: NAM_ID, name: "Nam", email: "nam@mkttool.local", updatedAt: new Date() },
      ],
    }),
  ]);
  proxyId = proxy.id;
});

afterAll(async () => {
  process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;
  resetVaultKeyCache();
  await prisma.$disconnect();
});

describe("new nick vault-key domain", () => {
  it("opens all three secret fields only with the operator key", async () => {
    const result = await createAccount(
      null,
      createForm({ totpSecretEnc: bocNhuCauNoi("JBSWY3DPEHPK3PXP") }),
    );
    expect(result.ok).toBe(true);

    const account = await prisma.account.findFirstOrThrow();
    const operatorKey = loadVaultKey("operator");

    expect(decryptCredential(account.passwordEnc ?? "",operatorKey)).toBe(
      "mat-khau-nick",
    );
    expect(decryptCredential(account.emailPasswordEnc, operatorKey)).toBe(
      "mat-khau-email",
    );
    expect(decryptCredential(account.totpSecretEnc ?? "", operatorKey)).toBe(
      "JBSWY3DPEHPK3PXP",
    );

    // Khóa vùng máy chủ KHÔNG được mở nổi cột nào trong ba cột trên.
    expect(() =>
      decryptCredential(account.passwordEnc ?? "",loadVaultKey("server")),
    ).toThrow();
    expect(() =>
      decryptCredential(account.emailPasswordEnc, loadVaultKey("server")),
    ).toThrow();
  });

  /** Máy chủ ghi thẳng thứ nó nhận — không mã hóa lại, không đụng vào nội dung. */
  it("stores exactly the ciphertext sent by Relay", async () => {
    const boc = bocNhuCauNoi("mat-khau-nick");

    await createAccount(null, createForm({ passwordEnc: boc }));

    const account = await prisma.account.findFirstOrThrow();
    expect(account.passwordEnc).toBe(boc);
  });

  /**
   * Phép thử chính của phase, ở đường tạo: máy chủ **không giữ khóa vùng operator** mà vẫn tạo
   * được nick. Đây là thứ phân biệt "đã tách vùng" với "vẫn tự mã hóa, chỉ đổi tên biến".
   */
  it("creates a nick when the server has no VAULT_KEY_OPERATOR", async () => {
    delete process.env.VAULT_KEY_OPERATOR;
    resetVaultKeyCache();

    const result = await createAccount(null, createForm());

    expect(result.ok).toBe(true);
    expect(await prisma.account.count()).toBe(1);
  });
});

/**
 * Luồng nhập một nick chia làm nhiều chặng, và đường tạo chỉ là chặng 1.
 *
 * Trước 07/08/2026 nó không phải vậy: form đòi đủ `antidetectProfileId` mới cho lưu, trong khi id
 * đó chỉ có được ở trang chi tiết của một nick **đã tồn tại**. Vòng luẩn quẩn đó làm nút "Tạo
 * profile trên máy này" thành nút không bao giờ hiện ra với nick Reddit tạo qua form.
 */
describe("step 1 - record the nick before creating a browser profile", () => {
  const redditForm = (overrides: Record<string, string> = {}) =>
    createForm({
      platform: "REDDIT",
      username: "anna",
      proxyId,
      passwordEnc: "", // nick Reddit đăng nhập bằng Google — không có mật khẩu riêng
      ...overrides,
    });

  it("creates a Reddit nick without a browser profile ID", async () => {
    const result = await createAccount(null, redditForm());

    expect(result.ok).toBe(true);
    const account = await prisma.account.findFirstOrThrow();
    expect(account.antidetectProfileId).toBeNull();
    // Câu báo phải chỉ ra việc tiếp theo: nick này chưa dùng được, và người vừa lưu sẽ đóng tab
    // nếu không ai nói gì.
    expect(result.message).toContain("profile");
  });

  it("stores NULL rather than an empty nick password for Reddit", async () => {
    await createAccount(null, redditForm());

    const account = await prisma.account.findFirstOrThrow();
    expect(account.passwordEnc).toBeNull();
  });

  it("rejects a Reddit nick that includes a nick password", async () => {
    const result = await createAccount(null, redditForm({ passwordEnc: bocMatKhau }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Google");
    expect(await prisma.account.count()).toBe(0);
  });

  it("leaves first sign-in empty for a new nick", async () => {
    await createAccount(null, redditForm());

    const account = await prisma.account.findFirstOrThrow();
    expect(account.firstLoginAt).toBeNull();
  });
});

/**
 * Chủ nick đặt ngay lúc tạo, vì `requireNickOwner()` chặn OPERATOR trên nick vô chủ — nick sinh ra
 * không chủ thì chính người vừa khai nó cũng không bấm được nút tạo profile.
 *
 * Phiên trong file này là **ADMIN**, tức nhánh được phép giao cho người khác.
 */
describe("nick owner is set during creation", () => {
  it("allows ADMIN to assign another teammate from the form", async () => {
    const result = await createAccount(
      null,
      createForm({ platform: "REDDIT", proxyId, passwordEnc: "", ownerId: NAM_ID }),
    );

    expect(result.ok).toBe(true);
    const account = await prisma.account.findFirstOrThrow();
    expect(account.ownerId).toBe(NAM_ID);
  });

  it("leaves the nick ownerless when ADMIN clears the owner field", async () => {
    await createAccount(null, createForm({ platform: "REDDIT", proxyId, passwordEnc: "" }));

    const account = await prisma.account.findFirstOrThrow();
    expect(account.ownerId).toBeNull();
  });
});

describe("ciphertext shape", () => {
  /**
   * Phép kiểm duy nhất máy chủ còn làm được với ba cột này — và phải làm. Không có nó thì một
   * form hỏng ghi mật khẩu trần vào database, im lặng, cho tới ngày ai đó mở bản sao lưu ra đọc.
   */
  it("rejects a plaintext password without writing anything", async () => {
    const result = await createAccount(
      null,
      createForm({ passwordEnc: "mat-khau-tran" }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Relay");
    expect(await prisma.account.count()).toBe(0);
  });

  it("stores NULL rather than an empty string for a blank TOTP secret", async () => {
    await createAccount(null, createForm({ totpSecretEnc: "" }));

    const account = await prisma.account.findFirstOrThrow();
    expect(account.totpSecretEnc).toBeNull();
  });
});

/**
 * Nền tảng thứ ba đi hết đường tạo, không dừng ở zod.
 *
 * Bài này canh một lỗi đã xảy ra thật (19/08/2026): giao diện mới gửi lên `platform="TIKTOK"`
 * trong khi `accountCreateSchema` mới chỉ khai `["REDDIT","FACEBOOK"]`. Nút "Tạo Profile" im
 * lặng không tạo được gì, và **1848 bài test vẫn xanh** — vì không bài nào dựng FormData rồi
 * gọi `createAccount`, chúng chỉ gọi thẳng các hàm lib bên dưới.
 *
 * Nên bài này cố tình đi qua đúng cửa mà giao diện đi: FormData → `createAccount` → database.
 */
describe("TikTok nick creation", () => {
  it("creates the nick and stores the correct platform", async () => {
    const result = await createAccount(
      null,
      createForm({ platform: "TIKTOK", proxyId, ownerId: NAM_ID }),
    );

    expect(result.ok).toBe(true);

    const account = await prisma.account.findFirstOrThrow();
    expect(account.platform).toBe("TIKTOK");
    expect(account.proxyId).toBe(proxyId);
    // Khác Reddit: nick TikTok CÓ mật khẩu riêng, và nó vẫn phải nằm ở vùng khóa operator.
    expect(decryptCredential(account.passwordEnc ?? "", loadVaultKey("operator"))).toBe(
      "mat-khau-nick",
    );
  });

  /** Proxy bắt buộc — cùng lý do với Reddit, và phải chặn TRƯỚC khi ghi gì xuống. */
  it("rejects a missing proxy without writing a record", async () => {
    const result = await createAccount(null, createForm({ platform: "TIKTOK", proxyId: "" }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("home IP");
    expect(await prisma.account.count()).toBe(0);
  });

  /** Đăng nhập bằng số điện thoại / Google: không có mật khẩu nick, và đó không phải lỗi. */
  it("creates the nick without a nick password", async () => {
    const result = await createAccount(
      null,
      createForm({ platform: "TIKTOK", proxyId, passwordEnc: "" }),
    );

    expect(result.ok).toBe(true);
    const account = await prisma.account.findFirstOrThrow();
    expect(account.passwordEnc).toBeNull();
  });
});
