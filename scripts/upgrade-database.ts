/**
 * Nâng cấp database sau khi nhận bản mới của công cụ.
 *
 * Chạy: npm run db:upgrade
 *
 * Đây là lệnh dành cho NGƯỜI DÙNG, khác `npm run db:migrate` (= `prisma migrate dev`) vốn là
 * lệnh của người phát triển: `migrate dev` có thể hỏi lại, có thể tạo migration mới, và trong
 * vài tình huống còn đề nghị dựng lại database từ đầu — thao tác xóa sạch kho danh tính.
 *
 * Việc áp migration vẫn để `prisma migrate deploy` làm, vì Prisma đã giữ sổ ở bảng
 * `_prisma_migrations`. Dựng sổ riêng là nhân đôi một thứ đã có, và hai sổ thì sớm muộn lệch nhau.
 *
 * Thứ script này thêm vào là thứ `migrate deploy` KHÔNG làm: sao lưu trước khi động vào dữ liệu,
 * và nói rõ phải làm gì nếu hỏng. Với công cụ này, database không phải cache dựng lại được —
 * nó là kho mật khẩu và TOTP của mọi nick.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { backupDatabase } from "../src/lib/db/database-backup";
import {
  type MigrationLedgerRow,
  appliedMigrationNames,
  findPendingMigrations,
} from "../src/lib/db/pending-migrations";
import { prisma } from "../src/lib/db/prisma-client";

const MIGRATIONS_DIR = path.join("prisma", "migrations");

function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * Đọc sổ migration của Prisma.
 *
 * Database mới tinh chưa có bảng này — đó không phải lỗi, chỉ nghĩa là chưa áp gì.
 * `migrate deploy` sẽ tự tạo bảng ở lượt chạy đầu.
 */
async function readLedger(): Promise<MigrationLedgerRow[]> {
  try {
    return await prisma.$queryRawUnsafe<MigrationLedgerRow[]>(
      "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations",
    );
  } catch {
    return [];
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const applied = appliedMigrationNames(await readLedger());
  const pending = findPendingMigrations(migrationsOnDisk(), applied);

  if (pending.length === 0) {
    console.log("");
    console.log("✅ Database đã ở bản mới nhất — không có gì phải áp.");
    console.log("");
    return;
  }

  console.log("");
  console.log(`Có ${pending.length} thay đổi cấu trúc cần áp:`);
  for (const name of pending) console.log(`   • ${name}`);
  console.log("");

  // Đã áp migration nào trước đây thì sao lưu TRƯỚC khi áp tiếp.
  //
  // Cố ý hỏi "đã từng áp gì chưa" chứ KHÔNG hỏi "database có tồn tại không": database luôn
  // tồn tại (người dùng phải tạo nó trước khi chạy được lệnh này), nên hỏi kiểu đó thì lần
  // cài đầu cũng bị sao lưu một database trống trơn. Sổ rỗng mới đúng là "chưa có gì để mất"
  // — và một bản sao lưu rỗng còn tệ hơn không có, vì nó làm người ta tưởng mình đang có
  // bản dự phòng.
  let backupPath: string | null = null;
  if (applied.size === 0) {
    console.log("Lần cài đầu — chưa có dữ liệu nào để sao lưu.");
  } else {
    const { filePath } = await backupDatabase();
    backupPath = filePath;
    console.log(
      `🗃️  Đã sao lưu trước khi áp: ${path.relative(process.cwd(), filePath)}` +
        ` (${formatSize(statSync(filePath).size)})`,
    );
  }
  console.log("");

  // Ngắt kết nối trước khi giao cho Prisma CLI. Postgres không khóa nhau như SQLite trước
  // đây, nhưng `migrate deploy` có thể phải chờ khóa DDL, và một pool còn mở là một chỗ để
  // nó chờ vô ích.
  await prisma.$disconnect();

  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
  } catch (error) {
    console.error("");
    console.error("❌ Áp migration thất bại. Dữ liệu cũ VẪN CÒN NGUYÊN ở bản sao lưu.");
    if (backupPath) {
      console.error(`   Bản sao: ${path.relative(process.cwd(), backupPath)}`);
      console.error("   Khôi phục: tắt app, tạo database rỗng mới rồi nạp bản sao vào đó bằng");
      console.error(`   psql -d <database_mới> -f ${path.relative(process.cwd(), backupPath)}`);
    }
    console.error("");
    throw error;
  }

  console.log("");
  console.log(`✅ Đã áp xong ${pending.length} thay đổi. Khởi động lại app trước khi dùng tiếp.`);
  if (backupPath) {
    console.log(`   Giữ bản sao ${path.basename(backupPath)} tới khi chắc chắn mọi thứ chạy đúng.`);
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error("Nâng cấp dừng lại:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
