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
  "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR =
  "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

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
let proxyId: string;
let replacementProxyId: string;

/** Form sửa nick — mọi trường bắt buộc, cộng thêm phần ghi đè tùy bài. */
async function updateForm(overrides: Record<string, string> = {}): Promise<FormData> {
  const revision = (
    await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { updatedAt: true },
    })
  ).updatedAt.toISOString();
  const form = new FormData();
  const fields: Record<string, string> = {
    id: accountId,
    revision,
    username: "anna",
    emailAddress: "anna@example.test",
    status: "ALIVE",
    karma: "500",
    antidetectProfileId: "profile-anna",
    proxyId,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: OPERATOR_ID, name: "Operator", email: "operator@mkttool.local", updatedAt: new Date() },
      { id: OWNER_ID, name: "Chủ nick", email: "chunick@mkttool.local", updatedAt: new Date() },
    ],
  });

  const [proxy, replacementProxy] = await Promise.all([
    prisma.proxy.create({
      data: {
        label: "proxy-anna",
        host: "127.0.0.1",
        port: 1080,
        username: "anna",
        passwordEnc: encryptCredential("proxy-cu", loadVaultKey("server")),
        country: "US",
      },
    }),
    prisma.proxy.create({
      data: {
        label: "proxy-thay-the",
        host: "127.0.0.2",
        port: 1081,
        username: "anna-moi",
        passwordEnc: encryptCredential("proxy-moi", loadVaultKey("server")),
        country: "GB",
      },
    }),
  ]);
  proxyId = proxy.id;
  replacementProxyId = replacementProxy.id;

  const account = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: "anna",
      passwordEnc: encryptForOperator("mat-khau-cu"),
      emailAddress: "anna@example.test",
      emailPasswordEnc: encryptForOperator("mat-khau-email-cu"),
      antidetectProfileId: "profile-anna",
      proxyId,
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

describe("another operator's nick", () => {
  /**
   * Đối xứng với `requestCredentialTicket`. Không có phép kiểm này thì trạng thái là "tôi không đọc
   * được mật khẩu nick của bạn, nhưng tôi ghi đè được nó".
   */
  it("rejects a password overwrite and preserves the current value", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("người khác phụ trách");

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(decryptAsOperator(after.passwordEnc ?? "")).toBe("mat-khau-cu");
  });

  it("rejects email-password and TOTP-secret overwrites", async () => {
    const email = await updateAccount(
      null,
      await updateForm({ emailPasswordEnc: encryptForOperator("moi") }),
    );
    const totp = await updateAccount(
      null,
      await updateForm({ totpSecretEnc: encryptForOperator("JBSWY3DPEHPK3PXP") }),
    );

    expect(email.ok).toBe(false);
    expect(totp.ok).toBe(false);
  });

  it("rejects a proxy change without writing the account or audit log", async () => {
    const before = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

    const result = await updateAccount(
      null,
      await updateForm({ proxyId: replacementProxyId }),
    );

    expect(result).toEqual({
      ok: false,
      message:
        "Changing a nick's proxy is an ADMIN task. Contact an administrator to request the change.",
    });
    expect(await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).toEqual(before);
    expect(
      await prisma.auditLog.count({
        where: { accountId, action: "ACCOUNT_UPDATED" },
      }),
    ).toBe(0);
  });

  /**
   * Phía còn lại của ranh giới, và là phía dễ siết nhầm: sửa vận hành cho nick của đồng nghiệp
   * là việc chung hằng ngày. Chặn ở đây thì phép kiểm sẽ bị gỡ chứ không được sửa.
   */
  it("allows operational updates to karma and status", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ karma: "900", status: "CHECKPOINT", quarantineReason: "bị hỏi lại" }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.karma).toBe(900);
    expect(after.status).toBe("CHECKPOINT");
  });

  it("allows karma, status, and writing-voice updates when the proxy is unchanged", async () => {
    const result = await updateAccount(
      null,
      await updateForm({
        karma: "901",
        status: "CHECKPOINT",
        quarantineReason: "bị hỏi lại",
        voice: "ngắn gọn",
      }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.karma).toBe(901);
    expect(after.status).toBe("CHECKPOINT");
    expect(after.voice).toBe("ngắn gọn");
    expect(after.proxyId).toBe(proxyId);
  });

  it("allows a browser profile change and records the before-to-after audit detail", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ antidetectProfileId: "profile-anna-moi" }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.antidetectProfileId).toBe("profile-anna-moi");
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { accountId, action: "ACCOUNT_UPDATED" },
    });
    expect(log.detail).toBe(
      "karma 500, ALIVE, browser profile profile-anna → profile-anna-moi",
    );
  });

  /** Ô bí mật để trống nghĩa là "giữ nguyên" — không phải một lần ghi đè, nên không bị gác. */
  it("does not trigger the secret guard when secret fields are blank", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ passwordEnc: "", emailPasswordEnc: "" }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("the operator's own nick", () => {
  beforeEach(async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: OPERATOR_ID } });
  });

  it("allows a password overwrite", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(true);
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(decryptAsOperator(after.passwordEnc ?? "")).toBe("mat-khau-moi");
  });
});

describe("ownerless nick", () => {
  beforeEach(async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: null } });
  });

  /** Mặc định đóng: nick không có chủ thì chỉ ADMIN chạm được bí mật — xem `requireNickOwner`. */
  it("prevents OPERATOR from overwriting secrets", async () => {
    const result = await updateAccount(
      null,
      await updateForm({ passwordEnc: encryptForOperator("mat-khau-moi") }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("chưa được phân công");
  });
});

describe("status-change audit log", () => {
  /**
   * Ép trạng thái KHÔNG bị gác theo chủ nick — chủ nick cũng ép được, nên phép kiểm đó không
   * nhắm đúng chỗ. Thứ giúp được là dấu vết đọc ra chiều đổi.
   */
  it("records the previous status when status changes", async () => {
    await updateAccount(
      null,
      await updateForm({ status: "SHADOWBANNED", quarantineReason: "mất bài" }),
    );
    await updateAccount(null, await updateForm({ status: "ALIVE" }));

    const logs = await prisma.auditLog.findMany({
      where: { accountId, action: "ACCOUNT_UPDATED" },
      orderBy: { at: "asc" },
    });

    expect(logs.at(-1)?.detail).toContain("SHADOWBANNED → ALIVE");
  });

  it("does not mention the previous status when status is unchanged", async () => {
    await updateAccount(null, await updateForm({ karma: "777" }));

    const log = await prisma.auditLog.findFirstOrThrow({ where: { accountId } });
    expect(log.detail).not.toContain("→");
  });
});
