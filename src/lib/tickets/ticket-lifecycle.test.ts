/**
 * Vòng đời một tấm vé: máy chủ phát → cầu nối xét → mở ruột.
 *
 * Bài test này đứng ở **cả hai đầu** của một hợp đồng mà GĐ4 sẽ hiện thực lại bằng một chương
 * trình riêng. Nên nó không chỉ hỏi "chạy được không", mà hỏi những câu mà bản viết lại kia
 * cũng sẽ phải trả lời: chữ ký phủ lên đúng cái gì, thứ tự các phép kiểm ra sao, và mỗi kiểu
 * hỏng nói câu gì.
 */
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

// Hạt giống khóa ký của máy chủ — vector RFC 8032, cùng giá trị dùng ở server-signing-key.test.
process.env.TICKET_SIGNING_KEY =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

const { loadServerSigningKeys, resetServerSigningKeysCache } = await import("./server-signing-key");
const { generateRelayDeviceKeyPair, relayPublicKeyToKeyObject } = await import("./relay-device-key");
const { issueTicket } = await import("./ticket-issuer");
const { TicketReplayGuard } = await import("./ticket-replay-guard");
const { verifyTicket, TicketRejected } = await import("./ticket-verifier");
const { TICKET_LIFETIME_MS, TICKET_KINDS } = await import("./ticket-types");

const DEVICE_ID = "device-hao";
const NOW = 1_800_000_000_000;

const PAYLOAD = {
  kind: TICKET_KINDS.CREDENTIAL,
  accountId: "acc-1",
  field: "password",
  credentialCiphertext: "v1.aaa.bbb.ccc",
} as const;

/** Khóa riêng X25519 dựng lại từ hex — đúng thứ cầu nối làm lúc khởi động. */
function privateKeyFromHex(privateHex: string, publicHex: string) {
  return createPrivateKey({
    key: {
      kty: "OKP",
      crv: "X25519",
      d: Buffer.from(privateHex, "hex").toString("base64url"),
      x: Buffer.from(publicHex, "hex").toString("base64url"),
    },
    format: "jwk",
  });
}

let device: ReturnType<typeof generateRelayDeviceKeyPair>;
let relay: Parameters<typeof verifyTicket>[1];

beforeEach(() => {
  resetServerSigningKeysCache();
  device = generateRelayDeviceKeyPair();
  relay = {
    deviceId: DEVICE_ID,
    version: 1,
    privateKey: privateKeyFromHex(device.privateKeyHex, device.publicKeyHex),
    serverPublicKey: loadServerSigningKeys().publicKey,
    replayGuard: new TicketReplayGuard(),
  };
});

const issue = (now = NOW) =>
  issueTicket(PAYLOAD, { deviceId: DEVICE_ID, publicKey: device.publicKeyHex }, now);

