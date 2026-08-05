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
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const OPERATOR_KEY_HEX =
  "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

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

let personaId: string;
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
    personaId,
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
  await prisma.persona.deleteMany();

  const persona = await prisma.persona.create({
    data: {
      name: "Nhân vật thử",
      voice: "điềm đạm",
      contentAngle: "self-hosting",
    },
  });
  personaId = persona.id;
});

afterAll(async () => {
  process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;
  resetVaultKeyCache();
  await prisma.$disconnect();
});

describe("vùng khóa của nick vừa tạo", () => {
  it("ba cột bí mật chỉ mở được bằng khóa operator", async () => {
    const result = await createAccount(
      null,
      createForm({ totpSecretEnc: bocNhuCauNoi("JBSWY3DPEHPK3PXP") }),
    );
    expect(result.ok).toBe(true);

    const account = await prisma.account.findFirstOrThrow();
    const operatorKey = loadVaultKey("operator");

    expect(decryptCredential(account.passwordEnc, operatorKey)).toBe(
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
      decryptCredential(account.passwordEnc, loadVaultKey("server")),
    ).toThrow();
    expect(() =>
      decryptCredential(account.emailPasswordEnc, loadVaultKey("server")),
    ).toThrow();
  });

  /** Máy chủ ghi thẳng thứ nó nhận — không mã hóa lại, không đụng vào nội dung. */
  it("ciphertext lưu xuống đúng bằng ciphertext cầu nối gửi lên", async () => {
    const boc = bocNhuCauNoi("mat-khau-nick");

    await createAccount(null, createForm({ passwordEnc: boc }));

    const account = await prisma.account.findFirstOrThrow();
    expect(account.passwordEnc).toBe(boc);
  });

  /**
   * Phép thử chính của phase, ở đường tạo: máy chủ **không giữ khóa vùng operator** mà vẫn tạo
   * được nick. Đây là thứ phân biệt "đã tách vùng" với "vẫn tự mã hóa, chỉ đổi tên biến".
   */
  it("tạo được nick khi máy chủ không có VAULT_KEY_OPERATOR", async () => {
    delete process.env.VAULT_KEY_OPERATOR;
    resetVaultKeyCache();

    const result = await createAccount(null, createForm());

    expect(result.ok).toBe(true);
    expect(await prisma.account.count()).toBe(1);
  });
});

describe("hình dạng ciphertext", () => {
  /**
   * Phép kiểm duy nhất máy chủ còn làm được với ba cột này — và phải làm. Không có nó thì một
   * form hỏng ghi mật khẩu trần vào database, im lặng, cho tới ngày ai đó mở bản sao lưu ra đọc.
   */
  it("từ chối mật khẩu dạng trần, không ghi gì", async () => {
    const result = await createAccount(
      null,
      createForm({ passwordEnc: "mat-khau-tran" }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("cầu nối");
    expect(await prisma.account.count()).toBe(0);
  });

  it("TOTP secret để trống thì cột thành NULL, không phải chuỗi rỗng", async () => {
    await createAccount(null, createForm({ totpSecretEnc: "" }));

    const account = await prisma.account.findFirstOrThrow();
    expect(account.totpSecretEnc).toBeNull();
  });
});
