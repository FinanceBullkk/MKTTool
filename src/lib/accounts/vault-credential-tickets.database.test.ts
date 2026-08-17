/**
 * Đường phát vé bí mật, chạy hai đầu trên database thật.
 *
 * Bài test trung tâm của GĐ3 nằm ở đây: **gỡ `VAULT_KEY_OPERATOR` khỏi môi trường máy chủ, phát
 * vé vẫn chạy** — và tấm vé đó vẫn mở ra đúng mật khẩu ở phía cầu nối. Đó là phép thử duy nhất
 * phân biệt được "đã tách vùng khóa" với "vẫn một kho, chỉ đổi tên biến": mọi bài test khác đều
 * xanh y hệt ở cả hai trạng thái.
 *
 * Phiên là OPERATOR chứ không phải ADMIN, vì `requireNickOwner` cho ADMIN qua sớm — dựng phiên
 * ADMIN ở đây là bỏ luôn nửa số nhánh cần canh.
 */
import { createPrivateKey } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketPayload } from "@/lib/tickets/ticket-types";

const OPERATOR_ID = "user-operator";
const NGUOI_KHAC_ID = "user-nguoi-khac";

const SERVER_KEY_HEX = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
const OPERATOR_KEY_HEX = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

process.env.VAULT_KEY_SERVER = SERVER_KEY_HEX;
process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;
// Vector RFC 8032, cùng giá trị dùng ở ticket-lifecycle.test.
process.env.TICKET_SIGNING_KEY =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ({
    userId: OPERATOR_ID,
    email: "operator@mkttool.local",
    role: "OPERATOR" as const,
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential, decryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey, resetVaultKeyCache } = await import("@/lib/crypto/encryption-key-loader");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { loadServerSigningKeys } = await import("@/lib/tickets/server-signing-key");
const { TicketReplayGuard } = await import("@/lib/tickets/ticket-replay-guard");
const { verifyTicket } = await import("@/lib/tickets/ticket-verifier");
const { resetTicketRateLimit } = await import("@/lib/tickets/ticket-rate-limit");
const { requestCredentialTicket, requestOtpTicket } = await import("./vault-credential-actions");

const MAT_KHAU = "mat-khau-that";
const MAT_KHAU_EMAIL = "mat-khau-email-that";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

let device: ReturnType<typeof generateRelayDeviceKeyPair>;
let deviceId: string;
let accountId: string;

const asOperatorKey = (plaintext: string) => encryptCredential(plaintext, loadVaultKey("operator"));

/**
 * Cầu nối xét vé bằng khóa riêng của chính máy nó — đúng thứ GĐ4 sẽ làm trong `.exe`.
 *
 * Dựng lại từ hex thay vì giữ `KeyObject` sẵn có: đó là đường mà cầu nối thật đi (nó đọc hex từ
 * file cấu hình), nên test đi đúng đường đó thì mới bắt được lỗi chuyển đổi định dạng.
 */
function openAtRelay(ticket: string) {
  return verifyTicket(ticket, {
    deviceId,
    version: 1,
    privateKey: createPrivateKey({
      key: {
        kty: "OKP",
        crv: "X25519",
        d: Buffer.from(device.privateKeyHex, "hex").toString("base64url"),
        x: Buffer.from(device.publicKeyHex, "hex").toString("base64url"),
      },
      format: "jwk",
    }),
    serverPublicKey: loadServerSigningKeys().publicKey,
    replayGuard: new TicketReplayGuard(),
  });
}

/**
 * Soi ruột vé về đúng loại mong đợi.
 *
 * `verifyTicket` cố ý trả `unknown` — nội dung vừa ra khỏi lớp mã hóa là dữ liệu chưa kiểm. Bài
 * test đi đúng đường mà cầu nối thật phải đi: soi trước, tin sau.
 */
function payloadOfKind<K extends TicketPayload["kind"]>(
  payload: unknown,
  kind: K,
): Extract<TicketPayload, { kind: K }> {
  const value = payload as TicketPayload;
  if (value?.kind !== kind) throw new Error(`Sai loại vé: mong ${kind}, nhận ${value?.kind}.`);
  return value as Extract<TicketPayload, { kind: K }>;
}

/** Khôi phục khóa operator vào môi trường máy chủ sau một bài test đã gỡ nó. */
function restoreOperatorKey() {
  process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;
  resetVaultKeyCache();
}

beforeEach(async () => {
  restoreOperatorKey();
  resetTicketRateLimit();

  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: OPERATOR_ID, name: "Operator", email: "operator@mkttool.local", updatedAt: new Date() },
      { id: NGUOI_KHAC_ID, name: "Người khác", email: "khac@mkttool.local", updatedAt: new Date() },
    ],
  });

  device = generateRelayDeviceKeyPair();
  const registered = await prisma.relayDevice.create({
    data: { name: "Laptop của Operator", userId: OPERATOR_ID, publicKey: device.publicKeyHex },
    select: { id: true },
  });
  deviceId = registered.id;


  const account = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: "anna",
      passwordEnc: asOperatorKey(MAT_KHAU),
      emailAddress: "anna@example.test",
      emailPasswordEnc: asOperatorKey(MAT_KHAU_EMAIL),
      totpSecretEnc: asOperatorKey(TOTP_SECRET),
      status: "ALIVE",
      karma: 500,
      ownerId: OPERATOR_ID,
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  restoreOperatorKey();
  await prisma.$disconnect();
});

