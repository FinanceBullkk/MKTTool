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
  it("matches the RFC 6238 vector using the final 6 digits of the 8-digit code", async () => {
    // RFC 6238, T=59, SHA-1, 8 số => 94287082. Ta sinh 6 số nên lấy 6 số cuối: 287082.
    const { code } = await generateTotpCode(RFC_SECRET, 59_000);
    expect(code).toBe("287082");
  });

  it("matches the RFC 6238 vector at the second timestamp", async () => {
    // T=1111111109 => 07081804 (8 số) => 6 số cuối: 081804
    const { code } = await generateTotpCode(RFC_SECRET, 1_111_111_109_000);
    expect(code).toBe("081804");
  });

  it("accepts a 10-byte secret that the default guardrail would reject", async () => {
    const { code } = await generateTotpCode(SHORT_SECRET);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("keeps the code stable within a 30-second window and changes in the next window", async () => {
    const a = await generateTotpCode(RFC_SECRET, 60_000);
    const b = await generateTotpCode(RFC_SECRET, 89_000);
    const c = await generateTotpCode(RFC_SECRET, 90_000);
    expect(a.code).toBe(b.code);
    expect(c.code).not.toBe(a.code);
  });

  it("calculates the remaining seconds correctly", async () => {
    expect((await generateTotpCode(RFC_SECRET, 60_000)).secondsRemaining).toBe(30);
    expect((await generateTotpCode(RFC_SECRET, 75_000)).secondsRemaining).toBe(15);
    expect((await generateTotpCode(RFC_SECRET, 89_000)).secondsRemaining).toBe(1);
  });

  it("normalizes whitespace and lowercase letters in the secret", async () => {
    expect(normalizeTotpSecret(" jbsw y3dp ehpk 3pxp ")).toBe(SHORT_SECRET);
    const withSpaces = await generateTotpCode("jbsw y3dp ehpk 3pxp", 60_000);
    const clean = await generateTotpCode(SHORT_SECRET, 60_000);
    expect(withSpaces.code).toBe(clean.code);
  });

  it("throws TotpGenerationError for an invalid secret", async () => {
    await expect(generateTotpCode("not-base32!!!")).rejects.toThrow(TotpGenerationError);
    expect(await isValidTotpSecret("not-base32!!!")).toBe(false);
    expect(await isValidTotpSecret(SHORT_SECRET)).toBe(true);
  });
});
