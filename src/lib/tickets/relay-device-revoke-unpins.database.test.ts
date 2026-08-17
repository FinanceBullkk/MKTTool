/**
 * Thu hồi một chiếc máy **gỡ ghim mọi nick của nó**, trong cùng một transaction.
 *
 * Đường thu hồi là đường khẩn cấp — laptop vừa mất. Nếu nó không gỡ ghim thì nick ở lại trên
 * một chiếc máy đã chết, và triệu chứng là "bấm mở profile không ra gì" chứ không phải một câu
 * lỗi đọc được. Nếu nó chặn thu hồi vì còn nick trỏ tới thì tệ hơn nữa: thủ tục đặt trước
 * thiệt hại, trong lúc chiếc máy kia vẫn xin được vé.
 *
 * Đây là hai lựa chọn ngược nhau và cả hai đều "hợp lý", nên hướng đã chọn cần test canh.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ADMIN_ID = "user-admin";
const HA_ID = "user-ha";

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";
process.env.ALLOWED_EMAILS = "admin@mkttool.local,ha@mkttool.local";

/**
 * Phải thay CẢ `requireAdmin`, không chỉ `requireActor`: `adminAction` gọi thẳng `requireAdmin`,
 * mà bên trong nó gọi `requireActor` của chính module đó — lời gọi nội bộ không đi qua mock.
 * Cùng lý lẽ với `relay-device-actions.database.test.ts`.
 */
const TEST_ADMIN = { userId: ADMIN_ID, email: "admin@mkttool.local", role: "ADMIN" as const };

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => TEST_ADMIN,
  requireAdmin: async () => TEST_ADMIN,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { revokeRelayDevice } = await import("./relay-device-actions");

let deviceId: string;
let deviceKhac: string;

async function pinNick(username: string, pinnedTo: string): Promise<string> {
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username,
      passwordEnc: encryptCredential("mat-khau", loadVaultKey("operator")),
      emailAddress: `${username}@example.test`,
      emailPasswordEnc: encryptCredential("mat-khau-email", loadVaultKey("operator")),
      status: "ALIVE",
      ownerId: HA_ID,
      deviceId: pinnedTo,
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
      { id: ADMIN_ID, name: "Admin", email: "admin@mkttool.local", updatedAt: new Date() },
      { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
    ],
  });

  const [mat, con] = await Promise.all([
    prisma.relayDevice.create({
      data: { name: "Laptop đã mất", userId: HA_ID, publicKey: "a".repeat(64) },
    }),
    prisma.relayDevice.create({
      data: { name: "PC ở nhà", userId: HA_ID, publicKey: "b".repeat(64) },
    }),
  ]);
  deviceId = mat.id;
  deviceKhac = con.id;

});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("thu hồi máy còn nick ghim", () => {
  it("không bị chặn, và gỡ ghim đúng nick của máy đó", async () => {
    const anna = await pinNick("anna", deviceId);
    const bob = await pinNick("bob", deviceId);
    const carol = await pinNick("carol", deviceKhac);

    const result = await revokeRelayDevice(deviceId);

    expect(result.ok).toBe(true);

    const [annaSau, bobSau, carolSau] = await Promise.all([
      prisma.account.findUniqueOrThrow({ where: { id: anna } }),
      prisma.account.findUniqueOrThrow({ where: { id: bob } }),
      prisma.account.findUniqueOrThrow({ where: { id: carol } }),
    ]);

    expect(annaSau.deviceId).toBeNull();
    expect(bobSau.deviceId).toBeNull();
    // Nick của chiếc máy KHÁC không được đụng tới — thu hồi là việc của một máy.
    expect(carolSau.deviceId).toBe(deviceKhac);
  });

  /**
   * Con số phải có trong câu báo. Gỡ ghim lặng lẽ thì người vừa thu hồi không biết mình vừa
   * làm hai nick ngừng mở được profile, và họ chỉ phát hiện khi có người báo nút hỏng.
   */
  it("câu báo nói rõ mấy nick vừa mất ghim", async () => {
    await pinNick("anna", deviceId);
    await pinNick("bob", deviceId);

    const result = await revokeRelayDevice(deviceId);

    expect(result.message).toContain("2 nick");
    expect(result.message).toContain("gán cụm");
  });

  it("máy không có nick nào thì câu báo không bịa ra con số", async () => {
    const result = await revokeRelayDevice(deviceId);

    expect(result.message).not.toContain("nick đang ghim");
    // Lời nhắc xoay khóa vẫn phải còn — đó mới là việc quan trọng khi máy thật sự mất.
    expect(result.message).toContain("VAULT_KEY_OPERATOR");
  });

  it("chủ nick giữ nguyên — mất máy không phải mất người", async () => {
    const anna = await pinNick("anna", deviceId);

    await revokeRelayDevice(deviceId);

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: anna } });
    expect(sau.ownerId).toBe(HA_ID);
  });
});
