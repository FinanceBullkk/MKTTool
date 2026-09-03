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
import { readR2Config } from "../r2/r2-config";
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
        `${VAULT_KEY_ENV.server} and ${VAULT_KEY_ENV.operator} use the SAME key, so the vault ` +
        `domains are not actually separated. A server compromise would expose every nick password, ` +
        `email address, and TOTP secret.`,
      action:
        `Separate the keys with \`npm run vault:rekey -- --domain=operator --new-key=<hex>\`, then remove ` +
        `${VAULT_KEY_ENV.operator} from the server environment and restart.`,
    };
  }

  if (posture === "operator-key-on-server") {
    return {
      id: "vault-key-operator-on-server",
      tone: "amber",
      audience: "ADMIN",
      message:
        `The server still holds ${VAULT_KEY_ENV.operator}. The domains are separated, but a copy ` +
        `of the key that opens nick secrets remains on the server; only operator machines should hold it.`,
      action:
        `Remove ${VAULT_KEY_ENV.operator} from the server environment, then restart. The app remains ` +
        `fully functional without this variable, as covered by tests.`,
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
        `${DAILY_HEALTH_CHECK_ENV} is invalid, so scheduled health checks are NOT running: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      action: `Set ${DAILY_HEALTH_CHECK_ENV} to HH:MM format, such as "09:00", then restart.`,
    };
  }

  return {
    id: "health-check-schedule-off",
    tone: "amber",
    audience: "ADMIN",
    message:
      "Scheduled health checks are disabled, so checks run only when someone starts one manually. " +
      "The health table can look complete while its data becomes older each day, and shadowbans are silent.",
    action:
      `Set ${DAILY_HEALTH_CHECK_ENV}="09:00" in team time in the server environment, then restart.`,
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
      message: `Backups outside Railway are NOT running because the configuration is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
      action: `Correct ${DAILY_BACKUP_ENV} and all four R2_* variables in the server environment, then restart.`,
    };
  }

  return {
    id: "backup-not-configured",
    tone: "amber",
    audience: "ADMIN",
    message:
      "No backup exists outside Railway. Railway disk backups, if enabled, share the same account " +
      "as the original and do not protect against losing the entire project or account.",
    action:
      `Set ${DAILY_BACKUP_ENV}="03:00" and all four R2_* variables in the server environment. ` +
      `Keep the bucket private and limit the R2 token to writing only to that bucket.`,
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
