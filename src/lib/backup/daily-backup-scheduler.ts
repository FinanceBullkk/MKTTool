/**
 * Bộ lịch sao lưu hằng ngày lên R2 — chạy trong web app, khởi động từ `src/instrumentation.ts`.
 *
 * Dùng lại nguyên bộ khung của lịch dò shadowban: hàm quyết định thuần trong
 * `src/lib/schedule/daily-run-schedule.ts`, và một hàng `ScheduledJobRun` để đòi quyền chạy. Nên
 * nó thừa hưởng luôn hai tính chất đã đo được trên máy chủ thật: nhiều bản app thì đúng một bản
 * bắn, và deploy lại giữa ngày không bắn lại lượt đã chạy.
 *
 * ## Vì sao KHÔNG ghi bản sao xuống ổ đĩa của container
 *
 * `data/backups/` trong container là ổ **tạm**, mất sau mỗi lần deploy. Một bản sao lưu chết cùng
 * lúc với thứ nó bảo vệ thì tệ hơn không có, vì nó *trông như* có. File `.sql` ở đây chỉ là chỗ
 * đệm vài giây giữa `pg_dump` và lượt tải lên, và bị xóa ngay sau đó.
 *
 * ## Vì sao KHÔNG tự xóa bản cũ trên R2
 *
 * Bản dump nặng ~35 KB, tức 13 MB một năm, trong khi hạn miễn phí của R2 là 10 GB — dọn dẹp
 * không giải quyết vấn đề nào có thật. Đổi lại, một lỗi trong logic dọn sẽ **âm thầm xóa đúng thứ
 * cả tính năng này sinh ra để giữ**, và chỉ lộ ra vào ngày cần khôi phục. Không đánh đổi.
 */
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { dumpDatabaseTo } from "../db/database-backup";
import { resolveBackupSource } from "../db/backup-source";
import { summarizeDumpContents } from "../db/dump-content-summary";
import { formatTimestampForFileName } from "../format/vietnamese-date-format";
import { loadTeamTimezone, wallClockIn } from "../format/team-timezone";
import {
  DailyScheduleError,
  decideDailyRun,
  formatTimeOfDay,
  readDailyScheduleTime,
  type TimeOfDay,
} from "../schedule/daily-run-schedule";
import {
  claimScheduledRun,
  readScheduledJobRun,
  recordScheduledRunOutcome,
  type ScheduledJobRunRecord,
} from "../schedule/scheduled-job-run-store";
import { DAILY_BACKUP_ENV, DAILY_BACKUP_JOB_KEY } from "./daily-backup-config";
import { putObject } from "../r2/r2-client";
import { readR2Config, type R2Config } from "../r2/r2-config";

export { DAILY_BACKUP_ENV, DAILY_BACKUP_JOB_KEY };

/** Nhịp kiểm tra, cùng lý lẽ với lịch dò: đúng bằng độ chính xác mà `HH:MM` hứa hẹn. */
export const TICK_INTERVAL_MS = 60_000;

export type DailyBackupStatus =
  | "disabled"
  | "too-early"
  | "already-decided"
  | "lost-race"
  | "uploaded"
  | "failed";

export interface DailyBackupResult {
  status: DailyBackupStatus;
  message: string;
}

export interface DailyBackupDeps {
  now?: Date;
  env?: Partial<Record<string, string>>;
  /** Tiêm để test không phải gọi `pg_dump` thật lẫn mạng thật. */
  dumpTo?: (filePath: string) => Promise<void>;
  upload?: (options: { config: R2Config; key: string; body: Buffer }) => Promise<void>;
}

/**
 * Tên object trên R2, gom theo tháng để danh sách còn đọc được sau vài năm.
 *
 * Năm/tháng lấy qua `wallClockIn` theo múi giờ team, không qua `getFullYear`/`getMonth` — hai hàm
 * đó nằm trong danh sách cấm của dự án (`machine-clock-ban.test.ts`) vì chúng cắt ngày theo giờ
 * của máy đang chạy. Trên Railway máy chạy giờ UTC, nên bản sao lúc 03:00 giờ team sẽ rơi vào
 * tháng trước ở đúng ngày mùng 1 — kiểu lệch mỗi tháng một lần và không ai để ý.
 */
export function backupObjectKey(now: Date): string {
  const wall = wallClockIn(now, loadTeamTimezone());
  const month = String(wall.month).padStart(2, "0");
  return `mkttool/${wall.year}-${month}/mkttool-prod-${formatTimestampForFileName(now)}.sql`;
}

/**
 * Một nhịp kiểm tra. Ném lỗi khi giờ hẹn hoặc cấu hình R2 khai sai — người gọi bắt và ghi log.
 */
