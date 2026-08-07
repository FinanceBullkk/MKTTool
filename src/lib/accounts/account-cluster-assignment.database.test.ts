/**
 * `assignAccountCluster` ép bất biến của cụm: **máy phải thuộc chủ nick, và phải còn dùng được.**
 *
 * Bất biến này bắc qua hai bảng (`Account.ownerId` với `RelayDevice.userId`), thứ Postgres không
 * ép được nếu không có trigger. Nên chỗ ép duy nhất là action này — và một bất biến chỉ do code
 * giữ thì phải có test canh, không thì nó trôi.
 *
 * Phiên là ADMIN vì `adminAction` đòi vậy; ranh giới đang kiểm ở đây là ranh giới **dữ liệu**,
 * không phải ranh giới vai trò.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ADMIN_ID = "user-admin";
const HA_ID = "user-ha";
const NAM_ID = "user-nam";

process.env.VAULT_KEY_SERVER = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.VAULT_KEY_OPERATOR = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
process.env.ALLOWED_EMAILS = "admin@mkttool.local,ha@mkttool.local,nam@mkttool.local";
process.env.ADMIN_EMAILS = "admin@mkttool.local";

/**
 * Thay cả `requireAdmin`: `adminAction` gọi thẳng nó, và lời gọi `requireActor` nội bộ bên
 * trong nó không đi qua mock. Cùng lý lẽ với `relay-device-actions.database.test.ts`.
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
const { AUDIT_ACTIONS } = await import("@/lib/audit/audit-log-actions");
const { assignAccountCluster } = await import("./account-owner-actions");

let accountId: string;
let mayCuaHa: string;
let mayCuaNam: string;
let mayDaThuHoi: string;

function clusterForm(ownerId: string, deviceId: string): FormData {
  const form = new FormData();
  form.set("accountId", accountId);
  form.set("ownerId", ownerId);
  form.set("deviceId", deviceId);
  return form;
}

const auditActions = () =>
  prisma.auditLog
    .findMany({ where: { accountId }, orderBy: { at: "asc" }, select: { action: true } })
    .then((rows) => rows.map((row) => row.action));

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: ADMIN_ID, name: "Admin", email: "admin@mkttool.local", updatedAt: new Date() },
      { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
      { id: NAM_ID, name: "Nam", email: "nam@mkttool.local", updatedAt: new Date() },
    ],
  });

  const devices = await Promise.all([
    prisma.relayDevice.create({
      data: { name: "Laptop Dell của Hà", userId: HA_ID, publicKey: "a".repeat(64) },
    }),
    prisma.relayDevice.create({
      data: { name: "PC của Nam", userId: NAM_ID, publicKey: "b".repeat(64) },
    }),
    prisma.relayDevice.create({
      data: {
        name: "Laptop đã mất của Hà",
        userId: HA_ID,
        publicKey: "c".repeat(64),
        revokedAt: new Date(),
      },
    }),
  ]);
  [mayCuaHa, mayCuaNam, mayDaThuHoi] = devices.map((device) => device.id);


  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "anna",
      passwordEnc: encryptCredential("mat-khau", loadVaultKey("operator")),
      emailAddress: "anna@example.test",
      emailPasswordEnc: encryptCredential("mat-khau-email", loadVaultKey("operator")),
      antidetectProfileId: "profile-anna",
      status: "ALIVE",
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bất biến máy thuộc chủ nick", () => {
  it("từ chối ghim vào máy của người khác, và KHÔNG ghi gì", async () => {
    const result = await assignAccountCluster(null, clusterForm(HA_ID, mayCuaNam));

    expect(result.ok).toBe(false);
    // Câu từ chối phải nêu đúng máy đó của ai — người bấm mới biết mình chọn nhầm dòng nào.
    expect(result.message).toContain("nam@mkttool.local");

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBeNull();
    expect(after.deviceId).toBeNull();
    expect(await auditActions()).toEqual([]);
  });

  /**
   * Máy đã thu hồi vẫn là máy của đúng người, nên nó lọt qua phép so `userId`. Nó phải bị chặn
   * bằng một phép kiểm riêng — không thì cụm trông hợp lệ mà vé không bao giờ tới nơi.
   */
  it("từ chối ghim vào máy đã thu hồi", async () => {
    const result = await assignAccountCluster(null, clusterForm(HA_ID, mayDaThuHoi));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("thu hồi");

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.deviceId).toBeNull();
  });

  it("nhận cặp khớp, ghi cả hai hàng nhật ký", async () => {
    const result = await assignAccountCluster(null, clusterForm(HA_ID, mayCuaHa));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBe(HA_ID);
    expect(after.deviceId).toBe(mayCuaHa);
    expect(await auditActions()).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED,
    ]);
  });
});

describe("gỡ chủ", () => {
  beforeEach(async () => {
    await assignAccountCluster(null, clusterForm(HA_ID, mayCuaHa));
    await prisma.auditLog.deleteMany();
  });

  it("gỡ luôn máy — nick không chủ không ghim vào máy ai được", async () => {
    const result = await assignAccountCluster(null, clusterForm("", ""));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBeNull();
    expect(after.deviceId).toBeNull();
    expect(await auditActions()).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_CLEARED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_UNPINNED,
    ]);
  });

  it("từ chối gỡ chủ mà vẫn giữ máy", async () => {
    const result = await assignAccountCluster(null, clusterForm("", mayCuaHa));

    expect(result.ok).toBe(false);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBe(HA_ID);
  });
});

describe("đổi chủ", () => {
  beforeEach(async () => {
    await assignAccountCluster(null, clusterForm(HA_ID, mayCuaHa));
    await prisma.auditLog.deleteMany();
  });

  /**
   * Giao nick sang người khác thì máy cũ **không được đi theo**: nó là máy của người cũ, và cụm
   * lệch nghĩa là chủ mới xin được bí mật nhưng vé bay về máy người cũ.
   */
  it("chuyển sang người khác kèm máy của họ ghi MOVED", async () => {
    const result = await assignAccountCluster(null, clusterForm(NAM_ID, mayCuaNam));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBe(NAM_ID);
    expect(after.deviceId).toBe(mayCuaNam);
    expect(await auditActions()).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_MOVED,
    ]);
  });

  it("chuyển chủ mà bỏ trống ô máy thì nick mất ghim, không giữ máy người cũ", async () => {
    const result = await assignAccountCluster(null, clusterForm(NAM_ID, ""));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.deviceId).toBeNull();
  });
});

describe("người không còn trong ALLOWED_EMAILS", () => {
  it("bị từ chối — gán cho họ là dựng ra nick không ai mở được", async () => {
    const nguoiDaRoi = await prisma.user.create({
      data: { id: "user-cu", name: "Người cũ", email: "cu@mkttool.local", updatedAt: new Date() },
    });

    const result = await assignAccountCluster(null, clusterForm(nguoiDaRoi.id, ""));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ALLOWED_EMAILS");
  });
});
