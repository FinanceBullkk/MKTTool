/**
 * Sinh cặp khóa ký vé của máy chủ (Ed25519).
 *
 * Chạy: npm run keys:server-keygen
 *
 * In ra hai thứ đi hai hướng ngược nhau:
 *  - HẠT GIỐNG khóa riêng → dán vào TICKET_SIGNING_KEY trong .env của máy chủ, không đi đâu khác
 *  - KHÓA CÔNG KHAI       → chép sang cấu hình từng cầu nối, để nó biết vé nào là vé thật
 *
 * Khóa công khai suy ra từ hạt giống nên KHÔNG cần cất giữ: cần lại thì in ra bằng
 * `npm run keys:server-pubkey`, đọc thẳng khóa riêng trong .env. Lệnh này sinh cặp MỚI mỗi
 * lần chạy, nên đừng dùng nó để tra khóa công khai của khóa đang dùng.
 *
 * Đổi khóa ký thì MỌI cầu nối phải cập nhật khóa công khai, nếu không chúng từ chối sạch vé.
 * Khác hẳn khóa kho: mất khóa ký không mất dữ liệu, chỉ là phải đi chép lại một vòng.
 */
import { randomBytes } from "node:crypto";
import {
  SERVER_SIGNING_KEY_ENV,
  SIGNING_SEED_BYTES,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";

const seed = randomBytes(SIGNING_SEED_BYTES);
const { publicKeyHex } = signingKeysFromSeed(seed);

console.log("");
console.log("── Khóa riêng — dán vào .env của MÁY CHỦ, không gửi cho ai ──────────────────");
console.log("");
console.log(`${SERVER_SIGNING_KEY_ENV}="${seed.toString("hex")}"`);
console.log("");
console.log("── Khóa công khai — chép sang cấu hình TỪNG CẦU NỐI ────────────────────────");
console.log("");
console.log(publicKeyHex);
console.log("");
console.log("Khóa công khai lộ cũng không mất gì: nó chỉ đối chiếu được chữ ký, không tạo ra");
console.log("chữ ký. Khóa riêng thì ngược lại — ai cầm nó là phát được vé giả.");
console.log("");
