import { describe, expect, it } from "vitest";
import {
  TotpGenerationError,
  generateTotpCode,
  isValidTotpSecret,
  normalizeTotpSecret,
} from "./totp-code-generator";

/** Secret chuẩn RFC 6238: chuỗi ASCII "12345678901234567890" mã hóa base32. */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

/** Secret 16 ký tự base32 = 10 byte — độ dài phổ biến các nền tảng thật hay phát. */
const SHORT_SECRET = "JBSWY3DPEHPK3PXP";

describe("totp-code-generator", () => {
  it("khớp vector chuẩn RFC 6238 (6 số cuối của mã 8 số)", async () => {
    // RFC 6238, T=59, SHA-1, 8 số => 94287082. Ta sinh 6 số nên lấy 6 số cuối: 287082.
    const { code } = await generateTotpCode(RFC_SECRET, 59_000);
    expect(code).toBe("287082");
  });

  it("khớp vector chuẩn RFC 6238 ở mốc thời gian thứ hai", async () => {
    // T=1111111109 => 07081804 (8 số) => 6 số cuối: 081804
    const { code } = await generateTotpCode(RFC_SECRET, 1_111_111_109_000);
    expect(code).toBe("081804");
  });

  it("chấp nhận secret 10 byte (16 ký tự base32) mà guardrail mặc định sẽ từ chối", async () => {
    const { code } = await generateTotpCode(SHORT_SECRET);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("mã không đổi trong cùng một cửa sổ 30 giây, đổi khi sang cửa sổ mới", async () => {
    const a = await generateTotpCode(RFC_SECRET, 60_000);
    const b = await generateTotpCode(RFC_SECRET, 89_000);
    const c = await generateTotpCode(RFC_SECRET, 90_000);
    expect(a.code).toBe(b.code);
    expect(c.code).not.toBe(a.code);
  });

  it("tính đúng số giây còn lại", async () => {
    expect((await generateTotpCode(RFC_SECRET, 60_000)).secondsRemaining).toBe(30);
    expect((await generateTotpCode(RFC_SECRET, 75_000)).secondsRemaining).toBe(15);
    expect((await generateTotpCode(RFC_SECRET, 89_000)).secondsRemaining).toBe(1);
  });

  it("chuẩn hóa secret có khoảng trắng và chữ thường", async () => {
    expect(normalizeTotpSecret(" jbsw y3dp ehpk 3pxp ")).toBe(SHORT_SECRET);
    const withSpaces = await generateTotpCode("jbsw y3dp ehpk 3pxp", 60_000);
    const clean = await generateTotpCode(SHORT_SECRET, 60_000);
    expect(withSpaces.code).toBe(clean.code);
  });

  it("secret không hợp lệ thì ném TotpGenerationError", async () => {
    await expect(generateTotpCode("khong-phai-base32!!!")).rejects.toThrow(TotpGenerationError);
    expect(await isValidTotpSecret("khong-phai-base32!!!")).toBe(false);
    expect(await isValidTotpSecret(SHORT_SECRET)).toBe(true);
  });
});
