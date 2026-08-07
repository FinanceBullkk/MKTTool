/**
 * Sao lưu database Postgres thành một file SQL duy nhất bằng `pg_dump`.
 *
 * `pg_dump` chụp ảnh trong một transaction nên bản sao luôn nhất quán, và chạy được khi app
 * đang mở — không phải tắt server mới sao lưu được (trước đây `VACUUM INTO` của SQLite cũng
 * cho tính chất này, giữ nguyên yêu cầu đó khi đổi nền dữ liệu).
 *
 * Cố ý xuất SQL dạng chữ (`--format=plain`) chứ không phải dạng nén `-Fc`, dù dạng nén nhỏ hơn
 * và khôi phục linh hoạt hơn. Hai lý do, cả hai đều thắng dung lượng:
 *
 * 1. Bản sao phải **đọc được bằng mắt** để kiểm "không có credential dạng trần" — xem
 *    `scripts/smoke-test-identity-vault.ts`. Quét chuỗi trên file nén thì luôn không thấy gì,
 *    tức là một phép kiểm luôn xanh — kiểu hỏng tệ nhất của một phép kiểm an toàn.
 * 2. Khôi phục bằng `psql -f file.sql` là một lệnh, không cần biết `pg_restore` tồn tại.
 *    Dữ liệu ở đây rất nhỏ (chục nick, chục proxy) nên dung lượng không phải vấn đề.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { formatTimestampForFileName } from "../format/vietnamese-date-format";
import { resolveBackupSource, type BackupSource } from "./backup-source";
import { postgresToolEnv } from "./postgres-connection-env";

/** Thư mục chứa bản sao lưu. Đã nằm trong .gitignore — bản sao chứa credential đã mã hóa. */
export const BACKUP_DIR = path.join("data", "backups");

/** Đuôi file của bản sao lưu. Dùng chung để chỗ đếm bản sao không đếm nhầm file khác. */
export const BACKUP_FILE_EXTENSION = ".sql";

export interface BackupResult {
  /** Đường dẫn tuyệt đối tới file vừa tạo. */
  filePath: string;
  source: BackupSource;
}

/**
 * Tạo một bản sao lưu mới trong `data/backups/`. Trả về đường dẫn file.
 *
 * Tên file có mốc thời gian nên không bao giờ ghi đè bản cũ, và mang **tiền tố theo nguồn** nên
 * bản của máy chủ không lẫn với bản của máy dev — xem `backup-source.ts`.
 */
export async function backupDatabase(
  options: { now?: Date; source?: BackupSource } = {},
): Promise<BackupResult> {
  const { now = new Date(), source = resolveBackupSource("local") } = options;
  mkdirSync(BACKUP_DIR, { recursive: true });

  const filePath = path.resolve(
    BACKUP_DIR,
    `${source.namePrefix}-${formatTimestampForFileName(now)}${BACKUP_FILE_EXTENSION}`,
  );
  await dumpDatabaseTo(filePath, source);

  return { filePath, source };
}

/**
 * Đổ toàn bộ database ra một file SQL cho trước.
 *
 * Tách riêng khỏi `backupDatabase` để smoke test dùng lại được với file tạm của nó — phép
 * kiểm "kho không chứa credential dạng trần" phải soi đúng thứ mà bản sao lưu thật chứa,
 * chứ không phải một đường xuất khác dựng riêng cho test.
 *
 * **Từ chối ghi đè file đã tồn tại.** Sao lưu không được phép âm thầm mất bản trước —
 * `VACUUM INTO` của SQLite trước đây cũng từ chối, giữ nguyên hành vi đó.
 */
export async function dumpDatabaseTo(
  filePath: string,
  source: BackupSource = resolveBackupSource("local"),
  timeoutMs: number = PG_DUMP_TIMEOUT_MS,
): Promise<void> {
  if (existsSync(filePath)) {
    throw new Error(
      `Đã có file ${filePath}. Sao lưu không ghi đè bản cũ — đổi tên hoặc chờ sang giây kế tiếp.`,
    );
  }

  await runPgDump(filePath, postgresToolEnv(source.databaseUrl), timeoutMs);
}

/**
 * Trần thời gian cho một lượt `pg_dump`.
 *
 * **Vì sao phải có trần, chứ không phải chờ đến khi xong:** `runPgDump` chỉ kết thúc khi tiến
 * trình con đóng. Tiến trình đó treo — mạng nội bộ đứt giữa chừng, server nhận kết nối rồi không
 * trả lời — thì Promise **không bao giờ giải quyết**. Lượt sao lưu đêm sẽ im lặng tuyệt đối:
 * không dòng log nào, không kết quả nào ghi vào `ScheduledJobRun`, và nhìn từ ngoài giống hệt
 * trạng thái "chưa tới giờ hẹn".
 *
 * Đó đúng là kiểu hỏng mà cả module này dựng lên để chặn. Dump rỗng đã bị coi là thất bại vì một
 * bản sao *trông như thật* nguy hiểm hơn không có bản sao nào; dump treo cũng cùng loại, chỉ khác
 * là nó không để lại dấu vết nào để ai đó nghi ngờ.
 *
 * 10 phút là trần rộng rãi chứ không phải ước lượng sát: bản dump thật hiện nay 35 KB, xong trong
 * vài giây. Trần này để phân biệt "chậm bất thường" với "không bao giờ xong", không phải để tối ưu.
 */
