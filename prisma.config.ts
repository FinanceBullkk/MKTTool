import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Prisma 7 không tự nạp .env nữa. Node 24 có sẵn loadEnvFile nên không cần dotenv.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env chưa tồn tại — CLI sẽ báo lỗi rõ ràng ở bước sau
}

/**
 * Prisma 7 chuyển connection URL từ schema.prisma sang đây.
 * File này chỉ phục vụ Prisma CLI (migrate/studio); runtime dùng driver adapter
 * trong src/lib/db/prisma-client.ts.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
