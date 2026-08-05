import { createPrivateKey, diffieHellman } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RELAY_PUBLIC_KEY_HEX_LENGTH,
  RelayDeviceKeyError,
  assertRelayPublicKeyUsable,
  generateRelayDeviceKeyPair,
  normalizeRelayPublicKey,
  relayPublicKeyToHex,
  relayPublicKeyToKeyObject,
} from "./relay-device-key";

/**
 * Vector chuẩn của RFC 7748 (mục 6.1) — cùng lý do với vector RFC 8032 ở
 * `server-signing-key.test.ts`: sinh khóa rồi tự trao khóa với chính mình chỉ chứng minh module
 * nhất quán với bản thân nó, và một cách đọc byte ngược hoàn toàn vẫn qua được bài đó.
 *
 * Vector chuẩn chứng minh đây đúng là X25519 và đúng thứ tự byte, tức khóa mà cầu nối ở Phase
 * 04 in ra — một chương trình viết độc lập — sẽ được máy chủ hiểu đúng.
 */
const RFC_7748 = {
  alicePublicKey: "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
  bobPrivateKey: "5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb",
  bobPublicKey: "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f",
  sharedSecret: "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742",
} as const;

/** Khóa riêng của Bob dựng lại từ vector, để đối chiếu bí mật chung. */
function bobPrivateKeyObject() {
  return createPrivateKey({
    key: {
      kty: "OKP",
      crv: "X25519",
      d: Buffer.from(RFC_7748.bobPrivateKey, "hex").toString("base64url"),
      x: Buffer.from(RFC_7748.bobPublicKey, "hex").toString("base64url"),
    },
    format: "jwk",
  });
}

describe("normalizeRelayPublicKey", () => {
  it("đưa về hex chữ thường", () => {
    expect(normalizeRelayPublicKey(RFC_7748.alicePublicKey.toUpperCase())).toBe(
      RFC_7748.alicePublicKey,
    );
  });

  /**
   * Chữ hoa và chữ thường phải ra CÙNG một chuỗi, vì cột `publicKey` là `@unique` và Postgres
   * phân biệt hoa thường. Không chuẩn hóa thì cùng một chiếc máy nằm được ở hai hàng, và thu
   * hồi hàng này vẫn còn hàng kia nhận vé — đúng kiểu hỏng mà người thu hồi không thấy.
   */
  it("hai kiểu viết của cùng một khóa ra cùng một chuỗi", () => {
    const lower = normalizeRelayPublicKey(RFC_7748.alicePublicKey);
    const upper = normalizeRelayPublicKey(RFC_7748.alicePublicKey.toUpperCase());

    expect(lower).toBe(upper);
  });

  /** Khóa chép từ terminal hay dính xuống dòng và khoảng trắng — dọn hộ, đừng bắt dán lại. */
  it("bỏ khoảng trắng và xuống dòng nằm giữa chuỗi", () => {
    const messy = `${RFC_7748.alicePublicKey.slice(0, 32)}\n  ${RFC_7748.alicePublicKey.slice(32)}`;

    expect(normalizeRelayPublicKey(messy)).toBe(RFC_7748.alicePublicKey);
  });

  it("từ chối chuỗi rỗng", () => {
    expect(() => normalizeRelayPublicKey("   ")).toThrow(RelayDeviceKeyError);
  });

  it("từ chối chuỗi sai độ dài, và nói ra độ dài đang có", () => {
    expect(() => normalizeRelayPublicKey("abcd")).toThrow(
      new RegExp(`${RELAY_PUBLIC_KEY_HEX_LENGTH} ký tự hex.*đang có 4 ký tự`, "s"),
    );
  });

  it("từ chối ký tự ngoài bảng hex", () => {
    expect(() => normalizeRelayPublicKey("z".repeat(RELAY_PUBLIC_KEY_HEX_LENGTH))).toThrow(
      /chỉ được chứa ký tự hex/,
    );
  });
});

