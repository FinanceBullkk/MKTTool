/**
 * Sinh một TOTP secret dùng thử, để kiểm chứng tính năng OTP của kho danh tính
 * mà KHÔNG cần bật 2FA trên tài khoản thật.
 *
 * Chạy: npx tsx scripts/generate-test-totp-secret.ts
 *
 * Cách dùng:
 *  1. Chạy script, lấy secret in ra.
 *  2. Thêm vào Google Authenticator / Authy bằng chức năng "Nhập khóa thiết lập" (manual entry).
 *  3. Dán secret đó vào ô "TOTP secret" của một nick giả trong MKTTool.
 *  4. Bấm "Hiện mã OTP" trên trang chi tiết nick, so với mã trên điện thoại.
 *     Hai mã phải trùng nhau. Nếu trùng thì tính năng OTP hoạt động đúng.
 *
 * Lưu ý: secret này chỉ để test, không dùng cho tài khoản thật.
 */
import {
  NobleCryptoPlugin,
  ScureBase32Plugin,
  TOTP,
  createGuardrails,
} from "otplib";
import { generateTotpCode } from "../src/lib/totp/totp-code-generator";

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
  guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
});

async function main() {
  const secret = totp.generateSecret();
  const uri = totp.toURI({ secret, label: "nick-test@mkttool.local", issuer: "MKTTool Test" });

  // Sinh mã bằng chính module của ứng dụng, không phải bằng otplib trực tiếp —
  // như vậy mới kiểm chứng được đúng đường dẫn code mà UI đang dùng.
  const current = await generateTotpCode(secret);

  console.log("");
  console.log("  TOTP secret dùng thử");
  console.log("  ─────────────────────────────────────────────");
  console.log(`  Secret        ${secret}`);
  console.log(`  Mã hiện tại   ${current.code}   (còn ${current.secondsRemaining}s)`);
  console.log("");
  console.log("  otpauth URI (dán vào trình tạo QR nếu muốn quét):");
  console.log(`  ${uri}`);
  console.log("");
  console.log("  Các bước kiểm chứng:");
  console.log("   1. Mở Google Authenticator > Thêm > Nhập khóa thiết lập");
  console.log(`   2. Dán secret: ${secret}`);
  console.log("   3. Dán secret đó vào ô \"TOTP secret\" của một nick giả trong MKTTool");
  console.log("   4. Bấm \"Hiện mã OTP\" ở trang chi tiết nick");
  console.log("   5. Hai mã phải trùng nhau — nếu trùng là tính năng OTP chạy đúng");
  console.log("");
  console.log("  Secret này CHỈ để test. Không dùng cho tài khoản thật.");
  console.log("");
}

main().catch((error) => {
  console.error("Lỗi:", error instanceof Error ? error.message : error);
  process.exit(1);
});
