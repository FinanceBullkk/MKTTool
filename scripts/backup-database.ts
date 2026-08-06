/**
 * Sao lưu database ra data/backups/.
 *
 * Chạy:
 *   npm run db:backup           sao lưu database của MÁY NÀY (DATABASE_URL)
 *   npm run db:backup:remote    hút bản sao từ MÁY CHỦ THẬT về máy này
 *                               (PRODUCTION_DATABASE_URL — xem src/lib/db/backup-source.ts)
 *
 * Chạy được khi app đang mở. Nên chạy trước mỗi lần migrate và trước khi đụng vào dữ liệu thật.
 *
 * ## Vì sao bản sao lưu KHÔNG tự chạy trên máy chủ
 *
 * Nghe hợp lý: đã có bộ lịch trong app rồi (GĐ5), thêm một việc `db:backup` hằng đêm là xong.
 * Nhưng trong container, `data/backups/` là **ổ tạm** — nó biến mất sau mỗi lần deploy. Một bản
 * sao lưu chết cùng lúc với thứ nó bảo vệ thì tệ hơn là không có, vì nó *trông như* có: bảng
 * điều khiển hiện file, log nói "đã sao lưu", và sự thật chỉ lộ ra vào ngày cần khôi phục.
 *
 * Nên hai nửa nằm ở hai chỗ, đúng như phần còn lại của kiến trúc: **Railway tự sao lưu ổ đĩa**
 * (bật trong bảng điều khiển của dịch vụ Postgres), còn lệnh này kéo một bản về **máy người
 * quản trị** — nơi không mất theo máy chủ.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describeDatabaseTarget, resolveBackupSource } from "../src/lib/db/backup-source";
import {
  BACKUP_DIR,
  BACKUP_FILE_EXTENSION,
  backupDatabase,
} from "../src/lib/db/database-backup";
import { summarizeDumpContents } from "../src/lib/db/dump-content-summary";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const kind = process.argv.includes("--remote") ? "remote" : "local";
  const source = resolveBackupSource(kind);

  // In nơi hút TRƯỚC khi chạy: người gõ nhầm cờ cần thấy điều đó trước khi có một file mang tên
  // sai nằm trong thư mục sao lưu.
  console.log("");
  console.log(
    kind === "remote"
      ? `Hút bản sao từ MÁY CHỦ: ${describeDatabaseTarget(source.databaseUrl)}`
      : `Sao lưu database của máy này: ${describeDatabaseTarget(source.databaseUrl)}`,
  );

  const { filePath } = await backupDatabase({ source });
  const size = statSync(filePath).size;
  const contents = summarizeDumpContents(readFileSync(filePath, "utf8"));

  const total = readdirSync(BACKUP_DIR).filter((name) =>
    name.endsWith(BACKUP_FILE_EXTENSION),
  ).length;

  console.log("");
  console.log(`✅ Đã sao lưu: ${path.relative(process.cwd(), filePath)} (${formatSize(size)})`);
  console.log(`   ${contents.totalRows} hàng dữ liệu trong ${contents.tablesWithRows} bảng.`);
  console.log(`   Thư mục ${BACKUP_DIR} đang giữ ${total} bản.`);

  // Dump của một database RỖNG vẫn là file .sql hợp lệ và vẫn qua mọi phép kiểm ở trên. Nói
  // thẳng ra ở đây, vì bản sao lưu là thứ chỉ được kiểm chứng vào ngày muộn nhất có thể.
  if (contents.totalRows === 0) {
    console.log("");
    console.log("⚠️  KHÔNG có hàng dữ liệu nào trong bản sao này — database nguồn đang rỗng.");
    console.log("   File vẫn hợp lệ (đủ cấu trúc bảng) nhưng khôi phục nó ra một kho trống.");
    if (kind === "remote") {
      console.log("   Kiểm lại PRODUCTION_DATABASE_URL: rất có thể nó đang trỏ nhầm sang một");
      console.log("   Postgres khác trong cùng dự án.");
    }
  }

  console.log("");
  console.log("Bản sao lưu này CHỨA credential đã mã hóa, và chỉ giải mã được bằng ĐÚNG hai khóa");
  console.log("đang dùng: VAULT_KEY_SERVER và VAULT_KEY_OPERATOR.");
  console.log("→ Cất bản sao ở nơi KHÁC với file .env. Để chung hai thứ là đưa luôn cả ổ khóa");
  console.log("  lẫn chìa cho người nhặt được.");
  console.log("→ Ngược lại, sao lưu mà không giữ khóa thì lúc khôi phục cũng không đọc được gì.");
  console.log("  Khóa operator nằm ở máy operator, không ở máy chủ — sao lưu máy chủ mà thiếu nó");
  console.log("  thì mật khẩu nick trong bản sao là rác.");
  console.log("");
  console.log("Thử khôi phục vào một database rỗng trên máy này (bản sao chưa thử là bản sao");
  console.log("chưa biết có dùng được không):");
  console.log(`  createdb -U postgres mkttool_restore_test`);
  console.log(
    `  psql -U postgres -d mkttool_restore_test -f "${path.relative(process.cwd(), filePath)}"`,
  );
  console.log("");
}

// Không mở kết nối Prisma ở đây: pg_dump tự nối lấy, nên script này không có gì để ngắt.
main().catch((error) => {
  console.error("");
  console.error("❌ Sao lưu thất bại:", error instanceof Error ? error.message : error);
  console.error("");
  process.exitCode = 1;
});
