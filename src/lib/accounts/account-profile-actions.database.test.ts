/**
 * `recordCreatedProfile` — năm phép kiểm, và hai trong số đó là ranh giới an toàn thật.
 *
 * Điều 4 (*nick chưa thuộc máy nào khác*) canh phía OPERATOR: nới nó ra thì một OPERATOR chỉ cần
 * bấm "Tạo profile" là kéo được nick của đồng nghiệp về máy mình — rồi đọc mật khẩu proxy của nick
 * đó qua vé mở profile, vì vé mở profile bay theo `deviceId`.
 *
 * Điều 3 (*máy phải thuộc CHỦ NICK*) canh phía ADMIN, và **chỉ** ADMIN chạm tới nó được:
 * `requireNickOwner` cho ADMIN đi qua mọi nick, nên không có nó thì một ADMIN nhập liệu hộ sẽ ghim
 * nick của đồng nghiệp vào máy của chính mình — profile nằm sai máy, nick mà chủ nó không mở nổi.
 *
 * Vì thế phiên **đổi vai được**: mặc định là OPERATOR Hà, và bài nào cần thì đặt lại thành ADMIN.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const HA_ID = "user-ha";
const NAM_ID = "user-nam";

/**
 * Phiên đang đăng nhập, đổi được giữa các bài.
 *
 * `vi.hoisted` vì factory của `vi.mock` bị kéo lên đầu file — tham chiếu tới một `const` khai báo
 * bên dưới là chạm vào vùng chết của nó.
 */
const phien = vi.hoisted(() => ({
  actor: {
    userId: "user-ha",
    email: "ha@mkttool.local",
    role: "OPERATOR" as "ADMIN" | "OPERATOR",
  },
}));

const ADMIN_ID = "user-admin";

const PHIEN_HA_OPERATOR = { userId: HA_ID, email: "ha@mkttool.local", role: "OPERATOR" as const };
const PHIEN_ADMIN = { userId: ADMIN_ID, email: "admin@mkttool.local", role: "ADMIN" as const };

process.env.VAULT_KEY_SERVER = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.VAULT_KEY_OPERATOR = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
process.env.ALLOWED_EMAILS = "ha@mkttool.local,nam@mkttool.local";
process.env.ADMIN_EMAILS = "admin@mkttool.local";

/** Mặc định: Hà là OPERATOR và là chủ nick. Bài nào cần vai khác thì đặt lại `phien.actor`. */
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => phien.actor,
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
let mayCuaAdmin: string;

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
      proxyId: proxy.id,
      status: "ALIVE",
      ownerId: HA_ID,
      ...cluster,
    },
  });
  return account.id;
}

beforeEach(async () => {
  phien.actor = PHIEN_HA_OPERATOR;

  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
      { id: NAM_ID, name: "Nam", email: "nam@mkttool.local", updatedAt: new Date() },
      { id: ADMIN_ID, name: "Quản trị", email: "admin@mkttool.local", updatedAt: new Date() },
    ],
  });

  const [dell, pcNam, daMat, mayAdmin] = await Promise.all([
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
    // Máy của chính ADMIN — cần có thì phép kiểm 3 mới chạm tới được. Không có nó thì phép kiểm 2
    // ("máy này có phải của bạn không") bắn trước và che mất thứ đang muốn canh.
    prisma.relayDevice.create({
      data: { name: "Máy quản trị", userId: ADMIN_ID, publicKey: "d".repeat(64) },
    }),
  ]);
  mayCuaHa = dell.id;
  mayCuaNam = pcNam.id;
  mayDaThuHoi = daMat.id;
  mayCuaAdmin = mayAdmin.id;


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

describe("năm phép kiểm", () => {
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
   * Ranh giới của phía ADMIN, và **chỉ** ADMIN đi tới được: `requireNickOwner` đã chặn OPERATOR ở
   * điều 1 rồi. Không có phép kiểm này thì một ADMIN nhập liệu hộ đồng nghiệp sẽ ghim nick của họ
   * vào máy của chính mình — profile chỉ tồn tại trên một máy, nên chủ nick không mở nổi nick của
   * mình, và bất biến `deviceId != null ⟹ device.userId == ownerId` vỡ ngay lúc ghi.
   */
  it("3 — ADMIN ghim nick của người khác vào máy MÌNH thì bị từ chối", async () => {
    phien.actor = PHIEN_ADMIN;
    const cuaNam = await seedNick("erin", { ownerId: NAM_ID });

    const result = await recordCreatedProfile({
      accountId: cuaNam,
      profileId: "p-erin",
      deviceId: mayCuaAdmin, // máy của chính ADMIN, trong khi chủ nick là Nam
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("người khác phụ trách");

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: cuaNam } });
    expect(sau.antidetectProfileId).toBeNull();
    expect(sau.deviceId).toBeNull();
  });

  it("3b — ADMIN tạo hộ nick CHƯA có chủ cũng bị từ chối, kèm chỗ gán chủ", async () => {
    phien.actor = PHIEN_ADMIN;
    const voChu = await seedNick("frank");
    await prisma.account.update({ where: { id: voChu }, data: { ownerId: null } });

    const result = await recordCreatedProfile({
      accountId: voChu,
      profileId: "p-frank",
      deviceId: mayCuaAdmin,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Phân công cụm");
  });

  /**
   * Ranh giới của phía OPERATOR. Nick đã thuộc máy khác thì tạo profile mới **không** được kéo nó
   * về đây — nếu không, tự ghim thành một đường vòng qua `assignAccountCluster` (vốn chỉ ADMIN gọi
   * được), và đích đến là mật khẩu proxy của nick người khác.
   */
  it("4 — nick đã ghim ở máy KHÁC thì từ chối, không kéo về", async () => {
    const daGhim = await seedNick("carol", { deviceId: mayCuaNam });

    const result = await recordCreatedProfile({
      accountId: daGhim,
      profileId: "p-carol",
      deviceId: mayCuaHa,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("PC của Nam");
    // The rejection must instruct the operator to remove the newly created profile instead of
    // leaving orphaned data in MKT Browser.
    expect(result.message).toContain("orphan");

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: daGhim } });
    expect(sau.deviceId).toBe(mayCuaNam);
    expect(sau.antidetectProfileId).toBeNull();
  });

  it("5 — profile đã gắn nick khác thì từ chối kèm tên nick đó", async () => {
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
