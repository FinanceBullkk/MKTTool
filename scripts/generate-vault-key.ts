/**
 * Sinh khóa mã hóa 32 byte cho kho danh tính.
 *
 * Chạy: npm run vault:keygen
 *
 * Dán giá trị in ra vào VAULT_KEY trong .env, đồng thời SAO LƯU vào password manager.
 * Mất khóa = mất toàn bộ mật khẩu và TOTP secret của mọi nick, không khôi phục được.
 */
import { randomBytes } from "node:crypto";
import { VAULT_KEY_BYTES } from "../src/lib/crypto/encryption-key-loader";

const key = randomBytes(VAULT_KEY_BYTES).toString("hex");

console.log("");
console.log(`VAULT_KEY="${key}"`);
console.log("");
console.log("Dán dòng trên vào .env và sao lưu vào password manager.");
console.log("Mất khóa này thì không giải mã lại được credential nào.");
console.log("");
