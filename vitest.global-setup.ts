/**
 * Dựng một database SQLite tạm cho các test chạm database, rồi xóa sạch khi xong.
 *
 * Vì sao phải có database thật: tầng `rule-context-queries.ts` chỉ gồm truy vấn Prisma.
 * Giả lập Prisma trong test thì chỉ chứng minh được "mình gọi hàm đúng như mình nghĩ",
 * không chứng minh được truy vấn LỌC ĐÚNG — mà lọc sai chính là kiểu hỏng nguy hiểm nhất
 * ở đây: luật im lặng cho qua thay vì báo lỗi.
 *
 * Áp thẳng các file trong prisma/migrations thay vì gọi `prisma db push`. Hai cái lợi:
 * test không phụ thuộc Prisma CLI (chạy trơn trong CI), và mỗi lượt chạy test kiểm luôn
 * chuỗi migration có áp sạch từ đầu không — thứ mà `db push` bỏ qua vì nó dựng thẳng từ schema.
 */
import { readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { splitSqlStatements } from "./src/lib/db/sql-statement-splitter";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Thư mục riêng, nằm ngoài data/ để không lẫn với dữ liệu vận hành. */
const TEST_DB_DIR = path.join(projectRoot, ".test-tmp");
const TEST_DB_FILE = path.join(TEST_DB_DIR, "rules-test.db");
const MIGRATIONS_DIR = path.join(projectRoot, "prisma", "migrations");

/**
 * Đường dẫn TUYỆT ĐỐI, cố ý: driver adapter giải đường dẫn tương đối theo thư mục làm việc,
 * và thư mục làm việc của test worker không chắc trùng gốc dự án.
 *
 * → Đổi ở đây thì đổi cả TEST_DATABASE_URL trong vitest.config.mts (chỗ đó đặt DATABASE_URL
 *   cho test worker). Hai bên lệch nhau thì test đỏ ngay ở truy vấn đầu tiên.
 */
const TEST_DATABASE_URL = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;

/** Tên thư mục migration bắt đầu bằng mốc thời gian, nên xếp theo tên là xếp đúng thứ tự áp. */
function readMigrationsInOrder(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }));
}

export default async function setup() {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DB_DIR, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: TEST_DATABASE_URL }),
  });

  try {
    for (const migration of readMigrationsInOrder()) {
      for (const statement of splitSqlStatements(migration.sql)) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (cause) {
          // Nói rõ migration nào, câu lệnh nào — không để người đọc mò trong cả chuỗi migration.
          throw new Error(
            `Không áp được migration "${migration.name}".\nCâu lệnh:\n${statement}`,
            { cause },
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return () => {
    rmSync(TEST_DB_DIR, { recursive: true, force: true });
  };
}