describe("vé bí mật đi hết vòng", () => {
  it("cầu nối mở vé ra đúng mật khẩu", async () => {
    const issued = await requestCredentialTicket(accountId, "password");
    if ("ok" in issued) throw new Error(`Đáng lẽ phát được vé: ${issued.message}`);

    const payload = payloadOfKind(openAtRelay(issued.ticket).payload, "CREDENTIAL");

    expect(decryptCredential(payload.credentialCiphertext, loadVaultKey("operator"))).toBe(MAT_KHAU);
    expect(issued.deviceName).toBe("Laptop của Operator");
  });

  it("vé mật khẩu email mang đúng cột kia", async () => {
    const issued = await requestCredentialTicket(accountId, "emailPassword");
    if ("ok" in issued) throw new Error(issued.message);

    const payload = payloadOfKind(openAtRelay(issued.ticket).payload, "CREDENTIAL");

    expect(decryptCredential(payload.credentialCiphertext, loadVaultKey("operator"))).toBe(
      MAT_KHAU_EMAIL,
    );
  });

  it("vé OTP mang TOTP secret, cầu nối sinh được mã", async () => {
    const issued = await requestOtpTicket(accountId);
    if ("ok" in issued) throw new Error(issued.message);

    const payload = payloadOfKind(openAtRelay(issued.ticket).payload, "OTP");

    expect(decryptCredential(payload.totpSecretCiphertext, loadVaultKey("operator"))).toBe(
      TOTP_SECRET,
    );
  });

  /** Trình duyệt chỉ là người đưa thư — nó cầm vé đi qua nhưng không đọc được gì bên trong. */
  it("chuỗi vé không chứa mật khẩu dạng trần", async () => {
    const issued = await requestCredentialTicket(accountId, "password");
    if ("ok" in issued) throw new Error(issued.message);

    expect(issued.ticket).not.toContain(MAT_KHAU);

    // Kể cả ciphertext nguyên văn trong database cũng không được nằm ở bao ngoài đọc được:
    // nó là thứ chỉ cần một khóa nữa là mở ra, nên để hở nó là hạ vé xuống thành một lớp.
    const stored = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { passwordEnc: true },
    });
    const envelope = Buffer.from(issued.ticket.split(".")[0], "base64url").toString("utf8");
    expect(envelope).not.toContain(stored.passwordEnc);
  });
});

/**
 * Phép thử chính của cả phase — Success Criteria của phase-03.
 *
 * Không có bài này thì "đã tách vùng khóa" chỉ là lời khai: mọi bài test khác đều xanh y hệt
 * trong một hệ vẫn giải mã ngay tại máy chủ.
 */
describe("máy chủ không có khóa operator", () => {
  beforeEach(() => {
    delete process.env.VAULT_KEY_OPERATOR;
    resetVaultKeyCache();
  });

  it("vẫn phát được vé mật khẩu, và cầu nối vẫn mở ra đúng", async () => {
    const issued = await requestCredentialTicket(accountId, "password");
    if ("ok" in issued) throw new Error(`Đáng lẽ phát được vé: ${issued.message}`);

    const payload = payloadOfKind(openAtRelay(issued.ticket).payload, "CREDENTIAL");

    // Khóa quay lại phía cầu nối — nơi duy nhất đáng lẽ có nó.
    restoreOperatorKey();
    expect(decryptCredential(payload.credentialCiphertext, loadVaultKey("operator"))).toBe(MAT_KHAU);
  });

  it("vẫn phát được vé OTP", async () => {
    const issued = await requestOtpTicket(accountId);

    expect("ticket" in issued).toBe(true);
  });
});

