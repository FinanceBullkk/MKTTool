import { sign, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SERVER_SIGNING_KEY_ENV,
  ServerSigningKeyError,
  loadServerSigningKeys,
  parseSigningSeed,
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "./server-signing-key";

/**
 * Đối chiếu với vector chuẩn của RFC 8032 (mục 7.1) thay vì chỉ thử ký-rồi-kiểm.
 *
 * Ký rồi tự kiểm chỉ chứng minh module nhất quán với chính nó — một cách suy khóa sai hoàn
 * toàn vẫn qua được bài đó. Vector chuẩn chứng minh đây đúng là Ed25519, tức chữ ký máy chủ
 * phát ra sẽ được một bên khác (cầu nối ở Phase 04, viết độc lập) đối chiếu đúng.
 */
const RFC_8032 = [
  {
    name: "TEST 1 - empty message",
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    publicKey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    signature:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
      "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  {
    name: "TEST 2 - one-byte message",
    seed: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
    publicKey: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    message: "72",
    signature:
      "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da" +
      "085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
] as const;

const SEED_HEX = RFC_8032[0].seed;

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[SERVER_SIGNING_KEY_ENV];
  delete process.env[SERVER_SIGNING_KEY_ENV];
  resetServerSigningKeysCache();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[SERVER_SIGNING_KEY_ENV];
  else process.env[SERVER_SIGNING_KEY_ENV] = savedEnv;
  resetServerSigningKeysCache();
});

describe("server signing key pair", () => {
  for (const vector of RFC_8032) {
    it(`matches RFC 8032 vector - ${vector.name}`, () => {
      const keys = signingKeysFromSeed(Buffer.from(vector.seed, "hex"));
      expect(keys.publicKeyHex).toBe(vector.publicKey);

      const message = Buffer.from(vector.message, "hex");
      expect(sign(null, message, keys.privateKey).toString("hex")).toBe(vector.signature);
      expect(verify(null, message, keys.publicKey, Buffer.from(vector.signature, "hex"))).toBe(
        true,
      );
    });
  }

  it("invalidates the signature when one character in the message changes", () => {
    const keys = signingKeysFromSeed(Buffer.from(SEED_HEX, "hex"));
    const signature = sign(null, Buffer.from("ticket 1"), keys.privateKey);

    expect(verify(null, Buffer.from("ticket 2"), keys.publicKey, signature)).toBe(false);
  });

  it("does not verify this server's signature with another server's key", () => {
    const mine = signingKeysFromSeed(Buffer.from(SEED_HEX, "hex"));
    const other = signingKeysFromSeed(Buffer.from(RFC_8032[1].seed, "hex"));
    const message = Buffer.from("ticket");

    expect(verify(null, message, other.publicKey, sign(null, message, mine.privateKey))).toBe(
      false,
    );
  });

  it("derives the public key from the seed so the pair cannot drift", () => {
    const first = signingKeysFromSeed(Buffer.from(SEED_HEX, "hex"));
    const second = signingKeysFromSeed(Buffer.from(SEED_HEX, "hex"));

    expect(first.publicKeyHex).toBe(second.publicKeyHex);
    expect(first.publicKeyHex).not.toBe(SEED_HEX); // công khai KHÁC riêng, không lẫn lộn
  });
});

describe("parseSigningSeed", () => {
  it("rejects a missing, incorrectly sized, or non-hexadecimal seed", () => {
    expect(() => parseSigningSeed(undefined, SERVER_SIGNING_KEY_ENV)).toThrow(
      ServerSigningKeyError,
    );
    expect(() => parseSigningSeed("", SERVER_SIGNING_KEY_ENV)).toThrow(
      /TICKET_SIGNING_KEY is missing/,
    );
    expect(() => parseSigningSeed("abcd", SERVER_SIGNING_KEY_ENV)).toThrow(
      /64 hexadecimal characters/,
    );
    expect(() => parseSigningSeed("z".repeat(64), SERVER_SIGNING_KEY_ENV)).toThrow(
      /may contain only hexadecimal characters/,
    );
  });
});

describe("loadServerSigningKeys", () => {
  it("reads the seed from the environment variable", () => {
    process.env[SERVER_SIGNING_KEY_ENV] = SEED_HEX;
    expect(loadServerSigningKeys().publicKeyHex).toBe(RFC_8032[0].publicKey);
  });

  it("states which command to run when the variable is missing", () => {
    expect(() => loadServerSigningKeys()).toThrow(/npm run keys:server-keygen/);
  });

  it("caches the key pair and reads the environment again after reset", () => {
    process.env[SERVER_SIGNING_KEY_ENV] = SEED_HEX;
    expect(loadServerSigningKeys().publicKeyHex).toBe(RFC_8032[0].publicKey);

    process.env[SERVER_SIGNING_KEY_ENV] = RFC_8032[1].seed;
    expect(loadServerSigningKeys().publicKeyHex).toBe(RFC_8032[0].publicKey);

    resetServerSigningKeysCache();
    expect(loadServerSigningKeys().publicKeyHex).toBe(RFC_8032[1].publicKey);
  });
});
