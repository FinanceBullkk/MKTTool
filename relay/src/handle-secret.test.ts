/**
 * Đường lấy bí mật, đo hai đầu thật: máy chủ **chỉ có ciphertext** và phát vé; cầu nối giải mã
 * bằng khóa vùng operator của riêng nó.
 *
 * Bài test quan trọng nhất của cả file là bài cuối: **khóa của máy chủ không mở được** thứ vé
 * này mang. Đó là toàn bộ mục đích của GĐ3 phát biểu thành một phép thử.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptCredential } from "../../src/lib/crypto/credential-encryption";
import { generateRelayDeviceKeyPair } from "../../src/lib/tickets/relay-device-key";
import { relayPrivateKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { issueTicket } from "../../src/lib/tickets/ticket-issuer";
import {
  SERVER_SIGNING_KEY_ENV,
  publicKeyToHex,
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "../../src/lib/tickets/server-signing-key";
import { TICKET_KINDS, TICKET_LIFETIME_MS } from "../../src/lib/tickets/ticket-types";
import { handleSecretReveal } from "./handle-secret";
import { buildRelayIdentity } from "./relay-identity";

const SERVER_SEED = "11".repeat(32);
const OPERATOR_KEY = Buffer.from("ab".repeat(32), "hex");
const SERVER_KEY = Buffer.from("cd".repeat(32), "hex");
const DEVICE_ID = "device-abc";

/** TOTP secret base32 hợp lệ, đủ dài theo guardrail 10 byte của bộ sinh mã. */
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

function setup(deviceId = DEVICE_ID) {
  const keys = generateRelayDeviceKeyPair();
  const serverPublicKey = publicKeyToHex(
    signingKeysFromSeed(Buffer.from(SERVER_SEED, "hex")).publicKey,
  );

  const identity = buildRelayIdentity(
    { deviceId, serverPublicKey, vaultKeyOperator: "ab".repeat(32), webOrigin: "https://web.example" },
    relayPrivateKeyToKeyObject(keys.privateKeyHex),
  );

  return {
    identity,
    recipient: { deviceId, publicKey: keys.publicKeyHex },
    deps: {
      identity,
      vaultKeyOperator: OPERATOR_KEY,
      notConfiguredMessage: "chưa cấu hình",
    },
  };
}

function credentialTicket(
  recipient: { deviceId: string; publicKey: string },
  plaintext: string,
  field: "password" | "emailPassword" = "password",
  key: Buffer = OPERATOR_KEY,
) {
  return issueTicket(
    {
      kind: TICKET_KINDS.CREDENTIAL,
      accountId: "acc-1",
      field,
      // Đúng như đời thật: máy chủ chuyển tiếp NGUYÊN VĂN ciphertext trong database.
      credentialCiphertext: encryptCredential(plaintext, key),
    },
    recipient,
  );
}

function body(ticket: string): string {
  return JSON.stringify({ ticket });
}

beforeEach(() => {
  process.env[SERVER_SIGNING_KEY_ENV] = SERVER_SEED;
  resetServerSigningKeysCache();
});

afterEach(() => {
  delete process.env[SERVER_SIGNING_KEY_ENV];
  resetServerSigningKeysCache();
  vi.useRealTimers();
});

describe("handleSecretReveal", () => {
  it("mở được mật khẩu nick bằng khóa vùng operator", async () => {
    const { recipient, deps } = setup();

    const result = await handleSecretReveal(body(credentialTicket(recipient, "mat-khau-that")), deps);

    expect(result.ok).toBe(true);
    expect(result.secret).toBe("mat-khau-that");
    expect(result.label).toBe("Mật khẩu nick");
  });

  it("nhãn nói đúng thứ đang hiện — mật khẩu nick khác mật khẩu email", async () => {
    const { recipient, deps } = setup();

    const result = await handleSecretReveal(
      body(credentialTicket(recipient, "mk-email", "emailPassword")),
      deps,
    );

    expect(result.label).toBe("Mật khẩu email");
  });

  it("KHÓA CỦA MÁY CHỦ KHÔNG MỞ ĐƯỢC — phép thử chính của GĐ3", async () => {
    // Ciphertext dựng bằng khóa vùng operator, cầu nối thử mở bằng khóa vùng server.
    const { recipient, identity } = setup();

    const result = await handleSecretReveal(body(credentialTicket(recipient, "mat-khau-that")), {
      identity,
      vaultKeyOperator: SERVER_KEY,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(false);
    expect(result.secret).toBeUndefined();
    // Câu phải chỉ vào việc phải làm, không chỉ vào lỗi của thư viện mật mã.
    expect(result.message).toContain("relay-config.json");
  });

  it("sinh được mã OTP kèm số giây còn lại", async () => {
    const { recipient, deps } = setup();
    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.OTP,
        accountId: "acc-1",
        totpSecretCiphertext: encryptCredential(TOTP_SECRET, OPERATOR_KEY),
      },
      recipient,
    );

    const result = await handleSecretReveal(body(ticket), deps);

    expect(result.ok).toBe(true);
    expect(result.secret).toMatch(/^\d{6}$/);
    expect(result.secondsRemaining).toBeGreaterThan(0);
    expect(result.secondsRemaining).toBeLessThanOrEqual(30);
  });

  it("TOTP secret trong kho hỏng thì nói rõ phải sửa ở đâu", async () => {
    // Máy chủ mất phép kiểm base32 từ GĐ3 (nó không đọc nổi chuỗi đã bọc) — đây là lưới cuối.
    const { recipient, deps } = setup();
    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.OTP,
        accountId: "acc-1",
        totpSecretCiphertext: encryptCredential("không phải base32!!!", OPERATOR_KEY),
      },
      recipient,
    );

    const result = await handleSecretReveal(body(ticket), deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("base32");
  });

  it("vé mở profile KHÔNG hiện được ở tab này", async () => {
    const { recipient, deps } = setup();
    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: "acc-1",
        antidetectProfileId: "p1",
        proxyLabel: "Proxy #1",
        proxy: { protocol: "http", host: "1.2.3.4", port: 8080 },
      },
      recipient,
    );

    const result = await handleSecretReveal(body(ticket), deps);

    expect(result.ok).toBe(false);
    expect(result.secret).toBeUndefined();
  });

  it("vé quá hạn bị từ chối TRƯỚC khi giải mã", async () => {
    const { recipient, deps } = setup();
    const ticket = credentialTicket(recipient, "mat-khau-that");

    const result = await handleSecretReveal(body(ticket), deps, Date.now() + TICKET_LIFETIME_MS + 1);

    expect(result.rejectionCode).toBe("EXPIRED");
    expect(result.secret).toBeUndefined();
  });

  it("vé dùng lần hai bị từ chối — tải lại tab không lấy lại được mật khẩu", async () => {
    const { recipient, deps } = setup();
    const ticket = credentialTicket(recipient, "mat-khau-that");

    expect((await handleSecretReveal(body(ticket), deps)).ok).toBe(true);

    const second = await handleSecretReveal(body(ticket), deps);
    expect(second.rejectionCode).toBe("ALREADY_USED");
    expect(second.secret).toBeUndefined();
  });

  it("chưa cấu hình xong thì không giải mã gì cả", async () => {
    const result = await handleSecretReveal(body("bat-ky"), {
      identity: null,
      vaultKeyOperator: null,
      notConfiguredMessage: "Cầu nối chưa cấu hình xong",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Cầu nối chưa cấu hình xong");
  });
});