describe("đường thành công", () => {
  it("phát rồi xét: ruột về nguyên vẹn", () => {
    const result = verifyTicket(issue(), relay, NOW + 1_000);

    expect(result.payload).toEqual(PAYLOAD);
    expect(result.envelope.deviceId).toBe(DEVICE_ID);
    expect(result.envelope.kind).toBe(TICKET_KINDS.CREDENTIAL);
  });

  /**
   * Bí mật KHÔNG được đọc từ vé mà không có khóa riêng của máy. Đây là lời hứa trung tâm của
   * cả GĐ3 — trình duyệt cầm vé đi qua nhưng không đọc được gì bên trong.
   */
  it("nhìn thẳng vào vé thì không thấy nội dung", () => {
    const ticket = issue();
    const envelope = JSON.parse(
      Buffer.from(ticket.split(".")[0], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(JSON.stringify(envelope)).not.toContain("v1.aaa.bbb.ccc");
    expect(JSON.stringify(envelope)).not.toContain("acc-1");
    expect(ticket).not.toContain("password");
  });

  /**
   * Success Criteria của phase-03, đúng câu chữ: *"mở devtools lúc bấm Mở profile — nội dung vé
   * phải là chuỗi mã hóa, không đọc được mật khẩu proxy"*.
   *
   * Bản nháp đầu của plan để hở chỗ này với lý do "người đó vào /proxies cũng xem được". Đúng,
   * nhưng đó là lý lẽ của phương án rẻ: `/proxies` đòi đăng nhập, còn một chuỗi nằm sẵn trong
   * DOM thì bất cứ script hay extension nào chạy trên tab đó cũng nhặt được.
   */
  it("vé mở profile: mật khẩu proxy không đọc được ở bao ngoài", () => {
    const launch = {
      kind: TICKET_KINDS.LAUNCH_PROFILE,
      accountId: "acc-1",
      antidetectProfileId: "profile-anna",
      proxyLabel: "webshare-01",
      proxy: {
        protocol: "http",
        host: "1.2.3.4",
        port: 8080,
        username: "user-proxy",
        password: "mat-khau-proxy-that",
      },
    } as const;

    const ticket = issueTicket(launch, { deviceId: DEVICE_ID, publicKey: device.publicKeyHex }, NOW);

    expect(ticket).not.toContain("mat-khau-proxy-that");
    expect(ticket).not.toContain("1.2.3.4");
    // Nhưng cầu nối vẫn nhận đủ cấu hình để đẩy sang adapter, không phải hỏi lại máy chủ.
    expect(verifyTicket(ticket, relay, NOW).payload).toEqual(launch);
  });

  it("mỗi vé một khóa dùng một lần khác nhau", () => {
    const first = JSON.parse(Buffer.from(issue().split(".")[0], "base64url").toString("utf8"));
    const second = JSON.parse(Buffer.from(issue().split(".")[0], "base64url").toString("utf8"));

    expect(first.epk).not.toBe(second.epk);
    expect(first.jti).not.toBe(second.jti);
  });
});

describe("các nhánh từ chối", () => {
  function expectRejection(fn: () => unknown, code: string) {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(TicketRejected);
      expect((error as InstanceType<typeof TicketRejected>).code).toBe(code);
      return;
    }
    throw new Error(`Đáng lẽ phải bị từ chối với mã ${code}, nhưng lại qua được.`);
  }

  it("vé sai hình dạng", () => {
    expectRejection(() => verifyTicket("khong-co-dau-cham", relay, NOW), "MALFORMED");
  });

  /** Sửa một ký tự trong bao ngoài — chữ ký phải bắt được. */
  it("bao ngoài bị sửa", () => {
    const [envelope, signature] = issue().split(".");
    const tampered = `${envelope.slice(0, -1)}${envelope.at(-1) === "A" ? "B" : "A"}.${signature}`;

    expectRejection(() => verifyTicket(tampered, relay, NOW), "BAD_SIGNATURE");
  });

  it("vé của máy chủ khác", () => {
    const stranger = generateKeyPairSync("ed25519");
    expectRejection(
      () => verifyTicket(issue(), { ...relay, serverPublicKey: stranger.publicKey }, NOW),
      "BAD_SIGNATURE",
    );
  });

  /** QĐ 11: cầu nối cũ phải nói được câu đúng, không chết mơ hồ ở bước giải mã. */
  it("cầu nối quá cũ — và câu báo bảo tải lại", () => {
    const ticket = issue();

    try {
      verifyTicket(ticket, { ...relay, version: 0 }, NOW);
      throw new Error("Đáng lẽ phải bị từ chối.");
    } catch (error) {
      expect((error as InstanceType<typeof TicketRejected>).code).toBe("RELAY_TOO_OLD");
      expect((error as Error).message).toContain("Tải lại cầu nối");
    }
  });

  it("vé quá hạn", () => {
    expectRejection(() => verifyTicket(issue(), relay, NOW + TICKET_LIFETIME_MS + 1), "EXPIRED");
  });

  it("còn hạn ở đúng mili giây cuối", () => {
    expect(() => verifyTicket(issue(), relay, NOW + TICKET_LIFETIME_MS - 1)).not.toThrow();
  });

  it("vé phát cho máy khác", () => {
    expectRejection(
      () => verifyTicket(issue(), { ...relay, deviceId: "device-khac" }, NOW),
      "WRONG_DEVICE",
    );
  });

  /**
   * Máy KHÁC cầm được vé thì cũng không mở nổi ruột — chữ ký hợp lệ, `deviceId` khớp, nhưng
   * khóa riêng sai. Đây là phép thử chứng minh lớp mã hóa thật sự gắn vào từng máy, chứ không
   * chỉ dựa vào việc `deviceId` được kiểm.
   */
  it("đúng deviceId nhưng sai khóa riêng thì vẫn không mở được", () => {
    const other = generateRelayDeviceKeyPair();

    expectRejection(
      () =>
        verifyTicket(issue(), {
          ...relay,
          privateKey: privateKeyFromHex(other.privateKeyHex, other.publicKeyHex),
        }, NOW),
      "UNSEALABLE",
    );
  });

  it("dùng lại lần hai bị từ chối", () => {
    const ticket = issue();
    verifyTicket(ticket, relay, NOW);

    expectRejection(() => verifyTicket(ticket, relay, NOW), "ALREADY_USED");
  });

  /** Vé quá hạn không được ghi vào sổ đã tiêu — nó bị chặn vì hạn, sổ không cần nhớ. */
  it("vé quá hạn không chiếm chỗ trong sổ chống dùng lại", () => {
    try {
      verifyTicket(issue(), relay, NOW + TICKET_LIFETIME_MS + 1);
    } catch {
      // mong đợi
    }

    expect(relay.replayGuard.size).toBe(0);
  });
});

describe("TicketReplayGuard", () => {
  it("lần đầu nhận, lần sau từ chối", () => {
    const guard = new TicketReplayGuard();

    expect(guard.consume("a", NOW + 30_000, NOW)).toBe(true);
    expect(guard.consume("a", NOW + 30_000, NOW)).toBe(false);
  });

  it("quên jti đã hết hạn nên sổ không phình mãi", () => {
    const guard = new TicketReplayGuard();
    guard.consume("cu", NOW + 1_000, NOW);

    // Quá hạn của "cu" rồi mới ghi cái mới: lượt dọn phải bỏ "cu" đi.
    guard.consume("moi", NOW + 40_000, NOW + 2_000);

    expect(guard.size).toBe(1);
  });
});

describe("khóa của máy nhận", () => {
  it("phát vé bằng khóa hỏng thì đổ ngay ở máy chủ", () => {
    expect(() =>
      issueTicket(PAYLOAD, { deviceId: DEVICE_ID, publicKey: "khong-phai-hex" }, NOW),
    ).toThrow(/khóa/i);
  });

  it("khóa công khai trong vé đúng là khóa dựng được", () => {
    const envelope = JSON.parse(Buffer.from(issue().split(".")[0], "base64url").toString("utf8"));

    expect(() => relayPublicKeyToKeyObject(envelope.epk)).not.toThrow();
  });
});
