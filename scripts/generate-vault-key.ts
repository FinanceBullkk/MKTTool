/**
 * Sinh khóa mã hóa 32 byte cho kho danh tính.
 *
 * Chạy: npm run vault:keygen
 *
 * Kho có hai vùng khóa (xem encrypted-field-registry.ts) nên lệnh này in ra một khóa dùng
 * cho vùng nào cũng được — dán vào VAULT_KEY_SERVER hoặc VAULT_KEY_OPERATOR trong .env,
 * đồng thời SAO LƯU vào password manager.
 *
 * Mất khóa = mất vĩnh viễn phần dữ liệu thuộc vùng đó, không khôi phục được.
 */
import { randomBytes } from "node:crypto";
import {
  VAULT_KEY_BYTES,
  VAULT_KEY_ENV,
} from "../src/lib/crypto/encryption-key-loader";

const key = randomBytes(VAULT_KEY_BYTES).toString("hex");

console.log("");
console.log(key);
console.log("");
console.log("Dán vào ĐÚNG MỘT trong hai biến ở .env, rồi sao lưu vào password manager:");
console.log(`  ${VAULT_KEY_ENV.server}    mật khẩu proxy + token Facebook`);
console.log(`  ${VAULT_KEY_ENV.operator}  mật khẩu / email / TOTP của nick`);
console.log("");
console.log("Đang thay khóa cho database đã có dữ liệu? KHÔNG sửa .env trước —");
console.log("chạy `npm run vault:rekey -- --domain=<vùng> --new-key=<khóa trên>` để mã hóa lại,");
console.log("nếu không thì dữ liệu cũ thành rác không mở được.");
console.log("");
