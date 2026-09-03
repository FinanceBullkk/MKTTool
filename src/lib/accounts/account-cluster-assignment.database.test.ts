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
const INITIAL_ACCOUNT_UPDATED_AT = new Date("2026-01-01T00:00:00.000Z");

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";
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

async function clusterForm(
  ownerId: string,
  deviceId: string,
  revision?: string,
): Promise<FormData> {
  const currentRevision =
    revision ??
    (
      await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { updatedAt: true },
      })
    ).updatedAt.toISOString();
  const form = new FormData();
  form.set("accountId", accountId);
  form.set("ownerId", ownerId);
  form.set("deviceId", deviceId);
  form.set("revision", currentRevision);
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
      updatedAt: INITIAL_ACCOUNT_UPDATED_AT,
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Relay PC belongs to the nick owner invariant", () => {
  it("rejects another person's Relay PC without writing anything", async () => {
    const result = await assignAccountCluster(null, await clusterForm(HA_ID, mayCuaNam));

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
  it("rejects a revoked Relay PC", async () => {
    const result = await assignAccountCluster(null, await clusterForm(HA_ID, mayDaThuHoi));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("revoked");

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.deviceId).toBeNull();
  });

  it("accepts a matching owner and Relay PC and records both audit entries", async () => {
    const result = await assignAccountCluster(null, await clusterForm(HA_ID, mayCuaHa));

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

describe("remove nick owner", () => {
  beforeEach(async () => {
    await assignAccountCluster(null, await clusterForm(HA_ID, mayCuaHa));
    await prisma.auditLog.deleteMany();
  });

  it("also removes the Relay PC because an ownerless nick cannot stay assigned", async () => {
    const result = await assignAccountCluster(null, await clusterForm("", ""));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBeNull();
    expect(after.deviceId).toBeNull();
    expect(await auditActions()).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_CLEARED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_UNPINNED,
    ]);
  });

  it("rejects removing the owner while retaining the Relay PC", async () => {
    const result = await assignAccountCluster(null, await clusterForm("", mayCuaHa));

    expect(result.ok).toBe(false);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBe(HA_ID);
  });
});

describe("change nick owner", () => {
  beforeEach(async () => {
    await assignAccountCluster(null, await clusterForm(HA_ID, mayCuaHa));
    await prisma.auditLog.deleteMany();
  });

  /**
   * Giao nick sang người khác thì máy cũ **không được đi theo**: nó là máy của người cũ, và cụm
   * lệch nghĩa là chủ mới xin được bí mật nhưng vé bay về máy người cũ.
   */
  it("records MOVED when assigning another owner and their Relay PC", async () => {
    const result = await assignAccountCluster(null, await clusterForm(NAM_ID, mayCuaNam));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.ownerId).toBe(NAM_ID);
    expect(after.deviceId).toBe(mayCuaNam);
    expect(await auditActions()).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_MOVED,
    ]);
  });

  it("removes the old Relay PC when changing owner without selecting a new PC", async () => {
    const result = await assignAccountCluster(null, await clusterForm(NAM_ID, ""));

    expect(result.ok).toBe(true);

    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.deviceId).toBeNull();
  });
});

describe("teammate removed from ALLOWED_EMAILS", () => {
  it("rejects assignment because nobody could access the nick afterward", async () => {
    const nguoiDaRoi = await prisma.user.create({
      data: { id: "user-cu", name: "Người cũ", email: "cu@mkttool.local", updatedAt: new Date() },
    });

    const result = await assignAccountCluster(null, await clusterForm(nguoiDaRoi.id, ""));

    expect(result.ok).toBe(false);
    expect(result.message).toContain("no longer has sign-in access");
  });
});

describe("optimistic concurrency during nick assignment", () => {
  it("rejects a stale revision without writing the account or audit log", async () => {
    const staleRevision = (
      await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
        select: { updatedAt: true },
      })
    ).updatedAt.toISOString();

    const winner = await assignAccountCluster(
      null,
      await clusterForm(HA_ID, mayCuaHa, staleRevision),
    );
    expect(winner.ok).toBe(true);

    const accountAfterWinner = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const auditsAfterWinner = await prisma.auditLog.findMany({
      where: { accountId },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      select: { action: true, detail: true },
    });

    const loser = await assignAccountCluster(
      null,
      await clusterForm(NAM_ID, mayCuaNam, staleRevision),
    );

    expect(loser).toEqual({
      ok: false,
      message: "This record was changed after you opened it. Reload the page before saving.",
    });

    const accountAfterLoser = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(accountAfterLoser.ownerId).toBe(accountAfterWinner.ownerId);
    expect(accountAfterLoser.deviceId).toBe(accountAfterWinner.deviceId);
    expect(accountAfterLoser.updatedAt).toEqual(accountAfterWinner.updatedAt);
    expect(
      await prisma.auditLog.findMany({
        where: { accountId },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        select: { action: true, detail: true },
      }),
    ).toEqual(auditsAfterWinner);
  });
});
