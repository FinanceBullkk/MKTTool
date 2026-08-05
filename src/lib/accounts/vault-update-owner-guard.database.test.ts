/**
 * `updateAccount` gác gì theo chủ nick, và cố ý KHÔNG gác gì.
 *
 * Ranh giới ở đây là một quyết định, không phải chi tiết cài đặt — nên nó cần test canh cả hai
 * phía. Nới ra thì một OPERATOR ghi đè được mật khẩu nick của đồng nghiệp; siết vào thì team
 * 5-6 người không sửa nổi karma cho nhau, và ai đó sẽ gỡ phép kiểm chứ không gỡ nick.
 *
 * File riêng vì `vault-edit-actions.database.test.ts` dựng phiên ADMIN cứng ở cấp module, mà
 * ADMIN thì `requireNickOwner` cho qua sớm — không kiểm được gì ở đây.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const OPERATOR_ID = "user-operator";
const OWNER_ID = "user-chu-nick";

process.env.VAULT_KEY_SERVER =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.VAULT_KEY_OPERATOR =
  "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

/** Phiên OPERATOR — vai trò khác hẳn các test kho khác, và đó là toàn bộ mục đích file này. */
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: OPERATOR_ID,
    email: "operator@mkttool.local",
    role: "OPERATOR" as const,
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential, decryptCredential } = await import(
  "@/lib/crypto/credential-encryption"
);
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { updateAccount } = await import("./vault-update-actions");

const encryptForOperator = (plaintext: string) =>
  encryptCredential(plaintext, loadVaultKey("operator"));
const decryptAsOperator = (encoded: string) =>
  decryptCredential(encoded, loadVaultKey("operator"));

let accountId: string;
let personaId: string;

/** Form sửa nick — mọi trường bắt buộc, cộng thêm phần ghi đè tùy bài. */
function updateForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    id: accountId,
    username: "anna",
    emailAddress: "anna@example.test",
    personaId,
    status: "ALIVE",
    karma: "500",
    antidetectProfileId: "profile-anna",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: OPERATOR_ID, name: "Operator", email: "operator@mkttool.local", updatedAt: new Date() },
      { id: OWNER_ID, name: "Chủ nick", email: "chunick@mkttool.local", updatedAt: new Date() },
    ],
  });

  const persona = await prisma.persona.create({
    data: { name: "Nhân vật thử", voice: "điềm đạm", contentAngle: "self-hosting" },
  });
  personaId = persona.id;

  const account = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: "anna",
      passwordEnc: encryptForOperator("mat-khau-cu"),
      emailAddress: "anna@example.test",
      emailPasswordEnc: encryptForOperator("mat-khau-email-cu"),
      personaId: persona.id,
      status: "ALIVE",
      karma: 500,
      ownerId: OWNER_ID,
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("nick của người khác", () => {
  /**
   * Đối xứng với `requestCredentialTicket`. Không có phép kiểm này thì trạng thái là "tôi không đọc
   * được mật khẩu nick của bạn, nhưng tôi ghi đè được nó".
   */
  it("từ chối ghi đè mật khẩu, và GIỮ NGUYÊN giá trị cũ", async () => {
    const result = await updateAccount(
      null,
      updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("người khác phụ trách");

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(decryptAsOperator(after.passwordEnc)).toBe("mat-khau-cu");
  });

  it("từ chối ghi đè mật khẩu email và TOTP secret", async () => {
    const email = await updateAccount(
      null,
      updateForm({ emailPasswordEnc: encryptForOperator("moi") }),
    );
    const totp = await updateAccount(
      null,
      updateForm({ totpSecretEnc: encryptForOperator("JBSWY3DPEHPK3PXP") }),
    );

    expect(email.ok).toBe(false);
    expect(totp.ok).toBe(false);
  });

  /**
   * Phía còn lại của ranh giới, và là phía dễ siết nhầm: sửa vận hành cho nick của đồng nghiệp
   * là việc chung hằng ngày. Chặn ở đây thì phép kiểm sẽ bị gỡ chứ không được sửa.
   */
  it("CHO PHÉP sửa phần vận hành — karma, trạng thái", async () => {
    const result = await updateAccount(
      null,
      updateForm({ karma: "900", status: "CHECKPOINT", quarantineReason: "bị hỏi lại" }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.karma).toBe(900);
    expect(after.status).toBe("CHECKPOINT");
  });

  /** Ô bí mật để trống nghĩa là "giữ nguyên" — không phải một lần ghi đè, nên không bị gác. */
  it("ô bí mật để trống thì không kích hoạt phép gác", async () => {
    const result = await updateAccount(null, updateForm({ passwordEnc: "", emailPasswordEnc: "" }));

    expect(result.ok).toBe(true);
  });
});

describe("nick của chính mình", () => {
  beforeEach(async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: OPERATOR_ID } });
  });

  it("ghi đè được mật khẩu", async () => {
    const result = await updateAccount(
      null,
      updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(decryptAsOperator(after.passwordEnc)).toBe("mat-khau-moi");
  });
});

describe("nick chưa có chủ", () => {
  beforeEach(async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: null } });
  });

  /** Mặc định đóng: nick không có chủ thì chỉ ADMIN chạm được bí mật — xem `requireNickOwner`. */
  it("OPERATOR không ghi đè được bí mật", async () => {
    const result = await updateAccount(
      null,
      updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("chưa được phân công");
  });
});

describe("nhật ký đổi trạng thái", () => {
  /**
   * Ép trạng thái KHÔNG bị gác theo chủ nick — chủ nick cũng ép được, nên phép kiểm đó không
   * nhắm đúng chỗ. Thứ giúp được là dấu vết đọc ra chiều đổi.
   */
  it("ghi cả trạng thái cũ khi trạng thái đổi", async () => {
    await updateAccount(null, updateForm({ status: "SHADOWBANNED", quarantineReason: "mất bài" }));
    await updateAccount(null, updateForm({ status: "ALIVE" }));

    const logs = await prisma.auditLog.findMany({
      where: { accountId, action: "ACCOUNT_UPDATED" },
      orderBy: { at: "asc" },
    });

    expect(logs.at(-1)?.detail).toContain("SHADOWBANNED → ALIVE");
  });

  it("không nhắc trạng thái cũ khi trạng thái giữ nguyên", async () => {
    await updateAccount(null, updateForm({ karma: "777" }));

    const log = await prisma.auditLog.findFirstOrThrow({ where: { accountId } });
    expect(log.detail).not.toContain("→");
  });
});
