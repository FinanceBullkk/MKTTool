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
import { DAILY_BACKUP_ENV } from "../backup/daily-backup-config";
import { readR2Config } from "../backup/r2-client";
import { DAILY_HEALTH_CHECK_ENV } from "../health/daily-health-check-config";
import { readDailyScheduleTime } from "../schedule/daily-run-schedule";
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

/**
 * Cảnh báo lịch dò shadowban chưa bật — hoặc khai sai nên không bật được.
 *
 * Đây đúng loại hỏng mà khay này sinh ra để bắt: **mọi màn hình trông bình thường**. Bảng sức
 * khỏe vẫn đầy số liệu của lượt dò tay gần nhất, không ô nào đỏ, không dòng nào thiếu — chỉ là
 * số liệu đó mỗi ngày một cũ đi, và tới lúc ai đó để ý thì cả cụm nick đã bị ẩn hai tuần. Cùng
 * lập luận với luật 10 của bộ luật: *không có tin xấu* không phải là *tin tốt*.
 *
 * **Chỉ kêu ở môi trường production.** Máy dev cố ý không bật lịch (xem `readDailyScheduleTime`),
 * nên kêu ở đó là dạy người ta phớt lờ cả khay.
 */
export function dailyHealthCheckScheduleAlert(env: VaultKeyEnv = process.env): OpsAlert | null {
  if (env.NODE_ENV !== "production") return null;

  try {
    if (readDailyScheduleTime(env[DAILY_HEALTH_CHECK_ENV]) !== null) return null;
  } catch (error) {
    return {
      id: "health-check-schedule-invalid",
      tone: "red",
      audience: "ADMIN",
      message:
        `${DAILY_HEALTH_CHECK_ENV} khai sai nên lịch dò shadowban KHÔNG chạy: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      action: `Sửa ${DAILY_HEALTH_CHECK_ENV} về dạng HH:MM (ví dụ "09:00") rồi khởi động lại.`,
    };
  }

  return {
    id: "health-check-schedule-off",
    tone: "amber",
    audience: "ADMIN",
    message:
      "Lịch dò shadowban đang tắt, nên bộ dò chỉ chạy khi có người bấm nút. Bảng sức khỏe vẫn " +
      "trông đầy đủ trong lúc số liệu mỗi ngày một cũ đi — shadowban thì im lặng.",
    action:
      `Khai ${DAILY_HEALTH_CHECK_ENV}="09:00" (giờ team) trong biến môi trường của máy chủ rồi ` +
      `khởi động lại.`,
  };
}

/**
 * Cảnh báo chưa bật sao lưu ra ngoài Railway.
 *
 * Khác cảnh báo ở trang Hôm nay: chỗ đó nói *"nếp sao lưu đang hỏng"* và cần dữ liệu trong kho;
 * chỗ này nói *"chưa có nếp nào"* và chỉ cần đọc biến môi trường — đúng ranh giới của khay.
 *
 * Chỉ ADMIN thấy vì chỉ họ khai được biến, và chỉ ở production vì máy dev cố ý không sao lưu.
 */
export function backupNotConfiguredAlert(env: VaultKeyEnv = process.env): OpsAlert | null {
  if (env.NODE_ENV !== "production") return null;

  try {
    const scheduled = readDailyScheduleTime(env[DAILY_BACKUP_ENV]) !== null;
    const r2 = readR2Config(env) !== null;
    if (scheduled && r2) return null;
  } catch (error) {
    return {
      id: "backup-config-invalid",
      tone: "red",
      audience: "ADMIN",
      message: `Sao lưu ra ngoài Railway KHÔNG chạy vì cấu hình sai: ${
        error instanceof Error ? error.message : String(error)
      }`,
      action: `Sửa ${DAILY_BACKUP_ENV} và bốn biến R2_* trong biến môi trường máy chủ rồi khởi động lại.`,
    };
  }

  return {
    id: "backup-not-configured",
    tone: "amber",
    audience: "ADMIN",
    message:
      "Chưa có bản sao lưu nào nằm ngoài Railway. Sao lưu ổ đĩa của Railway (nếu có) nằm cùng " +
      "tài khoản với bản gốc, nên nó không chống được ca mất cả dự án hoặc mất tài khoản.",
    action:
      `Khai ${DAILY_BACKUP_ENV}="03:00" cùng bốn biến R2_* trong biến môi trường của máy chủ. ` +
      `Bucket phải để riêng tư, và token R2 chỉ nên có quyền ghi vào đúng bucket đó.`,
  };
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
  const all = [
    vaultKeySeparationAlert(env),
    dailyHealthCheckScheduleAlert(env),
    backupNotConfiguredAlert(env),
  ].filter((alert): alert is OpsAlert => alert !== null);

  return all
    .filter((alert) => alert.audience === "EVERYONE" || role === "ADMIN")
    .sort((left, right) => (left.tone === right.tone ? 0 : left.tone === "red" ? -1 : 1));
}
