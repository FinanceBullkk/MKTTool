/**
 * Vé khai phiên bản cầu nối tối thiểu **theo từng loại**.
 *
 * ## Vì sao bài này tồn tại
 *
 * Cầu nối không có bộ tự cập nhật (QĐ 11), nên bản cũ còn chạy ngoài kia rất lâu. Nếu ai đó
 * nâng sàn chung lên vì một loại vé mới, thì **mọi** vé — mật khẩu, OTP, mở profile — bị mọi
 * cầu nối cũ từ chối cùng lúc. Một tính năng thêm vào biến thành một lượt ngừng dịch vụ cho cả
 * team, kể cả những người chưa cần tới nó.
 *
 * Kiểu hỏng đó **không có triệu chứng lúc phát triển**: máy dev luôn chạy cầu nối mới nhất. Nó
 * chỉ lộ ra sau khi deploy, trên máy người khác. Nên phải có một bài canh cứng ba loại vé cũ.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Khóa ký thật không cần cho bài này — nó chỉ đọc bao ngoài, không xác minh chữ ký. Sinh MỘT lần
// ở cấp module: `generateKeyPairSync` tốn vài chục ms, và bài này gọi `issueTicket` bốn lượt.
const KHOA_KY = generateKeyPairSync("ed25519");

vi.mock("./server-signing-key", () => ({ loadServerSigningKeys: () => KHOA_KY }));

const { issueTicket } = await import("./ticket-issuer");
const { MIN_RELAY_VERSION, MIN_RELAY_VERSION_BY_KIND, TICKET_KINDS, effectiveMinRelayVersion } =
  await import("./ticket-types");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");

const recipient = { deviceId: "device-1", publicKey: generateRelayDeviceKeyPair().publicKeyHex };

/** Đọc `minRelayVersion` từ bao ngoài của một tấm vé đã ký. */
function minRelayVersionOf(ticket: string): number {
  const [envelope] = ticket.split(".");
  return JSON.parse(Buffer.from(envelope, "base64url").toString("utf8")).minRelayVersion;
}

const PROXY = { protocol: "http" as const, host: "1.2.3.4", port: 8080 };

describe("unrelated ticket kinds keep the base Relay floor", () => {
  /**
   * Credential and OTP delivery do not depend on the managed-browser contract. Raising their floor
   * would create an unrelated outage for installed Relay versions.
   */
  it.each([
    [TICKET_KINDS.CREDENTIAL, { kind: TICKET_KINDS.CREDENTIAL, accountId: "a", field: "password" as const, credentialCiphertext: "x" }],
    [TICKET_KINDS.OTP, { kind: TICKET_KINDS.OTP, accountId: "a", totpSecretCiphertext: "x" }],
  ])("%s keeps the base floor", (_kind, payload) => {
    expect(minRelayVersionOf(issueTicket(payload, recipient))).toBe(MIN_RELAY_VERSION);
  });
});

describe("managed profile operations require Relay version 7", () => {
  it.each([
    [
      TICKET_KINDS.LAUNCH_PROFILE,
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: "a",
        antidetectProfileId: "p",
        proxyLabel: "L",
        proxy: PROXY,
      },
    ],
    [
      TICKET_KINDS.CREATE_PROFILE,
      {
        kind: TICKET_KINDS.CREATE_PROFILE,
        accountId: "a",
        requestId: "create-profile:a",
        profileName: "REDDIT — anna",
        proxy: PROXY,
        fingerprint: {
          device: "windows-laptop-amd",
          localeId: "en-US",
          timezone: "America/Denver",
          screen: { width: 1680, height: 1050 },
        },
        seed: "mkttool-abc",
      },
    ],
  ])("%s requires correlated managed-operation support", (_kind, payload) => {
    const ticket = issueTicket(
      payload,
      recipient,
    );

    // The capability requirement is still 7 — that is when the managed-browser contract arrived,
    // and it does not change. What the ticket *carries* is the higher of that and the security
    // floor, so assert the table and the wire separately rather than assuming they are equal.
    // They were equal until MIN_RELAY_VERSION was raised to 13 on 18 August 2026; conflating them
    // is what C39 was.
    expect(MIN_RELAY_VERSION_BY_KIND[_kind]).toBe(7);
    expect(minRelayVersionOf(ticket)).toBe(effectiveMinRelayVersion(_kind));
    expect(minRelayVersionOf(ticket)).toBeGreaterThanOrEqual(MIN_RELAY_VERSION);
  });

  /** Thêm loại vé mà quên khai bảng thì nó âm thầm lấy sàn chung — bài này bắt chuyện đó. */
  it("includes every ticket type in the table", () => {
    for (const kind of Object.values(TICKET_KINDS)) {
      expect(MIN_RELAY_VERSION_BY_KIND[kind]).toBeTypeOf("number");
    }
  });
});

describe("compatibility updates require Relay version 12", () => {
  it("keeps the updater command off older installed Relays", () => {
    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.COMPATIBILITY_UPDATE,
        manifest: {},
        revocations: [],
        authorization: {},
        smokeProfile: {
          proxyLabel: "Observer 1",
          proxyCountry: "US",
          proxy: PROXY,
        },
      },
      recipient,
    );
    // 12 is the capability requirement and stays recorded as such; what the ticket carries is the
    // higher of that and the security floor. The two were the same number until MIN_RELAY_VERSION
    // was raised to 13 on 18 August 2026 — see C39 for why conflating them was a defect.
    expect(MIN_RELAY_VERSION_BY_KIND[TICKET_KINDS.COMPATIBILITY_UPDATE]).toBe(12);
    expect(minRelayVersionOf(ticket)).toBe(
      effectiveMinRelayVersion(TICKET_KINDS.COMPATIBILITY_UPDATE),
    );
  });
});
