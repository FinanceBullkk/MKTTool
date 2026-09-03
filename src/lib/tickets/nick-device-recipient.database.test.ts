/**
 * `resolveNickDeviceRecipient` — vé bay về **máy giữ nick**, không về máy người bấm.
 *
 * Bài quan trọng nhất của file này là bài **ADMIN cũng bị từ chối**. Chỗ khác trong dự án
 * (`requireNickOwner`) cho ADMIN qua sớm để còn đường khôi phục; ở đây ngoại lệ đó là vô nghĩa
 * vì vé bọc mật mã cho khóa của máy kia. Cho qua chỉ đẻ ra một tấm vé chắc chắn hỏng cộng một
 * hàng nhật ký nói dối — nên ranh giới ngược chiều này cần test canh, không thì lần sau ai đó
 * "sửa cho nhất quán".
 *
 * Không mock `require-actor`: hàm nhận thẳng `Actor` làm tham số nên dựng tay là đủ.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { resolveNickDeviceRecipient } = await import("./ticket-recipient-lookup");
type Actor = import("@/lib/auth/require-actor").Actor;

const HA_ID = "user-ha";
const NAM_ID = "user-nam";
const ADMIN_ID = "user-admin";

const ha: Actor = { userId: HA_ID, email: "ha@mkttool.local", role: "OPERATOR" };
const nam: Actor = { userId: NAM_ID, email: "nam@mkttool.local", role: "OPERATOR" };
const admin: Actor = { userId: ADMIN_ID, email: "admin@mkttool.local", role: "ADMIN" };

const KHOA_CONG_KHAI_CUA_HA = "a".repeat(64);

let mayCuaHa: string;
let mayDaThuHoi: string;

/** Nick mới với đúng phần cụm cần cho bài đang chạy. */
async function createNick(cluster: { ownerId?: string; deviceId?: string }): Promise<string> {
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `nick-${Math.random().toString(36).slice(2, 10)}`,
      passwordEnc: encryptCredential("mat-khau", loadVaultKey("operator")),
      emailAddress: "nick@example.test",
      emailPasswordEnc: encryptCredential("mat-khau-email", loadVaultKey("operator")),
      status: "ALIVE",
      ...cluster,
    },
  });
  return account.id;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: HA_ID, name: "Ha", email: "ha@mkttool.local", updatedAt: new Date() },
      { id: NAM_ID, name: "Nam", email: "nam@mkttool.local", updatedAt: new Date() },
      { id: ADMIN_ID, name: "Admin", email: "admin@mkttool.local", updatedAt: new Date() },
    ],
  });

  const [dell, daMat] = await Promise.all([
    prisma.relayDevice.create({
      data: { name: "Ha's Dell laptop", userId: HA_ID, publicKey: KHOA_CONG_KHAI_CUA_HA },
    }),
    prisma.relayDevice.create({
      data: {
        name: "Lost laptop",
        userId: HA_ID,
        publicKey: "b".repeat(64),
        revokedAt: new Date(),
      },
    }),
  ]);
  mayCuaHa = dell.id;
  mayDaThuHoi = daMat.id;

});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("four outcomes", () => {
  it("explains how to assign a nick that has no Relay PC", async () => {
    const accountId = await createNick({ ownerId: HA_ID });

    const result = await resolveNickDeviceRecipient(ha, accountId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Nick "');
    expect(result.message).toContain("Nick assignment");
  });

  it("names the revoked Relay PC", async () => {
    const accountId = await createNick({ ownerId: HA_ID, deviceId: mayDaThuHoi });

    const result = await resolveNickDeviceRecipient(ha, accountId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Lost laptop");
    expect(result.message).toContain("revoked");
  });

  it("names the other operator's Relay PC and email", async () => {
    const accountId = await createNick({ ownerId: HA_ID, deviceId: mayCuaHa });

    const result = await resolveNickDeviceRecipient(nam, accountId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Ha's Dell laptop");
    expect(result.message).toContain("ha@mkttool.local");
  });

  it("returns the public key of the current operator's Relay PC", async () => {
    const accountId = await createNick({ ownerId: HA_ID, deviceId: mayCuaHa });

    const result = await resolveNickDeviceRecipient(ha, accountId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipient).toEqual({
      deviceId: mayCuaHa,
      deviceName: "Ha's Dell laptop",
      publicKey: KHOA_CONG_KHAI_CUA_HA,
    });
  });
});

describe("ADMIN has no recipient exception", () => {
  /**
   * Ngược chiều `requireNickOwner`, và cố ý. Vé mã hóa cho khóa của máy Hà thì ADMIN ngồi máy
   * khác có nhận được cũng không mở nổi — cho qua chỉ tạo ra một cửa sổ trống và một hàng
   * `AuditLog` ghi "đã cấp quyền đọc" cho một lượt đọc không bao giờ xảy ra.
   */
  it("rejects an ADMIN using a nick stored on another operator's Relay PC", async () => {
    const accountId = await createNick({ ownerId: HA_ID, deviceId: mayCuaHa });

    const result = await resolveNickDeviceRecipient(admin, accountId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Nick assignment");
  });

  it("allows an ADMIN to use a nick stored on their own Relay PC", async () => {
    const mayCuaAdmin = await prisma.relayDevice.create({
      data: { name: "Admin PC", userId: ADMIN_ID, publicKey: "d".repeat(64) },
    });
    const accountId = await createNick({ ownerId: ADMIN_ID, deviceId: mayCuaAdmin.id });

    const result = await resolveNickDeviceRecipient(admin, accountId);

    expect(result.ok).toBe(true);
  });
});

it("rejects a missing nick", async () => {
  const result = await resolveNickDeviceRecipient(ha, "khong-co-that");

  expect(result.ok).toBe(false);
});