describe("relayPublicKeyToKeyObject", () => {
  /**
   * Bài kiểm chính: khóa đọc từ chuỗi hex, đem trao khóa với khóa riêng của Bob, phải ra đúng
   * bí mật chung mà RFC 7748 công bố.
   */
  it("dựng đúng khóa X25519 — đối chiếu bí mật chung của RFC 7748", () => {
    const alice = relayPublicKeyToKeyObject(RFC_7748.alicePublicKey);
    const shared = diffieHellman({ privateKey: bobPrivateKeyObject(), publicKey: alice });

    expect(shared.toString("hex")).toBe(RFC_7748.sharedSecret);
  });

  it("nhận cả chuỗi chưa chuẩn hóa", () => {
    const key = relayPublicKeyToKeyObject(` ${RFC_7748.alicePublicKey.toUpperCase()} `);

    expect(relayPublicKeyToHex(key)).toBe(RFC_7748.alicePublicKey);
  });
});

describe("assertRelayPublicKeyUsable", () => {
  it("cho qua khóa bình thường", () => {
    const key = relayPublicKeyToKeyObject(RFC_7748.alicePublicKey);

    expect(() => assertRelayPublicKeyUsable(key)).not.toThrow();
  });

  /**
   * Điểm bậc thấp: đúng 64 ký tự hex, qua sạch mọi phép kiểm hình thức, nhưng bí mật chung ra
   * toàn số 0 với MỌI khóa đối diện — tức là ai nhặt được vé cũng mở ra được mà không cần khóa
   * riêng của máy nào. Đây là lý do phép thử trao khóa tồn tại; thiếu nó thì một khóa như thế
   * nằm im trong sổ tới tận ngày phát vé thật.
   */
  it.each([
    ["toàn số 0", "00".repeat(32)],
    ["điểm bậc 8", "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800"],
    ["p − 1", "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"],
  ])("từ chối khóa yếu — %s", (_name, hex) => {
    const key = relayPublicKeyToKeyObject(hex);

    expect(() => assertRelayPublicKeyUsable(key)).toThrow(/khóa yếu/);
  });
});

describe("generateRelayDeviceKeyPair", () => {
  it("sinh cặp khóa dùng được, và khóa công khai khớp khóa riêng", () => {
    const { publicKeyHex, privateKeyHex } = generateRelayDeviceKeyPair();

    expect(publicKeyHex).toHaveLength(RELAY_PUBLIC_KEY_HEX_LENGTH);
    expect(privateKeyHex).toHaveLength(RELAY_PUBLIC_KEY_HEX_LENGTH);

    // Cùng một cặp thì trao khóa hai chiều phải ra cùng một bí mật.
    const privateKey = createPrivateKey({
      key: {
        kty: "OKP",
        crv: "X25519",
        d: Buffer.from(privateKeyHex, "hex").toString("base64url"),
        x: Buffer.from(publicKeyHex, "hex").toString("base64url"),
      },
      format: "jwk",
    });
    const other = generateRelayDeviceKeyPair();

    const fromOurs = diffieHellman({
      privateKey,
      publicKey: relayPublicKeyToKeyObject(other.publicKeyHex),
    });
    const fromTheirs = diffieHellman({
      privateKey: createPrivateKey({
        key: {
          kty: "OKP",
          crv: "X25519",
          d: Buffer.from(other.privateKeyHex, "hex").toString("base64url"),
          x: Buffer.from(other.publicKeyHex, "hex").toString("base64url"),
        },
        format: "jwk",
      }),
      publicKey: relayPublicKeyToKeyObject(publicKeyHex),
    });

    expect(fromOurs.toString("hex")).toBe(fromTheirs.toString("hex"));
  });

  it("mỗi lần gọi ra một cặp khác", () => {
    expect(generateRelayDeviceKeyPair().publicKeyHex).not.toBe(
      generateRelayDeviceKeyPair().publicKeyHex,
    );
  });
});
