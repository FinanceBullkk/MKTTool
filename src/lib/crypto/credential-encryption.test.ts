import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialDecryptionError,
  decryptCredential,
  decryptOptionalCredential,
  encryptCredential,
  encryptOptionalCredential,
} from "./credential-encryption";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

describe("credential-encryption", () => {
  it("mã hóa rồi giải mã trả về đúng chuỗi gốc", () => {
    const secret = "MatKhau!@#123 với tiếng Việt";
    expect(decryptCredential(encryptCredential(secret, KEY), KEY)).toBe(secret);
  });

  it("mã hóa cùng một đầu vào hai lần cho ciphertext khác nhau (IV ngẫu nhiên)", () => {
    const a = encryptCredential("same-input", KEY);
    const b = encryptCredential("same-input", KEY);
    expect(a).not.toBe(b);
    expect(decryptCredential(a, KEY)).toBe(decryptCredential(b, KEY));
  });

  it("sai khóa thì ném CredentialDecryptionError, không trả về rác", () => {
    const encoded = encryptCredential("top-secret", KEY);
    expect(() => decryptCredential(encoded, OTHER_KEY)).toThrow(CredentialDecryptionError);
  });

  it("sửa ciphertext thì phát hiện được nhờ auth tag", () => {
    const encoded = encryptCredential("top-secret", KEY);
    const parts = encoded.split(".");
    const tampered = Buffer.from(parts[3], "base64url");
    tampered[0] ^= 0xff;
    parts[3] = tampered.toString("base64url");
    expect(() => decryptCredential(parts.join("."), KEY)).toThrow(CredentialDecryptionError);
  });

  it("ciphertext không chứa plaintext dạng trần", () => {
    const encoded = encryptCredential("SuperSecretPassword", KEY);
    expect(encoded).not.toContain("SuperSecretPassword");
  });

  it("từ chối chuỗi sai định dạng", () => {
    expect(() => decryptCredential("khong-phai-dinh-dang", KEY)).toThrow(
      CredentialDecryptionError,
    );
    expect(() => decryptCredential("v2.a.b.c", KEY)).toThrow(/Phiên bản mã hóa không hỗ trợ/);
  });

  it("xử lý chuỗi rỗng và giá trị null cho field không bắt buộc", () => {
    expect(encryptOptionalCredential(null, KEY)).toBeNull();
    expect(encryptOptionalCredential("", KEY)).toBeNull();
    expect(decryptOptionalCredential(null, KEY)).toBeNull();

    const encoded = encryptOptionalCredential("JBSWY3DPEHPK3PXP", KEY);
    expect(decryptOptionalCredential(encoded, KEY)).toBe("JBSWY3DPEHPK3PXP");
  });
});
