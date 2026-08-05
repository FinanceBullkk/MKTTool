/**
 * Gom cảnh báo vận hành cho một người xem.
 *
 * Mỗi nguồn cảnh báo là một hàm thuần trả `OpsAlert | null`, và hàm gom chỉ nối chúng lại rồi
 * lọc theo vai trò. Thêm cảnh báo mới = thêm một hàm và một dòng trong mảng — đúng thứ khay
 * này được dựng ra để làm dễ (xem chú thích đầu `ops-alert-types.ts`).
 *
 * **Không truy vấn database ở đây.** Khay hiện trên MỌI trang, nên mỗi truy vấn thêm vào là một
 * truy vấn nhân với số trang người ta mở. Cảnh báo cần dữ liệu trong kho thì thuộc về trang
 * Hôm nay, không thuộc về khay.
 */
import {
  readVaultKeyPosture,
  VAULT_KEY_ENV,
  type VaultKeyEnv,
} from "../crypto/encryption-key-loader";
import type { OpsAlert } from "./ops-alert-types";

/**
 * Cảnh báo về thế đứng hai vùng khóa.
 *
 * Hai trạng thái đáng nói, và chúng KHÁC NHAU về mức độ chứ không phải cùng một chuyện nói hai
 * kiểu:
 *
 * - `shared-key` — **đỏ**. Hai biến cùng một giá trị nghĩa là một phiên bị trộm vẫn đọc được
 *   mật khẩu nick: toàn bộ GĐ3 đang không có tác dụng gì, trong khi màn hình trông y hệt lúc
 *   đã tách xong. Đây chính là kiểu hỏng mà khay này sinh ra để bắt.
 * - `operator-key-on-server` — **vàng**. Khóa đã tách thật (mật khẩu nick mã hóa bằng khóa
 *   riêng), nhưng máy chủ vẫn cầm bản sao khóa đó. Chưa hỏng; sẽ hỏng đúng vào ngày máy chủ bị
 *   chiếm. Đích của GĐ3 là gỡ hẳn biến này khỏi môi trường máy chủ.
 *
 * `no-server-key` KHÔNG sinh cảnh báo: thiếu khóa vùng server thì `loadVaultKey` đã ném lỗi ồn
 * ào ngay lần mã hóa đầu tiên. Vẽ thêm một dòng vàng cho thứ đã hỏng ầm ĩ là làm loãng khay.
 */
export function vaultKeySeparationAlert(env: VaultKeyEnv = process.env): OpsAlert | null {
  const posture = readVaultKeyPosture(env);

  if (posture === "shared-key") {
    return {
      id: "vault-key-shared",
      tone: "red",
      audience: "ADMIN",
      message:
        `${VAULT_KEY_ENV.server} và ${VAULT_KEY_ENV.operator} đang là CÙNG một khóa, nên kho ` +
        `chưa thật sự tách hai vùng: chiếm được máy chủ là mở được mật khẩu, email và TOTP của ` +
        `mọi nick.`,
      action:
        `Tách khóa: \`npm run vault:rekey -- --domain=operator --new-key=<hex>\`, rồi gỡ hẳn ` +
        `${VAULT_KEY_ENV.operator} khỏi môi trường máy chủ và khởi động lại.`,
    };
  }

  if (posture === "operator-key-on-server") {
    return {
      id: "vault-key-operator-on-server",
      tone: "amber",
      audience: "ADMIN",
      message:
        `Máy chủ vẫn đang giữ ${VAULT_KEY_ENV.operator}. Hai vùng đã tách thật, nhưng bản sao ` +
        `khóa mở bí mật nick còn nằm trên máy chủ — chỗ duy nhất giữ nó phải là máy operator.`,
      action:
        `Gỡ ${VAULT_KEY_ENV.operator} khỏi môi trường máy chủ rồi khởi động lại. App chạy đủ ` +
        `chức năng khi không có biến này — có test canh điều đó.`,
    };
  }

  return null;
}

/** Vai trò của người đang xem, theo đúng hai vai trò của `Actor`. */
export type OpsAlertViewerRole = "ADMIN" | "OPERATOR";

/**
 * Cảnh báo nên hiện cho người này, xếp đỏ trước vàng.
 *
 * Lọc theo **ai sửa được**: OPERATOR không đổi được biến môi trường của máy chủ, nên đưa họ một
 * dòng đỏ vĩnh viễn chỉ dạy họ phớt lờ khay. Cảnh báo của GĐ4 (*"cầu nối bản cũ"*) đi hướng
 * ngược lại — người ngồi máy đó tự sửa được — nên nó sẽ khai `audience: "EVERYONE"`.
 */
export function collectOpsAlerts(
  role: OpsAlertViewerRole,
  env: VaultKeyEnv = process.env,
): OpsAlert[] {
  const all = [vaultKeySeparationAlert(env)].filter((alert): alert is OpsAlert => alert !== null);

  return all
    .filter((alert) => alert.audience === "EVERYONE" || role === "ADMIN")
    .sort((left, right) => (left.tone === right.tone ? 0 : left.tone === "red" ? -1 : 1));
}