const PG_DUMP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Lệnh `pg_dump` sẽ chạy. Mặc định lấy trên PATH; `PG_DUMP_PATH` ghi đè để trỏ tới một bản khác.
 *
 * ## Vì sao cần đường ghi đè
 *
 * `pg_dump` **từ chối dump từ server có major cao hơn chính nó**, và từ chối bằng một câu chỉ nói
 * hai con số chứ không nói phải làm gì:
 *
 *     pg_dump: error: aborting because of server version mismatch
 *     pg_dump: detail: server version: 18.4; pg_dump version: 17.10
 *
 * Đây không phải giả thiết: đúng ca đó xảy ra 08/08/2026 khi Railway đã ở Postgres 18 còn máy dev
 * vẫn cài client 17 — `npm run db:backup:remote` gãy, mà đó chính là bước phải chạy **trước mỗi
 * lần deploy có đổi cấu trúc database**. Nếp an toàn hỏng đúng lúc cần nó nhất.
 *
 * Container thì không dính (Dockerfile ghim `PG_CLIENT_MAJOR` theo bản của hãng), nên chỉ đường
 * kéo về tay từ máy quản trị viên mới cần biến này. Một dòng trong `.env` rẻ hơn nhiều so với
 * việc gỡ cài đặt Postgres 17 khỏi máy đang dùng:
 *
 *     PG_DUMP_PATH="C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe"
 */
const PG_DUMP_COMMAND = process.env.PG_DUMP_PATH?.trim() || "pg_dump";

/**
 * Nhận ra lời từ chối vì lệch phiên bản, để đổi nó thành câu nói được phải làm gì.
 *
 * Nguyên văn của Postgres nêu đúng hai con số rồi thôi. Người đọc nó lúc đang vội deploy cần biết
 * *"cài client mới hơn, hoặc trỏ PG_DUMP_PATH sang đó"* — chứ không cần học lại luật tương thích
 * của pg_dump.
 */
function describePgDumpFailure(code: number | null, stderr: string): string {
  const goc = stderr.trim();
  if (/server version mismatch/i.test(goc)) {
    return (
      `pg_dump trên máy này cũ hơn database đang nối tới nên nó từ chối dump.\n${goc}\n\n` +
      "Cách xử: cài Postgres client có major ≥ major của server, rồi khai đường dẫn tới nó " +
      'trong .env — ví dụ PG_DUMP_PATH="C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe". ' +
      "Không cần gỡ bản cũ đang dùng cho database dưới máy."
    );
  }
  return `pg_dump dừng với mã ${code}.${goc ? `\n${goc}` : ""}`;
}

/** Khoảng chờ sau `SIGTERM` trước khi `SIGKILL`, để `pg_dump` kịp hủy truy vấn đang mở. */
const PG_DUMP_KILL_GRACE_MS = 5_000;

/**
 * `--no-owner --no-privileges`: bản sao khôi phục được vào máy khác với tên chủ sở hữu khác.
 * Bản sao chỉ hữu ích khi máy cũ đã hỏng, mà lúc đó tên role trên máy mới gần như chắc chắn
 * khác — giữ chủ sở hữu vào file là tự đặt một cái bẫy ngay lúc cần nó nhất.
 */
function runPgDump(
  filePath: string,
  toolEnv: Record<string, string>,
  timeoutMs: number = PG_DUMP_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      PG_DUMP_COMMAND,
      ["--file", filePath, "--format=plain", "--no-owner", "--no-privileges"],
      { env: { ...process.env, ...toolEnv }, shell: false },
    );

    // Gom stderr để lỗi của Postgres đi thẳng vào thông báo, thay vì rơi vào hư không và
    // để lại đúng một dòng "exit code 1".
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Hết giờ và tiến trình đóng là hai đường đua nhau: giết tiến trình cũng làm `close` bắn.
    // Chốt đúng một lần, nếu không thì lượt quá giờ sẽ vừa `reject` vừa `resolve` ngay sau đó.
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      finish();
    };

    const timeoutTimer = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), PG_DUMP_KILL_GRACE_MS);
      killTimer.unref();

      settle(() =>
        reject(
          new Error(
            `pg_dump không xong sau ${Math.round(timeoutMs / 1000)} giây nên đã bị buộc dừng. ` +
              "File sinh ra dở dang, không dùng làm bản sao được. Kiểm lại đường mạng tới database.",
          ),
        ),
      );
    }, timeoutMs);
    // Không giữ vòng lặp sự kiện sống chỉ vì cái hẹn này: `npm run db:backup` phải thoát ngay
    // khi dump xong, chứ không nằm đợi hết 10 phút.
    timeoutTimer.unref();

    child.on("error", (cause: NodeJS.ErrnoException) => {
      settle(() =>
        reject(
          cause.code === "ENOENT"
            ? new Error(
                `Không chạy được lệnh ${PG_DUMP_COMMAND}. ` +
                  (process.env.PG_DUMP_PATH
                    ? "PG_DUMP_PATH trong .env đang trỏ vào một đường dẫn không tồn tại."
                    : "Thêm thư mục bin của Postgres vào PATH " +
                      '(mặc định trên Windows: "C:\\Program Files\\PostgreSQL\\17\\bin") ' +
                      "rồi mở lại terminal."),
              )
            : cause,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(killTimer);
      settle(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(describePgDumpFailure(code, stderr)));
      });
    });
  });
}
