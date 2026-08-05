import { describe, expect, it } from "vitest";
import { decryptCredential } from "../../src/lib/crypto/credential-encryption";
import { handleEncryptForVault } from "./handle-encrypt-for-vault";

const OPERATOR_KEY = Buffer.from("ab".repeat(32), "hex");
const OTHER_KEY = Buffer.from("cd".repeat(32), "hex");

const deps = { vaultKeyOperator: OPERATOR_KEY, notConfiguredMessage: "chưa cấu hình" };

function body(secrets: Record<string, unknown>): string {
  return JSON.stringify(secrets);
}

describe("handleEncryptForVault", () => {
  it("bọc cả ba ô, trả về đúng tên cột của Account", async () => {
    const result = await handleEncryptForVault(
      body({
        password: "mk-nick",
        emailPassword: "mk-email",
        totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      }),
      deps,
    );

    expect(result.ok).toBe(true);
    expect(decryptCredential(String(result.passwordEnc), OPERATOR_KEY)).toBe("mk-nick");
    expect(decryptCredential(String(result.emailPasswordEnc), OPERATOR_KEY)).toBe("mk-email");
  });

  it("chỉ bọc ô có giá trị — ô để trống nghĩa là giữ nguyên giá trị cũ", async () => {
    // Quy ước của form sửa nick. Ghi một chuỗi rỗng đã mã hóa đè lên là xóa mật khẩu thật.
    const result = await handleEncryptForVault(body({ password: "chỉ-đổi-cái-này" }), deps);

    expect(result.ok).toBe(true);
    expect(result.passwordEnc).toBeDefined();
    expect(result.emailPasswordEnc).toBeUndefined();
    expect(result.totpSecretEnc).toBeUndefined();
  });

  it("ô toàn khoảng trắng tính là để trống", async () => {
    const result = await handleEncryptForVault(body({ password: "   " }), deps);

    expect(result.ok).toBe(false);
    expect(result.passwordEnc).toBeUndefined();
  });

  it("ciphertext chỉ mở được bằng khóa vùng operator", async () => {
    const result = await handleEncryptForVault(body({ password: "mk-nick" }), deps);

    expect(() => decryptCredential(String(result.passwordEnc), OTHER_KEY)).toThrow();
  });

  it("kiểm TOTP secret trước khi bọc — máy chủ đã mất phép kiểm này từ GĐ3", async () => {
    const result = await handleEncryptForVault(body({ totpSecret: "không-phải-base32" }), deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("base32");
  });

  it("TOTP secret hỏng thì KHÔNG bọc luôn cả hai ô kia", async () => {
    // Trả về nửa vời là ghi mật khẩu mới vào kho mà TOTP thì không — người dùng đọc "đã lưu"
    // rồi tin là cả ba ô đã vào.
    const result = await handleEncryptForVault(
      body({ password: "mk-nick", totpSecret: "sai" }),
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.passwordEnc).toBeUndefined();
  });

  it("chuẩn hóa TOTP secret trước khi bọc — chuỗi đã mã hóa thì sau không sửa lại được", async () => {
    const result = await handleEncryptForVault(
      body({ totpSecret: "jbswy3dp ehpk3pxp jbswy3dp ehpk3pxp" }),
      deps,
    );

    expect(result.ok).toBe(true);
    expect(decryptCredential(String(result.totpSecretEnc), OPERATOR_KEY)).toBe(
      "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    );
  });

  it("không có ô nào thì nói thẳng là lỗi giao diện", async () => {
    const result = await handleEncryptForVault(body({}), deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("giao diện");
  });

  it("chưa cấu hình xong thì không bọc gì", async () => {
    const result = await handleEncryptForVault(body({ password: "x" }), {
      vaultKeyOperator: null,
      notConfiguredMessage: "Cầu nối chưa cấu hình xong",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Cầu nối chưa cấu hình xong");
  });

  it("thân request không phải JSON thì báo rõ", async () => {
    expect((await handleEncryptForVault("{ hỏng", deps)).message).toContain("JSON");
  });
});
