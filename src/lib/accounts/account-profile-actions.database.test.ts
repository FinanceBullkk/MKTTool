/**
 * `recordCreatedProfile` — bốn phép kiểm, và một trong số đó là ranh giới an toàn thật.
 *
 * Điều 3 (*nick chưa thuộc máy nào khác*) là thứ đáng canh nhất cả file. Nới nó ra thì một
 * OPERATOR chỉ cần bấm "Tạo profile" là kéo được nick của đồng nghiệp về máy mình — rồi đọc mật
 * khẩu proxy của nick đó qua vé mở profile, vì vé mở profile bay theo `deviceId`.
 *
 * Phiên là OPERATOR chứ không phải ADMIN: `requireNickOwner` cho ADMIN qua sớm, nên vai đó không
 * kiểm được gì ở đây.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const HA_ID = "user-ha";
const NAM_ID = "user-nam";

process.env.VAULT_KEY_SERVER = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.VAULT_KEY_OPERATOR = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
process.env.ALLOWED_EMAILS = "ha@mkttool.local,nam@mkttool.local";
process.env.ADMIN_EMAILS = "admin@mkttool.local";

/** Hà là OPERATOR và là chủ nick trong mọi bài dưới đây. */
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: HA_ID,
    email: "ha@mkttool.local",
    role: "OPERATOR" as const,
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { AUDIT_ACTIONS } = await import("@/lib/audit/audit-log-actions");
const { recordCreatedProfile } = await import("./account-profile-actions");

let accountId: string;
let mayCuaHa: string;
let mayCuaNam: string;
let mayDaThuHoi: string;
let personaId: string;

let nextPort = 9000;

async function seedNick(username: string, cluster: { ownerId?: string; deviceId?: string } = {}) {
  const proxy = await prisma.proxy.create({
    data: {
      label: `proxy-${username}`,
      host: "1.2.3.4",
      port: nextPort++,
      username: "u",
      passwordEnc: encryptCredential("p", loadVaultKey("server")),
      country: "US",
      protocol: "http",
    },
  });

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username,
      passwordEnc: encryptCredential("mat-khau", loadVaultKey("operator")),
      emailAddress: `${username}@example.test`,
      emailPasswordEnc: encryptCredential("mat-khau-email", loadVaultKey("operator")),
      personaId,
      proxyId: proxy.id,
      status: "ALIVE",
      ownerId: HA_ID,
      ...cluster,
    },
  });
  return account.id;
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
      { id: NAM_ID, name: "Nam", email: "nam@mkttool.local", updatedAt: new Date() },
    ],
  });

  const [dell, pcNam, daMat] = await Promise.all([
    prisma.relayDevice.create({
      data: { name: "Laptop Dell của Hà", userId: HA_ID, publicKey: "a".repeat(64) },
    }),
    prisma.relayDevice.create({
      data: { name: "PC của Nam", userId: NAM_ID, publicKey: "b".repeat(64) },
    }),
    prisma.relayDevice.create({
      data: {
        name: "Laptop đã mất",
        userId: HA_ID,
        publicKey: "c".repeat(64),
        revokedAt: new Date(),
      },
    }),
  ]);
  mayCuaHa = dell.id;
  mayCuaNam = pcNam.id;
  mayDaThuHoi = daMat.id;

  const persona = await prisma.persona.create({
    data: { name: "Nhân vật thử", voice: "điềm đạm", contentAngle: "self-hosting" },
  });
  personaId = persona.id;

  accountId = await seedNick("anna");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("đường thuận", () => {
  it("ghi id profile VÀ ghim nick vào máy vừa tạo, trong một lượt", async () => {
    const result = await recordCreatedProfile({
      accountId,
      profileId: "profile-moi-tinh",
      deviceId: mayCuaHa,
    });

    expect(result.ok).toBe(true);

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(sau.antidetectProfileId).toBe("profile-moi-tinh");
    // Ghim máy là phụ phẩm của việc tạo profile — không phải khai thêm, không khai sai được.
    expect(sau.deviceId).toBe(mayCuaHa);

    const actions = (
      await prisma.auditLog.findMany({ where: { accountId }, orderBy: { at: "asc" } })
    ).map((row) => row.action);
    expect(actions).toContain(AUDIT_ACTIONS.ACCOUNT_PROFILE_CREATED);
    expect(actions).toContain(AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED);
  });

  it("ghi lại lần nữa trên đúng máy đó vẫn được — bấm hai lần không hỏng", async () => {
    await recordCreatedProfile({ accountId, profileId: "p1", deviceId: mayCuaHa });
    const result = await recordCreatedProfile({ accountId, profileId: "p1", deviceId: mayCuaHa });

    expect(result.ok).toBe(true);
  });
});

describe("bốn phép kiểm", () => {
  it("1 — nick của người khác thì bị từ chối", async () => {
    const cuaNam = await seedNick("bob", { ownerId: NAM_ID });

    const result = await recordCreatedProfile({
      accountId: cuaNam,
      profileId: "p-bob",
      deviceId: mayCuaHa,
    });

    expect(result.ok).toBe(false);
    const sau = await prisma.account.findUniqueOrThrow({ where: { id: cuaNam } });
    expect(sau.antidetectProfileId).toBeNull();
  });

  it("2a — máy của người khác thì bị từ chối", async () => {
    const result = await recordCreatedProfile({
      accountId,
      profileId: "p",
      deviceId: mayCuaNam,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("không phải máy của bạn");
  });

  it("2b — máy đã thu hồi thì bị từ chối", async () => {
    const result = await recordCreatedProfile({
      accountId,
      profileId: "p",
      deviceId: mayDaThuHoi,
    });

    expect(result.ok).toBe(false);
  });

  /**
   * Ranh giới an toàn. Nick đã thuộc máy khác thì tạo profile mới **không** được kéo nó về đây —
   * nếu không, tự ghim thành một đường vòng qua `assignAccountCluster` (vốn chỉ ADMIN gọi được),
   * và đích đến là mật khẩu proxy của nick người khác.
   */
  it("3 — nick đã ghim ở máy KHÁC thì từ chối, không kéo về", async () => {
    const daGhim = await seedNick("carol", { deviceId: mayCuaNam });

    const result = await recordCreatedProfile({
      accountId: daGhim,
      profileId: "p-carol",
      deviceId: mayCuaHa,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("PC của Nam");
    // Câu từ chối phải nhắc dọn profile vừa lỡ tạo, không để lại rác bên MultiZen.
    expect(result.message).toContain("mồ côi");

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: daGhim } });
    expect(sau.deviceId).toBe(mayCuaNam);
    expect(sau.antidetectProfileId).toBeNull();
  });

  it("4 — profile đã gắn nick khác thì từ chối kèm tên nick đó", async () => {
    const khac = await seedNick("dave");
    await recordCreatedProfile({ accountId: khac, profileId: "p-chung", deviceId: mayCuaHa });

    const result = await recordCreatedProfile({
      accountId,
      profileId: "p-chung",
      deviceId: mayCuaHa,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("dave");
  });
});

describe("dữ liệu vào không hợp lệ", () => {
  it("thiếu trường thì từ chối chứ không ghi nửa vời", async () => {
    const result = await recordCreatedProfile({ accountId, profileId: "" });

    expect(result.ok).toBe(false);
    const sau = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(sau.antidetectProfileId).toBeNull();
  });
});
