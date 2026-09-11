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
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketEnvelope } from "@/lib/tickets/ticket-types";
import { generateRelayDeviceKeyPair, relayPrivateKeyToKeyObject } from "@/lib/tickets/relay-device-key";
import { openSealedPayload } from "@/lib/tickets/ticket-sealed-box";
import { resetServerSigningKeysCache } from "@/lib/tickets/server-signing-key";

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

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";
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
const { recordCreatedProfile, requestCreateProfileTicket } = await import("./account-profile-actions");

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetServerSigningKeysCache();
});

describe("successful path", () => {
  it("records the browser profile ID and assigns the creating Relay PC in one operation", async () => {
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

  it("allows the same browser profile to be recorded again on the same Relay PC", async () => {
    await recordCreatedProfile({ accountId, profileId: "p1", deviceId: mayCuaHa });
    const result = await recordCreatedProfile({ accountId, profileId: "p1", deviceId: mayCuaHa });

    expect(result.ok).toBe(true);
  });
});

describe("five safety checks", () => {
  it("1 - rejects a nick owned by another operator", async () => {
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

  it("2a - rejects another operator's Relay PC", async () => {
    const result = await recordCreatedProfile({
      accountId,
      profileId: "p",
      deviceId: mayCuaNam,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("not yours");
  });

  it("2b - rejects a revoked Relay PC", async () => {
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
  it("3 - rejects an ADMIN assigning another owner's nick to the ADMIN's Relay PC", async () => {
    phien.actor = PHIEN_ADMIN;
    const cuaNam = await seedNick("erin", { ownerId: NAM_ID });

    const result = await recordCreatedProfile({
      accountId: cuaNam,
      profileId: "p-erin",
      deviceId: mayCuaAdmin, // máy của chính ADMIN, trong khi chủ nick là Nam
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("another operator");

    const sau = await prisma.account.findUniqueOrThrow({ where: { id: cuaNam } });
    expect(sau.antidetectProfileId).toBeNull();
    expect(sau.deviceId).toBeNull();
  });

  it("3b - rejects ADMIN creation for an ownerless nick and identifies where to assign it", async () => {
    phien.actor = PHIEN_ADMIN;
    const voChu = await seedNick("frank");
    await prisma.account.update({ where: { id: voChu }, data: { ownerId: null } });

    const result = await recordCreatedProfile({
      accountId: voChu,
      profileId: "p-frank",
      deviceId: mayCuaAdmin,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Nick assignment");
  });

  /**
   * Ranh giới của phía OPERATOR. Nick đã thuộc máy khác thì tạo profile mới **không** được kéo nó
   * về đây — nếu không, tự ghim thành một đường vòng qua `assignAccountCluster` (vốn chỉ ADMIN gọi
   * được), và đích đến là mật khẩu proxy của nick người khác.
   */
  it("4 - rejects a nick already assigned to another Relay PC", async () => {
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

  it("5 - rejects a browser profile already assigned to another nick and names it", async () => {
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

describe("invalid input", () => {
  it("rejects missing fields without a partial write", async () => {
    const result = await recordCreatedProfile({ accountId, profileId: "" });

    expect(result.ok).toBe(false);
    const sau = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(sau.antidetectProfileId).toBeNull();
  });
});

describe("explicit Relay PC selection for profile creation", () => {
  const fingerprint = {
    device: "desktop", localeId: "en-US", timezone: "America/New_York",
    screen: { width: 1920, height: 1080 },
  };

  it("encrypts for the selected PC when the owner has two active PCs", async () => {
    vi.stubEnv("TICKET_SIGNING_KEY", randomBytes(32).toString("hex"));
    const keys = generateRelayDeviceKeyPair();
    const otherKeys = generateRelayDeviceKeyPair();
    await prisma.relayDevice.update({ where: { id: mayCuaHa }, data: { publicKey: otherKeys.publicKeyHex } });
    const selected = await prisma.relayDevice.create({
      data: { name: "Selected local PC", userId: HA_ID, publicKey: keys.publicKeyHex },
    });

    const result = await requestCreateProfileTicket(accountId, fingerprint, selected.id);

    expect(result).toHaveProperty("deviceId", selected.id);
    if (!("ticket" in result)) throw new Error(result.message);
    const envelope = JSON.parse(Buffer.from(result.ticket.split(".")[0], "base64url").toString()) as TicketEnvelope;
    expect(envelope.deviceId).toBe(selected.id);
    const payload = { ephemeralPublicKey: envelope.epk, sealed: envelope.sealed };
    expect(openSealedPayload(payload, relayPrivateKeyToKeyObject(keys.privateKeyHex)))
      .toMatchObject({ kind: "CREATE_PROFILE", accountId });
    expect(() => openSealedPayload(payload, relayPrivateKeyToKeyObject(otherKeys.privateKeyHex))).toThrow();
    await expect(requestCreateProfileTicket(accountId, fingerprint)).resolves.toMatchObject({ ok: false });
  });

  it.each(["unowned", "revoked", "unknown"] as const)("rejects an %s selected PC", async (kind) => {
    const selectedId = kind === "unowned" ? mayCuaNam : kind === "revoked" ? mayDaThuHoi : "missing-device";
    await expect(requestCreateProfileTicket(accountId, fingerprint, selectedId))
      .resolves.toMatchObject({ ok: false, message: expect.stringContaining("selected Relay PC") });
  });
});

describe("concurrent changes during profile completion", () => {
  it("waits for an in-flight revocation and refuses to pin the revoked PC", async () => {
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const revoking = prisma.$transaction(async (tx) => {
      await tx.relayDevice.update({ where: { id: mayCuaHa }, data: { revokedAt: new Date() } });
      locked.resolve();
      await release.promise;
      await tx.account.updateMany({ where: { deviceId: mayCuaHa }, data: { deviceId: null } });
    });
    await locked.promise;
    const recording = recordCreatedProfile({ accountId, profileId: "racing-revocation", deviceId: mayCuaHa });
    try {
      await vi.waitFor(async () => {
        const waiting = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
              AND wait_event_type = 'Lock'
              AND query LIKE '%FROM "RelayDevice"%FOR NO KEY UPDATE%'
          ) AS waiting`;
        expect(waiting[0].waiting).toBe(true);
      }, { timeout: 2000, interval: 20 });
    } finally {
      release.resolve();
      await revoking;
      await recording;
    }

    expect((await recording).ok).toBe(false);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.deviceId).toBeNull();
    expect(account.antidetectProfileId).toBeNull();
    expect(await prisma.auditLog.count({ where: { accountId } })).toBe(0);
  });

  it.each(["revoked", "reassigned", "retiring"] as const)(
    "rejects a Relay PC that became %s after its initial read",
    async (change) => {
      const staleDevice = await prisma.relayDevice.findUniqueOrThrow({ where: { id: mayCuaHa } });
      await prisma.relayDevice.update({
        where: { id: mayCuaHa },
        data: change === "revoked" ? { revokedAt: new Date() }
          : change === "reassigned" ? { userId: NAM_ID }
          : { retirementId: "retirement-in-progress" },
      });
      // Only the precheck sees the old snapshot; the transaction uses the real database.
      vi.spyOn(prisma.relayDevice, "findUnique").mockResolvedValueOnce(staleDevice);

      const result = await recordCreatedProfile({ accountId, profileId: "stale-profile", deviceId: mayCuaHa });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("changed");
      const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
      expect(account.antidetectProfileId).toBeNull();
      expect(account.deviceId).toBeNull();
      expect(await prisma.auditLog.count({ where: { accountId } })).toBe(0);
    },
  );

  it("rejects a changed account revision even when owner and device return to their old values", async () => {
    const staleAccount = await prisma.account.findUniqueOrThrow({
      where: { id: accountId }, include: { device: true },
    });
    await prisma.account.update({
      where: { id: accountId },
      data: { updatedAt: new Date(staleAccount.updatedAt.getTime() + 1000) },
    });
    // requireNickOwner reads first, followed by recordCreatedProfile's account snapshot.
    vi.spyOn(prisma.account, "findUnique")
      .mockResolvedValueOnce(staleAccount)
      .mockResolvedValueOnce(staleAccount);

    const result = await recordCreatedProfile({ accountId, profileId: "stale-profile", deviceId: mayCuaHa });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("changed");
    expect((await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).antidetectProfileId).toBeNull();
    expect(await prisma.auditLog.count({ where: { accountId } })).toBe(0);
  });

  it("allows only one of two different profiles completing for the same nick", async () => {
    const results = await Promise.all([
      recordCreatedProfile({ accountId, profileId: "first-profile", deviceId: mayCuaHa }),
      recordCreatedProfile({ accountId, profileId: "second-profile", deviceId: mayCuaHa }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { accountId } })).toBe(2);
  });
});