export async function tickDailyBackup(
  deps: DailyBackupDeps = {},
): Promise<DailyBackupResult> {
  const {
    now = new Date(),
    env = process.env,
    dumpTo = (filePath: string) => dumpDatabaseTo(filePath, resolveBackupSource("local", env)),
    upload = defaultUpload,
  } = deps;

  const at = readDailyScheduleTime(env[DAILY_BACKUP_ENV]);
  const config = readR2Config(env);
  if (!at || !config) {
    return {
      status: "disabled",
      message: at
        ? "R2 backups are disabled because the R2_* variables are not configured."
        : `R2 backups are disabled because ${DAILY_BACKUP_ENV} is not configured.`,
    };
  }

  const record = await readScheduledJobRun(DAILY_BACKUP_JOB_KEY);
  const decision = decideDailyRun({
    now,
    timeZone: loadTeamTimezone(),
    at,
    lastRunAt: record?.lastRunAt ?? null,
  });

  if (decision.verdict === "TOO_EARLY") return { status: "too-early", message: decision.reason };
  if (decision.verdict === "ALREADY_DECIDED") {
    return { status: "already-decided", message: decision.reason };
  }

  const claimed = await claimScheduledRun({
    key: DAILY_BACKUP_JOB_KEY,
    scheduledFor: decision.scheduledFor,
    now,
  });
  if (!claimed) {
    return { status: "lost-race", message: "Another app instance claimed today's run first." };
  }

  // File đệm nằm ở thư mục tạm của hệ điều hành, KHÔNG ở `data/backups/`: chỗ đó là nơi cất bản
  // sao lưu thật của máy quản trị, và một file chỉ sống vài giây không có việc gì nằm chung đó.
  const scratch = path.join(tmpdir(), `mkttool-backup-${now.getTime()}.sql`);

  try {
    await dumpTo(scratch);
    const body = await readFile(scratch);
    const contents = summarizeDumpContents(body.toString("utf8"));

    // Dump của một database RỖNG vẫn là file .sql hợp lệ. Tải nó lên rồi ghi "thành công" là dựng
    // ra đúng thứ nguy hiểm nhất: một bản sao lưu trông như thật. Coi là thất bại.
    if (contents.totalRows === 0) {
      const detail =
        "The dump contains NO data rows, so it was not uploaded. The source database is empty, " +
        "or DATABASE_URL points to the wrong database.";
      await recordScheduledRunOutcome(DAILY_BACKUP_JOB_KEY, "SKIPPED", detail);
      return { status: "failed", message: detail };
    }

    const key = backupObjectKey(now);
    await upload({ config, key, body });

    const detail =
      `Uploaded to R2: ${key} (${Math.round(body.length / 1024)} KB, ` +
      `${contents.totalRows} ${contents.totalRows === 1 ? "row" : "rows"} across ` +
      `${contents.tablesWithRows} ${contents.tablesWithRows === 1 ? "table" : "tables"}).`;
    await recordScheduledRunOutcome(DAILY_BACKUP_JOB_KEY, "LAUNCHED", detail);
    return { status: "uploaded", message: detail };
  } catch (error) {
    const detail = `Backup failed: ${error instanceof Error ? error.message : String(error)}`;
    await recordScheduledRunOutcome(DAILY_BACKUP_JOB_KEY, "SKIPPED", detail);
    return { status: "failed", message: detail };
  } finally {
    // Xóa file đệm dù thành công hay không: nó chứa ciphertext của cả kho, không có lý do để nó
    // nằm lại trong thư mục tạm của container.
    await unlink(scratch).catch(() => {});
  }
}

function defaultUpload(options: { config: R2Config; key: string; body: Buffer }): Promise<void> {
  return putObject({ ...options, contentType: "application/sql" });
}

/** Giờ hẹn + lượt gần nhất, cho màn hình. */
export interface DailyBackupView {
  at: TimeOfDay | null;
  r2Configured: boolean;
  configError: string | null;
  lastRun: ScheduledJobRunRecord | null;
}

export async function readDailyBackupSchedule(
  env: Partial<Record<string, string>> = process.env,
): Promise<DailyBackupView> {
  let at: TimeOfDay | null = null;
  let r2Configured = false;
  let configError: string | null = null;

  try {
    at = readDailyScheduleTime(env[DAILY_BACKUP_ENV]);
    r2Configured = readR2Config(env) !== null;
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  return {
    at,
    r2Configured,
    configError,
    lastRun: await readScheduledJobRun(DAILY_BACKUP_JOB_KEY),
  };
}

let running = false;

/** Bật bộ lịch. Trả `null` khi không bật. Cùng khuôn với `startDailyHealthCheckScheduler`. */
export function startDailyBackupScheduler(): { stop: () => void } | null {
  if (running) return null;

  let at: TimeOfDay | null;
  let configured: boolean;
  try {
    at = readDailyScheduleTime(process.env[DAILY_BACKUP_ENV]);
    configured = readR2Config(process.env) !== null;
  } catch (error) {
    console.error(
      `[backup] Could not start: ${error instanceof DailyScheduleError ? error.message : error}`,
    );
    return null;
  }

  if (!at || !configured) {
    console.log(
      `[backup] Disabled. Set ${DAILY_BACKUP_ENV}="03:00" and all four R2_* variables to run daily backups.`,
    );
    return null;
  }

  running = true;
  console.log(`[backup] Enabled at ${formatTimeOfDay(at)} daily in ${loadTeamTimezone()}, uploading to R2.`);

  const tick = async () => {
    try {
      const result = await tickDailyBackup();
      if (result.status !== "too-early" && result.status !== "already-decided") {
        console.log(`[backup] ${result.message}`);
      }
    } catch (error) {
      console.error("[backup] Scheduler tick failed:", error);
    }
  };

  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  timer.unref();
  void tick();

  return {
    stop: () => {
      clearInterval(timer);
      running = false;
    },
  };
}
