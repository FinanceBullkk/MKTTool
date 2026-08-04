/**
 * Dựng schema sạch trên database Postgres dành riêng cho test, rồi xóa sạch khi xong.
 *
 * Vì sao phải có database thật: tầng `rule-context-queries.ts` chỉ gồm truy vấn Prisma.
 * Giả lập Prisma trong test thì chỉ chứng minh được "mình gọi hàm đúng như mình nghĩ",
 * không chứng minh được truy vấn LỌC ĐÚNG — mà lọc sai chính là kiểu hỏng nguy hiểm nhất
 * ở đây: luật im lặng cho qua thay vì báo lỗi.
 *
 * Áp thẳng các file trong prisma/migrations thay vì gọi `prisma db push`. Hai cái lợi:
 * test không phụ thuộc Prisma CLI (chạy trơn trong CI), và mỗi lượt chạy test kiểm luôn
 * chuỗi migration có áp sạch từ đầu không — thứ mà `db push` bỏ qua vì nó dựng thẳng từ schema.
 * Nguyên tắc này giữ nguyên từ thời SQLite; chỉ chỗ chứa là đổi.
 *
 * Khác biệt so với thời SQLite: database tạm không còn là một file xóa đi là xong, mà là một
 * database Postgres **có thật, dùng lại qua nhiều lượt chạy**. Nên phải tự tay dọn — và phải
 * có chốt chặn không bao giờ dọn nhầm chỗ (xem `assertIsTestDatabase`).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { splitSqlStatements } from "./src/lib/db/sql-statement-splitter";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(projectRoot, "prisma", "migrations");

/**
 * Chốt chặn: chỉ chạy trên database có tên kết thúc bằng `_test`.
 *
 * Global setup này chạy `DROP SCHEMA public CASCADE` — xóa sạch không hỏi lại. Trỏ nhầm
 * `TEST_DATABASE_URL` vào database vận hành là mất toàn bộ kho danh tính, và mất theo kiểu
 * không có bước nào để kịp hối hận. Quy ước đặt tên rẻ hơn nhiều so với hậu quả.
 */
export function assertIsTestDatabase(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));

  if (!name.endsWith("_test")) {
    throw new Error(
      `Từ chối chạy test trên database "${name}".\n` +
        `Bộ test XÓA SẠCH schema trước mỗi lượt chạy, nên chỉ nhận database có tên kết thúc ` +
        `bằng "_test" (ví dụ mkttool_test).\n` +
        `Sửa TEST_DATABASE_URL trong .env.`,
    );
  }

  return name;
}

function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      "Thiếu TEST_DATABASE_URL — các test chạm database cần một Postgres thật.\n" +
        "Thêm vào .env, ví dụ:\n" +
        '  TEST_DATABASE_URL="postgresql://postgres:mật_khẩu@localhost:5432/mkttool_test"\n' +
        "Database này phải TỒN TẠI SẴN; bộ test tự dựng bảng bên trong nó, không tự tạo database.",
    );
  }

  assertIsTestDatabase(url);
  return url;
}

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

/**
 * Xóa schema `public` rồi tạo lại — cách dứt điểm nhất để mỗi lượt chạy bắt đầu từ database
 * trống, kể cả khi lượt trước chết giữa chừng và để lại bảng dở dang.
 */
async function resetPublicSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
}

export default async function setup() {
  const databaseUrl = testDatabaseUrl();

  const connect = () =>
    new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  const prisma = connect();

  try {
    await resetPublicSchema(prisma);

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

  return async () => {
    // Kết nối mới: kết nối ở trên đã đóng, và teardown chạy sau khi mọi test đã xong.
    // Dọn để không bỏ lại ciphertext của dữ liệu test nằm trong database qua đêm.
    const cleanup = connect();
    try {
      await resetPublicSchema(cleanup);
    } finally {
      await cleanup.$disconnect();
    }
  };
}
