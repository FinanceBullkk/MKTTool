/**
 * Sao lưu database SQLite thành một file duy nhất, nhất quán.
 *
 * Dùng `VACUUM INTO` chứ không copy file: SQLite chạy chế độ WAL nên phần dữ liệu mới nhất
 * có thể còn nằm ở file `-wal` bên cạnh. Copy mỗi file `.db` là ra một bản sao thiếu, và
 * cái thiếu đó chỉ lộ ra vào lúc cần khôi phục.
 *
 * `VACUUM INTO` cũng chạy được khi app đang mở — không phải tắt server mới sao lưu được.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { prisma } from "./prisma-client";

/** Thư mục chứa bản sao lưu. Đã nằm trong .gitignore — bản sao chứa credential đã mã hóa. */
export const BACKUP_DIR = path.join("data", "backups");

/** `20260802-190530` — xếp theo tên là xếp theo thời gian. */
function timestampForFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export interface BackupResult {
  /** Đường dẫn tuyệt đối tới file vừa tạo. */
  filePath: string;
}

/**
 * Tạo một bản sao lưu mới. Trả về đường dẫn file.
 *
 * Tên file có mốc thời gian nên không bao giờ ghi đè bản cũ — `VACUUM INTO` cũng từ chối
 * ghi vào file đã tồn tại, và đó là hành vi đúng: sao lưu không được phép âm thầm mất bản trước.
 */
export async function backupDatabase(now: Date = new Date()): Promise<BackupResult> {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const filePath = path.resolve(BACKUP_DIR, `mkttool-${timestampForFileName(now)}.db`);

  // SQLite không xử lý ký tự thoát kiểu backslash trong chuỗi, nhưng dấu nháy đơn thì phải
  // nhân đôi. Dùng dấu gạch chéo xuôi cho cả Windows lẫn Linux.
  const sqlPath = filePath.replace(/\\/g, "/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);

  return { filePath };
}
