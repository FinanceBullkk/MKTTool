/**
 * Sao lưu database ra data/backups/.
 *
 * Chạy: npm run db:backup
 *
 * Chạy được khi app đang mở. Nên chạy trước mỗi lần migrate và trước khi đụng vào dữ liệu thật.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  BACKUP_DIR,
  BACKUP_FILE_EXTENSION,
  backupDatabase,
} from "../src/lib/db/database-backup";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const { filePath } = await backupDatabase();
  const size = statSync(filePath).size;

  const total = readdirSync(BACKUP_DIR).filter((name) =>
    name.endsWith(BACKUP_FILE_EXTENSION),
  ).length;

  console.log("");
  console.log(`✅ Đã sao lưu: ${path.relative(process.cwd(), filePath)} (${formatSize(size)})`);
  console.log(`   Thư mục ${BACKUP_DIR} đang giữ ${total} bản.`);
  console.log("");
  console.log("Bản sao lưu này CHỨA credential đã mã hóa, và chỉ giải mã được bằng ĐÚNG hai khóa");
  console.log("đang dùng: VAULT_KEY_SERVER và VAULT_KEY_OPERATOR.");
  console.log("→ Cất bản sao ở nơi KHÁC với file .env. Để chung hai thứ là đưa luôn cả ổ khóa");
  console.log("  lẫn chìa cho người nhặt được.");
  console.log("→ Ngược lại, sao lưu mà không giữ khóa thì lúc khôi phục cũng không đọc được gì.");
  console.log("  Khóa operator nằm ở máy operator, không ở máy chủ — sao lưu máy chủ mà thiếu nó");
  console.log("  thì mật khẩu nick trong bản sao là rác.");
  console.log("");
}

// Không mở kết nối Prisma ở đây: pg_dump tự nối lấy, nên script này không có gì để ngắt.
main().catch((error) => {
  console.error("");
  console.error("❌ Sao lưu thất bại:", error instanceof Error ? error.message : error);
  console.error("");
  process.exitCode = 1;
});