describe("các nhánh từ chối", () => {
  /**
   * Chặn vẫn đúng ở bản cũ — thứ từng mất là **lời giải thích**: `AuthorizationError` ném trần
   * ra khỏi server action thì trình duyệt chỉ thấy promise reject, nút chết lặng không chữ nào.
   */
  it("nick của người khác: trả câu giải thích, không ném lỗi", async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: NGUOI_KHAC_ID } });

    const result = await requestCredentialTicket(accountId, "password");

    expect("ok" in result && result.ok).toBe(false);
    expect("message" in result && result.message).toContain("người khác phụ trách");
  });

  it("nick chưa phân công: mặc định đóng, kèm câu nói phải làm gì", async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: null } });

    const result = await requestOtpTicket(accountId);

    expect("message" in result && result.message).toContain("chưa được phân công");
  });

  it("chưa có máy nào trong sổ: nói rõ phải đăng ký ở đâu", async () => {
    await prisma.relayDevice.deleteMany();

    const result = await requestCredentialTicket(accountId, "password");

    expect("message" in result && result.message).toContain("/relay-devices");
  });

  /** Thu hồi phải chặn được **vé mới** — đó là toàn bộ lời hứa của nút thu hồi. */
  it("máy đã thu hồi không nhận được vé mới", async () => {
    await prisma.relayDevice.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });

    const result = await requestCredentialTicket(accountId, "password");

    expect("ok" in result && result.ok).toBe(false);
  });

  it("hai máy đang dùng mà không chọn: bắt chọn thay vì đoán bừa", async () => {
    const second = generateRelayDeviceKeyPair();
    await prisma.relayDevice.create({
      data: { name: "Máy bàn", userId: OPERATOR_ID, publicKey: second.publicKeyHex },
    });

    const result = await requestCredentialTicket(accountId, "password");

    expect("message" in result && result.message).toContain("chọn máy bạn đang ngồi");
  });

  it("chọn máy của người khác thì bị từ chối", async () => {
    const other = generateRelayDeviceKeyPair();
    const otherDevice = await prisma.relayDevice.create({
      data: { name: "Máy người khác", userId: NGUOI_KHAC_ID, publicKey: other.publicKeyHex },
      select: { id: true },
    });

    const result = await requestCredentialTicket(accountId, "password", otherDevice.id);

    expect("ok" in result && result.ok).toBe(false);
  });

  it("nick chưa lưu TOTP secret: nói ngay, không bắt đợi một tab trống", async () => {
    await prisma.account.update({ where: { id: accountId }, data: { totpSecretEnc: null } });

    const result = await requestOtpTicket(accountId);

    expect("message" in result && result.message).toContain("chưa lưu TOTP secret");
  });
});

/**
 * Hạn nhịp: một phiên bị trộm không rút sạch kho trong vài giây.
 *
 * `AuditLog` ghi lại đầy đủ, nhưng nhật ký là thứ đọc SAU — lúc đó thiệt hại đã xong.
 */
describe("hạn nhịp", () => {
  it("chặn lượt thứ 11 trong một phút, kèm số giây chờ", async () => {
    for (let lan = 0; lan < 10; lan += 1) {
      const ok = await requestCredentialTicket(accountId, "password");
      expect("ticket" in ok).toBe(true);
    }

    const chan = await requestCredentialTicket(accountId, "password");

    expect("ok" in chan && chan.ok).toBe(false);
    expect("message" in chan && chan.message).toMatch(/tạm dừng \d+ giây/);
  });

  /** Người bị chặn vẫn phải được biết vì sao mình bị chặn, chứ không phải một nút im lặng. */
  it("lượt bị chặn KHÔNG ghi vào nhật ký lộ credential", async () => {
    for (let lan = 0; lan < 11; lan += 1) {
      await requestCredentialTicket(accountId, "password");
    }

    const logs = await prisma.auditLog.count({
      where: { accountId, action: "CREDENTIAL_REVEALED" },
    });
    expect(logs).toBe(10);
  });
});

describe("nhật ký", () => {
  /**
   * Mốc ghi là lúc PHÁT VÉ, không phải lúc người dùng nhìn thấy mật khẩu — máy chủ tự biết mốc
   * đó, còn mốc kia thì nó chỉ biết nếu tin lời trình duyệt khai.
   */
  it("ghi CREDENTIAL_REVEALED kèm cột nào và máy nào", async () => {
    await requestCredentialTicket(accountId, "emailPassword");

    const log = await prisma.auditLog.findFirstOrThrow({ where: { accountId } });
    expect(log.action).toBe("CREDENTIAL_REVEALED");
    expect(log.detail).toContain("emailPassword");
    expect(log.detail).toContain("Laptop của Operator");
    expect(log.actorId).toBe(OPERATOR_ID);
  });

  it("ghi OTP_GENERATED kèm máy nhận", async () => {
    await requestOtpTicket(accountId);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { accountId } });
    expect(log.action).toBe("OTP_GENERATED");
    expect(log.detail).toContain("Laptop của Operator");
  });

  /** Không phát được vé thì không có bí mật nào rời kho — nhật ký phải im. */
  it("không ghi gì khi bị từ chối vì không phải chủ nick", async () => {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: NGUOI_KHAC_ID } });

    await requestCredentialTicket(accountId, "password");

    expect(await prisma.auditLog.count()).toBe(0);
  });
});
