/**
 * In khóa công khai ứng với khóa ký đang dùng.
 *
 * Chạy: npm run keys:server-pubkey
 *
 * Cần nó mỗi lần cài cầu nối lên một máy mới: máy đó phải biết khóa công khai của máy chủ
 * thì mới phân biệt được vé thật với vé giả.
 *
 * Vì khóa công khai suy ra được từ khóa riêng, nó KHÔNG phải thứ cần cất giữ — cần thì in
 * lại. Ngược lại thì không: từ khóa công khai không lần ngược ra khóa riêng.
 */
import path from "node:path";
import {
  SERVER_SIGNING_KEY_ENV,
  parseSigningSeed,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";

process.loadEnvFile(path.join(process.cwd(), ".env"));

const seed = parseSigningSeed(process.env[SERVER_SIGNING_KEY_ENV], SERVER_SIGNING_KEY_ENV);
const { publicKeyHex } = signingKeysFromSeed(seed);

console.log("");
console.log("Khóa công khai của máy chủ — chép sang cấu hình cầu nối:");
console.log("");
console.log(publicKeyHex);
console.log("");
