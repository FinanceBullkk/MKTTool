/**
 * Sinh cặp khóa cho MỘT máy chạy cầu nối (X25519).
 *
 * Chạy: npm run keys:relay-keygen
 *
 * In ra hai thứ đi hai hướng ngược nhau — và đây là chỗ dễ làm sai nhất của cả cơ chế:
 *  - KHÓA RIÊNG    → ở lại trên chính chiếc máy này, trong cấu hình cầu nối. Không gửi đi đâu,
 *                    không nhắn cho ai, không dán lên web.
 *  - KHÓA CÔNG KHAI → gửi cho quản trị viên để ghi vào sổ tại /relay-devices.
 *
 * ## Chạy lệnh này TRÊN MÁY SẼ DÙNG, không phải trên máy chủ
 *
 * Toàn bộ ý nghĩa của cặp khóa này nằm ở chỗ máy chủ **không** biết khóa riêng: nhờ vậy trang
 * web chuyển vé đi mà không đọc được gì bên trong. Sinh khóa hộ ở nơi khác rồi nhắn khóa riêng
 * qua chat là tự tay phá đúng tính chất đó — và phá lặng lẽ, vì mọi thứ vẫn chạy bình thường.
 *
 * Tới Phase 04, cầu nối tự sinh khóa của nó lúc cài và lệnh này thành đường dự phòng.
 */
import { generateRelayDeviceKeyPair } from "../src/lib/tickets/relay-device-key";

const { publicKeyHex, privateKeyHex } = generateRelayDeviceKeyPair();

console.log("");
console.log("── Khóa riêng — Ở LẠI MÁY NÀY, không gửi cho ai ────────────────────────────");
console.log("");
console.log(privateKeyHex);
console.log("");
console.log("── Khóa công khai — gửi cho quản trị viên, ghi vào sổ ở /relay-devices ─────");
console.log("");
console.log(publicKeyHex);
console.log("");
console.log("Máy chủ chỉ giữ khóa công khai. Nó bọc nội dung vé bằng khóa đó, và chỉ chiếc máy");
console.log("đang giữ khóa riêng ở trên mới mở ra được — trình duyệt chuyển vé qua tay nhưng");
console.log("không đọc được, kể cả mật khẩu proxy nằm trong vé.");
console.log("");
console.log("Mất máy: báo quản trị viên thu hồi ngay, rồi xoay khóa vùng operator.");
console.log("");
